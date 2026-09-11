import { discoverHarnesses } from "@skillstudio/harness-core";
import type { HarnessDiscoveryPort } from "@skillstudio/contracts";

import { createHarnessesService } from "./harnesses/service.js";
import { createConnectorServer } from "./http/server.js";

const DEFAULT_PORT = 4317;

function configuredPort(value: string | undefined): number {
  if (value === undefined || value === "") {
    return DEFAULT_PORT;
  }

  if (!/^\d+$/.test(value)) {
    throw new Error("SKILLSTUDIO_PORT must be an integer from 1024 through 65535.");
  }

  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) {
    throw new Error("SKILLSTUDIO_PORT must be an integer from 1024 through 65535.");
  }
  return port;
}

const nonExecutingDiscoveryPort: HarnessDiscoveryPort = {
  find: async () => null,
  version: async () => ({ exitCode: 1, stdout: "", stderr: "" }),
  isFile: async () => false,
  readText: async () => null,
  pythonVersion: async () => null,
  now: () => new Date().toISOString(),
};

const port = configuredPort(process.env.SKILLSTUDIO_PORT);
const harnesses = createHarnessesService({
  discoverHarnesses: () => discoverHarnesses(nonExecutingDiscoveryPort, {
    hermesSourceCheckout: null,
    deepseekSourceCheckout: null,
  }),
});
const connector = createConnectorServer({ port, harnesses });

void connector.listen().then((listeningPort) => {
  process.stdout.write(`SkillStudio connector listening on http://127.0.0.1:${listeningPort}\n`);
});
