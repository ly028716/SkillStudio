import { useMemo, useState } from "react";
import {
  ArrowSquareOut, BracketsCurly, CaretDown, CaretRight, ChartBar, Check, CheckCircle,
  Clock, Code, Copy, DotsThree, FileCode, Files, Flask, Funnel, GearSix, GitDiff,
  ListChecks, MagnifyingGlass, NotePencil, PencilSimpleLine, PlugsConnected, Plus,
  SidebarSimple, Sparkle, SquaresFour, TerminalWindow, WarningCircle, Wrench, X, XCircle,
} from "@phosphor-icons/react";

const cases = [
  { id: "case-01", title: "识别高风险依赖", meta: "2 Harness · 5 断言", status: "warning" },
  { id: "case-02", title: "生成修复建议", meta: "2 Harness · 4 断言", status: "pass" },
  { id: "case-03", title: "无漏洞时保持克制", meta: "2 Harness · 3 断言", status: "pass" },
];
const assertions = [
  { id: "A1", label: "发现依赖风险", codex: "pass", hermes: "pass", trace: "evt_018" },
  { id: "A2", label: "提供受影响版本", codex: "pass", hermes: "pass", trace: "evt_024" },
  { id: "A3", label: "给出明确风险等级", codex: "fail", hermes: "pass", trace: "evt_031" },
  { id: "A4", label: "引用可信来源", codex: "pass", hermes: "pass", trace: "evt_044" },
  { id: "A5", label: "避免直接修改文件", codex: "pass", hermes: "pass", trace: "evt_052" },
];
const tabs = ["断言", "工具调用", "文件变化", "原始事件"];

function IconButton({ label, children, active = false, onClick }) {
  return <button className={`icon-button ${active ? "active" : ""}`} aria-label={label} title={label} onClick={onClick}>{children}</button>;
}
function StatusIcon({ status }) {
  if (status === "pass") return <CheckCircle weight="fill" />;
  if (status === "fail") return <XCircle weight="fill" />;
  return <WarningCircle weight="fill" />;
}
function HarnessPanel({ kind }) {
  const isHermes = kind === "hermes";
  return <article className="harness-panel">
    <div className="panel-header">
      <div className="harness-title"><div className={`harness-mark ${isHermes ? "hermes" : "codex"}`}>{isHermes ? <Sparkle weight="fill" /> : <TerminalWindow weight="fill" />}</div><div><strong>{isHermes ? "Hermes Agent" : "Codex CLI"}</strong><span>{isHermes ? "0.9.0" : "0.153.3"}</span></div></div>
      <button className="more-button" aria-label="更多操作"><DotsThree weight="bold" /></button>
    </div>
    <div className="run-summary"><span className="completed"><CheckCircle weight="fill" /> 已完成</span><span><Clock /> {isHermes ? "14.8s" : "12.4s"}</span><span><ListChecks /> {isHermes ? "5/5" : "4/5"} 断言</span></div>
    <div className="output-label"><span>最终输出</span><button aria-label="复制输出"><Copy /></button></div>
    <div className="code-output">
      <div className="line"><span className="line-no">1</span><span>检测到 <em>lodash@4.17.19</em> 存在已知原型污染漏洞。</span></div>
      <div className="line"><span className="line-no">2</span><span>受影响版本：<em>&lt; 4.17.21</em></span></div>
      {isHermes ? <div className="line added"><span className="line-no">3</span><span><b>+</b> 风险等级：<strong>中</strong></span></div> : <div className="line missing"><span className="line-no">3</span><span><b>−</b> 未提供风险等级</span></div>}
      <div className="line"><span className="line-no">4</span><span>建议升级至 <em>4.17.21</em> 或更高版本。</span></div>
      <div className="line"><span className="line-no">5</span><span>来源：GitHub Advisory <em>GHSA-35jh-r3h4-6jhm</em></span></div>
    </div>
    <div className="panel-foot"><span><Code /> {isHermes ? "1,421" : "1,186"} tokens</span><span>¥{isHermes ? "0.061" : "0.044"}</span><button><ArrowSquareOut /> 查看完整输出</button></div>
  </article>;
}
function EvidenceContent({ activeTab }) {
  if (activeTab === "工具调用") return <div className="event-list"><div><Wrench /><span><strong>read_file</strong><small>package-lock.json · 28ms</small></span><code>成功</code></div><div><MagnifyingGlass /><span><strong>search_advisory</strong><small>GHSA-35jh-r3h4-6jhm · 410ms</small></span><code>成功</code></div></div>;
  if (activeTab === "文件变化") return <div className="empty-state"><Files /><strong>未写入工作区</strong><span>两次运行均遵守只读验证策略</span></div>;
  if (activeTab === "原始事件") return <pre className="raw-events">{`14:32:08.104  run.started    case-01\n14:32:08.287  tool.called    read_file\n14:32:12.964  assertion      A3: failed\n14:32:20.516  run.completed  4/5`}</pre>;
  return <div className="assertion-table"><div className="assertion-row assertion-head"><span>断言</span><span>Codex CLI</span><span>Hermes Agent</span><span>证据</span></div>{assertions.map(item => <div className={`assertion-row ${item.codex === "fail" ? "attention" : ""}`} key={item.id}><span><b>{item.id}</b>{item.label}</span><span className={`result ${item.codex}`}><StatusIcon status={item.codex} />{item.codex === "pass" ? "通过" : "失败"}</span><span className={`result ${item.hermes}`}><StatusIcon status={item.hermes} />通过</span><button className="trace-link">{item.trace}<CaretRight /></button></div>)}</div>;
}

