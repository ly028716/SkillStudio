# Skill 创作基础实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans` 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 在现有只读 Skill 库上实现可恢复的本地 Skill 创建、编辑、保存、版本指纹和基础诊断，为后续 Codex 验证闭环提供可信的 Skill 来源。

**架构：** 保持本地 Connector 作为文件访问边界；纯 Skill 解析与诊断逻辑放在独立包；Connector 对授权目录执行受限读写，并通过 `baseVersion` 防止覆盖外部修改。Web 端先浏览，再进入单 Skill 编辑工作台；本计划不启动 Agent Harness。

**技术栈：** 现有 npm workspaces、TypeScript、Node.js、React；测试沿用 `tsx --test tests/*.test.ts`。新增依赖只有在确认 Node 25 兼容和锁文件变更后才纳入。

---

## 范围与前置条件

- 已有能力：M0 Harness 能力诊断；M1 目录登记、受限扫描、Skill 搜索与只读详情。
- 本计划完成后：根目录注册可恢复；用户可新建和编辑 Skill；保存具备版本冲突保护；基础格式诊断可定位问题。
- 本计划不包含：测试案例、Harness 执行、日志流、评价比较、导出、Hermes 适配器或 DeepSeek 真实运行。
- 隔离工作区基线：`npm run typecheck` 通过；`npm run test` 有 3 项旧 Harness 页面/API 断言失败（24 项中 21 项通过）。实施中重新核对后，确认两项测试断言已落后于共享 Headers 与配对首页设计，另一项暴露 `reportHeadline` 导出回归；均在任务 7 中修复。
- 来源文件仍是磁盘上的 `SKILL.md`；不能把列表索引当成内容真源。
- 创建、编辑和保存的前置授权独立于目录读取授权；只读目录不能出现可提交写操作。
- 不跟随符号链接；路径必须在登记根目录内。保存失败、冲突或连接中断时不得丢弃用户草稿。

## 文件清单与职责

- 修改 `packages/contracts/src/index.ts`：补充 Skill 创建、保存、版本与诊断所需 DTO。
- 创建 `packages/skill-core/package.json`、`packages/skill-core/tsconfig.json`、`packages/skill-core/src/index.ts`、`packages/skill-core/src/frontmatter.ts`、`packages/skill-core/src/diagnostics.ts`：提供纯函数解析和分层诊断，不访问磁盘或 Harness。
- 创建 `apps/connector/src/state/local-state.ts`：在 `%LOCALAPPDATA%\SkillStudio` 保存根目录注册信息和独立写入授权并处理 schema 版本迁移；允许测试通过显式数据目录隔离状态；派生的 Skill 扫描索引仍可重建。
- 创建 `apps/connector/src/files/safe-write.ts`：集中实现登记根内路径校验、版本比较、临时文件写入、替换和写后读取校验。
- 修改 `apps/connector/src/skills/repository.ts`、`apps/connector/package.json`：提供创建、保存、重新扫描和读取最新版本操作，并接入纯 Skill 核心包。
- 修改 `apps/connector/src/http/server.ts`：增加创建与内容保存端点，并映射错误码和冲突响应。
- 修改 `apps/web/src/api/client.ts`：增加上述 API 的类型化客户端调用。
- 创建 `apps/web/src/features/editor/SkillEditor.tsx` 与 `apps/web/src/features/editor/editor-state.ts`：编辑文本、显示保存状态和诊断；可测试的草稿状态转换放入纯函数模块；不引入自动保存或隐式运行。
- 修改 `apps/web/src/features/library/LibraryPage.tsx`、`apps/web/src/App.tsx`、`apps/web/src/styles.css`：从库进入编辑器，加入新建入口、草稿离开保护和诊断呈现。
- 创建 `tests/tsconfig.json`、`tests/contracts-authoring.typecheck.ts`、`tests/skill-core.test.ts`、`tests/skill-state.test.ts`、`tests/skill-write.test.ts`、`tests/skill-authoring-api.test.ts`、`tests/web-skill-authoring.test.ts`：分别覆盖契约类型、纯逻辑、持久化、安全写入、HTTP 契约和编辑状态转换。浏览器页面布局与键盘交互通过人工验收，不在本阶段引入新的 UI 测试框架。
- 修改 `README.md`、`docs/development.md`：只在实现验收通过后更新“当前开发状态”；本计划撰写阶段不提前宣称功能完成。

