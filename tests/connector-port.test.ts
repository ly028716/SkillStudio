import assert from "node:assert/strict";
import test from "node:test";

import { parseConnectorPort } from "../apps/connector/src/port.js";

test("defaults the connector port to 4317 when SKILLSTUDIO_PORT is absent", () => {
  assert.equal(parseConnectorPort(undefined), 4317);
});

test("accepts the inclusive SKILLSTUDIO_PORT bounds", () => {
  assert.equal(parseConnectorPort("1024"), 1024);
  assert.equal(parseConnectorPort("65535"), 65535);
});

test("rejects malformed and out-of-range SKILLSTUDIO_PORT values", () => {
  for (const value of ["1023", "65536", "4317.5", "not-a-port"]) {
    assert.throws(
      () => parseConnectorPort(value),
      /SKILLSTUDIO_PORT must be an integer from 1024 through 65535\./,
    );
  }
});
