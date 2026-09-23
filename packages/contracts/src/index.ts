export const CONTRACT_SCHEMA_VERSION = "2026-09-23" as const;

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
  code:
    | "CONNECTOR_UNAVAILABLE"
    | "INVALID_REQUEST"
    | "NOT_FOUND"
    | "INTERNAL"
    | "UNAUTHORIZED"
    | "ROOT_UNAVAILABLE"
    | "PATH_OUTSIDE_ROOT"
    | "LIMIT_EXCEEDED"
    | "CONFLICT"
    | "READ_ONLY";
  message: string;
  requestId: string;
  details?: { currentVersion?: string };
}

export interface CreateSkillRequest {
  rootId: string;
  directoryName: string;
  name: string;
  description: string;
}

export interface SaveSkillRequest {
  content: string;
  baseVersion: string;
}

export type DiagnosticLayer = "structure" | "style" | "harness" | "capability";
export type DiagnosticSeverity = "error" | "warning" | "info";

export interface SkillDiagnostic {
  code: string;
  layer: DiagnosticLayer;
  severity: DiagnosticSeverity;
  message: string;
  line?: number;
  column?: number;
  rulesetVersion?: string;
}

export type RootScanStatus = "idle" | "scanning" | "ready" | "partial" | "error";

export interface SkillRoot {
  schemaVersion: typeof CONTRACT_SCHEMA_VERSION;
  id: string;
  label: string;
  canonicalPath: string;
  writeEnabled: boolean;
  scanStatus: RootScanStatus;
  skillCount: number;
  issueCount: number;
  scannedAt: string | null;
}

export interface SkillSummary {
  schemaVersion: typeof CONTRACT_SCHEMA_VERSION;
  id: string;
  rootId: string;
  relativePath: string;
  name: string;
  description: string;
  contentVersion: string;
  diagnostics: Array<{ severity: "error" | "warning"; message: string }>;
}

export interface SkillDetail extends SkillSummary {
  content: string;
}

export interface RootScanResult {
  schemaVersion: typeof CONTRACT_SCHEMA_VERSION;
  root: SkillRoot;
  skills: SkillSummary[];
  issues: Array<{ relativePath: string; message: string }>;
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
