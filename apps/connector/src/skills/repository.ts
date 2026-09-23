import { createHash, randomUUID } from "node:crypto";
import { lstat, open, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";

import type {
  RootScanResult,
  CreateSkillRequest,
  SaveSkillRequest,
  SkillDetail,
  SkillRoot,
  SkillSummary,
} from "@skillstudio/contracts";
import { CONTRACT_SCHEMA_VERSION } from "@skillstudio/contracts";
import { diagnoseSkillDocument, parseSkillDocument } from "@skillstudio/skill-core";
import { createSkillFile, SafeWriteError, saveSkillFile } from "../files/safe-write.js";
import { LocalStateStore, type RegisteredRoot } from "../state/local-state.js";

const MAX_SKILLS = 10_000;
const MAX_VISITED_ENTRIES = 50_000;
const MAX_DEPTH = 32;
const MAX_SKILL_BYTES = 1024 * 1024;
const SKIPPED_DIRECTORIES = new Set([
  "node_modules",
  ".git",
  ".hg",
  ".svn",
  ".venv",
  "venv",
  "vendor",
  "dist",
  "build",
  "__pycache__",
]);

interface RootState {
  root: SkillRoot;
  skills: Map<string, SkillDetail>;
}

function isWithinRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function metadata(content: string): { name: string | null; description: string | null } {
  const parsed = parseSkillDocument(content);
  if (!parsed.ok) return { name: null, description: null };
  const { name, description } = parsed.document.frontmatter;
  return {
    name: typeof name === "string" && name.trim() ? name : null,
    description: typeof description === "string" && description.trim() ? description : null,
  };
}

function diagnostics(content: string): SkillDetail["diagnostics"] {
  return diagnoseSkillDocument(content)
    .filter((diagnostic) => diagnostic.severity === "error" || diagnostic.severity === "warning")
    .map(({ severity, message }) => ({ severity: severity === "error" ? "error" : "warning", message }));
}

function asSummary(detail: SkillDetail): SkillSummary {
  const { content: _content, ...summary } = detail;
  return summary;
}

async function readSkillContent(filePath: string): Promise<string> {
  const handle = await open(filePath, "r");
  try {
    const fileStat = await handle.stat();
    if (!fileStat.isFile()) throw new Error("Skill path is not a regular file.");
    if (fileStat.size > MAX_SKILL_BYTES) {
      throw new SkillRepositoryError("LIMIT_EXCEEDED", "SKILL.md 超过 1 MiB。");
    }

    const buffer = Buffer.alloc(MAX_SKILL_BYTES + 1);
    let bytesRead = 0;
    while (bytesRead < buffer.length) {
      const result = await handle.read(buffer, bytesRead, buffer.length - bytesRead, bytesRead);
      if (result.bytesRead === 0) break;
      bytesRead += result.bytesRead;
    }
    if (bytesRead > MAX_SKILL_BYTES) {
      throw new SkillRepositoryError("LIMIT_EXCEEDED", "SKILL.md 超过 1 MiB。");
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, bytesRead));
  } finally {
    await handle.close();
  }
}

export class SkillRepositoryError extends Error {
  constructor(readonly code: "INVALID_REQUEST" | "ROOT_UNAVAILABLE" | "PATH_OUTSIDE_ROOT" | "NOT_FOUND" | "LIMIT_EXCEEDED", message: string) {
    super(message);
    this.name = "SkillRepositoryError";
  }
}

export class SkillRepository {
  private readonly roots = new Map<string, RootState>();

  constructor(private readonly localState?: LocalStateStore) {}

