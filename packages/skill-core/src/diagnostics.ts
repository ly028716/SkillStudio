import type { SkillDiagnostic } from "@skillstudio/contracts";
import { parseSkillDocument } from "./frontmatter.js";

export const SKILL_DIAGNOSTICS_RULESET_VERSION = "1";

export function diagnoseSkillDocument(content: string): SkillDiagnostic[] {
  const parsed = parseSkillDocument(content);
  if (!parsed.ok) {
    return [{
      code: parsed.error.code,
      layer: "structure",
      severity: "error",
      message: parsed.error.message,
      ...(parsed.error.line ? { line: parsed.error.line } : {}),
      ...(parsed.error.column ? { column: parsed.error.column } : {}),
      rulesetVersion: SKILL_DIAGNOSTICS_RULESET_VERSION,
    }];
  }

  const diagnostics: SkillDiagnostic[] = [];
  for (const field of ["name", "description"] as const) {
    const value = parsed.document.frontmatter[field];
    if (typeof value !== "string" || value.trim().length === 0) {
      diagnostics.push({
        code: field === "name" ? "INVALID_NAME" : "INVALID_DESCRIPTION",
        layer: "structure",
        severity: "error",
        message: `Frontmatter field '${field}' must be a non-empty string.`,
        rulesetVersion: SKILL_DIAGNOSTICS_RULESET_VERSION,
      });
    }
  }

  if (parsed.document.body.trim().length === 0) {
    diagnostics.push({
      code: "EMPTY_BODY",
      layer: "style",
      severity: "warning",
      message: "Add instructions to the Skill body.",
      rulesetVersion: SKILL_DIAGNOSTICS_RULESET_VERSION,
    });
  }

  return diagnostics;
}
