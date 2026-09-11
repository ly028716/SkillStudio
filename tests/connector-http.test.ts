import assert from "node:assert/strict";
import test from "node:test";

import { type HarnessReport } from "@skillstudio/contracts";
import { createConnectorServer } from "../apps/connector/src/http/server.js";

const reports: HarnessReport[] = ["codex", "hermes", "deepseek"].map((kind) => ({
  schemaVersion: "2026-09-10",
  kind: kind as HarnessReport["kind"],
  displayName: `${kind} Harness`,
  executablePath: null,
  detectedVersion: null,
  facts: [],
}));

async function withConnector(
  run: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const connector = createConnectorServer({
    port: 0,
    requestId: () => "request-123",
    discoverHarnesses: async () => reports,
  });
  const port = await connector.listen();

  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await connector.close();
  }
}

function assertSafeJsonHeaders(response: Response): void {
  assert.equal(response.headers.get("content-type"), "application/json; charset=utf-8");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
}

test("returns the exact versioned health envelope with an injected request id", async () => {
  await withConnector(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/health`);

    assert.equal(response.status, 200);
    assertSafeJsonHeaders(response);
    assert.deepEqual(await response.json(), {
      schemaVersion: "2026-09-10",
      requestId: "request-123",
      data: { status: "ok" },
    });
  });
});

test("returns three injected harness reports through the loopback API", async () => {
  await withConnector(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/harnesses`);

    assert.equal(response.status, 200);
    assertSafeJsonHeaders(response);
    assert.deepEqual(await response.json(), {
      schemaVersion: "2026-09-10",
      requestId: "request-123",
      data: reports,
    });
  });
});

test("returns a JSON NOT_FOUND error for missing paths", async () => {
  await withConnector(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/missing`);

    assert.equal(response.status, 404);
    assertSafeJsonHeaders(response);
    assert.deepEqual(await response.json(), {
      code: "NOT_FOUND",
      message: "The requested endpoint was not found.",
      requestId: "request-123",
    });
  });
});

test("rejects non-GET requests with safe JSON headers", async () => {
  await withConnector(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/health`, { method: "POST" });

    assert.equal(response.status, 405);
    assertSafeJsonHeaders(response);
    assert.deepEqual(await response.json(), {
      code: "INVALID_REQUEST",
      message: "Only GET requests are supported.",
      requestId: "request-123",
    });
  });
});

test("returns a safe JSON error when injected harness discovery fails", async () => {
  const connector = createConnectorServer({
    port: 0,
    requestId: () => "request-123",
    discoverHarnesses: async () => {
      throw new Error("unavailable");
    },
  });
  const port = await connector.listen();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/harnesses`);

    assert.equal(response.status, 500);
    assertSafeJsonHeaders(response);
    assert.deepEqual(await response.json(), {
      code: "INTERNAL",
      message: "The connector could not load harness status.",
      requestId: "request-123",
    });
  } finally {
    await connector.close();
  }
});

test("binds its listening socket to IPv4 loopback only", async () => {
  const connector = createConnectorServer({
    port: 0,
    discoverHarnesses: async () => reports,
  });

  await connector.listen();
  try {
    assert.equal(connector.address().address, "127.0.0.1");
  } finally {
    await connector.close();
  }
});
