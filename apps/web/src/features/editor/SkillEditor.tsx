import React, { useEffect, useState } from "react";

import type { SkillDetail } from "@skillstudio/contracts";
import { diagnoseSkillDocument } from "@skillstudio/skill-core";
import { getSkill, saveSkill, ConnectorRequestError } from "../../api/client.js";
import {
  beginEditorSave,
  createEditorState,
  discardEditorDraft,
  failEditorSave,
  reloadEditorSkill,
  saveEditorConflict,
  saveEditorSucceeded,
  updateEditorDraft,
  type SkillEditorState,
} from "./editor-state.js";

const connectorBaseUrl = import.meta.env?.VITE_CONNECTOR_BASE_URL ?? "";

interface SkillEditorProps {
  skill: SkillDetail;
  onClose: () => void;
  onSaved: (skill: SkillDetail) => void;
}

export function SkillEditor({ skill, onClose, onSaved }: SkillEditorProps) {
  const [state, setState] = useState<SkillEditorState>(() => createEditorState(skill));
  const [busy, setBusy] = useState(false);
  const diagnostics = diagnoseSkillDocument(state.draft);
  const dirty = state.draft !== state.skill.content;

  useEffect(() => {
    if (!dirty) return;
    const preventUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", preventUnload);
    return () => window.removeEventListener("beforeunload", preventUnload);
  }, [dirty]);

  const close = () => {
    if (dirty && !window.confirm("草稿尚未保存。确定离开并放弃修改吗？")) return;
    onClose();
  };

  const save = async () => {
    const saving = beginEditorSave(state);
    if (saving === state) return;
    setState(saving);
    setBusy(true);
    try {
      const saved = await saveSkill(fetch, connectorBaseUrl, saving.skill.id, {
        content: saving.draft,
        baseVersion: saving.skill.contentVersion,
      });
      setState((current) => saveEditorSucceeded(current, saved, saving.draft));
      onSaved(saved);
    } catch (error) {
      if (error instanceof ConnectorRequestError && error.status === 409) {
        setState((current) => saveEditorConflict(current, error.message, error.currentVersion));
      } else {
        setState((current) => failEditorSave(current, error instanceof Error ? error.message : "保存失败，草稿仍保留。"));
      }
    } finally {
      setBusy(false);
    }
  };

  const reload = async () => {
    setBusy(true);
    try {
      const latest = await getSkill(fetch, connectorBaseUrl, state.skill.id);
      setState((current) => reloadEditorSkill(current, latest));
    } catch (error) {
      setState((current) => failEditorSave(current, error instanceof Error ? error.message : "重新载入失败；草稿仍保留。"));
    } finally {
      setBusy(false);
    }
  };

  const copyDraft = async () => {
    try {
      await navigator.clipboard.writeText(state.draft);
      setState((current) => ({ ...current, error: "草稿已复制，可在重新载入后粘贴恢复。" }));
    } catch {
      setState((current) => ({ ...current, error: "无法访问剪贴板；请手动复制编辑区内容。" }));
    }
  };

  const statusLabel: Record<SkillEditorState["status"], string> = {
    clean: "已保存",
    dirty: "有未保存修改",
    saving: "正在保存…",
    saved: "保存完成",
    error: "保存失败，草稿已保留",
    conflict: "检测到版本冲突，草稿已保留",
  };

  return (
    <div className="editor-backdrop" role="presentation">
      <section className="skill-editor" role="dialog" aria-modal="true" aria-labelledby="editor-title">
        <header className="editor-header">
          <div><p className="eyebrow">LOCAL SKILL AUTHORING</p><h2 id="editor-title">{state.skill.name}</h2><p>{state.skill.relativePath} · 基准版本 {state.skill.contentVersion.slice(0, 12)}</p></div>
          <button className="close-button" type="button" aria-label="关闭编辑器" onClick={close}>×</button>
        </header>
        <div className="editor-status" role="status"><span className={dirty ? "status-dot dirty" : "status-dot"} />{statusLabel[state.status]}{state.currentVersion && <small>磁盘版本：{state.currentVersion.slice(0, 12)}</small>}</div>
        <label className="editor-label" htmlFor="skill-source-editor">SKILL.md 正文</label>
        <textarea
          id="skill-source-editor"
          className="editor-textarea"
          spellCheck={false}
          value={state.draft}
          onChange={(event) => setState((current) => updateEditorDraft(current, event.target.value))}
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
              event.preventDefault();
              void save();
            }
          }}
          aria-describedby="editor-diagnostics"
        />
        <section className="editor-diagnostics" id="editor-diagnostics" aria-live="polite">
          <div className="panel-heading"><h3>草稿诊断</h3><span className="count-badge">{diagnostics.length}</span></div>
          {diagnostics.length === 0 ? <p>未发现基础结构问题。</p> : <ul className="diagnostics">{diagnostics.map((diagnostic, index) => <li key={`${diagnostic.code}-${index}`} className={diagnostic.severity}>{diagnostic.message}{diagnostic.line ? `（第 ${diagnostic.line} 行）` : ""}</li>)}</ul>}
        </section>
        {state.error && <p className={state.status === "conflict" ? "editor-error conflict" : "editor-error"} role="alert">{state.error}</p>}
        <footer className="editor-actions">
          {state.status === "conflict" && <><button type="button" disabled={busy} onClick={copyDraft}>复制草稿</button><button type="button" disabled={busy} onClick={() => void reload()}>重新载入磁盘版本</button></>}
          <span className="editor-action-spacer" />
          <button type="button" disabled={!dirty || busy} onClick={() => setState((current) => discardEditorDraft(current))}>放弃修改</button>
          <button className="primary-button" type="button" disabled={!dirty || busy || state.status === "conflict"} onClick={() => void save()}>{busy ? "处理中…" : "保存"}</button>
        </footer>
      </section>
    </div>
  );
}
