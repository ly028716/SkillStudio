import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export interface RegisteredRoot {
  id: string;
  label: string;
  canonicalPath: string;
  writeEnabled: boolean;
}

export class LocalStateStoreError extends Error {
  constructor(readonly code: "CORRUPT" | "UNSUPPORTED_VERSION" | "WRITE_FAILED", message: string) {
    super(message);
    this.name = "LocalStateStoreError";
  }
}

interface LocalStateStoreOptions {
  dataDirectory?: string;
  replaceFile?: (source: string, destination: string) => Promise<void>;
}

const STATE_SCHEMA_VERSION = 1;
const STATE_FILE_NAME = "state.json";

function defaultDataDirectory(): string {
  const localAppData = process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local");
  return path.join(localAppData, "SkillStudio");
}

function parseRoots(value: unknown): RegisteredRoot[] {
  if (!Array.isArray(value)) throw new LocalStateStoreError("CORRUPT", "本地目录登记状态格式无效。请保留状态文件并检查恢复。");
  const ids = new Set<string>();
  return value.map((item: unknown) => {
    if (item === null || typeof item !== "object") throw new LocalStateStoreError("CORRUPT", "本地目录登记状态格式无效。请保留状态文件并检查恢复。");
    const record = item as Record<string, unknown>;
    if (typeof record.id !== "string" || !record.id || ids.has(record.id)
      || typeof record.label !== "string" || !record.label
      || typeof record.canonicalPath !== "string" || !path.isAbsolute(record.canonicalPath)) {
      throw new LocalStateStoreError("CORRUPT", "本地目录登记状态格式无效。请保留状态文件并检查恢复。");
    }
    ids.add(record.id);
    return { id: record.id, label: record.label, canonicalPath: record.canonicalPath, writeEnabled: record.writeEnabled === true };
  });
}

export class LocalStateStore {
  private readonly dataDirectory: string;
  private readonly replaceFile: (source: string, destination: string) => Promise<void>;

  constructor(options: LocalStateStoreOptions = {}) {
    this.dataDirectory = options.dataDirectory ?? process.env.SKILLSTUDIO_DATA_DIR ?? defaultDataDirectory();
    this.replaceFile = options.replaceFile ?? (async (source, destination) => rename(source, destination));
  }

  async loadRoots(): Promise<RegisteredRoot[]> {
    const filePath = path.join(this.dataDirectory, STATE_FILE_NAME);
    let text: string;
    try {
      text = await readFile(filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw new LocalStateStoreError("CORRUPT", "本地目录登记状态无法读取。请检查文件权限并重试。");
    }

    let state: unknown;
    try {
      state = JSON.parse(text);
    } catch {
      throw new LocalStateStoreError("CORRUPT", "本地目录登记状态不是有效 JSON。原文件已保留，请检查恢复。");
    }
    if (state === null || typeof state !== "object" || !("schemaVersion" in state)) {
      throw new LocalStateStoreError("CORRUPT", "本地目录登记状态缺少版本信息。原文件已保留，请检查恢复。");
    }
    const schemaVersion = (state as { schemaVersion?: unknown }).schemaVersion;
    if (schemaVersion !== STATE_SCHEMA_VERSION) {
      throw new LocalStateStoreError("UNSUPPORTED_VERSION", "本地目录登记状态版本不受支持。原文件已保留，请升级或恢复。");
    }
    return parseRoots((state as { roots?: unknown }).roots);
  }

  async saveRoots(roots: readonly RegisteredRoot[]): Promise<void> {
    const safeRoots = parseRoots(roots.map(({ id, label, canonicalPath, writeEnabled }) => ({ id, label, canonicalPath, writeEnabled })));
    const stateText = `${JSON.stringify({ schemaVersion: STATE_SCHEMA_VERSION, roots: safeRoots }, null, 2)}\n`;
    const filePath = path.join(this.dataDirectory, STATE_FILE_NAME);
    const temporaryPath = path.join(this.dataDirectory, `.state-${randomUUID()}.tmp`);
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      await mkdir(this.dataDirectory, { recursive: true });
      handle = await open(temporaryPath, "wx", 0o600);
      await handle.writeFile(stateText, "utf8");
      await handle.sync();
      await handle.close();
      handle = undefined;
      await this.replaceFile(temporaryPath, filePath);
    } catch {
      await handle?.close().catch(() => undefined);
      await rm(temporaryPath, { force: true }).catch(() => undefined);
      throw new LocalStateStoreError("WRITE_FAILED", "本地目录登记状态保存失败。之前的状态文件未被覆盖。");
    }
  }
}
