import { createHash, randomUUID } from "node:crypto";
import { link, lstat, mkdir, open, readFile, realpath, rename, rm, rmdir, stat, unlink } from "node:fs/promises";
import path from "node:path";

const MAX_CONTENT_BYTES = 1024 * 1024;
const fileLocks = new Map<string, Promise<void>>();

async function withFileLock<T>(filePath: string, operation: () => Promise<T>): Promise<T> {
  const previous = fileLocks.get(filePath) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  const queued = previous.then(() => current);
  fileLocks.set(filePath, queued);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (fileLocks.get(filePath) === queued) fileLocks.delete(filePath);
  }
}

interface SafeFileTarget {
  directory: string;
  file: string;
  directoryIdentity: { dev: number; ino: number };
}

async function isDirectoryIdentityCurrent(root: string, target: SafeFileTarget): Promise<boolean> {
  try {
    const current = await lstat(target.directory);
    return current.isDirectory()
      && !current.isSymbolicLink()
      && current.dev === target.directoryIdentity.dev
      && current.ino === target.directoryIdentity.ino
      && await realpath(target.directory) === target.directory
      && isWithinRoot(root, target.directory);
  } catch {
    return false;
  }
}

export class SafeWriteError extends Error {
  constructor(
    readonly code: "READ_ONLY" | "PATH_OUTSIDE_ROOT" | "CONFLICT" | "INVALID_REQUEST" | "LIMIT_EXCEEDED" | "NOT_FOUND" | "ROOT_UNAVAILABLE",
    message: string,
    readonly currentVersion?: string,
  ) {
    super(message);
    this.name = "SafeWriteError";
  }
}

interface WriteRequest {
  rootPath: string;
  writable: boolean;
  content: string;
}

interface SaveSkillFileRequest extends WriteRequest {
  relativePath: string;
  baseVersion: string;
  beforeReplace?: () => Promise<void>;
}

interface CreateSkillFileRequest extends WriteRequest {
  directoryName: string;
}

function contentVersion(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function isWithinRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function assertWritable(request: WriteRequest): void {
  if (!request.writable) throw new SafeWriteError("READ_ONLY", "该目录尚未获得写入授权。");
  if (Buffer.byteLength(request.content, "utf8") > MAX_CONTENT_BYTES) {
    throw new SafeWriteError("LIMIT_EXCEEDED", "Skill 内容超过 1 MiB。");
  }
}

async function canonicalRoot(rootPath: string): Promise<string> {
  try {
    const rootStat = await lstat(rootPath);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error("invalid root");
    const canonical = await realpath(rootPath);
    if (!(await stat(canonical)).isDirectory()) throw new Error("invalid root");
    return canonical;
  } catch {
    throw new SafeWriteError("ROOT_UNAVAILABLE", "已登记的根目录无法读取，请重新授权。");
  }
}

function safeSegments(relativePath: string): string[] {
  if (typeof relativePath !== "string" || relativePath.trim() === "" || path.isAbsolute(relativePath)) {
    throw new SafeWriteError("PATH_OUTSIDE_ROOT", "Skill 路径不在授权根目录内。");
  }
  const segments = relativePath.split(/[\\/]/);
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new SafeWriteError("PATH_OUTSIDE_ROOT", "Skill 路径不在授权根目录内。");
  }
  return segments;
}

async function resolveSkillFile(root: string, relativePath: string): Promise<SafeFileTarget> {
  const segments = safeSegments(relativePath);
  let current = root;
  try {
    for (const segment of segments) {
      current = path.join(current, segment);
      const entryStat = await lstat(current);
      if (!entryStat.isDirectory() || entryStat.isSymbolicLink()) throw new Error("unsafe path");
      const canonical = await realpath(current);
      if (!isWithinRoot(root, canonical)) throw new Error("outside root");
      current = canonical;
    }
    const directory = current;
    const directoryStat = await lstat(directory);
    const file = path.join(directory, "SKILL.md");
    const fileStat = await lstat(file);
    if (!fileStat.isFile() || fileStat.isSymbolicLink()) throw new Error("unsafe file");
    if (!isWithinRoot(root, await realpath(file))) throw new Error("outside root");
    return { directory, file, directoryIdentity: { dev: directoryStat.dev, ino: directoryStat.ino } };
  } catch (error) {
    if (error instanceof SafeWriteError) throw error;
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new SafeWriteError("NOT_FOUND", "找不到该 Skill 文件。");
    throw new SafeWriteError("PATH_OUTSIDE_ROOT", "Skill 路径不在授权根目录内或包含符号链接。");
  }
}

async function stageFile(directory: string, content: string): Promise<string> {
  const temporaryPath = path.join(directory, `.skillstudio-${randomUUID()}.tmp`);
  const handle = await open(temporaryPath, "wx", 0o600);
  try {
    await handle.writeFile(content, "utf8");
    await handle.sync();
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  } finally {
    await handle.close();
  }
  return temporaryPath;
}

