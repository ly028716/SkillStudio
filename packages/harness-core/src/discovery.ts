import { join } from "node:path";

import {
  CONTRACT_SCHEMA_VERSION,
  type CapabilityFact,
  type FactStatus,
  type HarnessDiscoveryConfig,
  type HarnessDiscoveryPort,
  type HarnessReport,
} from "@skillstudio/contracts";

import {
  CODEX_PROFILE,
  DEEPSEEK_PROFILE,
  HERMES_PROFILE,
  type HarnessProfile,
} from "./profiles.js";

const HERMES_SKILL_SUMMARY =
  "Project skills use .agents/skills and .hermes/skills; skills.external_dirs adds configured locations, and loading project skills requires a trust decision.";
const DEEPSEEK_SKILL_SUMMARY =
  "Static source evidence identifies the dsh profile launcher and @deepseek-ai/dsh-skill; runtime skill discovery is not verified.";

function createFact(
  checkedAt: string,
  key: CapabilityFact["key"],
  status: FactStatus,
  summary: string,
  evidence: string[],
): CapabilityFact {
  return { key, status, summary, evidence, checkedAt };
}

function createReport(
  profile: HarnessProfile,
  executablePath: string | null,
  detectedVersion: string | null,
  facts: CapabilityFact[],
): HarnessReport {
  return {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    kind: profile.kind,
    displayName: profile.displayName,
    executablePath,
    detectedVersion,
    facts,
  };
}

function codexVersion(stdout: string): string | null {
  return /^codex-cli\s+(\S+)/m.exec(stdout)?.[1] ?? null;
}

function hermesProjectVersion(pyproject: string | null): string | null {
  if (pyproject === null) {
    return null;
  }

  const projectSection = /(?:^|\r?\n)\[project\]([\s\S]*?)(?=\r?\n\[[^\]]+\]|$)/.exec(pyproject)?.[1];
  return projectSection?.match(/^\s*version\s*=\s*["']([^"']+)["']\s*$/m)?.[1] ?? null;
}

function hasEligiblePython(version: string | null): boolean {
  return /(?:^|\s)(?:Python\s+)?3\.(?:11|12|13)(?:\.\d+)?\b/.test(
    version ?? "",
  );
}

function deepseekPackageDetails(packageText: string | null): {
  version: string | null;
  nodeEngine: string | null;
} {
  if (packageText === null) {
    return { version: null, nodeEngine: null };
  }

  try {
    const parsed: unknown = JSON.parse(packageText);
    if (typeof parsed !== "object" || parsed === null) {
      return { version: null, nodeEngine: null };
    }

    const record = parsed as Record<string, unknown>;
    const engines = record.engines;
    const nodeEngineValue =
      typeof engines === "object" && engines !== null
        ? (engines as Record<string, unknown>).node
        : undefined;
    const nodeEngine = typeof nodeEngineValue === "string" ? nodeEngineValue : null;
    return {
      version: typeof record.version === "string" ? record.version : null,
      nodeEngine,
    };
  } catch {
    return { version: null, nodeEngine: null };
  }
}

async function discoverCodex(
  port: HarnessDiscoveryPort,
  checkedAt: string,
): Promise<HarnessReport> {
  const executablePath = await port.find("codex");
  const versionResult = executablePath === null ? null : await port.version(executablePath);
  const detectedVersion = versionResult === null ? null : codexVersion(versionResult.stdout);
  const installed = executablePath !== null;

  return createReport(CODEX_PROFILE, executablePath, detectedVersion, [
    createFact(
      checkedAt,
      "installation",
      installed ? "ready" : "not_installed",
      installed ? "Codex CLI executable was found." : "Codex CLI executable was not found.",
      installed ? [`Executable: ${executablePath}`] : ["find(\"codex\") returned no executable."],
    ),
    createFact(
      checkedAt,
      "version",
      detectedVersion === null ? (installed ? "unknown" : "not_installed") : "ready",
      detectedVersion === null ? "Codex CLI version could not be normalized." : `Codex CLI reports version ${detectedVersion}.`,
      detectedVersion === null
        ? ["Expected a line matching /^codex-cli\\s+(\\S+)/m."]
        : [`Normalized from Codex CLI output: ${detectedVersion}`],
    ),
    createFact(
      checkedAt,
      "execution",
      "unknown",
      "Codex execution has not been verified by discovery.",
      ["Discovery does not launch Codex commands beyond its injected version probe."],
    ),
    createFact(
      checkedAt,
      "skillDiscovery",
      "unknown",
      "Codex skill discovery has not been verified by discovery.",
      ["No Codex skills are loaded during discovery."],
    ),
  ]);
}