## 实施任务

### 任务 1：冻结作者功能的领域契约

**文件：** 修改 `packages/contracts/src/index.ts`；创建 `tests/tsconfig.json`、`tests/contracts-authoring.typecheck.ts`。

- [x] **步骤 1：先写契约失败用例**

  编写 `satisfies` 类型样例，覆盖创建请求、保存请求、分层诊断和带当前版本摘要的冲突错误。

- [x] **步骤 2：运行契约用例确认失败**

  运行：`npx tsc --noEmit -p tests/tsconfig.json`

  结果：因 `CreateSkillRequest`、`SaveSkillRequest`、`SkillDiagnostic` 未导出且错误码不含 `CONFLICT` 而失败。

- [x] **步骤 3：补充最小 DTO**

  添加 `CreateSkillRequest`、`SaveSkillRequest`、`SkillDiagnostic` 和必要的错误类型；保存成功响应必须包含新 `contentVersion`，不新增没有消费者的通用版本系统。

- [x] **步骤 4：运行契约用例确认通过**

  运行：`npx tsc --noEmit -p tests/tsconfig.json` 和 `npx tsx --test tests/contracts.test.ts`

  预期：契约用例通过，旧 DTO 和 schema 版本检查同步更新。

### 任务 2：实现 Skill frontmatter 解析与基础诊断

**文件：** 创建 `packages/skill-core/*` 和 `tests/skill-core.test.ts`；若新增 YAML 解析依赖，修改根 `package.json` 与锁文件。

- [x] **步骤 1：先写解析和诊断测试**

  覆盖有效 `name`/`description`、缺少 frontmatter、YAML 语法错误、重复键、非字符串字段、未知字段保留、CRLF 输入、空正文和大输入拒绝。诊断把文档结构错误与写作建议分层。

- [x] **步骤 2：运行测试确认失败**

  运行：`npx tsx --test tests/skill-core.test.ts`

  预期：因解析与诊断导出尚不存在而失败。

  结果：新测试因 `packages/skill-core/src/index.js` 不存在而失败，确认了预期红灯。

- [x] **步骤 3：实现纯函数 API**

  提供 `parseSkillDocument(content)` 与 `diagnoseSkillDocument(content)`。解析不得改写原始文本；如果选用 YAML 解析依赖，先核对 Node 25 兼容、锁文件和安全维护状态，再添加最小依赖。

  结果：新增 `@skillstudio/skill-core` 与锁定的 `yaml@2.9.0`；官方包元数据显示 Node `>=14.6`，兼容 Node 25。限制文档为 1 MB，限制 YAML 别名展开，保留未知字段与正文原文。

- [x] **步骤 4：运行纯逻辑测试**

  运行：`npx tsx --test tests/skill-core.test.ts`

  预期：所有输入分类和诊断层级符合断言；未知 frontmatter 字段仍可读取。

  结果：`npx tsx --test tests/skill-core.test.ts` 4/4 通过，`npx tsc --noEmit -p tests/tsconfig.json` 与 `npm run typecheck` 通过。

### 任务 3：保存可迁移的 Connector 根目录状态

**文件：** 创建 `apps/connector/src/state/local-state.ts`；修改 `apps/connector/src/index.ts`、`apps/connector/src/skills/repository.ts`；创建 `tests/skill-state.test.ts`。

- [x] **步骤 1：先写状态恢复测试**

  覆盖首次启动、根目录新增/移除、Connector 重启恢复、无效 JSON、未知 schema 版本和原子状态文件替换失败。状态文件不得包含 Skill 正文或配对秘密。

- [x] **步骤 2：运行测试确认失败**

  运行：`npx tsx --test tests/skill-state.test.ts`

  预期：因状态存储模块尚不存在而失败。

  结果：新测试因 `apps/connector/src/state/local-state.js` 不存在而失败，确认了预期红灯。

