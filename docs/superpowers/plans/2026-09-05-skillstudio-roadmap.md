# SkillStudio 实施路线图（评审稿）

> **历史路线图：** 本计划基于单 Codex 宿主定位，不能直接执行。它保留安全和工作量参考；多 Harness 规格通过用户复核后需重新编写实施计划。

> 执行说明：设计选定后，使用 superpowers:writing-plans 将下面各阶段细化成可执行任务，再使用 superpowers:executing-plans 按任务实施。本次交付是需求与方案计划，不是已批准的逐行编码指令，不启动子代理或开发。

**Goal:** 交付作者与使用者并重的本地 Skill 创作、发现、校验和受控运行闭环。

**Architecture:** 单 Node 连接器提供静态前端、HTTP 和 WebSocket，直接操作注册目录；纯规则包承担解析、诊断和领域类型。CLI 适配器封装版本探测、预检、启动和事件归一化。

**Tech Stack:** 延用 React、TypeScript、Node.js、JSON；拟采用 npm workspaces，具体受支持版本和新增依赖在 M0 核对、锁定。这里不宣称候选依赖已安装或已兼容。

**Spec:** [产品需求](../specs/2026-09-05-skillstudio-product.md)、[UI 设计](../specs/2026-09-05-skillstudio-ui.md)。

## 全局约束

- 作者与使用者并重，必须分别验收两条闭环。
- 目标平台：Windows 11 本机浏览器；桌面视口优先。
- 服务只监听 127.0.0.1；认证同时覆盖 HTTP 与 WebSocket。
- SKILL.md 为内容来源；用户状态、派生索引、历史分开保存。
- 同时只允许一个活动运行，不排队，不静默安装或提升权限。
- 单源文件上限 1MiB；扫描最多 10,000 Skill；导出最多 1,000 文件/100 MiB。
- 日志每次 10 MiB；记录最近 100 次且最多 30 天；运行默认超时 30 分钟。
- 应用不能把 CLI 存在、Skill 校验通过或退出码 0 单独解释为业务成功。
- 下列路径均为**拟创建文件**，目前没有这些应用模块或可执行测试命令。

## 1. 模块与接口边界

| 拟建位置 | 职责 | 依赖 |
| --- | --- | --- |
| `apps/web/src/features/library/` | 库、详情、查询状态 | contracts、API |
| `apps/web/src/features/editor/` | 源码、草稿版本、保存、冲突 | contracts、API |
| `apps/web/src/features/runs/` | 预检、结果、日志和记录 | contracts、API、事件流 |
| `apps/web/src/features/connections/` | 根和宿主状态 | API |
| `apps/web/src/ui/` | tokens、按钮、字段、对话框、空状态 | 经选择的视觉基线 |
| `apps/connector/src/files/` | 路径边界、扫描、读写、导出 | 文件系统 |
| `apps/connector/src/skills/` | Skill 索引与查询 | files、core |
| `apps/connector/src/runs/` | 生命周期、锁、日志、取消 | codex adapter、state |
| `apps/connector/src/adapters/codex.ts` | CLI 探测、发现预检、argv、事件解析 | 本机 CLI、contracts |
| `apps/connector/src/auth/` | 启动凭据、会话、Origin/Host | HTTP/WS |
| `apps/connector/src/state/` | 用户状态、索引、运行元数据迁移 | 本地 JSON |
| `packages/core/src/` | 解析与分层诊断纯函数 | 文本输入 |
| `packages/contracts/src/` | DTO、错误码与事件 schema | 无业务运行时依赖 |
| `tests/fixtures/`、`tests/e2e/` | 文件夹具、伪 CLI、真实流程 | 测试环境 |

核心数据契约在 M0 固化：Root(id, canonicalPath, access, scanStatus)；Skill(id, rootId, relativePath, name, description, contentVersion, diagnostics)；Diagnostic(code, layer, severity, message, line?, column?, rulesetVersion)；Run(id, clientRequestId, skillId, sourceVersion, cwd, permission, status, exitCode?, sourceChanged)；RunEvent(runId, seq, time, kind, text)。

