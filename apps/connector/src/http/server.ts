import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";

import {
  createEnvelope,
  type ApiError,
  type HarnessReport,
} from "@skillstudio/contracts";

import { ConnectorSession } from "../auth/session.js";
import {
  createHarnessesService,
  type HarnessesService,
} from "../harnesses/service.js";
import { SkillRepository, SkillRepositoryError } from "../skills/repository.js";
import { SafeWriteError } from "../files/safe-write.js";

const LOOPBACK_ADDRESS = "127.0.0.1";
const DEFAULT_BODY_LIMIT = 16 * 1024;
const AUTHORING_BODY_LIMIT = 4 * 1024 * 1024;
const JSON_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
} as const;

interface ConnectorServerOptions {
  port: number;
  requestId?: () => string;
  discoverHarnesses?: () => Promise<HarnessReport[]>;
  harnesses?: HarnessesService;
  skills?: SkillRepository;
  session?: ConnectorSession;
}

export interface ConnectorServer {
  listen(): Promise<number>;
  close(): Promise<void>;
  address(): AddressInfo;
}

function writeJson(
  response: import("node:http").ServerResponse,
  status: number,
  body: unknown,
  extraHeaders: Record<string, string> = {},
): void {
  response.writeHead(status, { ...JSON_HEADERS, ...extraHeaders });
  response.end(JSON.stringify(body));
}

function apiError(code: ApiError["code"], message: string, requestId: string, details?: ApiError["details"]): ApiError {
  return {
    code,
    message,
    requestId,
    ...(details === undefined ? {} : { details }),
  };
}

async function readJson(request: import("node:http").IncomingMessage, maxBytes = DEFAULT_BODY_LIMIT): Promise<unknown> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > maxBytes) throw new Error("Request body exceeds limit.");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