  async restore(): Promise<void> {
    if (this.localState === undefined) return;
    const registrations = await this.localState.loadRoots();
    for (const registration of registrations) {
      const root: SkillRoot = {
        schemaVersion: CONTRACT_SCHEMA_VERSION,
        ...registration,
        scanStatus: "idle",
        skillCount: 0,
        issueCount: 0,
        scannedAt: null,
      };
      this.roots.set(root.id, { root, skills: new Map() });

      try {
        const canonicalPath = await realpath(root.canonicalPath);
        if (canonicalPath !== root.canonicalPath || !(await stat(canonicalPath)).isDirectory()) {
          root.scanStatus = "error";
          root.issueCount = 1;
          root.scannedAt = new Date().toISOString();
          continue;
        }
        await this.scan(root.id);
      } catch {
        root.scanStatus = "error";
        root.issueCount = 1;
        root.scannedAt = new Date().toISOString();
      }
    }
  }

  private async persistRoots(): Promise<void> {
    if (this.localState === undefined) return;
    const roots: RegisteredRoot[] = [...this.roots.values()].map(({ root }) => ({
      id: root.id,
      label: root.label,
      canonicalPath: root.canonicalPath,
      writeEnabled: root.writeEnabled,
    }));
    await this.localState.saveRoots(roots);
  }

  listRoots(): SkillRoot[] {
    return [...this.roots.values()].map(({ root }) => ({ ...root }));
  }

  async addRoot(inputPath: string, writeEnabled = false): Promise<RootScanResult> {
    if (typeof inputPath !== "string" || inputPath.trim() === "" || !path.isAbsolute(inputPath)) {
      throw new SkillRepositoryError("INVALID_REQUEST", "请输入有效的绝对目录路径。");
    }

    let canonicalPath: string;
    try {
      canonicalPath = await realpath(inputPath.trim());
      if (!(await stat(canonicalPath)).isDirectory()) throw new Error("not a directory");
    } catch {
      throw new SkillRepositoryError("ROOT_UNAVAILABLE", "目录不存在或无法读取。");
    }

    for (const existing of this.roots.values()) {
      if (isWithinRoot(existing.root.canonicalPath, canonicalPath) || isWithinRoot(canonicalPath, existing.root.canonicalPath)) {
        throw new SkillRepositoryError("INVALID_REQUEST", "该目录与已登记的根目录重复或重叠。");
      }
    }

    const root: SkillRoot = {
      schemaVersion: CONTRACT_SCHEMA_VERSION,
      id: randomUUID(),
      label: path.basename(canonicalPath) || canonicalPath,
      canonicalPath,
      writeEnabled,
      scanStatus: "scanning",
      skillCount: 0,
      issueCount: 0,
      scannedAt: null,
    };
    const state: RootState = { root, skills: new Map() };
    this.roots.set(root.id, state);
    try {
      await this.persistRoots();
    } catch (error) {
      this.roots.delete(root.id);
      throw error;
    }
    return this.scan(root.id);
  }

  async removeRoot(id: string): Promise<void> {
    const removed = this.roots.get(id);
    if (removed === undefined) throw new SkillRepositoryError("NOT_FOUND", "找不到该目录。");
    this.roots.delete(id);
    try {
      await this.persistRoots();
    } catch (error) {
      this.roots.set(id, removed);
      throw error;
    }
  }