- [x] **步骤 3：实现最小本地状态仓库**

  将规范化根路径、显示名和状态 schema 版本写入 `%LOCALAPPDATA%\SkillStudio` 下的专用本地状态文件；允许 `SKILLSTUDIO_DATA_DIR` 覆盖以隔离测试状态。扫描得到的 Skill 列表重启后重建，不把缓存误当来源。损坏状态须给出可恢复错误，不自动清空或覆盖。

  结果：状态文件只保存根 ID、显示名、规范化路径和独立的 `writeEnabled` 授权；Connector 启动后重扫可用目录。`SKILLSTUDIO_DATA_DIR` 以及显式测试目录均受支持。旧状态记录没有该字段时按只读恢复。

- [x] **步骤 4：运行状态测试确认通过**

  运行：`npx tsx --test tests/skill-state.test.ts`

  预期：重启后恢复登记目录；损坏或未知版本不会静默覆盖原状态。

  结果：`npx tsx --test tests/skill-state.test.ts` 5/5 通过，`npm run typecheck` 通过。

### 任务 4：实现路径约束、冲突检查与安全保存

**文件：** 创建 `apps/connector/src/files/safe-write.ts`；修改 `apps/connector/src/skills/repository.ts`；创建 `tests/skill-write.test.ts`。

- [x] **步骤 1：先写文件边界测试**

  覆盖只读根拒写、根外路径拒绝、符号链接拒绝、创建同名目录不覆盖、过大内容拒绝、`baseVersion` 不匹配返回冲突、写入中断保留原文件、成功保存后哈希更新。

- [x] **步骤 2：运行测试确认失败**

  运行：`npx tsx --test tests/skill-write.test.ts`

  预期：因安全写入函数尚不存在而失败。

  结果：新测试因 `apps/connector/src/files/safe-write.js` 不存在而失败，确认了预期红灯。

- [x] **步骤 3：实现安全写入边界**

  每次写入前重新解析根和目标路径、检查授权与 `baseVersion`；在同目录临时文件写入并验证后替换，替换后重新读取并计算版本。冲突时不写文件；创建使用排他操作；不经 shell 拼接路径。

  结果：写权限默认关闭、拒绝符号链接与根外路径、创建目录排他、保存使用同目录临时文件和版本二次检查；写入内容限制为 1 MB。

- [x] **步骤 4：运行文件安全测试确认通过**

  运行：`npx tsx --test tests/skill-write.test.ts`

  预期：越界、链接、冲突、超限和失败注入均保留源文件；成功路径返回磁盘实际版本。

  结果：`npx tsx --test tests/skill-write.test.ts` 7/7 通过，包含并发保存冲突与目录替换为 junction 的回归检查。

### 任务 5：增加 Connector 创建与保存 API

**文件：** 修改 `apps/connector/src/http/server.ts`、`apps/connector/src/skills/repository.ts`、`packages/contracts/src/index.ts`；创建 `tests/skill-authoring-api.test.ts`。

- [x] **步骤 1：先写 HTTP 行为测试**

  覆盖有效创建/保存、缺字段、只读根、未登记根、版本冲突、非法 ID、未配对会话，以及失败响应不泄露绝对路径或堆栈。

- [x] **步骤 2：运行测试确认失败**

  运行：`npx tsx --test tests/skill-authoring-api.test.ts`

  预期：新增路由返回未找到或对应失败状态。

  结果：新增用例首先命中缺失写权限字段与新路由的预期失败，确认了行为覆盖。

- [x] **步骤 3：实现最少端点**

  新增 `POST /api/skills` 创建最小模板和 `PUT /api/skills/:id/content` 保存正文；两者均要求现有会话认证，创建/保存不隐式扫描未登记目录。冲突用 HTTP 409 和当前版本摘要表达。

  结果：根目录登记可显式单独授予写入；创建和保存端点受配对会话保护，错误体不返回磁盘路径或堆栈。保存 API 允许合法 Skill 正文大小并对总请求体限流。

- [x] **步骤 4：运行 API 测试确认通过**

  运行：`npx tsx --test tests/skill-authoring-api.test.ts`

  预期：成功和拒绝场景均匹配状态码及结构化错误；旧只读 API 行为不变。

  结果：`npx tsx --test tests/skill-authoring-api.test.ts` 3/3 通过，包括未配对、只读、未登记根、非法 ID、大正文保存和版本冲突。

### 任务 6：实现 Web 编辑、诊断和冲突恢复

