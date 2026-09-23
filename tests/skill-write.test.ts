import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createSkillFile, saveSkillFile, SafeWriteError } from "../apps/connector/src/files/safe-write.js";

function version(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

test("rejects writes when the registered root is read-only", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "skillstudio-write-"));
  try {
    await assert.rejects(createSkillFile({ rootPath, directoryName: "new-skill", content: "body", writable: false }),
      (error: unknown) => error instanceof SafeWriteError && error.code === "READ_ONLY");
  } finally {
    await rm(rootPath, { recursive: true, force: true });
  }
});

test("refuses paths outside the root and symbolic-link targets", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "skillstudio-write-"));
  const outsidePath = await mkdtemp(path.join(os.tmpdir(), "skillstudio-outside-"));
  try {
    await assert.rejects(saveSkillFile({ rootPath, relativePath: "../outside", content: "new", baseVersion: version("old"), writable: true }),
      (error: unknown) => error instanceof SafeWriteError && error.code === "PATH_OUTSIDE_ROOT");
    await symlink(outsidePath, path.join(rootPath, "linked"), "junction");
    await assert.rejects(saveSkillFile({ rootPath, relativePath: "linked", content: "new", baseVersion: version("old"), writable: true }),
      (error: unknown) => error instanceof SafeWriteError && error.code === "PATH_OUTSIDE_ROOT");
  } finally {
    await rm(rootPath, { recursive: true, force: true });
    await rm(outsidePath, { recursive: true, force: true });
  }
});

test("creates a skill exclusively and does not overwrite a same-name directory", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "skillstudio-write-"));
  try {
    await mkdir(path.join(rootPath, "same-name"));
    await writeFile(path.join(rootPath, "same-name", "SKILL.md"), "keep", "utf8");
    await assert.rejects(createSkillFile({ rootPath, directoryName: "same-name", content: "replace", writable: true }),
      (error: unknown) => error instanceof SafeWriteError && error.code === "CONFLICT");
    assert.equal(await readFile(path.join(rootPath, "same-name", "SKILL.md"), "utf8"), "keep");
  } finally {
    await rm(rootPath, { recursive: true, force: true });
  }
});

test("rejects oversized content and stale base versions without changing the file", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "skillstudio-write-"));
  const skillDirectory = path.join(rootPath, "skill");
  const original = "original";
  try {
    await mkdir(skillDirectory);
    await writeFile(path.join(skillDirectory, "SKILL.md"), original, "utf8");
    await assert.rejects(saveSkillFile({ rootPath, relativePath: "skill", content: "replacement", baseVersion: version("stale"), writable: true }),
      (error: unknown) => error instanceof SafeWriteError && error.code === "CONFLICT");
    await assert.rejects(saveSkillFile({ rootPath, relativePath: "skill", content: "x".repeat(1_100_001), baseVersion: version(original), writable: true }),
      (error: unknown) => error instanceof SafeWriteError && error.code === "LIMIT_EXCEEDED");
    assert.equal(await readFile(path.join(skillDirectory, "SKILL.md"), "utf8"), original);
  } finally {
    await rm(rootPath, { recursive: true, force: true });
  }
});

test("keeps original content after interrupted save and returns the actual new hash", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "skillstudio-write-"));
  const skillDirectory = path.join(rootPath, "skill");
  const original = "original";
  const updated = "updated";
  try {
    await mkdir(skillDirectory);
    await writeFile(path.join(skillDirectory, "SKILL.md"), original, "utf8");
    await assert.rejects(saveSkillFile({
      rootPath,
      relativePath: "skill",
      content: updated,
      baseVersion: version(original),
      writable: true,
      beforeReplace: async () => { throw new Error("simulated interruption"); },
    }));
    assert.equal(await readFile(path.join(skillDirectory, "SKILL.md"), "utf8"), original);

    const result = await saveSkillFile({ rootPath, relativePath: "skill", content: updated, baseVersion: version(original), writable: true });
    assert.equal(result.contentVersion, version(updated));
    assert.equal(await readFile(path.join(skillDirectory, "SKILL.md"), "utf8"), updated);
  } finally {
    await rm(rootPath, { recursive: true, force: true });
  }
});

test("serializes concurrent saves so a stale writer receives a conflict", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "skillstudio-write-"));
  const skillDirectory = path.join(rootPath, "skill");
  const original = "original";
  let releaseFirst!: () => void;
  let signalFirstEntered!: () => void;
  const firstPaused = new Promise<void>((resolve) => { releaseFirst = resolve; });
  const firstEntered = new Promise<void>((resolve) => { signalFirstEntered = resolve; });
  try {
    await mkdir(skillDirectory);
    await writeFile(path.join(skillDirectory, "SKILL.md"), original, "utf8");
    const first = saveSkillFile({
      rootPath,
      relativePath: "skill",
      content: "first save",
      baseVersion: version(original),
      writable: true,
      beforeReplace: () => {
        signalFirstEntered();
        return firstPaused;
      },
    });
    await firstEntered;
    let secondEnteredBeforeFirstFinished = false;
    const second = saveSkillFile({
      rootPath,
      relativePath: "skill",
      content: "second save",
      baseVersion: version(original),
      writable: true,
      beforeReplace: async () => { secondEnteredBeforeFirstFinished = true; },
    });
    setTimeout(releaseFirst, 20);

    const results = await Promise.allSettled([first, second]);
    assert.equal(results[0]?.status, "fulfilled");
    assert.equal(results[1]?.status, "rejected");
    assert.ok(results[1]?.status === "rejected" && results[1].reason instanceof SafeWriteError
      && results[1].reason.code === "CONFLICT");
    assert.equal(secondEnteredBeforeFirstFinished, false);
    assert.equal(await readFile(path.join(skillDirectory, "SKILL.md"), "utf8"), "first save");
  } finally {
    releaseFirst();
    await rm(rootPath, { recursive: true, force: true });
  }
});

test("refuses to replace a skill when its directory is swapped for a junction", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "skillstudio-write-"));
  const outsidePath = await mkdtemp(path.join(os.tmpdir(), "skillstudio-outside-"));
  const skillDirectory = path.join(rootPath, "skill");
  const movedDirectory = path.join(rootPath, "skill-original");
  const original = "original";
  try {
    await mkdir(skillDirectory);
    await writeFile(path.join(skillDirectory, "SKILL.md"), original, "utf8");
    await writeFile(path.join(outsidePath, "SKILL.md"), "outside", "utf8");
    await assert.rejects(saveSkillFile({
      rootPath,
      relativePath: "skill",
      content: "replacement",
      baseVersion: version(original),
      writable: true,
      beforeReplace: async () => {
        await rename(skillDirectory, movedDirectory);
        await symlink(outsidePath, skillDirectory, "junction");
      },
    }), (error: unknown) => error instanceof SafeWriteError && error.code === "PATH_OUTSIDE_ROOT");

    await rm(skillDirectory, { force: true });
    await rename(movedDirectory, skillDirectory);
    assert.equal(await readFile(path.join(skillDirectory, "SKILL.md"), "utf8"), original);
    assert.equal(await readFile(path.join(outsidePath, "SKILL.md"), "utf8"), "outside");
  } finally {
    await rm(rootPath, { recursive: true, force: true });
    await rm(outsidePath, { recursive: true, force: true });
  }
});
