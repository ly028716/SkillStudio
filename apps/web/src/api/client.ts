import {
  CONTRACT_SCHEMA_VERSION,
  type ApiEnvelope,
  type CapabilityFact,
  type HarnessReport,
} from "@skillstudio/contracts";

const harnessKinds = new Set<HarnessReport["kind"]>(["codex", "hermes", "deepseek"]);
const factKeys = new Set<CapabilityFact["key"]>([
  "installation",
  "version",
  "execution",
  "skillDiscovery",
]);
const factStatuses = new Set<CapabilityFact["status"]>([
  "ready",
  "blocked",
  "not_installed",
  "unknown",
  "unsupported",
]);

export class ConnectorUnavailableError extends Error {
  constructor() {
    super("无法连接本地连接器");
    this.name = "ConnectorUnavailableError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isCapabilityFact(value: unknown): value is CapabilityFact {
  return isRecord(value)
    && typeof value.key === "string"
    && factKeys.has(value.key as CapabilityFact["key"])
    && typeof value.status === "string"
    && factStatuses.has(value.status as CapabilityFact["status"])
    && typeof value.summary === "string"
    && isStringArray(value.evidence)
    && typeof value.checkedAt === "string";
}

function isHarnessReport(value: unknown): value is HarnessReport {
  return isRecord(value)
    && value.schemaVersion === CONTRACT_SCHEMA_VERSION
    && typeof value.kind === "string"
    && harnessKinds.has(value.kind as HarnessReport["kind"])
    && typeof value.displayName === "string"
    && (typeof value.executablePath === "string" || value.executablePath === null)
    && (typeof value.detectedVersion === "string" || value.detectedVersion === null)
    && Array.isArray(value.facts)
    && value.facts.every(isCapabilityFact);
}

export function resolveConnectorBaseUrl(value: string | undefined): string {
  if (value === undefined || value === "") {
    return "";
  }

  try {
    const url = new URL(value);
    if (
      url.protocol !== "http:"
      || (url.hostname !== "127.0.0.1" && url.hostname !== "localhost")
      || url.username !== ""
      || url.password !== ""
    ) {
      throw new ConnectorUnavailableError();
    }

    return url.origin;
  } catch (error) {
    if (error instanceof ConnectorUnavailableError) {
      throw error;
    }

    throw new ConnectorUnavailableError();
  }
}

export async function getHarnessReports(
  fetchImpl: typeof fetch,
  baseUrl: string,
): Promise<HarnessReport[]> {
  try {
    const response = await fetchImpl(`${resolveConnectorBaseUrl(baseUrl)}/api/harnesses`, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new ConnectorUnavailableError();
    }

    const envelope: ApiEnvelope<unknown> = await response.json();
    if (!Array.isArray(envelope.data) || !envelope.data.every(isHarnessReport)) {
      throw new ConnectorUnavailableError();
    }

    return envelope.data;
  } catch (error) {
    if (error instanceof ConnectorUnavailableError) {
      throw error;
    }

    throw new ConnectorUnavailableError();
  }
}
