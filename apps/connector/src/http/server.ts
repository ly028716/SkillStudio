import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";

import { createEnvelope, type HarnessReport } from "@skillstudio/contracts";

import {
  createHarnessesService,
  type HarnessesService,
} from "../harnesses/service.js";

const LOOPBACK_ADDRESS = "127.0.0.1";
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
}

export interface ConnectorServer {
  listen(): Promise<number>;
  close(): Promise<void>;
  address(): AddressInfo;
}

function writeJson(response: import("node:http").ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, JSON_HEADERS);
  response.end(JSON.stringify(body));
}

function notFound(requestId: string): { code: "NOT_FOUND"; message: string; requestId: string } {
  return {
    code: "NOT_FOUND",
    message: "The requested endpoint was not found.",
    requestId,
  };
}

export function createConnectorServer(options: ConnectorServerOptions): ConnectorServer {
  const requestId = options.requestId ?? randomUUID;
  const harnesses = options.harnesses ?? createHarnessesService({
    discoverHarnesses: options.discoverHarnesses ?? (async () => []),
  });
  const server = createServer(async (request, response) => {
    const id = requestId();
    const pathname = new URL(request.url ?? "/", `http://${LOOPBACK_ADDRESS}`).pathname;

    if (request.method !== "GET") {
      writeJson(response, 404, notFound(id));
      return;
    }

    if (pathname === "/api/health") {
      writeJson(response, 200, createEnvelope(id, { status: "ok" }));
      return;
    }

    if (pathname === "/api/harnesses") {
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

    writeJson(response, 404, notFound(id));
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
