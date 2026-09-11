import { useEffect, useState } from "react";

import type { CapabilityFact, FactStatus, HarnessReport } from "@skillstudio/contracts";
import { getHarnessReports } from "./api/client.js";

const connectorBaseUrl = import.meta.env.VITE_CONNECTOR_BASE_URL ?? "";

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

function reportHeadline(report: HarnessReport): string {
  const installation = factFor(report, "installation");
  const execution = factFor(report, "execution");

  if (report.kind === "hermes" && installation?.summary.includes("source checkout was found") && execution?.status === "blocked") {
    return "Hermes Agent · 已发现，运行时受阻";
  }

  if (report.kind === "deepseek" && installation?.summary.includes("source checkout was verified")) {
    return "DeepSeek Harness · 已发现源码，仅静态诊断";
  }

  return `${report.displayName} · ${statusDetails[installation?.status ?? "unknown"].label}`;
}

function reportStatus(report: HarnessReport): FactStatus {
  const facts = report.facts;
  if (facts.some((fact) => fact.status === "blocked")) return "blocked";
  if (facts.some((fact) => fact.status === "unsupported")) return "unsupported";
  if (facts.some((fact) => fact.status === "ready")) return "ready";
  return factFor(report, "installation")?.status ?? "unknown";
}

function FactRow({ fact }: { fact: CapabilityFact }) {
  const [expanded, setExpanded] = useState(false);
  const status = statusDetails[fact.status];

  return (
    <li className="fact-row">
      <div className="fact-summary">
        <span className={`status-mark ${status.tone}`} aria-hidden="true">{status.symbol}</span>
        <div>
          <p className="fact-key">{factLabels[fact.key]}</p>
          <p>{fact.summary}</p>
        </div>
        <span className={`status-text ${status.tone}`}>{status.label}</span>
      </div>
      {fact.evidence.length > 0 && (
        <button
          className="evidence-toggle"
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "收起证据" : `查看证据 · ${fact.evidence.length}`}
        </button>
      )}
      {expanded && (
        <ul className="evidence-list" aria-label={`${factLabels[fact.key]} 的证据`}>
          {fact.evidence.map((item) => <li key={item}>{item}</li>)}
        </ul>
      )}
    </li>
  );
}

function HarnessCard({ report }: { report: HarnessReport }) {
  const status = statusDetails[reportStatus(report)];

  return (
    <article className="harness-card">
      <header className="harness-header">
        <div>
          <p className="eyebrow">HARNESS / {report.kind.toUpperCase()}</p>
          <h2>{reportHeadline(report)}</h2>
          <p className="version">{report.detectedVersion === null ? "版本待验证" : `版本 ${report.detectedVersion}`}</p>
        </div>
        <span className={`status-pill ${status.tone}`}><span aria-hidden="true">{status.symbol}</span> {status.label}</span>
      </header>
      <ul className="fact-list">
        {report.facts.map((fact) => <FactRow key={fact.key} fact={fact} />)}
      </ul>
    </article>
  );
}

export function App() {
  const [reports, setReports] = useState<HarnessReport[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [requestVersion, setRequestVersion] = useState(0);

  useEffect(() => {
    let current = true;
    setReports(null);
    setUnavailable(false);

    void getHarnessReports(fetch, connectorBaseUrl).then(
      (nextReports) => {
        if (current) setReports(nextReports);
      },
      () => {
        if (current) setUnavailable(true);
      },
    );

    return () => {
      current = false;
    };
  }, [requestVersion]);

  return (
    <div className="app-shell">
      <aside className="rail" aria-label="SkillStudio 导航">
        <a className="brand" href="#workspace" aria-label="SkillStudio 工作台">
          <span className="brand-mark">S</span>
          <span><strong>SkillStudio</strong><small>Evidence Console</small></span>
        </a>
        <nav>
          <a className="nav-item active" href="#workspace"><span aria-hidden="true">◫</span> 工作台</a>
          <a className="nav-item" href="#matrix"><span aria-hidden="true">◌</span> Harness 能力</a>
          <a className="nav-item" href="#boundary"><span aria-hidden="true">◇</span> M0 边界</a>
        </nav>
        <div className="rail-note">
          <span className="muted-dot" aria-hidden="true" />
          本地 Connector 提供发现结果
        </div>
      </aside>

      <main id="workspace" className="workspace">
        <header className="workspace-header">
          <div>
            <p className="breadcrumbs">工作台 <span>/</span> 本地能力基线</p>
            <h1>Harness 能力矩阵</h1>
            <p className="subtitle">只显示本地 Connector 已返回的发现证据；不会启动 Harness。</p>
          </div>
          <div className="scope-stamp">
            <span>范围</span>
            <strong>M0 · 只读诊断</strong>
          </div>
        </header>

        <section id="matrix" className="matrix" aria-live="polite" aria-busy={reports === null && !unavailable}>
          {reports === null && !unavailable && (
            <div className="state-panel loading">
              <span className="pulse" aria-hidden="true" />
              <div><p className="eyebrow">CONNECTOR</p><h2>正在读取本地发现证据</h2><p>此页面不会执行 Harness 或写入本地配置。</p></div>
            </div>
          )}
          {unavailable && (
            <div className="state-panel unavailable">
              <span className="state-symbol" aria-hidden="true">◇</span>
              <div>
                <p className="eyebrow">CONNECTOR UNAVAILABLE</p>
                <h2>无法连接本地连接器</h2>
                <p>请确认本地 Connector 正在监听 127.0.0.1:4317，然后重新读取状态。</p>
                <button className="retry-button" type="button" onClick={() => setRequestVersion((value) => value + 1)}>重新读取</button>
              </div>
            </div>
          )}
          {reports !== null && reports.map((report) => <HarnessCard key={report.kind} report={report} />)}
        </section>

        <section id="boundary" className="boundary" aria-labelledby="boundary-title">
          <p className="eyebrow">M0 BOUNDARY</p>
          <h2 id="boundary-title">证据优先，执行另行验证</h2>
          <p>状态由安装、版本、执行与技能发现事实组成。展开每项可查看 Connector 返回的原始证据。</p>
        </section>
      </main>
    </div>
  );
}