export async function createSkillFile(request: CreateSkillFileRequest): Promise<{ relativePath: string; contentVersion: string }> {
  assertWritable(request);
  const windowsReservedName = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(request.directoryName);
  if (!/^[\p{L}\p{N}][\p{L}\p{N}._ -]{0,79}$/u.test(request.directoryName)
    || /[. ]$/.test(request.directoryName) || windowsReservedName) {
    throw new SafeWriteError("INVALID_REQUEST", "目录名只能包含字母、数字、空格、点、下划线和连字符，且不能以点开头。");
  }

  const root = await canonicalRoot(request.rootPath);
  const directory = path.join(root, request.directoryName);
  if (!isWithinRoot(root, directory)) throw new SafeWriteError("PATH_OUTSIDE_ROOT", "Skill 路径不在授权根目录内。");
  try {
    await mkdir(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new SafeWriteError("CONFLICT", "目标目录已存在，未覆盖任何文件。");
    throw new SafeWriteError("ROOT_UNAVAILABLE", "无法在授权根目录中创建 Skill 目录。");
  }

  const file = path.join(directory, "SKILL.md");
  let temporaryPath: string | undefined;
  try {
    temporaryPath = await stageFile(directory, request.content);
    await link(temporaryPath, file);
    await unlink(temporaryPath);
    temporaryPath = undefined;
    const savedContent = await readFile(file, "utf8");
    return { relativePath: request.directoryName, contentVersion: contentVersion(savedContent) };
  } catch (error) {
    if (temporaryPath !== undefined) await rm(temporaryPath, { force: true }).catch(() => undefined);
    await rmdir(directory).catch(() => undefined);
    if (error instanceof SafeWriteError) throw error;
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new SafeWriteError("CONFLICT", "目标 Skill 文件已存在，未覆盖任何文件。");
    throw new SafeWriteError("ROOT_UNAVAILABLE", "Skill 文件创建失败；未保留不完整的新目录。");
  }
}

export async function saveSkillFile(request: SaveSkillFileRequest): Promise<{ contentVersion: string }> {
  assertWritable(request);
  if (!/^[a-f\d]{64}$/i.test(request.baseVersion)) {
    throw new SafeWriteError("INVALID_REQUEST", "保存请求缺少有效的基准版本。");
  }

  const root = await canonicalRoot(request.rootPath);
  const initialTarget = await resolveSkillFile(root, request.relativePath);
  return withFileLock(initialTarget.file, async () => {
    let target: SafeFileTarget;
    try {
      target = await resolveSkillFile(root, request.relativePath);
    } catch (error) {
      if (error instanceof SafeWriteError) throw error;
      throw new SafeWriteError("PATH_OUTSIDE_ROOT", "Skill 路径在保存期间发生变化。");
    }
    if (target.file !== initialTarget.file
      || target.directoryIdentity.dev !== initialTarget.directoryIdentity.dev
      || target.directoryIdentity.ino !== initialTarget.directoryIdentity.ino) {
      throw new SafeWriteError("PATH_OUTSIDE_ROOT", "Skill 路径在保存期间发生变化。");
    }

    let original: string;
    try {
      if ((await stat(target.file)).size > MAX_CONTENT_BYTES) throw new SafeWriteError("LIMIT_EXCEEDED", "当前 Skill 文件超过 1 MiB，未保存修改。");
      original = await readFile(target.file, "utf8");
    } catch (error) {
      if (error instanceof SafeWriteError) throw error;
      throw new SafeWriteError("ROOT_UNAVAILABLE", "Skill 文件无法读取，未保存修改。");
    }
    if (contentVersion(original) !== request.baseVersion) {
      throw new SafeWriteError("CONFLICT", "Skill 文件已在其他位置修改。请重新载入或复制草稿后再继续。", contentVersion(original));
    }

    let temporaryPath: string | undefined;
    try {
      if (!(await isDirectoryIdentityCurrent(root, target))) {
        throw new SafeWriteError("PATH_OUTSIDE_ROOT", "Skill 目录在保存期间发生变化。");
      }
      temporaryPath = await stageFile(target.directory, request.content);
      await request.beforeReplace?.();

      if (!(await isDirectoryIdentityCurrent(root, target))) {
        throw new SafeWriteError("PATH_OUTSIDE_ROOT", "Skill 目录在保存期间发生变化。");
      }
      const refreshed = await resolveSkillFile(root, request.relativePath);
      if (refreshed.file !== target.file
        || refreshed.directoryIdentity.dev !== target.directoryIdentity.dev
        || refreshed.directoryIdentity.ino !== target.directoryIdentity.ino) {
        throw new SafeWriteError("PATH_OUTSIDE_ROOT", "Skill 路径在保存期间发生变化。");
      }
      const current = await readFile(target.file, "utf8");
      if (contentVersion(current) !== request.baseVersion) {
        throw new SafeWriteError("CONFLICT", "Skill 文件已在其他位置修改。请重新载入或复制草稿后再继续。", contentVersion(current));
      }
      if (!(await isDirectoryIdentityCurrent(root, target))) {
        throw new SafeWriteError("PATH_OUTSIDE_ROOT", "Skill 目录在保存期间发生变化。");
      }
      await rename(temporaryPath, target.file);
      temporaryPath = undefined;
      const savedContent = await readFile(target.file, "utf8");
      return { contentVersion: contentVersion(savedContent) };
    } catch (error) {
      if (error instanceof SafeWriteError) throw error;
      throw new SafeWriteError("ROOT_UNAVAILABLE", "Skill 保存失败，原文件保持不变。");
    } finally {
      if (temporaryPath !== undefined && await isDirectoryIdentityCurrent(root, target)) {
        await rm(temporaryPath, { force: true }).catch(() => undefined);
      }
    }
  });
}
