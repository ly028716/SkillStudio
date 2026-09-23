import React, { useEffect, useState } from "react";

import type { CapabilityFact, FactStatus, HarnessReport } from "@skillstudio/contracts";
import { connectWithPairingCode, getHarnessReports, hasConnectorSession } from "./api/client.js";
import { LibraryPage } from "./features/library/LibraryPage.js";

const connectorBaseUrl = import.meta.env?.VITE_CONNECTOR_BASE_URL ?? "";

const statusDetails: Record<FactStatus, { label: string; tone: string; symbol: string }> = {
  ready: { label: "已就绪", tone: "ready", symbol: "●" },
  blocked: { label: "受阻", tone: "blocked", symbol: "◆" },
  not_installed: { label: "未发现", tone: "absent", symbol: "○" },
  unknown: { label: "待验证", tone: "unknown", symbol: "◌" },
  unsupported: { label: "M0 不支持", tone: "unsupported", symbol: "◇" },
};

const factLabels: Record<CapabilityFact["key"], string> = {
  installation: "安装与源码",
  version: "版本",
  execution: "执行边界",
  skillDiscovery: "技能发现",
};

function factFor(report: HarnessReport, key: CapabilityFact["key"]): CapabilityFact | undefined {
  return report.facts.find((fact) => fact.key === key);
}

export function reportHeadline(report: HarnessReport): string {
  const installation = factFor(report, "installation");
  const execution = factFor(report, "execution");
  if (report.kind === "hermes" && installation?.summary.includes("source checkout was found") && execution?.status === "blocked") {
    return "Hermes Agent · 已发现，运行时受阻";
  }
  if (report.kind === "deepseek" && installation?.summary.includes("source checkout was verified") && execution?.status === "unsupported") {
    return "DeepSeek Harness · 已发现源码，仅静态诊断";
  }
  return `${report.displayName} · ${statusDetails[installation?.status ?? "unknown"].label}`;
}

function reportStatus(report: HarnessReport): FactStatus {
  if (report.facts.some((fact) => fact.status === "blocked")) return "blocked";
  if (report.facts.some((fact) => fact.status === "unsupported")) return "unsupported";
  if (report.facts.some((fact) => fact.status === "ready")) return "ready";
  return factFor(report, "installation")?.status ?? "unknown";
}

function FactRow({ fact }: { fact: CapabilityFact }) {
  const [expanded, setExpanded] = useState(false);
  const status = statusDetails[fact.status];
  return (
    <li className="fact-row">
      <div className="fact-summary">
        <span className={`status-mark ${status.tone}`} aria-hidden="true">{status.symbol}</span>
        <div><p className="fact-key">{factLabels[fact.key]}</p><p>{fact.summary}</p></div>
        <span className={`status-text ${status.tone}`}>{status.label}</span>
      </div>
      {fact.evidence.length > 0 && <button className="evidence-toggle" type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>{expanded ? "收起证据" : `查看证据 · ${fact.evidence.length}`}</button>}
      {expanded && <ul className="evidence-list" aria-label={`${factLabels[fact.key]} 的证据`}>{fact.evidence.map((item) => <li key={item}>{item}</li>)}</ul>}
    </li>
  );
}

function HarnessCard({ report }: { report: HarnessReport }) {
  const status = statusDetails[reportStatus(report)];
  return (
    <article className="harness-card">
      <header className="harness-header"><div><p className="eyebrow">HARNESS / {report.kind.toUpperCase()}</p><h2>{reportHeadline(report)}</h2><p className="version">{report.detectedVersion === null ? "版本待验证" : `版本 ${report.detectedVersion}`}</p></div><span className={`status-pill ${status.tone}`}><span aria-hidden="true">{status.symbol}</span> {status.label}</span></header>
      <ul className="fact-list">{report.facts.map((fact) => <FactRow key={fact.key} fact={fact} />)}</ul>
    </article>
  );
}

function PairingScreen({ onConnected }: { onConnected: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const connect = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await connectWithPairingCode(fetch, connectorBaseUrl, code.trim());
      onConnected();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "无法连接本地连接器。");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="pairing-panel">
      <p className="eyebrow">LOCAL CONNECTOR</p><h2>连接本机 SkillStudio</h2>
      <p>在连接器终端复制一次性配对码。配对后，本标签页可以读取你明确添加的目录。</p>
      <form onSubmit={connect}><label htmlFor="pairing-code">一次性配对码</label><input id="pairing-code" autoComplete="off" value={code} onChange={(event) => setCode(event.target.value)} placeholder="从 Connector 终端粘贴" required />{error && <p className="inline-error" role="alert">{error}</p>}<button className="primary-button" disabled={busy}>{busy ? "正在连接…" : "安全连接"}</button></form>
      <small>配对码只能使用一次；会话凭据由 HttpOnly Cookie 保存。</small>
    </section>
  );
}

export function App() {
  const [connected, setConnected] = useState(hasConnectorSession);
  const [page, setPage] = useState<"library" | "harness">("library");
  const [reports, setReports] = useState<HarnessReport[] | null>(null);
  const [harnessError, setHarnessError] = useState("");

  useEffect(() => {
    const expireSession = () => setConnected(false);
    window.addEventListener("skillstudio:session-expired", expireSession);
    return () => window.removeEventListener("skillstudio:session-expired", expireSession);
  }, []);

  useEffect(() => {
    if (!connected || page !== "harness") return;
    let active = true;
    void getHarnessReports(fetch, connectorBaseUrl).then((value) => { if (active) setReports(value); }, (error: unknown) => { if (active) setHarnessError(error instanceof Error ? error.message : "无法读取状态。"); });
    return () => { active = false; };
  }, [connected, page]);

  return (
    <div className="app-shell">
      <aside className="rail" aria-label="SkillStudio 导航">
        <a className="brand" href="#workspace" aria-label="SkillStudio 工作台"><span className="brand-mark">S</span><span><strong>SkillStudio</strong><small>Skill Workbench</small></span></a>
        <nav><button className={`nav-item ${page === "library" ? "active" : ""}`} onClick={() => setPage("library")}><span aria-hidden="true">▤</span> Skill 库</button><button className={`nav-item ${page === "harness" ? "active" : ""}`} onClick={() => setPage("harness")}><span aria-hidden="true">◌</span> Harness 能力</button></nav>
        <div className="rail-note"><span className="muted-dot" aria-hidden="true" />本地 Connector · 仅本机访问</div>
      </aside>
      <main id="workspace" className="workspace">
        {!connected ? <PairingScreen onConnected={() => setConnected(true)} /> : page === "library" ? <LibraryPage /> : <><header className="workspace-header"><div><p className="breadcrumbs">工作台 <span>/</span> Harness</p><h1>Harness 能力矩阵</h1><p className="subtitle">只显示本地 Connector 返回的发现证据；不会启动 Harness。</p></div><div className="scope-stamp"><span>范围</span><strong>M0 · 只读诊断</strong></div></header>{harnessError && <div className="notice" role="alert">{harnessError}</div>}<section className="matrix" aria-live="polite">{reports === null && !harnessError ? <div className="state-panel loading"><span className="pulse" aria-hidden="true" /><div><p className="eyebrow">CONNECTOR</p><h2>正在读取本地发现证据</h2></div></div> : reports?.map((report) => <HarnessCard key={report.kind} report={report} />)}</section></>}
      </main>
    </div>
  );
}
