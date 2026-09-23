import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ConnectorSession } from "../apps/connector/src/auth/session.js";
import { createConnectorServer } from "../apps/connector/src/http/server.js";
import { SkillRepository } from "../apps/connector/src/skills/repository.js";

async function withPairedConnector(run: (baseUrl: string, cookie: string) => Promise<void>): Promise<void> {
  const session = new ConnectorSession();
  const connector = createConnectorServer({ port: 0, session, skills: new SkillRepository() });
  const port = await connector.listen();
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    const pairing = await fetch(`${baseUrl}/api/bootstrap`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pairingCode: session.pairingCode }),
    });
    assert.equal(pairing.status, 200);
    const cookie = pairing.headers.get("set-cookie")?.split(";")[0];
    assert.ok(cookie);
    await run(baseUrl, cookie);
  } finally {
    await connector.close();
  }
}

test("requires a paired local session before authoring operations", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "skillstudio-api-"));
  const session = new ConnectorSession();
  const connector = createConnectorServer({ port: 0, session, skills: new SkillRepository() });
  const port = await connector.listen();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/skills`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rootId: "root", directoryName: "skill", name: "skill", description: "desc" }),
    });
    assert.equal(response.status, 401);
    assert.equal(await readFile(path.join(rootPath, "SKILL.md"), "utf8").catch(() => null), null);
  } finally {
    await connector.close();
    await rm(rootPath, { recursive: true, force: true });
  }
});

test("creates and saves Skills in an explicitly writable root and reports version conflicts", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "skillstudio-api-"));
  try {
    await withPairedConnector(async (baseUrl, cookie) => {
      const headers = { "content-type": "application/json", cookie };
      const rootResponse = await fetch(`${baseUrl}/api/roots`, {
        method: "POST",
        headers,
        body: JSON.stringify({ path: rootPath, writeEnabled: true }),
      });
      assert.equal(rootResponse.status, 201);
      const rootPayload = await rootResponse.json() as { data: { root: { id: string; writeEnabled: boolean } } };
      assert.equal(rootPayload.data.root.writeEnabled, true);

      const createResponse = await fetch(`${baseUrl}/api/skills`, {
        method: "POST",
        headers,
        body: JSON.stringify({ rootId: rootPayload.data.root.id, directoryName: "demo", name: "Demo", description: "A demo" }),
      });
      assert.equal(createResponse.status, 201);
      const created = await createResponse.json() as { data: { id: string; contentVersion: string; content: string } };
      assert.equal(created.data.content.includes("name: \"Demo\""), true);

      const unknownRootResponse = await fetch(`${baseUrl}/api/skills`, {
        method: "POST",
        headers,
        body: JSON.stringify({ rootId: "not-registered", directoryName: "other", name: "Other", description: "Other" }),
      });
      assert.equal(unknownRootResponse.status, 404);

      const invalidIdResponse = await fetch(`${baseUrl}/api/skills/%2E%2E%2Fsecret/content`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ content: "draft", baseVersion: "0".repeat(64) }),
      });
      assert.equal(invalidIdResponse.status, 404);

      const saveResponse = await fetch(`${baseUrl}/api/skills/${encodeURIComponent(created.data.id)}/content`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ content: "---\nname: Demo\ndescription: Updated\n---\n\n# Body\n", baseVersion: created.data.contentVersion }),
      });
      assert.equal(saveResponse.status, 200);
      let saved = await saveResponse.json() as { data: { contentVersion: string } };

      const largeContent = `---\nname: Demo\ndescription: Large body\n---\n\n${"x".repeat(20_000)}\n`;
      const largeSaveResponse = await fetch(`${baseUrl}/api/skills/${encodeURIComponent(created.data.id)}/content`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ content: largeContent, baseVersion: saved.data.contentVersion }),
      });
      assert.equal(largeSaveResponse.status, 200);
      saved = await largeSaveResponse.json() as { data: { contentVersion: string } };

      const conflictResponse = await fetch(`${baseUrl}/api/skills/${encodeURIComponent(created.data.id)}/content`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ content: "draft", baseVersion: created.data.contentVersion }),
      });
      assert.equal(conflictResponse.status, 409);
      const conflict = await conflictResponse.json() as { code: string; details?: { currentVersion?: string } };
      assert.equal(conflict.code, "CONFLICT");
      assert.equal(conflict.details?.currentVersion, saved.data.contentVersion);
      assert.equal(await readFile(path.join(rootPath, "demo", "SKILL.md"), "utf8"), largeContent);
    });
  } finally {
    await rm(rootPath, { recursive: true, force: true });
  }
});

test("rejects read-only roots and does not expose absolute paths in errors", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "skillstudio-api-"));
  try {
    await withPairedConnector(async (baseUrl, cookie) => {
      const rootResponse = await fetch(`${baseUrl}/api/roots`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ path: rootPath }),
      });
      const root = await rootResponse.json() as { data: { root: { id: string; writeEnabled: boolean } } };
      assert.equal(root.data.root.writeEnabled, false);
      const createResponse = await fetch(`${baseUrl}/api/skills`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ rootId: root.data.root.id, directoryName: "demo", name: "Demo", description: "desc" }),
      });
      assert.equal(createResponse.status, 403);
      const errorText = await createResponse.text();
      assert.equal(errorText.includes(rootPath), false);
    });
  } finally {
    await rm(rootPath, { recursive: true, force: true });
  }
});