| 拟定端点 | 输入/输出和约束 |
| --- | --- |
| `POST /api/bootstrap` | 一次性凭据 → 内存会话；60 秒单次使用 |
| `GET/POST /api/roots`、`DELETE /api/roots/:id` | 列表/登记/解除根，删除不接触源文件 |
| `POST /api/roots/:id/scan` | 返回 scanId；异步报告进度和部分失败 |
| `GET /api/skills`、`GET /api/skills/:id` | 查询/读取；读取返回原文、contentVersion |
| `POST /api/skills` | rootId、目录名和元数据 → 新 Skill；排他创建 |
| `PUT /api/skills/:id/content` | content、baseVersion → 新版本；409 为冲突 |
| `POST /api/skills/:id/validate` | content、draftRevision → 对应 revision 诊断 |
| `POST /api/skills/:id/export` | expectedVersion、选中文件清单 → ZIP 流；文件变化拒绝 |
| `POST /api/runs/preflight` | Skill、版本、cwd、权限 → ready/blocked/unknown 及理由 |
| `POST /api/runs` | 预检输入加 clientRequestId、任务文本 → runId；启动前再检 |
| `POST /api/runs/:id/cancel` | 幂等停止请求；不能立即伪造 cancelled |
| `GET /api/runs`、`GET /api/runs/:id` | 历史/结果；不隐含继续任务 |
| `GET /api/runs/:id/events?afterSeq=N` | 补传日志及 truncation 标记 |
| `GET /api/connections` | 目录、扫描、CLI 版本和能力状态 |
| `WS /api/events` | Origin/Host + 首消息认证；5 秒超时；带 seq 的事件 |

统一错误返回 code、message、requestId、可选 details，不向前端暴露服务堆栈。错误码包括 UNAUTHORIZED、ROOT_UNAVAILABLE、PATH_OUTSIDE_ROOT、READ_ONLY、CONFLICT、FILE_TOO_LARGE、SKILL_NOT_DISCOVERED、CLI_UNAVAILABLE、RUN_BUSY、EXPORT_CHANGED、LIMIT_EXCEEDED。

## 2. 阶段与工作量

建议一名熟悉全栈的工程师按下表顺序推进；工作量为初始估算，非截止日期。基础合计 20–30 人日；另留 20% 风险缓冲约为 24–36 人日。宿主集成出现能力缺口时在 M0 重新估算，不到 M4 才发现。

| 阶段 | 估算 | 依赖 | 可独立评审的交付 |
| --- | --- | --- | --- |
| M0 设计收敛与宿主验证 | 2–3 人日 | 选择 UI 方向 | 视觉基线、支持矩阵、接口契约、工程脚手架 |
| M1 安全连接与只读浏览 | 4–6 人日 | M0 | 添加目录、搜索、详情、空/错误状态 |
| M2 创作、保存与诊断 | 5–7 人日 | M1 | 创建、原文编辑、分层诊断、冲突恢复 |
| M3 导出与本地状态 | 2–3 人日 | M2 | 复制/ZIP、收藏与最近打开、本地连接状态 |
| M4 运行与可恢复日志 | 4–6 人日 | M0 宿主探针 + M3 | 预检、真实运行、取消、断线、记录 |
| M5 联调与交付验证 | 3–5 人日 | M4 | 两条闭环、可访问性、性能和安装启动说明 |

### M0：减少未知项

拟建：`docs/decisions/0001-codex-capabilities.md`、`docs/decisions/0002-ui-baseline.md`、`packages/contracts/src/index.ts`、根 `package.json`、`tests/fixtures/codex/`。

