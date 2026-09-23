import assert from "node:assert/strict";
import test from "node:test";
import { diagnoseSkillDocument, parseSkillDocument } from "../packages/skill-core/src/index.js";

test("parses skill metadata while preserving unknown frontmatter fields and raw content", () => {
  const content = "---\r\nname: demo\r\ndescription: A sample skill\r\ncustom: keep-me\r\n---\r\n\r\n# Body\r\n";
  const parsed = parseSkillDocument(content);

  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.document.frontmatter.name, "demo");
    assert.equal(parsed.document.frontmatter.description, "A sample skill");
    assert.equal(parsed.document.frontmatter.custom, "keep-me");
    assert.equal(parsed.document.body, "\r\n# Body\r\n");
    assert.equal(parsed.document.content, content);
  }
});

test("reports missing frontmatter and empty body as structure diagnostics", () => {
  const missingMetadata = diagnoseSkillDocument("# No metadata\n");
  const emptyBody = diagnoseSkillDocument("---\nname: demo\ndescription: sample\n---\n");

  assert.ok(missingMetadata.some((item) => item.code === "MISSING_FRONTMATTER" && item.layer === "structure"));
  assert.ok(emptyBody.some((item) => item.code === "EMPTY_BODY" && item.layer === "style"));
});

test("reports malformed YAML, duplicate keys, and non-string required fields", () => {
  const malformed = parseSkillDocument("---\nname: [\n---\nbody\n");
  assert.equal(malformed.ok, false);

  const duplicate = diagnoseSkillDocument("---\nname: one\nname: two\ndescription: x\n---\nbody\n");
  assert.ok(duplicate.some((item) => item.code === "INVALID_FRONTMATTER"));

  const nonString = diagnoseSkillDocument("---\nname: 42\ndescription: false\n---\nbody\n");
  assert.ok(nonString.some((item) => item.code === "INVALID_NAME"));
  assert.ok(nonString.some((item) => item.code === "INVALID_DESCRIPTION"));
});

test("rejects documents larger than the parser limit", () => {
  const result = parseSkillDocument(`---\nname: x\ndescription: y\n---\n${"a".repeat(1_100_000)}`);

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "DOCUMENT_TOO_LARGE");
});
