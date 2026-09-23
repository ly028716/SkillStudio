import React, { useCallback, useEffect, useState } from "react";

import type { RootScanResult, SkillDetail, SkillRoot, SkillSummary } from "@skillstudio/contracts";
import {
  addRoot,
  createSkill,
  getRoots,
  getSkill,
  getSkills,
  removeRoot,
  scanRoot,
} from "../../api/client.js";
import { SkillEditor } from "../editor/SkillEditor.js";

const connectorBaseUrl = import.meta.env?.VITE_CONNECTOR_BASE_URL ?? "";

function RootForm({ onAdd }: { onAdd: (path: string, writeEnabled: boolean) => Promise<boolean> }) {
  const [value, setValue] = useState("");
  const [writeEnabled, setWriteEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      if (await onAdd(value.trim(), writeEnabled)) { setValue(""); setWriteEnabled(false); }
    } finally {
      setBusy(false);
    }
  };
  return <form className="root-form" onSubmit={submit}><label htmlFor="root-path">添加本地 Skill 根目录</label><div className="root-input-row"><input id="root-path" value={value} onChange={(event) => setValue(event.target.value)} placeholder="例如 D:\\Skills" required /><button className="primary-button" disabled={busy}>{busy ? "扫描中…" : "添加并扫描"}</button></div><label className="write-access-option"><input type="checkbox" checked={writeEnabled} onChange={(event) => setWriteEnabled(event.target.checked)} /><span>允许 SkillStudio 在此目录创建和保存 Skill</span></label><small>默认只读。可添加多个目录；只扫描 SKILL.md，跳过符号链接，单文件上限 1 MiB。</small></form>;
}