- [ ] 选定主图，按 UI 文档修正未保存运行、Windows 快捷键和目录选择能力。
- [ ] 在隔离测试目录验证目标 CLI：标准发现目录、未发现目录、同名 Skill、引用文件、中文/空格路径、Git 目录限制、取消进程树。
- [ ] 捕获测试用 JSONL 事件，证明使用的是选中的 Skill；只靠模型一句“我用了”不算充分证据，使用唯一输出约束和附件读取夹具交叉验证。
- [ ] 记录可用版本、可用调用方式和失败降级。若任意目录无法原生运行，按 R07 限制范围；不写隐式安装逻辑。
- [ ] 建立 DTO、错误码与示例响应，核对后续阶段接口。
- [ ] 核对依赖与运行时，创建最小工程并固定锁文件；约定 test、typecheck、build、test:e2e 脚本。

验收：宿主能力矩阵可复现；设计选择已记录；最小前后端启动成功。未通过宿主探针时 M1–M3 可继续，M4 不得宣称可发布。

### M1：只读闭环

拟建：`apps/connector/src/auth/session.ts`、`files/paths.ts`、`files/scanner.ts`、`skills/repository.ts`、`apps/web/src/features/library/LibraryPage.tsx`、`SkillDetail.tsx`；测试 `tests/integration/roots.test.ts`、`auth.test.ts`、`tests/e2e/library.spec.ts`。

- [ ] 先写失败夹具：目录穿越、junction、同名、部分不可读、重复/重叠根、失效会话和伪造 Origin。
- [ ] 实现根注册、规范路径映射、受限扫描和同源认证；默认拒绝符号链接。
- [ ] 实现首次空态、列表、搜索、详情和本地连接入口；接真实扫描响应。
- [ ] 实现分页或虚拟列表与扫描进度，不为 10,000 项一次渲染完整 DOM。
- [ ] 验证搜索状态恢复、部分扫描失败与源文件未变；审查通过后形成阶段提交。

验收：R01、R02、R03 详情部分及 R10 的读取边界；未注册目录不能通过猜测 ID 读取。

### M2：可恢复创作闭环

拟建：`packages/core/src/parse.ts`、`validate.ts`、`apps/connector/src/files/create.ts`、`save.ts`、`watch.ts`、`apps/web/src/features/editor/SkillEditor.tsx`、`ConflictDialog.tsx`；测试 `tests/integration/save-conflict.test.ts`、`tests/unit/validation.test.ts`、`tests/e2e/authoring.spec.ts`。

- [ ] 先测试两客户端同版本保存、外部变更、写入失败、超限文件、未知字段和旧诊断响应。
- [ ] 实现模板排他创建、原文读取、baseVersion 比对和单文件串行保存。
- [ ] 在 Windows 验证替换、恢复副本与文件占用；重读确认磁盘内容后返回成功。
- [ ] 实现编辑器、400ms 草稿校验、行定位、离开保护与冲突差异。
- [ ] 验证中文输入法、Ctrl+S、不支持编码、只读根与断线后草稿保留；审查后阶段提交。

验收：R03 创建、R04、R05。失效文件可以编辑保存，但 error 不允许运行。

### M3：可携带与本地状态

拟建：`apps/connector/src/files/export.ts`、`state/user-state.ts`、`state/migrations.ts`、`apps/web/src/features/library/ExportDialog.tsx`、`features/connections/ConnectionsPage.tsx`；测试 `tests/integration/export.test.ts`、`state-recovery.test.ts`。

- [ ] 测试 ZIP 路径越界、导出中源变化、敏感项排除、体积限制、状态 JSON 损坏和旧 schema 迁移。
- [ ] 实现文件清单预览、导出、复制失败反馈；不存在的系统目录选择能力不放按钮。
- [ ] 持久化根、收藏、最近打开；将派生索引独立，可单独重建。
- [ ] 实现 CLI 版本/能力状态和恢复副本保留策略，验证清理不碰源；审查后阶段提交。

验收：R06、R09 用户状态部分；浏览器剪贴板失败仍有手动复制退路。

### M4：可追踪运行闭环

