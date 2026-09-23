import { discoverHarnesses } from "@skillstudio/harness-core";
import type { HarnessDiscoveryPort } from "@skillstudio/contracts";

import { ConnectorSession } from "./auth/session.js";
import { createHarnessesService } from "./harnesses/service.js";
import { createConnectorServer } from "./http/server.js";
import { parseConnectorPort } from "./port.js";
import { SkillRepository } from "./skills/repository.js";
import { LocalStateStore } from "./state/local-state.js";

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
const session = new ConnectorSession();
const skills = new SkillRepository(new LocalStateStore());

void skills.restore().then(() => {
  const connector = createConnectorServer({ port, harnesses, session, skills });
  return connector.listen().then((listeningPort) => {
    process.stdout.write(`SkillStudio connector listening on http://127.0.0.1:${listeningPort}\n`);
    process.stdout.write(`Browser pairing code (valid for 30 minutes, one use): ${session.pairingCode}\n`);
  });
}).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "未知错误";
  process.stderr.write(`SkillStudio connector could not restore local state: ${message}\n`);
  process.exitCode = 1;
});
