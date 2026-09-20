import type { HarnessKind } from "@skillstudio/contracts";

export interface HarnessProfile {
  readonly kind: HarnessKind;
  readonly displayName: string;
}

export const CODEX_PROFILE: HarnessProfile = {
  kind: "codex",
  displayName: "Codex CLI",
};

export const HERMES_PROFILE: HarnessProfile = {
  kind: "hermes",
  displayName: "Hermes Agent",
};

export const DEEPSEEK_PROFILE: HarnessProfile = {
  kind: "deepseek",
  displayName: "DeepSeek Harness",
};
