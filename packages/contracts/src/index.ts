export const CONTRACT_SCHEMA_VERSION = "2026-09-10" as const;

export type HarnessKind = "codex" | "hermes" | "deepseek";

export type FactStatus =
  | "ready"
  | "blocked"
  | "not_installed"
  | "unknown"
  | "unsupported";

export interface CapabilityFact {
  key: "installation" | "version" | "execution" | "skillDiscovery";
  status: FactStatus;
  summary: string;
  evidence: string[];
  checkedAt: string;
}

export interface HarnessReport {
  schemaVersion: typeof CONTRACT_SCHEMA_VERSION;
  kind: HarnessKind;
  displayName: string;
  executablePath: string | null;
  detectedVersion: string | null;
  facts: CapabilityFact[];
}

export interface ApiEnvelope<T> {
  schemaVersion: typeof CONTRACT_SCHEMA_VERSION;
  requestId: string;
  data: T;
}

export interface ApiError {
  code: "CONNECTOR_UNAVAILABLE" | "INVALID_REQUEST" | "NOT_FOUND" | "INTERNAL";
  message: string;
  requestId: string;
}

export interface HarnessDiscoveryPort {
  find(command: string): Promise<string | null>;
  version(commandPath: string): Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
  }>;
  isFile(path: string): Promise<boolean>;
  readText(path: string): Promise<string | null>;
  pythonVersion(): Promise<string | null>;
  now(): string;
}

export interface HarnessDiscoveryConfig {
  hermesSourceCheckout: string | null;
  deepseekSourceCheckout: string | null;
}

export function createEnvelope<T>(requestId: string, data: T): ApiEnvelope<T> {
  return {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    requestId,
    data,
  };
}
