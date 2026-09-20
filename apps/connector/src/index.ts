import { discoverHarnesses } from "@skillstudio/harness-core";
import type { HarnessDiscoveryPort } from "@skillstudio/contracts";

import { createHarnessesService } from "./harnesses/service.js";
import { createConnectorServer } from "./http/server.js";
import { parseConnectorPort } from "./port.js";

const nonExecutingDiscoveryPort: HarnessDiscoveryPort = {
  find: async () => null,
  version: async () => ({ exitCode: 1, stdout: "", stderr: "" }),
  isFile: async () => false,
  readText: async () => null,
  pythonVersion: async () => null,
  now: () => new Date().toISOString(),
};

const port = parseConnectorPort(process.env.SKILLSTUDIO_PORT);
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
