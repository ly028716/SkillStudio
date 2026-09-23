import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";

const PAIRING_WINDOW_MS = 30 * 60 * 1000;
const SESSION_WINDOW_MS = 12 * 60 * 60 * 1000;
const TRUSTED_BROWSER_ORIGINS = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
]);

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

export class ConnectorSession {
  private pairingCodeValue = randomBytes(24).toString("base64url");
  private readonly pairingDigest = digest(this.pairingCodeValue);
  private readonly sessions = new Map<string, number>();
  private pairingExpiresAt = Date.now() + PAIRING_WINDOW_MS;
  private pairingUsed = false;

  acceptLocalRequest(request: IncomingMessage): boolean {
    const host = request.headers.host;
    if (host === undefined) return false;

    let hostName: string;
    try {
      hostName = new URL(`http://${host}`).hostname;
    } catch {
      return false;
    }
    if (!isLoopbackHostname(hostName)) return false;

    const origin = request.headers.origin;
    if (origin === undefined) return true;
    try {
      return TRUSTED_BROWSER_ORIGINS.has(new URL(origin).origin);
    } catch {
      return false;
    }
  }

  createSession(pairingCode: unknown): string | null {
    if (typeof pairingCode !== "string" || this.pairingUsed || Date.now() > this.pairingExpiresAt) return null;
    const candidate = digest(pairingCode);
    if (!timingSafeEqual(candidate, this.pairingDigest)) return null;

    this.pairingUsed = true;
    this.pairingCodeValue = "";
    const token = randomUUID();
    this.sessions.set(token, Date.now() + SESSION_WINDOW_MS);
    return token;
  }

  get pairingCode(): string {
    return this.pairingCodeValue;
  }

  isAuthorized(request: IncomingMessage): boolean {
    const cookieHeader = request.headers.cookie ?? "";
    const token = cookieHeader
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith("skillstudio_session="))
      ?.slice("skillstudio_session=".length);
    if (token === undefined) return false;

    const expiresAt = this.sessions.get(token);
    if (expiresAt === undefined) return false;
    if (Date.now() > expiresAt) {
      this.sessions.delete(token);
      return false;
    }
    return true;
  }
}
