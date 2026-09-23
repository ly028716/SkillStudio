import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { CapabilityFact, HarnessReport } from "@skillstudio/contracts";
import * as client from "../apps/web/src/api/client.js";
import * as statusScreen from "../apps/web/src/App.js";

const checkedAt = "2026-09-10T12:00:00.000Z";

function fact(
  key: CapabilityFact["key"],
  status: CapabilityFact["status"],
  summary: string,
  evidence: string[] = [],
): CapabilityFact {
  return { key, status, summary, evidence, checkedAt };
}

const reports: HarnessReport[] = [
  {
    schemaVersion: "2026-09-23",
    kind: "codex",
    displayName: "Codex",
    executablePath: "C:\\Tools\\codex.exe",
    detectedVersion: "0.153.4",
    facts: [
      fact("installation", "ready", "Codex CLI executable was found."),
      fact("version", "ready", "Codex CLI reports version 0.153.4."),
      fact("execution", "unknown", "Codex execution has not been verified by discovery."),
      fact("skillDiscovery", "unknown", "Codex skill discovery has not been verified by discovery."),
    ],
  },
  {
    schemaVersion: "2026-09-23",
    kind: "hermes",
    displayName: "Hermes Agent",
    executablePath: null,
    detectedVersion: "0.21.0",
    facts: [
      fact("installation", "blocked", "Hermes source checkout was found."),
      fact("version", "ready", "Hermes project version is 0.21.0."),
      fact("execution", "blocked", "Hermes execution is blocked by the Python runtime."),
      fact("skillDiscovery", "unknown", "Hermes skill discovery is not verified."),
    ],
  },
  {
    schemaVersion: "2026-09-23",
    kind: "deepseek",
    displayName: "DeepSeek Harness",
    executablePath: null,
    detectedVersion: "0.1.3-alpha.1",
    facts: [
      fact("installation", "unknown", "DeepSeek source checkout was verified for static compatibility diagnostics."),
      fact("version", "ready", "DeepSeek root package version is 0.1.3-alpha.1."),
      fact("execution", "unsupported", "DeepSeek execution is outside M0 scope."),
      fact("skillDiscovery", "unknown", "DeepSeek skill discovery is not verified."),
    ],
  },
];

function response(body: unknown, ok = true): Response {
  return {
    ok,
    json: async () => body,
  } as Response;
}

function getHarnessReports(fetchImpl: typeof fetch, baseUrl: string): Promise<HarnessReport[]> {
  return client.getHarnessReports(fetchImpl, baseUrl);
}

function assertUnavailable(error: unknown): boolean {
  assert.ok(error instanceof client.ConnectorUnavailableError);
  assert.equal(error.message, "无法连接本地连接器");
  return true;
}

test("returns reports from the versioned Connector envelope", async () => {
  let request: { url: string; init: RequestInit | undefined } | undefined;
  const fetchImpl: typeof fetch = async (input, init) => {
    request = { url: String(input), init };
    return response({
      schemaVersion: "2026-09-23",
      requestId: "request-123",
      data: reports,
    });
  };

  const result = await getHarnessReports(fetchImpl, "http://127.0.0.1:4317");

  assert.deepEqual(result, reports);
  assert.equal(request?.url, "http://127.0.0.1:4317/api/harnesses");
  assert.equal(new Headers(request?.init?.headers).get("accept"), "application/json");
});

test("rejects non-success Connector responses", async () => {
  await assert.rejects(
    getHarnessReports(async () => response({ code: "INTERNAL" }, false), "http://127.0.0.1:4317"),
    client.ConnectorUnavailableError,
  );
});

test("rejects envelopes without a report array", async () => {
  await assert.rejects(
    getHarnessReports(
      async () => response({ schemaVersion: "2026-09-23", requestId: "request-123", data: {} }),
      "http://127.0.0.1:4317",
    ),
    client.ConnectorUnavailableError,
  );
});

test("reports a localized unavailable error when the Connector cannot be reached", async () => {
  await assert.rejects(
    getHarnessReports(
      async () => Promise.reject(new Error("network unavailable")),
      "http://127.0.0.1:4317",
    ),
    (error: unknown) => {
      return assertUnavailable(error);
    },
  );
});

test("rejects malformed Harness reports and capability facts from a successful envelope", async () => {
  const malformedReports = [
    null,
    { ...reports[0], facts: null },
    { ...reports[0], facts: [fact("installation", "ready", "Installed."), { ...fact("version", "ready", "Version."), status: "connected" }] },
    { ...reports[0], facts: [{ ...fact("execution", "unknown", "Not verified."), evidence: [42] }] },
  ];

  for (const malformedReport of malformedReports) {
    await assert.rejects(
      getHarnessReports(
        async () => response({ schemaVersion: "2026-09-23", requestId: "request-123", data: [malformedReport] }),
        "http://127.0.0.1:4317",
      ),
      assertUnavailable,
    );
  }
});

test("allows only the proxy or loopback origins for the Connector base URL", () => {
  const resolve = (client as Record<string, unknown>).resolveConnectorBaseUrl;
  assert.equal(typeof resolve, "function", "expected a loopback-only Connector base URL resolver");

  const resolveConnectorBaseUrl = resolve as (value: string | undefined) => string;
  assert.equal(resolveConnectorBaseUrl(undefined), "");
  assert.equal(resolveConnectorBaseUrl(""), "");
  assert.equal(resolveConnectorBaseUrl("http://127.0.0.1:4317/"), "http://127.0.0.1:4317");
  assert.equal(resolveConnectorBaseUrl("http://localhost:4317"), "http://localhost:4317");
  assert.throws(() => resolveConnectorBaseUrl("http://connector.example.test"), assertUnavailable);
  assert.throws(() => resolveConnectorBaseUrl("https://connector.example.test"), assertUnavailable);
});

test("does not send a request when a Connector base URL is outside loopback", async () => {
  let requested = false;

  await assert.rejects(
    getHarnessReports(async () => {
      requested = true;
      return response({});
    }, "http://connector.example.test"),
    assertUnavailable,
  );

  assert.equal(requested, false);
});

test("renders evidence-backed Hermes and DeepSeek capability headlines", () => {
  const headline = (statusScreen as Record<string, unknown>).reportHeadline;
  assert.equal(typeof headline, "function", "expected the status headline helper to be exported");

  const reportHeadline = headline as (report: HarnessReport) => string;
  assert.equal(reportHeadline(reports[1]!), "Hermes Agent · 已发现，运行时受阻");
  assert.equal(reportHeadline({
    ...reports[2]!,
    facts: reports[2]!.facts.map((current) => current.key === "execution" ? { ...current, status: "unknown" as const } : current),
  }), "DeepSeek Harness · 待验证");
  assert.equal(reportHeadline(reports[2]!), "DeepSeek Harness · 已发现源码，仅静态诊断");
});

test("requires pairing before showing local Connector data", () => {
  const markup = renderToStaticMarkup(createElement(statusScreen.App));

  assert.match(markup, /一次性配对码/);
  assert.match(markup, /安全连接/);
  assert.doesNotMatch(markup, /正在读取本地发现证据/);
  assert.doesNotMatch(markup, /API.?key|开始执行|运行 Harness/i);
});