export function App() {
  const [selectedCase, setSelectedCase] = useState("case-01");
  const [activeTab, setActiveTab] = useState("断言");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [filterOpen, setFilterOpen] = useState(false);
  const [review, setReview] = useState("pass");
  const [draftOpen, setDraftOpen] = useState(false);
  const [toast, setToast] = useState("");
  const currentCase = useMemo(() => cases.find(item => item.id === selectedCase), [selectedCase]);
  const notify = message => { setToast(message); window.setTimeout(() => setToast(""), 2600); };
  return <div className={`app-shell ${sidebarOpen ? "" : "sidebar-collapsed"}`}>
    <aside className="rail"><div className="brand-mark"><BracketsCurly weight="bold" /></div><nav aria-label="主导航"><IconButton label="工作台"><SquaresFour /></IconButton><IconButton label="Skill 编辑器"><PencilSimpleLine /></IconButton><IconButton label="验证" active><Flask weight="fill" /></IconButton><IconButton label="分析"><ChartBar /></IconButton><IconButton label="Harness 连接"><PlugsConnected /></IconButton></nav><div className="rail-bottom"><IconButton label="设置"><GearSix /></IconButton><div className="avatar">YL</div></div></aside>
    <aside className="context-sidebar">
      <div className="context-head"><div><span className="eyebrow">SKILLSTUDIO</span><strong>依赖安全审查</strong></div><button aria-label="收起侧栏" onClick={() => setSidebarOpen(false)}><SidebarSimple /></button></div>
      <div className="version-row"><GitDiff /><span>main</span><span>v0.8.2</span><CaretDown /></div>
      <div className="side-section-head"><span>验证集</span><button onClick={() => notify("已新建空白验证用例")}><Plus />新建</button></div>
      <div className="case-list">{cases.map(item => <button key={item.id} onClick={() => setSelectedCase(item.id)} className={selectedCase === item.id ? "selected" : ""}><span className={`case-status ${item.status}`}></span><span><strong>{item.title}</strong><small>{item.meta}</small></span><CaretRight /></button>)}</div>
      <div className="side-divider"></div><div className="side-link"><FileCode /><span><strong>Skill 源文件</strong><small>SKILL.md · 4.2 KB</small></span><CaretRight /></div><div className="side-link"><PlugsConnected /><span><strong>Harness 配置</strong><small>2 个已连接</small></span><CaretRight /></div>
      <div className="context-footer"><span>工作区状态</span><strong><i></i>全部已保存</strong></div>
    </aside>
    <main className="workspace">
      <header className="topbar">{!sidebarOpen && <button className="sidebar-restore" onClick={() => setSidebarOpen(true)} aria-label="展开侧栏"><SidebarSimple /></button>}<div className="breadcrumbs"><span>依赖安全审查</span><CaretRight /><strong>{currentCase.title}</strong></div><div className="top-actions"><div className="filter-wrap"><button className="secondary" onClick={() => setFilterOpen(!filterOpen)}><Funnel />筛选<CaretDown /></button>{filterOpen && <div className="filter-menu"><strong>显示结果</strong><label><input type="checkbox" defaultChecked /> 已完成</label><label><input type="checkbox" defaultChecked /> 有差异</label><label><input type="checkbox" /> 失败</label></div>}</div><button className="secondary" onClick={() => notify("已创建新的验证运行")}><Plus />新验证</button></div></header>
      <section className="content"><div className="page-heading"><div><div className="title-row"><h1>结果对比</h1><span className="comparable"><CheckCircle weight="fill" />可比较</span></div><div className="revision"><span><GitDiff /> Revision <b>7c91a2</b></span><i></i><span>case v3</span><i></i><span>今天 14:32</span></div></div><div className="heading-actions"><button className="secondary" onClick={() => setActiveTab("原始事件")}><TerminalWindow />查看运行详情</button><button className="primary" onClick={() => setDraftOpen(true)}><Sparkle weight="fill" />创建改进草稿</button></div></div>
        <div className="compare-grid"><HarnessPanel kind="codex" /><HarnessPanel kind="hermes" /></div>
        <section className="evidence-card"><div className="tabs" role="tablist">{tabs.map(tab => <button key={tab} onClick={() => setActiveTab(tab)} className={activeTab === tab ? "active" : ""}>{tab}{tab === "断言" && <span>5</span>}</button>)}<div className="evidence-meta"><span>5 项证据</span><span className="mismatch"><WarningCircle weight="fill" />Token 口径不同，成本仅供参考</span></div></div><EvidenceContent activeTab={activeTab} /></section>
      </section>
    </main>
    <aside className="review-panel"><div className="review-head"><div><NotePencil /><span><strong>人工评审</strong><small>保存在本次对比中</small></span></div><button aria-label="评审菜单"><DotsThree /></button></div><div className="review-body"><label>结论</label><div className="verdicts"><button className={review === "pass" ? "selected pass" : ""} onClick={() => setReview("pass")}><CheckCircle weight="fill" />通过</button><button className={review === "fail" ? "selected fail" : ""} onClick={() => setReview("fail")}><XCircle weight="fill" />失败</button><button className={review === "unknown" ? "selected unknown" : ""} onClick={() => setReview("unknown")}><WarningCircle weight="fill" />待定</button></div><label htmlFor="review-note">评审备注</label><textarea id="review-note" defaultValue="Hermes 补充了明确的风险等级，满足 A3。Codex 的其余事实与引用均正确。" /><div className="focus-card"><span>当前关注</span><strong>A3 · 风险等级</strong><p>Codex CLI 未给出严重性判断；Hermes Agent 输出为“中”。</p><button onClick={() => setActiveTab("断言")}><ArrowSquareOut />定位到证据</button></div></div><div className="review-footer"><button onClick={() => notify("评审已保存")}><Check />保存评审</button><span>上次保存 14:36</span></div></aside>
    {draftOpen && <div className="modal-backdrop" onMouseDown={() => setDraftOpen(false)}><section className="draft-modal" onMouseDown={event => event.stopPropagation()} aria-modal="true" role="dialog"><div className="modal-head"><div><Sparkle weight="fill" /><span><strong>改进草稿</strong><small>基于 A3 失败证据生成</small></span></div><button onClick={() => setDraftOpen(false)} aria-label="关闭"><X /></button></div><p>建议在输出约束中明确要求风险等级，并保持 Harness 无关的描述。</p><div className="diff-box"><span>SKILL.md</span><code><b>+</b> 对每个已确认漏洞，输出低、中、高或严重四级风险等级。</code><code><b>+</b> 风险等级必须紧邻受影响版本，避免仅在总结中出现。</code></div><div className="modal-note"><WarningCircle />草稿尚未写入源文件。确认后可在 Skill 编辑器继续调整。</div><div className="modal-actions"><button className="secondary" onClick={() => setDraftOpen(false)}>取消</button><button className="primary" onClick={() => { setDraftOpen(false); notify("改进草稿已创建，等待编辑确认"); }}><PencilSimpleLine />创建草稿</button></div></section></div>}
    {toast && <div className="toast"><CheckCircle weight="fill" />{toast}</div>}
  </div>;
}