  async scan(rootId: string): Promise<RootScanResult> {
    const state = this.roots.get(rootId);
    if (state === undefined) throw new SkillRepositoryError("NOT_FOUND", "找不到该目录。");

    state.root.scanStatus = "scanning";
    const existingIds = new Map([...state.skills.values()].map((skill) => [skill.relativePath, skill.id]));
    state.skills.clear();
    const issues: RootScanResult["issues"] = [];
    const pending: Array<{ directory: string; depth: number }> = [{ directory: state.root.canonicalPath, depth: 0 }];
    let visited = 0;

    while (pending.length > 0 && state.skills.size < MAX_SKILLS) {
      const current = pending.pop();
      if (current === undefined) break;
      if (current.depth > MAX_DEPTH) {
        issues.push({ relativePath: path.relative(state.root.canonicalPath, current.directory), message: "目录层级超过扫描上限。" });
        continue;
      }

      let canonicalDirectory: string;
      try {
        const directoryStat = await lstat(current.directory);
        canonicalDirectory = await realpath(current.directory);
        if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink() || !isWithinRoot(state.root.canonicalPath, canonicalDirectory)) {
          issues.push({ relativePath: path.relative(state.root.canonicalPath, current.directory), message: "目录不在授权根目录内，已跳过。" });
          continue;
        }
      } catch {
        issues.push({ relativePath: path.relative(state.root.canonicalPath, current.directory), message: "目录不可读取，已跳过。" });
        continue;
      }

      let entries;
      try {
        entries = await readdir(canonicalDirectory, { withFileTypes: true });
      } catch {
        issues.push({ relativePath: path.relative(state.root.canonicalPath, current.directory), message: "目录不可读取，已跳过。" });
        continue;
      }

      visited += entries.length;
      if (visited > MAX_VISITED_ENTRIES) {
        issues.push({ relativePath: path.relative(state.root.canonicalPath, current.directory), message: "目录项数量超过扫描上限。" });
        break;
      }

      for (const entry of entries) {
        if (entry.name.startsWith(".")) continue;
        const entryPath = path.join(canonicalDirectory, entry.name);
        if (entry.isSymbolicLink()) continue;

        if (entry.isDirectory()) {
          if (SKIPPED_DIRECTORIES.has(entry.name.toLocaleLowerCase())) continue;
          pending.push({ directory: entryPath, depth: current.depth + 1 });
          continue;
        }
        if (!entry.isFile() || entry.name !== "SKILL.md") continue;

        try {
          const fileStat = await lstat(entryPath);
          const canonicalFile = await realpath(entryPath);
          if (!fileStat.isFile() || fileStat.isSymbolicLink() || !isWithinRoot(state.root.canonicalPath, canonicalFile)) {
            issues.push({ relativePath: path.relative(state.root.canonicalPath, entryPath), message: "文件不在授权目录内，已跳过。" });
            continue;
          }
          if (fileStat.size > MAX_SKILL_BYTES) {
            issues.push({ relativePath: path.relative(state.root.canonicalPath, entryPath), message: "SKILL.md 超过 1 MiB，已跳过。" });
            continue;
          }

          const content = await readSkillContent(canonicalFile);
          const parsed = metadata(content);
          const relativePath = path.relative(state.root.canonicalPath, path.dirname(canonicalFile));
          const id = existingIds.get(relativePath) ?? randomUUID();
          const skillDiagnostics = diagnostics(content);
          state.skills.set(id, {
            schemaVersion: CONTRACT_SCHEMA_VERSION,
            id,
            rootId,
            relativePath,
            name: parsed.name ?? path.basename(path.dirname(canonicalFile)),
            description: parsed.description ?? "暂无描述",
            contentVersion: createHash("sha256").update(content).digest("hex"),
            diagnostics: skillDiagnostics,
            content,
          });
        } catch {
          issues.push({ relativePath: path.relative(state.root.canonicalPath, entryPath), message: "SKILL.md 不可读取，已跳过。" });
        }

        if (state.skills.size >= MAX_SKILLS) {
          issues.push({ relativePath: ".", message: `Skill 数量达到 ${MAX_SKILLS} 项扫描上限。` });
          break;
        }
      }
    }

    state.root.skillCount = state.skills.size;
    state.root.issueCount = issues.length;
    state.root.scannedAt = new Date().toISOString();
    state.root.scanStatus = issues.length === 0 ? "ready" : state.skills.size === 0 ? "error" : "partial";

