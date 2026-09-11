import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import type {
  CapabilityFact,
  HarnessDiscoveryPort,
  HarnessReport,
} from "@skillstudio/contracts";
import { discoverHarnesses } from "@skillstudio/harness-core";

const hermesSource = "C:\\repos\\hermes-agent";
const deepseekSource = "C:\\repos\\deepseek-harness";

function fact(report: HarnessReport, key: CapabilityFact["key"]): CapabilityFact {
  const result = report.facts.find((candidate) => candidate.key === key);
  assert.ok(result, `expected ${report.kind} ${key} fact`);
  return result;
}

async function fixture(name: string): Promise<string> {
  return readFile(new URL(`./fixtures/harnesses/${name}`, import.meta.url), "utf8");
}

function createPort(options: {
  codexVersion: string;
  pythonVersion: string | null;
  sourceFiles: Record<string, string>;
}): HarnessDiscoveryPort & { readonly calls: string[] } {
  const calls: string[] = [];

  return {
    calls,
    async find(command) {
      calls.push(`find:${command}`);
      return command === "codex" ? "C:\\Tools\\codex.exe" : null;
    },
    async version(commandPath) {
      calls.push(`version:${commandPath}`);
      return { exitCode: 0, stdout: options.codexVersion, stderr: "" };
    },
    async isFile(path) {
      calls.push(`isFile:${path}`);
      return path in options.sourceFiles;
    },
    async readText(path) {
      calls.push(`readText:${path}`);
      return options.sourceFiles[path] ?? null;
    },
    async pythonVersion() {
      calls.push("pythonVersion");
      return options.pythonVersion;
    },
    now() {
      return "2026-09-10T12:00:00.000Z";
    },
  };
}

test("discovers fixture-backed source checkouts without installed harness runtimes", async () => {
  const [codexVersion, hermesPyproject, deepseekPackage] = await Promise.all([
    fixture("codex-version.txt"),
    fixture("hermes-source-pyproject.toml"),
    fixture("deepseek-source-package.json"),
  ]);
  const port = createPort({
    codexVersion,
    pythonVersion: null,
    sourceFiles: {
      [`${hermesSource}\\hermes`]: "#!/usr/bin/env python",
      [`${hermesSource}\\pyproject.toml`]: hermesPyproject,
      [`${deepseekSource}\\package.json`]: deepseekPackage,
      [`${deepseekSource}\\pnpm-workspace.yaml`]: "packages:\n  - apps/*\n",
      [`${deepseekSource}\\apps\\cli\\package.json`]: "{}",
    },
  });

  const reports = await discoverHarnesses(port, {
    hermesSourceCheckout: hermesSource,
    deepseekSourceCheckout: deepseekSource,
  });

  assert.deepEqual(reports.map((report) => report.kind), ["codex", "hermes", "deepseek"]);
  assert.equal(reports[0]?.detectedVersion, "0.153.4");
  assert.equal(fact(reports[0]!, "installation").status, "ready");
  assert.equal(reports[1]?.detectedVersion, "0.21.0");
  assert.equal(fact(reports[1]!, "installation").status, "blocked");
  assert.equal(fact(reports[1]!, "execution").evidence[0], "Source checkout found; Python 3.11–3.13 runtime unavailable");
  assert.match(fact(reports[1]!, "skillDiscovery").summary, /\.agents\/skills.*\.hermes\/skills.*skills\.external_dirs.*trust/i);
  assert.equal(reports[2]?.detectedVersion, "0.1.3-alpha.1");
  assert.equal(fact(reports[2]!, "execution").status, "unsupported");
  assert.equal(fact(reports[2]!, "execution").evidence[0], "M0 permits static compatibility diagnostics only");
  assert.match(fact(reports[2]!, "installation").summary, /dsh profile launcher/i);
  assert.match(fact(reports[2]!, "skillDiscovery").summary, /@deepseek-ai\/dsh-skill/i);
  assert.deepEqual(port.calls.filter((call) => call.startsWith("find:")), ["find:codex"]);
  assert.deepEqual(port.calls.filter((call) => call.startsWith("version:")), ["version:C:\\Tools\\codex.exe"]);
});

test("keeps a malformed Codex version unknown without blocking discovery", async () => {
  const port = createPort({
    codexVersion: await fixture("codex-unknown-version.txt"),
    pythonVersion: "Python 3.12.8",
    sourceFiles: {},
  });

  const [codex] = await discoverHarnesses(port, {
    hermesSourceCheckout: null,
    deepseekSourceCheckout: null,
  });

  assert.ok(codex);
  assert.equal(codex.detectedVersion, null);
  assert.equal(fact(codex, "version").status, "unknown");
  assert.notEqual(fact(codex, "version").status, "blocked");
  assert.equal(fact(codex, "installation").status, "ready");
});
