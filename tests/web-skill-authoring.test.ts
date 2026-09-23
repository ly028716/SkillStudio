import assert from "node:assert/strict";
import test from "node:test";
import type { SkillDetail } from "@skillstudio/contracts";
import * as client from "../apps/web/src/api/client.js";
import {
  beginEditorSave,
  createEditorState,
  discardEditorDraft,
  failEditorSave,
  reloadEditorSkill,
  saveEditorConflict,
  saveEditorSucceeded,
  updateEditorDraft,
} from "../apps/web/src/features/editor/editor-state.js";

function skill(content = "original", contentVersion = "version-1"): SkillDetail {
  return {
    schemaVersion: "2026-09-23",
    id: "skill-1",
    rootId: "root-1",
    relativePath: "demo",
    name: "Demo",
    description: "A demo",
    contentVersion,
    diagnostics: [],
    content,
  };
}

test("tracks clean, dirty, saving, saved, failure, conflict, discard, and reload transitions", () => {
  const initial = createEditorState(skill());
  assert.equal(initial.status, "clean");

  const dirty = updateEditorDraft(initial, "draft");
  assert.equal(dirty.status, "dirty");
  assert.equal(dirty.draft, "draft");
  const saving = beginEditorSave(dirty);
  assert.equal(saving.status, "saving");

  const saved = saveEditorSucceeded(saving, skill("draft", "version-2"));
  assert.equal(saved.status, "saved");
  assert.equal(saved.draft, "draft");
  assert.equal(saved.skill.contentVersion, "version-2");

  const editedDuringSave = updateEditorDraft(saving, "typed while saving");
  const savedWithNewDraft = saveEditorSucceeded(editedDuringSave, skill("draft", "version-2"), "draft");
  assert.equal(savedWithNewDraft.status, "dirty");
  assert.equal(savedWithNewDraft.draft, "typed while saving");
  assert.equal(savedWithNewDraft.skill.contentVersion, "version-2");

  const failedWithNewDraft = failEditorSave(editedDuringSave, "network error");
  assert.equal(failedWithNewDraft.status, "error");
  assert.equal(failedWithNewDraft.draft, "typed while saving");
  const conflictedWithNewDraft = saveEditorConflict(editedDuringSave, "external edit", "version-3");
  assert.equal(conflictedWithNewDraft.status, "conflict");
  assert.equal(conflictedWithNewDraft.draft, "typed while saving");

  const failed = failEditorSave(updateEditorDraft(initial, "kept draft"), "offline");
  assert.equal(failed.status, "error");
  assert.equal(failed.draft, "kept draft");
  const conflicted = saveEditorConflict(failed, "external edit", "version-3");
  assert.equal(conflicted.status, "conflict");
  assert.equal(conflicted.draft, "kept draft");
  assert.equal(conflicted.currentVersion, "version-3");

  assert.equal(discardEditorDraft(conflicted).draft, "original");
  const reloaded = reloadEditorSkill(conflicted, skill("external", "version-3"));
  assert.equal(reloaded.draft, "external");
  assert.equal(reloaded.skill.contentVersion, "version-3");
});

test("sends the original baseVersion in an explicit save API request", async () => {
  let request: { url: string; init: RequestInit | undefined } | undefined;
  const fetchImpl: typeof fetch = async (input, init) => {
    request = { url: String(input), init };
    return {
      ok: true,
      json: async () => ({ schemaVersion: "2026-09-23", requestId: "request", data: skill("updated", "version-2") }),
    } as Response;
  };

  const result = await client.saveSkill(fetchImpl, "http://127.0.0.1:4317", "skill-1", {
    content: "updated",
    baseVersion: "version-1",
  });
  assert.equal(result.contentVersion, "version-2");
  assert.equal(request?.url, "http://127.0.0.1:4317/api/skills/skill-1/content");
  assert.deepEqual(JSON.parse(String(request?.init?.body)), { content: "updated", baseVersion: "version-1" });
});

test("sends new Skill metadata to the explicitly selected root", async () => {
  let request: { url: string; init: RequestInit | undefined } | undefined;
  const createdSkill = skill("template", "version-new");
  const fetchImpl: typeof fetch = async (input, init) => {
    request = { url: String(input), init };
    return {
      ok: true,
      json: async () => ({ schemaVersion: "2026-09-23", requestId: "request", data: createdSkill }),
    } as Response;
  };

  const result = await client.createSkill(fetchImpl, "http://127.0.0.1:4317", {
    rootId: "root-1",
    directoryName: "demo",
    name: "Demo",
    description: "A demo",
  });
  assert.equal(result.id, "skill-1");
  assert.equal(request?.url, "http://127.0.0.1:4317/api/skills");
  assert.deepEqual(JSON.parse(String(request?.init?.body)), {
    rootId: "root-1",
    directoryName: "demo",
    name: "Demo",
    description: "A demo",
  });
});

test("preserves structured currentVersion from a conflict response", async () => {
  await assert.rejects(
    client.saveSkill(async () => ({
      ok: false,
      status: 409,
      json: async () => ({ code: "CONFLICT", message: "external edit", details: { currentVersion: "version-2" } }),
    } as Response), "http://127.0.0.1:4317", "skill-1", { content: "draft", baseVersion: "version-1" }),
    (error: unknown) => error instanceof client.ConnectorRequestError
      && error.status === 409
      && error.currentVersion === "version-2",
  );
});
