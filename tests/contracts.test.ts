import assert from "node:assert/strict";
import test from "node:test";

import {
  CONTRACT_SCHEMA_VERSION,
  createEnvelope,
  type FactStatus,
} from "@skillstudio/contracts";

test("exports the M0 contract schema version", () => {
  assert.equal(CONTRACT_SCHEMA_VERSION, "2026-09-10");
});

test("creates a versioned API envelope", () => {
  const factStatus = "ready" satisfies FactStatus;
  assert.equal(factStatus, "ready");

  assert.deepEqual(createEnvelope("req-1", { status: "ok" }), {
    schemaVersion: "2026-09-10",
    requestId: "req-1",
    data: { status: "ok" },
  });
});