async function discoverHermes(
  port: HarnessDiscoveryPort,
  sourceCheckout: string | null,
  checkedAt: string,
): Promise<HarnessReport> {
  if (sourceCheckout === null) {
    const executablePath = await port.find("hermes");
    const installed = executablePath !== null;
    return createReport(HERMES_PROFILE, executablePath, null, [
      createFact(checkedAt, "installation", installed ? "ready" : "not_installed", installed ? "Hermes executable was found." : "Hermes executable was not found.", installed ? [`Executable: ${executablePath}`] : ["find(\"hermes\") returned no executable."]),
      createFact(checkedAt, "version", "unknown", "Hermes version requires source metadata or a launcher probe.", []),
      createFact(checkedAt, "execution", "unknown", "Hermes execution has not been verified by discovery.", []),
      createFact(checkedAt, "skillDiscovery", "unknown", HERMES_SKILL_SUMMARY, ["Runtime skill discovery is unknown until the launcher runs."]),
    ]);
  }

  const launcherPath = join(sourceCheckout, "hermes");
  const pyprojectPath = join(sourceCheckout, "pyproject.toml");
  const [hasLauncher, hasPyproject] = await Promise.all([
    port.isFile(launcherPath),
    port.isFile(pyprojectPath),
  ]);
  const [pyproject, pythonVersion] = await Promise.all([
    hasPyproject ? port.readText(pyprojectPath) : Promise.resolve(null),
    port.pythonVersion(),
  ]);
  const sourceReady = hasLauncher && hasPyproject;
  const pythonReady = hasEligiblePython(pythonVersion);
  const detectedVersion = hermesProjectVersion(pyproject);
  const runtimeUnavailable = sourceReady && !pythonReady;

  return createReport(HERMES_PROFILE, hasLauncher ? launcherPath : null, detectedVersion, [
    createFact(
      checkedAt,
      "installation",
      sourceReady && pythonReady ? "ready" : "blocked",
      sourceReady ? "Hermes source checkout was found." : "Hermes source checkout is incomplete.",
      sourceReady
        ? pythonReady
          ? [`Source checkout found; Python runtime: ${pythonVersion}`]
          : ["Source checkout found; Python 3.11–3.13 runtime unavailable"]
        : ["Configured source checkout must contain hermes and pyproject.toml."],
    ),
    createFact(
      checkedAt,
      "version",
      detectedVersion === null ? "unknown" : "ready",
      detectedVersion === null ? "Hermes project version was not found." : `Hermes project version is ${detectedVersion}.`,
      detectedVersion === null ? ["[project].version was not available in pyproject.toml."] : [`[project].version: ${detectedVersion}`],
    ),
    createFact(
      checkedAt,
      "execution",
      runtimeUnavailable ? "blocked" : "unknown",
      runtimeUnavailable ? "Hermes execution is blocked by the Python runtime." : "Hermes execution remains unknown until the launcher runs.",
      runtimeUnavailable
        ? ["Source checkout found; Python 3.11–3.13 runtime unavailable"]
        : ["Launcher execution and authentication are not run during discovery."],
    ),
    createFact(checkedAt, "skillDiscovery", "unknown", HERMES_SKILL_SUMMARY, ["Runtime verification remains unknown until the launcher runs."]),
  ]);
}

async function discoverDeepSeek(
  port: HarnessDiscoveryPort,
  sourceCheckout: string | null,
  checkedAt: string,
): Promise<HarnessReport> {
  if (sourceCheckout === null) {
    const executablePath = await port.find("dsh");
    return createReport(DEEPSEEK_PROFILE, executablePath, null, [
      createFact(checkedAt, "installation", executablePath === null ? "not_installed" : "unknown", executablePath === null ? "DeepSeek dsh launcher was not found." : "DeepSeek dsh launcher was found but not invoked.", executablePath === null ? ["find(\"dsh\") returned no executable."] : [`dsh profile launcher: ${executablePath}`]),
      createFact(checkedAt, "version", "unknown", "DeepSeek version requires source metadata.", []),
      createFact(checkedAt, "execution", "unsupported", "DeepSeek execution is outside M0 scope.", ["M0 permits static compatibility diagnostics only"]),
      createFact(checkedAt, "skillDiscovery", "unknown", DEEPSEEK_SKILL_SUMMARY, ["@deepseek-ai/dsh-skill is not inspected without a source checkout."]),
    ]);
  }

  const packagePath = join(sourceCheckout, "package.json");
  const workspacePath = join(sourceCheckout, "pnpm-workspace.yaml");
  const cliPackagePath = join(sourceCheckout, "apps", "cli", "package.json");
  const [hasPackage, hasWorkspace, hasCliPackage] = await Promise.all([
    port.isFile(packagePath),
    port.isFile(workspacePath),
    port.isFile(cliPackagePath),
  ]);
  const packageText = hasPackage ? await port.readText(packagePath) : null;
  const { version, nodeEngine } = deepseekPackageDetails(packageText);
  const sourceSummary = hasPackage && hasWorkspace && hasCliPackage
    ? "DeepSeek source checkout was verified for static compatibility diagnostics."
    : "DeepSeek source checkout is incomplete for static compatibility diagnostics.";
  const staticEvidence = [
    "dsh profile launcher",
    "@deepseek-ai/dsh-skill",
    nodeEngine === null ? "Node engine was not found in package.json." : `Node engine: ${nodeEngine}`,
  ];

  return createReport(DEEPSEEK_PROFILE, null, version, [
    createFact(checkedAt, "installation", "unknown", `${sourceSummary} The dsh profile launcher is static evidence only.`, staticEvidence),
    createFact(checkedAt, "version", version === null ? "unknown" : "ready", version === null ? "DeepSeek root package version was not found." : `DeepSeek root package version is ${version}.`, version === null ? ["package.json version was not available."] : [`package.json version: ${version}`]),
    createFact(checkedAt, "execution", "unsupported", "DeepSeek execution is outside M0 scope.", ["M0 permits static compatibility diagnostics only"]),
    createFact(checkedAt, "skillDiscovery", "unknown", DEEPSEEK_SKILL_SUMMARY, staticEvidence),
  ]);
}

export async function discoverHarnesses(
  port: HarnessDiscoveryPort,
  config: HarnessDiscoveryConfig,
): Promise<HarnessReport[]> {
  const checkedAt = port.now();
  return Promise.all([
    discoverCodex(port, checkedAt),
    discoverHermes(port, config.hermesSourceCheckout, checkedAt),
    discoverDeepSeek(port, config.deepseekSourceCheckout, checkedAt),
  ]);
}
