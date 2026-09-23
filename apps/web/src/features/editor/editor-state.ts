import type { SkillDetail } from "@skillstudio/contracts";

export type EditorStatus = "clean" | "dirty" | "saving" | "saved" | "error" | "conflict";

export interface SkillEditorState {
  skill: SkillDetail;
  draft: string;
  status: EditorStatus;
  error: string | null;
  currentVersion?: string;
}

export function createEditorState(skill: SkillDetail): SkillEditorState {
  return { skill, draft: skill.content, status: "clean", error: null };
}

export function updateEditorDraft(state: SkillEditorState, draft: string): SkillEditorState {
  return { skill: state.skill, draft, status: draft === state.skill.content ? "clean" : "dirty", error: null };
}

export function beginEditorSave(state: SkillEditorState): SkillEditorState {
  if (state.draft === state.skill.content || state.status === "saving") return state;
  return { ...state, status: "saving", error: null };
}

export function saveEditorSucceeded(state: SkillEditorState, skill: SkillDetail, submittedDraft = state.draft): SkillEditorState {
  const draftChangedWhileSaving = state.draft !== submittedDraft;
  return {
    skill,
    draft: draftChangedWhileSaving ? state.draft : skill.content,
    status: draftChangedWhileSaving ? "dirty" : "saved",
    error: null,
  };
}

export function failEditorSave(state: SkillEditorState, error: string): SkillEditorState {
  return { ...state, status: "error", error };
}

export function saveEditorConflict(state: SkillEditorState, error: string, currentVersion?: string): SkillEditorState {
  return {
    ...state,
    status: "conflict",
    error,
    ...(currentVersion === undefined ? {} : { currentVersion }),
  };
}

export function discardEditorDraft(state: SkillEditorState): SkillEditorState {
  return { skill: state.skill, draft: state.skill.content, status: "clean", error: null };
}

export function reloadEditorSkill(_state: SkillEditorState, skill: SkillDetail): SkillEditorState {
  return createEditorState(skill);
}
