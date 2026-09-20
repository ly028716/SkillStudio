import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

async function readReferences(configPath: string): Promise<string[]> {
  const contents = await readFile(path.join(repositoryRoot, configPath), "utf8");
  const config = JSON.parse(contents) as { references?: Array<{ path?: string }> };

  return (config.references ?? []).flatMap((reference) =>
    typeof reference.path === "string" ? [reference.path] : [],
  );
}

test("declares workspace dependency references for clean TypeScript builds", async () => {
  assert.deepEqual(await readReferences("packages/harness-core/tsconfig.json"), [
    "../contracts",
  ]);
  assert.deepEqual(await readReferences("apps/connector/tsconfig.json"), [
    "../../packages/contracts",
    "../../packages/harness-core",
  ]);
  assert.deepEqual(await readReferences("apps/web/tsconfig.json"), [
    "../../packages/contracts",
  ]);

  const packageJson = JSON.parse(
    await readFile(path.join(repositoryRoot, "package.json"), "utf8"),
  ) as { scripts?: Record<string, string> };
  assert.equal(packageJson.scripts?.typecheck, "tsc -b");
});
