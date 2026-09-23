import {
  CONTRACT_SCHEMA_VERSION,
  type ApiEnvelope,
  type CapabilityFact,
  type CreateSkillRequest,
  type HarnessReport,
  type RootScanResult,
  type SaveSkillRequest,
  type SkillDetail,
  type SkillRoot,
  type SkillSummary,
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

export class ConnectorRequestError extends Error {
  constructor(readonly status: number, message: string, readonly currentVersion?: string) {
    super(message);
    this.name = "ConnectorRequestError";
  }
}

const SESSION_KEY = "skillstudio.connector.paired";

function hasPairedSessionMarker(): boolean {
  if (typeof window === "undefined") return false;
  return window.sessionStorage.getItem(SESSION_KEY) === "1";
}

async function request<T>(
  fetchImpl: typeof fetch,
  baseUrl: string,
  pathname: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body !== undefined) headers.set("Content-Type", "application/json");
  let response: Response;
  try {
    response = await fetchImpl(`${resolveConnectorBaseUrl(baseUrl)}${pathname}`, { ...init, headers });
  } catch {
    throw new ConnectorUnavailableError();
  }

  if (response.status === 401) {
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(SESSION_KEY);
      window.dispatchEvent(new Event("skillstudio:session-expired"));
    }
    throw new ConnectorRequestError(401, "连接器会话已失效，请重新配对。");
  }
  if (!response.ok) {
    let message = "本地连接器请求失败。";
    let currentVersion: string | undefined;
    try {
      const error = await response.json() as { message?: unknown; details?: { currentVersion?: unknown } };
      if (typeof error.message === "string") message = error.message;
      if (typeof error.details?.currentVersion === "string") currentVersion = error.details.currentVersion;
    } catch {
      // Keep the localized fallback for non-JSON responses.
    }
    throw new ConnectorRequestError(response.status, message, currentVersion);
  }

  const envelope = await response.json() as ApiEnvelope<T>;
  if (envelope.schemaVersion !== CONTRACT_SCHEMA_VERSION || !("data" in envelope)) {
    throw new ConnectorUnavailableError();
  }
  return envelope.data;
}

export async function connectWithPairingCode(fetchImpl: typeof fetch, baseUrl: string, pairingCode: string): Promise<void> {
  const data = await request<{ connected: boolean }>(
    fetchImpl,
    baseUrl,
    "/api/bootstrap",
    { method: "POST", body: JSON.stringify({ pairingCode }) },
  );
  if (data.connected !== true || typeof window === "undefined") {
    throw new ConnectorUnavailableError();
  }
  window.sessionStorage.setItem(SESSION_KEY, "1");
}

export function hasConnectorSession(): boolean {
  return hasPairedSessionMarker();
}

export async function getRoots(fetchImpl: typeof fetch, baseUrl: string): Promise<SkillRoot[]> {
  return request(fetchImpl, baseUrl, "/api/roots");
}

export async function addRoot(fetchImpl: typeof fetch, baseUrl: string, path: string, writeEnabled = false): Promise<RootScanResult> {
  return request(fetchImpl, baseUrl, "/api/roots", { method: "POST", body: JSON.stringify({ path, writeEnabled }) });
}

export async function removeRoot(fetchImpl: typeof fetch, baseUrl: string, rootId: string): Promise<void> {
  await request(fetchImpl, baseUrl, `/api/roots/${encodeURIComponent(rootId)}`, { method: "DELETE" });
}

export async function scanRoot(fetchImpl: typeof fetch, baseUrl: string, rootId: string): Promise<RootScanResult> {
  return request(fetchImpl, baseUrl, `/api/roots/${encodeURIComponent(rootId)}/scan`, { method: "POST" });
}

export async function getSkills(
  fetchImpl: typeof fetch,
  baseUrl: string,
  options: { query?: string; rootId?: string } = {},
): Promise<SkillSummary[]> {
  const query = new URLSearchParams();
  if (options.query !== undefined) query.set("q", options.query);
  if (options.rootId !== undefined) query.set("rootId", options.rootId);
  const suffix = query.size === 0 ? "" : `?${query.toString()}`;
  return request(fetchImpl, baseUrl, `/api/skills${suffix}`);
}

export async function getSkill(fetchImpl: typeof fetch, baseUrl: string, skillId: string): Promise<SkillDetail> {
  return request(fetchImpl, baseUrl, `/api/skills/${encodeURIComponent(skillId)}`);
}

export async function createSkill(fetchImpl: typeof fetch, baseUrl: string, input: CreateSkillRequest): Promise<SkillDetail> {
  return request(fetchImpl, baseUrl, "/api/skills", { method: "POST", body: JSON.stringify(input) });
}

export async function saveSkill(fetchImpl: typeof fetch, baseUrl: string, skillId: string, input: SaveSkillRequest): Promise<SkillDetail> {
  return request(fetchImpl, baseUrl, `/api/skills/${encodeURIComponent(skillId)}/content`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
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
    const reports = await request<unknown>(fetchImpl, baseUrl, "/api/harnesses");
    if (!Array.isArray(reports) || !reports.every(isHarnessReport)) {
      throw new ConnectorUnavailableError();
    }

    return reports;
  } catch (error) {
    if (error instanceof ConnectorUnavailableError) {
      throw error;
    }

    throw new ConnectorUnavailableError();
  }
}
