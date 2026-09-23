import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { LocalStateStore, LocalStateStoreError } from "../apps/connector/src/state/local-state.js";
import { SkillRepository } from "../apps/connector/src/skills/repository.js";

test("starts with no roots and restores root registrations after store recreation", async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), "skillstudio-state-"));
  try {
    const firstStore = new LocalStateStore({ dataDirectory });
    assert.deepEqual(await firstStore.loadRoots(), []);
    await firstStore.saveRoots([{ id: "root-1", label: "Skills", canonicalPath: path.join(dataDirectory, "skills"), writeEnabled: false }]);

    const restartedStore = new LocalStateStore({ dataDirectory });
    assert.deepEqual(await restartedStore.loadRoots(), [
      { id: "root-1", label: "Skills", canonicalPath: path.join(dataDirectory, "skills"), writeEnabled: false },
    ]);
  } finally {
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

test("adds and removes root records without persisting skill content or secrets", async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), "skillstudio-state-"));
  try {
    const store = new LocalStateStore({ dataDirectory });
    await store.saveRoots([
      { id: "one", label: "One", canonicalPath: "C:\\skills\\one", writeEnabled: false },
      { id: "two", label: "Two", canonicalPath: "C:\\skills\\two", writeEnabled: true },
    ]);
    await store.saveRoots([{ id: "two", label: "Two", canonicalPath: "C:\\skills\\two", writeEnabled: true }]);

    const stateText = await readFile(path.join(dataDirectory, "state.json"), "utf8");
    assert.equal(stateText.includes("skill body"), false);
    assert.equal(stateText.includes("pairing-secret"), false);
    assert.deepEqual(await store.loadRoots(), [{ id: "two", label: "Two", canonicalPath: "C:\\skills\\two", writeEnabled: true }]);
  } finally {
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

test("rejects invalid JSON and unknown schema versions without replacing the file", async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), "skillstudio-state-"));
  const filePath = path.join(dataDirectory, "state.json");
  try {
    const store = new LocalStateStore({ dataDirectory });
    await writeFile(filePath, "not json", "utf8");
    await assert.rejects(store.loadRoots(), (error: unknown) => error instanceof LocalStateStoreError && error.code === "CORRUPT");
    assert.equal(await readFile(filePath, "utf8"), "not json");

    await writeFile(filePath, JSON.stringify({ schemaVersion: 999, roots: [] }), "utf8");
    await assert.rejects(store.loadRoots(), (error: unknown) => error instanceof LocalStateStoreError && error.code === "UNSUPPORTED_VERSION");
    assert.equal(JSON.parse(await readFile(filePath, "utf8")).schemaVersion, 999);
  } finally {
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

test("preserves the prior state if atomic replacement fails", async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), "skillstudio-state-"));
  try {
    await mkdir(path.join(dataDirectory, "unused"));
    const base = new LocalStateStore({ dataDirectory });
    const roots = [{ id: "before", label: "Before", canonicalPath: "C:\\before", writeEnabled: false }];
    await base.saveRoots(roots);

    const failingStore = new LocalStateStore({ dataDirectory, replaceFile: async () => { throw new Error("injected failure"); } });
    await assert.rejects(
      failingStore.saveRoots([{ id: "after", label: "After", canonicalPath: "C:\\after", writeEnabled: false }]),
      (error: unknown) => error instanceof LocalStateStoreError && error.code === "WRITE_FAILED",
    );
    assert.deepEqual(await base.loadRoots(), roots);
  } finally {
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

test("restores registered roots by rescanning disk and persists removal", async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), "skillstudio-state-"));
  const skillsDirectory = await mkdtemp(path.join(os.tmpdir(), "skillstudio-skills-"));
  try {
    const firstRepository = new SkillRepository(new LocalStateStore({ dataDirectory }));
    const firstScan = await firstRepository.addRoot(skillsDirectory);
    const restartedRepository = new SkillRepository(new LocalStateStore({ dataDirectory }));
    await restartedRepository.restore();

    assert.equal(restartedRepository.listRoots()[0]?.id, firstScan.root.id);
    assert.equal(restartedRepository.listRoots()[0]?.scanStatus, "ready");
    await restartedRepository.removeRoot(firstScan.root.id);
    assert.deepEqual(await new LocalStateStore({ dataDirectory }).loadRoots(), []);
  } finally {
    await rm(dataDirectory, { recursive: true, force: true });
    await rm(skillsDirectory, { recursive: true, force: true });
  }
});