    return {
      schemaVersion: CONTRACT_SCHEMA_VERSION,
      root: { ...state.root },
      skills: [...state.skills.values()].map(asSummary),
      issues,
    };
  }

  listSkills(options: { query?: string; rootId?: string }): SkillSummary[] {
    const query = options.query?.trim().toLocaleLowerCase();
    return [...this.roots.values()]
      .filter(({ root }) => options.rootId === undefined || root.id === options.rootId)
      .flatMap(({ skills }) => [...skills.values()])
      .filter((skill) => query === undefined || query === "" || `${skill.name}\n${skill.description}\n${skill.relativePath}`.toLocaleLowerCase().includes(query))
      .map(asSummary)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async getSkill(id: string): Promise<SkillDetail> {
    for (const state of this.roots.values()) {
      const skill = state.skills.get(id);
      if (skill === undefined) continue;

      const filePath = path.join(state.root.canonicalPath, skill.relativePath, "SKILL.md");
      try {
        const canonicalFile = await realpath(filePath);
        const fileStat = await lstat(filePath);
        if (!fileStat.isFile() || fileStat.isSymbolicLink() || !isWithinRoot(state.root.canonicalPath, canonicalFile)) {
          throw new SkillRepositoryError("PATH_OUTSIDE_ROOT", "Skill 文件已移动到授权目录之外。");
        }
        if (fileStat.size > MAX_SKILL_BYTES) throw new SkillRepositoryError("LIMIT_EXCEEDED", "SKILL.md 超过 1 MiB。");
        const content = await readSkillContent(canonicalFile);
        const parsed = metadata(content);
        const skillDiagnostics = diagnostics(content);
        return {
          ...skill,
          name: parsed.name ?? path.basename(path.dirname(canonicalFile)),
          description: parsed.description ?? "暂无描述",
          diagnostics: skillDiagnostics,
          content,
          contentVersion: createHash("sha256").update(content).digest("hex"),
        };
      } catch (error) {
        if (error instanceof SkillRepositoryError) throw error;
        throw new SkillRepositoryError("ROOT_UNAVAILABLE", "Skill 文件已移动或无法读取，请重新扫描目录。");
      }
    }

    throw new SkillRepositoryError("NOT_FOUND", "找不到该 Skill，请重新扫描目录。");
  }

  async createSkill(input: CreateSkillRequest): Promise<SkillDetail> {
    const rootState = this.roots.get(input.rootId);
    if (rootState === undefined) throw new SkillRepositoryError("NOT_FOUND", "找不到该目录。");
    const safeName = JSON.stringify(input.name);
    const safeDescription = JSON.stringify(input.description);
    const content = `---\nname: ${safeName}\ndescription: ${safeDescription}\n---\n\n# Instructions\n\nDescribe the steps this Skill should perform.\n`;
    const created = await createSkillFile({
      rootPath: rootState.root.canonicalPath,
      directoryName: input.directoryName,
      content,
      writable: rootState.root.writeEnabled,
    });
    await this.scan(rootState.root.id);
    const createdSkill = [...rootState.skills.values()].find((skill) => skill.relativePath === created.relativePath);
    if (createdSkill === undefined) throw new SkillRepositoryError("ROOT_UNAVAILABLE", "Skill 已创建但重新扫描未能读取，请刷新目录。");
    return { ...createdSkill, content, contentVersion: created.contentVersion };
  }

  async saveSkill(id: string, input: SaveSkillRequest): Promise<SkillDetail> {
    for (const rootState of this.roots.values()) {
      const skill = rootState.skills.get(id);
      if (skill === undefined) continue;
      const saved = await saveSkillFile({
        rootPath: rootState.root.canonicalPath,
        relativePath: skill.relativePath,
        content: input.content,
        baseVersion: input.baseVersion,
        writable: rootState.root.writeEnabled,
      });
      await this.scan(rootState.root.id);
      const latest = [...rootState.skills.values()].find((candidate) => candidate.relativePath === skill.relativePath);
      if (latest === undefined) throw new SkillRepositoryError("ROOT_UNAVAILABLE", "Skill 已保存但重新扫描未能读取，请刷新目录。");
      return { ...latest, contentVersion: saved.contentVersion };
    }
    throw new SkillRepositoryError("NOT_FOUND", "找不到该 Skill，请重新扫描目录。");
  }
}