**文件：** 创建 `apps/web/src/features/editor/SkillEditor.tsx`、`apps/web/src/features/editor/editor-state.ts`、`tests/web-skill-authoring.test.ts`；修改 `apps/web/src/api/client.ts`、`apps/web/src/features/library/LibraryPage.tsx`、`apps/web/src/App.tsx`、`apps/web/src/styles.css`。

- [x] **步骤 1：先写用户流程测试**

  覆盖编辑状态 reducer 的初始、编辑、保存成功、保存失败、版本冲突、放弃草稿和重新载入转换；API 调用测试覆盖保存携带 `baseVersion`。页面焦点、键盘操作和错误提示由浏览器人工验收覆盖。

- [x] **步骤 2：运行交互测试确认失败**

  运行：`npx tsx --test tests/web-skill-authoring.test.ts`

  预期：因编辑流程不存在而失败；不得添加真实 Harness 执行按钮。

  结果：测试因 `editor-state.js` 不存在而失败，确认了预期红灯。

- [x] **步骤 3：实现明确状态的编辑界面**

  编辑器只提供显式保存，不自动保存；显示已保存版本和草稿诊断。冲突时保留草稿并提示重新载入或复制，不能提供未经设计的强制覆盖。新建预览目标目录后才提交创建请求。

  结果：编辑器支持显式保存、草稿诊断、版本冲突复制/重载、离开保护和 Ctrl/Cmd+S；根目录写权限未开启时不提供创建入口。

- [x] **步骤 4：运行交互测试确认通过**

  运行：`npx tsx --test tests/web-skill-authoring.test.ts`

  预期：创建、编辑、保存、错误、冲突和离开保护流程通过；只读状态不暴露写操作。

  结果：`npx tsx --test tests/web-skill-authoring.test.ts` 3/3 通过，`npm run build` 通过。浏览器人工交互验收因 Browser 环境无法连接本机监听页面未能完成，未尝试绕过。

### 任务 7：端到端核对、文档更新与阶段交付

**文件：** 修改 `README.md`、`docs/development.md`；涉及安全边界时同步修改 ADR；不更新旧历史路线图的完成状态。

- [x] **步骤 1：执行完整测试与静态检查**

  运行：`npm run test`、`npm run typecheck`、`npm run build`、`git diff --check`。

  预期：每条命令退出码为 0；若失败，先定位并修复，不在文档写成功结论。

  结果：`npm run typecheck`、`npm run build` 和 `git diff --check` 通过。`npm run test` 为 47/47；新增功能专项测试 23/23 通过（回归检查覆盖并发写入、目录路径替换及保存期间的继续编辑）。修复旧 Web/Harness 测试断言并恢复状态标题 helper 导出。生产依赖审计 0 漏洞；默认镜像不支持 audit 接口，改用官方 Registry 后通过。

- [x] **步骤 2：人工核对真实磁盘行为**

  在临时测试根中创建、编辑和保存一个 Skill；确认磁盘正文、行尾和哈希；制造外部修改后确认冲突；重启 Connector 确认根目录恢复；确认未授权目录未改变。

  结果：HTTP/写入/状态集成测试在临时目录实际创建、保存和重载文件，核对正文与 SHA-256，并验证冲突、只读拒绝与 Connector 状态重建。手动浏览器交互检查受本机页面连接限制未完成，需在隔离 worktree 启动后本机人工验收。

- [x] **步骤 3：仅更新已验证的进度描述**

  README 和开发说明列出实际可用的创建、编辑、保存和诊断能力，并明确尚未实现测试案例、Harness 运行和结果对比。

  结果：README 与开发说明按当前测试确认的能力更新；明确列出未实现的运行验证闭环及已知基线失败。

- [x] **步骤 4：提交独立阶段变更**

  仅暂存本计划所列实现、测试和文档文件；提交信息说明 Skill 创建、保存与诊断基础，不包含无关工作区内容。

## 规格覆盖自检

- 本计划实现 Skill 来源管理、编辑、版本指纹和基础静态诊断；安全写入与冲突恢复有单独任务。
- 本计划不覆盖 Harness 执行、测试案例、事件、评价或比较；这些是后续独立计划，不会被标记为已交付。
- Codex 单宿主验证计划应在作者基础验收后单独细化；Hermes 对比计划应以 Codex 运行证据和 adapter contract 稳定为前置条件。