拟建：`apps/connector/src/adapters/codex.ts`、`runs/preflight.ts`、`runs/manager.ts`、`runs/events.ts`、`runs/history.ts`、`apps/web/src/features/runs/RunPanel.tsx`、`RunDetail.tsx`；测试 `tests/integration/run-lifecycle.test.ts`、`codex-events.test.ts`、`tests/e2e/run.spec.ts`。

- [ ] 用伪 CLI 覆盖分块 JSONL、未知事件、stderr、非零退出、零退出但无完成事件、重复请求、巨量日志、超时及取消失败。
- [ ] 实现白名单 argv、stdin 提示词、工作目录预检、原生 Skill 发现验证；启动前再次核对版本。
- [ ] 实现单任务锁、请求幂等、状态机、进程树取消和受限日志持久化。
- [ ] 实现 WS 首消息认证、seq 补传、断线状态、日志截断和停止失败恢复。
- [ ] 在已批准的测试仓库执行一次真实 CLI 任务，保留脱敏证据；不把伪 CLI 测试当真实集成成功。
- [ ] 实现记录清理和连接器重启 interrupted 处理；审查后阶段提交。

验收：R07、R08、R09 运行部分及 R10 执行边界。确认进程退出之前不能解除活动锁。

### M5：交付门槛

拟建：`tests/e2e/recovery.spec.ts`、`tests/e2e/accessibility.spec.ts`、`docs/validation/mvp-results.md`、`docs/development.md`；修改根 `README.md`，仅此阶段增加经过验证的安装/启动命令。

- [ ] 执行 R11 性能基准，记录样本数、环境、原始耗时与分位值；未达标分析瓶颈而非修改指标掩盖。
- [ ] 两类用户分别完成预设任务，记录完成率、耗时、误操作和阻断点。
- [ ] 对同视口概念与实现做并列比较，检查主要流程、空/错状态、窄屏和 200% 缩放。
- [ ] 自动无障碍扫描加键盘、焦点、屏幕阅读器人工检查。
- [ ] 检查 XSS、路径边界、认证、导出、进程参数、取消和数据保留；不能仅凭单元测试宣布安全。
- [ ] 在干净 Windows 环境验证安装、首次启动、令牌失效重连、退出和日志位置；整理支持限制。

验收：所有 P0/P1 对应证据可追踪；未通过项明确阻止相应发布声明。

## 3. 验证策略与需求覆盖

测试命令在 M0 实际建立后才执行；计划标准命令为 `npm run test`、`npm run typecheck`、`npm run build`、`npm run test:e2e`，当前仓库不能运行。

| 需求 | 交付阶段 | 关键证据 |
| --- | --- | --- |
| R01 | M1 | 根边界与部分失败夹具 |
| R02 | M1 | 同名、组合搜索和状态恢复 |
| R03 | M1、M2 | 无效元数据仍可阅读；排他创建 |
| R04 | M2 | 并发冲突与失败写入恢复 |
| R05 | M2 | 规则分层、版本和旧响应丢弃 |
| R06 | M3 | 导出清单、越界和变更中止 |
| R07 | M0、M4 | 支持矩阵、目标 Skill 实际加载 |
| R08 | M4 | 伪 CLI 全生命周期 + 真实集成 |
| R09 | M3、M4 | 重建索引保留用户状态、历史清理 |
| R10 | M1–M5 | HTTP/WS 认证、路径、XSS 和参数边界 |
| R11 | M5 | 性能原始结果与人工可用性记录 |

功能任务先写关键失败测试，确认失败原因后实现，再验证成功；纯文案、间距等低风险改动以视觉检查为主，不编写镜像实现的测试。每阶段独立评审、提交，保留可运行版本；本轮只更新文档，不执行这些提交。

## 4. 方案收敛入口

下一步是选择或修改主布局，并确认运行的首版支持范围。之后先细化 M0/M1 的具体工程任务；不要一次性生成未经验证的整套应用或将本路线图标为已执行。
