import { parseDocument } from "yaml";

export const MAX_SKILL_DOCUMENT_BYTES = 1024 * 1024;

export interface ParsedSkillDocument {
  content: string;
  frontmatter: Record<string, unknown>;
  body: string;
}

export type ParseSkillDocumentResult =
  | { ok: true; document: ParsedSkillDocument }
  | { ok: false; error: { code: "MISSING_FRONTMATTER" | "INVALID_FRONTMATTER" | "DOCUMENT_TOO_LARGE"; message: string; line?: number; column?: number } };

export function parseSkillDocument(content: string): ParseSkillDocumentResult {
  if (new TextEncoder().encode(content).byteLength > MAX_SKILL_DOCUMENT_BYTES) {
    return { ok: false, error: { code: "DOCUMENT_TOO_LARGE", message: "Skill document exceeds the 1 MiB limit." } };
  }

  const firstLineEnd = content.search(/\r?\n/);
  const firstLine = firstLineEnd === -1 ? content : content.slice(0, firstLineEnd);
  if (firstLine !== "---") {
    return { ok: false, error: { code: "MISSING_FRONTMATTER", message: "Skill document must begin with YAML frontmatter." } };
  }

  const openingDelimiterLength = content.startsWith("---\r\n") ? 5 : content.startsWith("---\n") ? 4 : 3;
  const remainder = content.slice(openingDelimiterLength);
  const closingMatch = /^(?:---|\.\.\.)(?:\r?\n|$)/m.exec(remainder);
  if (!closingMatch) {
    return { ok: false, error: { code: "INVALID_FRONTMATTER", message: "YAML frontmatter is missing its closing delimiter." } };
  }

  const yamlText = remainder.slice(0, closingMatch.index);
  const body = remainder.slice(closingMatch.index + closingMatch[0].length);
  const yamlDocument = parseDocument(yamlText, { uniqueKeys: true, prettyErrors: false });
  const parseError = yamlDocument.errors[0];
  if (parseError) {
    const position = parseError.linePos?.[0];
    return {
      ok: false,
      error: {
        code: "INVALID_FRONTMATTER",
        message: "Skill frontmatter contains invalid YAML.",
        ...(position ? { line: position.line, column: position.col } : {}),
      },
    };
  }

  let value: unknown;
  try {
    value = yamlDocument.toJS({ mapAsMap: false, maxAliasCount: 20 });
  } catch {
    return { ok: false, error: { code: "INVALID_FRONTMATTER", message: "Skill frontmatter contains invalid or excessive YAML aliases." } };
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: { code: "INVALID_FRONTMATTER", message: "Skill frontmatter must be a YAML mapping." } };
  }

  return { ok: true, document: { content, frontmatter: value as Record<string, unknown>, body } };
}