export function LibraryPage() {
  const [roots, setRoots] = useState<SkillRoot[]>([]);
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [selectedRoot, setSelectedRoot] = useState("");
  const [selectedSkill, setSelectedSkill] = useState<SkillDetail | null>(null);
  const [editorSkill, setEditorSkill] = useState<SkillDetail | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createRootId, setCreateRootId] = useState("");
  const [createDirectoryName, setCreateDirectoryName] = useState("");
  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(100);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async (search = query, rootId = selectedRoot) => {
    const [nextRoots, nextSkills] = await Promise.all([
      getRoots(fetch, connectorBaseUrl),
      getSkills(fetch, connectorBaseUrl, { query: search, ...(rootId ? { rootId } : {}) }),
    ]);
    setRoots(nextRoots);
    setSkills(nextSkills);
  }, [query, selectedRoot]);

  useEffect(() => {
    let current = true;
    void Promise.all([getRoots(fetch, connectorBaseUrl), getSkills(fetch, connectorBaseUrl)])
      .then(([nextRoots, nextSkills]) => { if (current) { setRoots(nextRoots); setSkills(nextSkills); } })
      .catch((reason: unknown) => { if (current) setError(reason instanceof Error ? reason.message : "无法读取本地目录。"); });
    return () => { current = false; };
  }, []);

  useEffect(() => {
    setVisibleCount(100);
    const timer = window.setTimeout(() => {
      void getSkills(fetch, connectorBaseUrl, { query, ...(selectedRoot ? { rootId: selectedRoot } : {}) })
        .then(setSkills)
        .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "搜索失败。"));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [query, selectedRoot]);

  const add = async (rootPath: string, writeEnabled: boolean): Promise<boolean> => {
    setBusy(true);
    setError("");
    try {
      const result = await addRoot(fetch, connectorBaseUrl, rootPath, writeEnabled);
      setRoots((current) => [...current, result.root]);
      setSelectedRoot(result.root.id);
      setSkills(result.skills);
      setSelectedSkill(null);
      if (result.issues.length > 0) setError(`${result.issues.length} 个目录或文件无法读取，已显示可用结果。`);
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "无法添加目录。");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const rescan = async (rootId: string) => {
    setBusy(true);
    setError("");
    try {
      const result: RootScanResult = await scanRoot(fetch, connectorBaseUrl, rootId);
      setRoots((current) => current.map((root) => root.id === rootId ? result.root : root));
      await refresh(query, selectedRoot);
      if (result.issues.length > 0) setError(`${result.issues.length} 个目录或文件无法读取，已显示可用结果。`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "扫描失败。");
    } finally {
      setBusy(false);
    }
  };

  const openSkill = async (skill: SkillSummary) => {
    setSelectedSkill(null);
    setError("");
    try { setSelectedSkill(await getSkill(fetch, connectorBaseUrl, skill.id)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "无法读取 Skill。"); }
  };

  const forgetRoot = async (rootId: string) => {
    setError("");
    try {
      await removeRoot(fetch, connectorBaseUrl, rootId);
      setRoots((current) => current.filter((root) => root.id !== rootId));
      setSkills((current) => current.filter((skill) => skill.rootId !== rootId));
      if (selectedRoot === rootId) setSelectedRoot("");
      setSelectedSkill(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "移除目录失败。"); }
  };

  const submitCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const created = await createSkill(fetch, connectorBaseUrl, {
        rootId: createRootId,
        directoryName: createDirectoryName.trim(),
        name: createName.trim(),
        description: createDescription.trim(),
      });
      setCreateOpen(false);
      setCreateDirectoryName("");
      setCreateName("");
      setCreateDescription("");
      setSelectedRoot(createRootId);
      setSelectedSkill(null);
      setEditorSkill(created);
      await refresh(query, createRootId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "無法建立 Skill。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="library-layout">
      <section className="library-main">
        <div className="library-heading"><div><p className="eyebrow">LOCAL SKILL LIBRARY / M1</p><h1>Skill 库</h1><p className="subtitle">连接目录、浏览 Skill 内容，并查看基础元数据诊断。</p></div><div className="library-heading-actions"><span className="count-badge">{skills.length} 个 Skill</span><button type="button" disabled={!roots.some((root) => root.writeEnabled)} onClick={() => { const available = roots.find((root) => root.writeEnabled); setCreateRootId(available?.id ?? ""); setCreateOpen(true); }}>新建 Skill</button></div></div>
        <RootForm onAdd={add} />
        {error && <div className="notice" role="status">{error}</div>}
        <div className="library-toolbar"><label className="search-field"><span aria-hidden="true">⌕</span><input aria-label="搜索 Skill" placeholder="搜索名称、描述或路径" value={query} onChange={(event) => setQuery(event.target.value)} /></label><label className="root-filter"><span className="sr-only">筛选目录</span><select value={selectedRoot} onChange={(event) => setSelectedRoot(event.target.value)}><option value="">所有目录</option>{roots.map((root) => <option key={root.id} value={root.id}>{root.label}</option>)}</select></label></div>
        <div className="skill-list" aria-live="polite">
          {skills.length === 0 ? <div className="empty-state"><span aria-hidden="true">◇</span><h2>{roots.length === 0 ? "还没有连接目录" : "没有匹配的 Skill"}</h2><p>{roots.length === 0 ? "添加一个本地目录，SkillStudio 会查找其中的 SKILL.md。" : "试试其他关键词，或重新扫描已连接目录。"}</p></div> : skills.slice(0, visibleCount).map((skill) => <button className={`skill-row ${selectedSkill?.id === skill.id ? "selected" : ""}`} type="button" key={skill.id} onClick={() => void openSkill(skill)}><span className="skill-glyph" aria-hidden="true">S</span><span className="skill-copy"><strong>{skill.name}</strong><small>{skill.relativePath || "."} · {skill.description}</small></span><span className={`diagnostic-count ${skill.diagnostics.some((item) => item.severity === "error") ? "has-error" : ""}`}>{skill.diagnostics.length === 0 ? "格式待检查" : `${skill.diagnostics.length} 项提示`}</span></button>)}
        </div>
        {skills.length > visibleCount && <button className="load-more" type="button" onClick={() => setVisibleCount((current) => current + 100)}>再显示 100 个 · 还剩 {skills.length - visibleCount}</button>}
      </section>
      <aside className="library-sidebar">
        <div className="panel-heading"><div><p className="eyebrow">CONNECTED ROOTS</p><h2>本地目录</h2></div><span className="count-badge">{roots.length}</span></div>
        {roots.length === 0 ? <p className="sidebar-empty">添加目录后，扫描结果会显示在这里。</p> : <ul className="root-list">{roots.map((root) => <li key={root.id} className={selectedRoot === root.id ? "active" : ""}><button className="root-select" type="button" onClick={() => setSelectedRoot(root.id)}><strong>{root.label}</strong><small>{root.skillCount} 个 Skill · {root.writeEnabled ? "允许写入" : "只读"} · {root.scanStatus === "partial" ? `${root.issueCount} 项未读取` : root.scanStatus === "error" ? "扫描失败" : "扫描完成"}</small></button><div className="root-actions"><button type="button" aria-label={`重新扫描 ${root.label}`} disabled={busy} onClick={() => void rescan(root.id)}>↻</button><button type="button" aria-label={`移除 ${root.label}`} onClick={() => void forgetRoot(root.id)}>×</button></div></li>)}</ul>}
        <p className="privacy-note"><span aria-hidden="true">◉</span> 仅访问你明确添加的目录。移除目录会取消登记，不会删除磁盘文件。</p>
      </aside>
      {selectedSkill && !editorSkill && <div className="detail-backdrop" role="presentation" onClick={() => setSelectedSkill(null)}><section className="detail-panel" role="dialog" aria-modal="true" aria-labelledby="detail-title" onClick={(event) => event.stopPropagation()}><header><div><p className="eyebrow">SKILL DETAIL</p><h2 id="detail-title">{selectedSkill.name}</h2><p>{selectedSkill.relativePath || "."} · SHA-256 {selectedSkill.contentVersion.slice(0, 12)}</p></div><button className="close-button" aria-label="关闭详情" onClick={() => setSelectedSkill(null)}>×</button></header><p className="detail-description">{selectedSkill.description}</p>{selectedSkill.diagnostics.length > 0 && <ul className="diagnostics">{selectedSkill.diagnostics.map((diagnostic) => <li key={diagnostic.message} className={diagnostic.severity}>{diagnostic.message}</li>)}</ul>}<pre className="skill-source">{selectedSkill.content}</pre>{roots.find((root) => root.id === selectedSkill.rootId)?.writeEnabled && <button className="primary-button" type="button" onClick={() => setEditorSkill(selectedSkill)}>编辑 Skill</button>}</section></div>}
      {createOpen && <div className="editor-backdrop" role="presentation" onClick={() => setCreateOpen(false)}><form className="create-skill-dialog" role="dialog" aria-modal="true" aria-labelledby="create-skill-title" onSubmit={(event) => void submitCreate(event)} onClick={(event) => event.stopPropagation()}><header><div><p className="eyebrow">CREATE A SKILL</p><h2 id="create-skill-title">新建 Skill</h2></div><button className="close-button" type="button" aria-label="关闭新建表单" onClick={() => setCreateOpen(false)}>×</button></header><label>保存目录<select value={createRootId} onChange={(event) => setCreateRootId(event.target.value)} required>{roots.filter((root) => root.writeEnabled).map((root) => <option key={root.id} value={root.id}>{root.label}</option>)}</select></label><label>目录名<input value={createDirectoryName} onChange={(event) => setCreateDirectoryName(event.target.value)} placeholder="例如 my-skill" required /></label><label>Skill 名称<input value={createName} onChange={(event) => setCreateName(event.target.value)} required /></label><label>简短描述<input value={createDescription} onChange={(event) => setCreateDescription(event.target.value)} required /></label><p className="create-preview">预览：{roots.find((root) => root.id === createRootId)?.canonicalPath}\{createDirectoryName || "<目录名>"}\SKILL.md</p><footer className="editor-actions"><button type="button" onClick={() => setCreateOpen(false)}>取消</button><button className="primary-button" type="submit" disabled={busy}>{busy ? "正在创建…" : "创建并编辑"}</button></footer></form></div>}
      {editorSkill && <SkillEditor skill={editorSkill} onClose={() => setEditorSkill(null)} onSaved={(saved) => { setSelectedSkill(saved); void refresh(query, selectedRoot); }} />}
    </div>
  );
}