function routeId(pathname: string, prefix: string, suffix = ""): string | null {
  if (!pathname.startsWith(prefix) || !pathname.endsWith(suffix)) return null;
  const raw = pathname.slice(prefix.length, pathname.length - suffix.length || undefined);
  if (raw === "" || raw.includes("/")) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

export function createConnectorServer(options: ConnectorServerOptions): ConnectorServer {
  const requestId = options.requestId ?? randomUUID;
  const harnesses = options.harnesses ?? createHarnessesService({
    discoverHarnesses: options.discoverHarnesses ?? (async () => []),
  });
  const skills = options.skills ?? new SkillRepository();
  const session = options.session;
  const server = createServer(async (request, response) => {
    const id = requestId();
    const pathname = new URL(request.url ?? "/", `http://${LOOPBACK_ADDRESS}`).pathname;
    const method = request.method ?? "GET";

    if (session !== undefined && !session.acceptLocalRequest(request)) {
      writeJson(response, 403, apiError("UNAUTHORIZED", "Only local browser requests are accepted.", id));
      return;
    }

    if (pathname === "/api/bootstrap" && method === "POST") {
      if (session === undefined) {
        writeJson(response, 404, apiError("NOT_FOUND", "The requested endpoint was not found.", id));
        return;
      }
      try {
        const payload = await readJson(request);
        const pairingCode = typeof payload === "object" && payload !== null
          ? (payload as Record<string, unknown>).pairingCode
          : undefined;
        const token = session.createSession(pairingCode);
        if (token === null) {
          writeJson(response, 401, apiError("UNAUTHORIZED", "配对码无效、已使用或已过期。", id));
          return;
        }
        writeJson(response, 200, createEnvelope(id, { connected: true }), {
          "Set-Cookie": `skillstudio_session=${token}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=${12 * 60 * 60}`,
        });
      } catch {
        writeJson(response, 400, apiError("INVALID_REQUEST", "请求内容无效。", id));
      }
      return;
    }

    if (session !== undefined && pathname.startsWith("/api/") && pathname !== "/api/health" && !session.isAuthorized(request)) {
      writeJson(response, 401, apiError("UNAUTHORIZED", "连接器会话已失效，请重新配对。", id));
      return;
    }

    if (method === "GET" && pathname === "/api/health") {
      writeJson(response, 200, createEnvelope(id, { status: "ok" }));
      return;
    }

    if (method === "GET" && pathname === "/api/harnesses") {
      try {
        writeJson(response, 200, createEnvelope(id, await harnesses.list()));
      } catch {
        writeJson(response, 500, {
          code: "INTERNAL",
          message: "The connector could not load harness status.",
          requestId: id,
        });
      }
      return;
    }

    try {
      if (method === "GET" && pathname === "/api/roots") {
        writeJson(response, 200, createEnvelope(id, skills.listRoots()));
        return;
      }

      if (method === "POST" && pathname === "/api/roots") {
        const payload = await readJson(request);
        const body = typeof payload === "object" && payload !== null ? payload as Record<string, unknown> : {};
        const result = await skills.addRoot(typeof body.path === "string" ? body.path : "", body.writeEnabled === true);
        writeJson(response, 201, createEnvelope(id, result));
        return;
      }

      if (method === "POST" && pathname === "/api/skills") {
        const payload = await readJson(request);
        const body = typeof payload === "object" && payload !== null ? payload as Record<string, unknown> : {};
        if (typeof body.rootId !== "string" || body.rootId.length > 100
          || typeof body.directoryName !== "string" || body.directoryName.length > 80
          || typeof body.name !== "string" || body.name.trim() === "" || body.name.length > 200
          || typeof body.description !== "string" || body.description.trim() === "" || body.description.length > 1000) {
          writeJson(response, 400, apiError("INVALID_REQUEST", "创建请求字段无效或超出限制。", id));
          return;
        }
        writeJson(response, 201, createEnvelope(id, await skills.createSkill({
          rootId: body.rootId,
          directoryName: body.directoryName,
          name: body.name,
          description: body.description,
        })));
        return;
      }

      const saveSkillId = routeId(pathname, "/api/skills/", "/content");
      if (method === "PUT" && saveSkillId !== null) {
        const payload = await readJson(request, AUTHORING_BODY_LIMIT);
        const body = typeof payload === "object" && payload !== null ? payload as Record<string, unknown> : {};
        if (saveSkillId.length > 100 || typeof body.content !== "string"
          || typeof body.baseVersion !== "string" || body.baseVersion.length > 128) {
          writeJson(response, 400, apiError("INVALID_REQUEST", "保存请求字段无效或超出限制。", id));
          return;
        }
        writeJson(response, 200, createEnvelope(id, await skills.saveSkill(saveSkillId, {
          content: body.content,
          baseVersion: body.baseVersion,
        })));
        return;
      }

      const scanRootId = routeId(pathname, "/api/roots/", "/scan");
      if (method === "POST" && scanRootId !== null) {
        writeJson(response, 200, createEnvelope(id, await skills.scan(scanRootId)));
        return;
      }

      const rootId = routeId(pathname, "/api/roots/");
      if (method === "DELETE" && rootId !== null) {
        await skills.removeRoot(rootId);
        writeJson(response, 200, createEnvelope(id, { removed: true }));
        return;
      }

      if (method === "GET" && pathname === "/api/skills") {
        const url = new URL(request.url ?? "/", `http://${LOOPBACK_ADDRESS}`);
        const query = url.searchParams.get("q") ?? undefined;
        const rootIdFilter = url.searchParams.get("rootId") ?? undefined;
        if (query !== undefined && query.length > 200) {
          writeJson(response, 400, apiError("INVALID_REQUEST", "搜索内容不能超过 200 个字符。", id));
          return;
        }
        writeJson(response, 200, createEnvelope(id, skills.listSkills({
          ...(query === undefined ? {} : { query }),
          ...(rootIdFilter === undefined ? {} : { rootId: rootIdFilter }),
        })));
        return;
      }

      const skillId = routeId(pathname, "/api/skills/");
      if (method === "GET" && skillId !== null) {
        writeJson(response, 200, createEnvelope(id, await skills.getSkill(skillId)));
        return;
      }
    } catch (error) {
      if (error instanceof SafeWriteError) {
        const status = error.code === "READ_ONLY" ? 403
          : error.code === "CONFLICT" ? 409
            : error.code === "LIMIT_EXCEEDED" ? 413
              : error.code === "NOT_FOUND" ? 404
                : error.code === "ROOT_UNAVAILABLE" ? 403 : 400;
        writeJson(response, status, apiError(error.code, error.message, id,
          error.currentVersion === undefined ? undefined : { currentVersion: error.currentVersion }));
        return;
      }
      if (error instanceof SkillRepositoryError) {
        const status = error.code === "NOT_FOUND" ? 404
          : error.code === "ROOT_UNAVAILABLE" ? 403
            : error.code === "LIMIT_EXCEEDED" ? 413 : 400;
        writeJson(response, status, apiError(error.code, error.message, id));
        return;
      }
      if (error instanceof SyntaxError || (error instanceof Error && error.message === "Request body exceeds limit.")) {
        writeJson(response, error.message === "Request body exceeds limit." ? 413 : 400,
          apiError(error.message === "Request body exceeds limit." ? "LIMIT_EXCEEDED" : "INVALID_REQUEST", "请求内容无效或超出大小限制。", id));
        return;
      }
      writeJson(response, 500, apiError("INTERNAL", "The connector could not complete the request.", id));
      return;
    }

    writeJson(response, 404, apiError("NOT_FOUND", "The requested endpoint was not found.", id));
  });

  return {
    listen: () => listen(server, options.port),
    close: () => close(server),
    address: () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        throw new Error("Connector server is not listening.");
      }
      return address;
    },
  };
}

function listen(server: Server, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const fail = (error: Error): void => {
      server.off("listening", ready);
      reject(error);
    };
    const ready = (): void => {
      server.off("error", fail);
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("Connector server did not expose a TCP address."));
        return;
      }
      resolve(address.port);
    };

    server.once("error", fail);
    server.once("listening", ready);
    server.listen({ host: LOOPBACK_ADDRESS, port });
  });
}

function close(server: Server): Promise<void> {
  if (!server.listening) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    server.close((error) => (error === undefined ? resolve() : reject(error)));
  });
}
