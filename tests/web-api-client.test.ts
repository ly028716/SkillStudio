import assert from "node:assert/strict";
import test from "node:test";

import type { HarnessReport } from "@skillstudio/contracts";
import {
  ConnectorUnavailableError,
  getHarnessReports,
} from "../apps/web/src/api/client.js";

const reports: HarnessReport[] = [
  {
    schemaVersion: "2026-09-10",
    kind: "codex",
    displayName: "Codex",
    executablePath: "C:\\Tools\\codex.exe",
    detectedVersion: "0.153.4",
    facts: [],
  },
  {
    schemaVersion: "2026-09-10",
    kind: "hermes",
    displayName: "Hermes Agent",
    executablePath: null,
    detectedVersion: "0.21.0",
    facts: [],
  },
  {
    schemaVersion: "2026-09-10",
    kind: "deepseek",
    displayName: "DeepSeek Harness",
    executablePath: null,
    detectedVersion: "0.1.3-alpha.1",
    facts: [],
  },
];

function response(body: unknown, ok = true): Response {
  return {
    ok,
    json: async () => body,
  } as Response;
}

test("returns reports from the versioned Connector envelope", async () => {
  let request: { url: string; init: RequestInit | undefined } | undefined;
  const fetchImpl: typeof fetch = async (input, init) => {
    request = { url: String(input), init };
    return response({
      schemaVersion: "2026-09-10",
      requestId: "request-123",
      data: reports,
    });
  };

  const result = await getHarnessReports(fetchImpl, "http://127.0.0.1:4317");

  assert.deepEqual(result, reports);
  assert.deepEqual(request, {
    url: "http://127.0.0.1:4317/api/harnesses",
    init: { headers: { Accept: "application/json" } },
  });
});

test("rejects non-success Connector responses", async () => {
  await assert.rejects(
    getHarnessReports(async () => response({ code: "INTERNAL" }, false), "http://127.0.0.1:4317"),
    ConnectorUnavailableError,
  );
});

test("rejects envelopes without a report array", async () => {
  await assert.rejects(
    getHarnessReports(
      async () => response({ schemaVersion: "2026-09-10", requestId: "request-123", data: {} }),
      "http://127.0.0.1:4317",
    ),
    ConnectorUnavailableError,
  );
});

test("reports a localized unavailable error when the Connector cannot be reached", async () => {
  await assert.rejects(
    getHarnessReports(
      async () => Promise.reject(new Error("network unavailable")),
      "http://127.0.0.1:4317",
    ),
    (error: unknown) => {
      assert.ok(error instanceof ConnectorUnavailableError);
      assert.equal(error.message, "无法连接本地连接器");
      return true;
    },
  );
});
