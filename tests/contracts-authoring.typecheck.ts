import type {
  ApiError,
  CreateSkillRequest,
  SaveSkillRequest,
  SkillDiagnostic,
} from "../packages/contracts/src/index.js";

export const createSkillRequest = {
  rootId: "root-1",
  directoryName: "review-helper",
  name: "review-helper",
  description: "Review a code change.",
} satisfies CreateSkillRequest;

export const saveSkillRequest = {
  content: "---\nname: review-helper\n---\n",
  baseVersion: "sha256:abc123",
} satisfies SaveSkillRequest;

export const skillDiagnostic = {
  code: "DESCRIPTION_MISSING",
  layer: "structure",
  severity: "warning",
  message: "Add a description.",
  line: 2,
} satisfies SkillDiagnostic;

export const conflictError = {
  code: "CONFLICT",
  message: "The file changed on disk.",
  requestId: "request-1",
  details: { currentVersion: "sha256:def456" },
} satisfies ApiError;
