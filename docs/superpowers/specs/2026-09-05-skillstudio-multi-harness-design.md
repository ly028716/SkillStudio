# SkillStudio 多 Harness 产品设计

原始设计日期：2026-09-05。产品方向于 2026-09-23 确认采用“本地 Skill 验证工作台”。本文件描述目标设计，详细规格仍需复核；其中能力范围均为规划，不能作为已实现或已认证的依据。

## 1. 产品定义

SkillStudio 是连接不同 Agent Harness 的 Skill 创作与验证工作台。它管理 Skill 源文件、兼容诊断、测试案例、验证计划、运行证据和结果对比；Agent Harness 继续管理模型、工具、权限执行和 Agent Loop。

产品承诺是“帮助用户证明一份 Skill 在特定宿主和条件下表现如何”，而不是“保证 Skill 安全、正确或跨宿主等价”。

目标能力按阶段交付：

- 第一阶段以 Codex CLI 打通兼容诊断、预检、受控运行、事件采集和结果评价。
- Codex 闭环通过验收后，再扩展 Hermes Agent 运行与跨宿主结果比较。
- DeepSeek Harness 暂做静态兼容诊断和能力模型；真实运行另行评估。
- Windows 11 本地 Web 工作台；其他平台需单独认证。

宿主支持以版本化探针和真实运行证据为准。发现命令、安装版本或静态源码均不能单独证明宿主已登录、加载指定 Skill 或可成功执行。

首版不实现模型供应商管理、自有 Agent Loop、工具注册中心、长期记忆、多 Agent 编排、定时任务、远程运行、自动安装 Harness、自动修改 Skill、公共市场或多人协作。

## 2. 用户与核心结果

Skill 作者需要回答三个问题：内容是否合法、目标宿主能否加载、修改是否改善了实际表现。

Skill 使用者需要回答三个问题：Skill 来自哪里、在当前宿主是否可用、运行结果与其他宿主有何差异。

平台维护者需要回答三个问题：适配器支持哪些能力、一次结论由哪些证据得出、宿主升级是否造成兼容回归。

核心成功任务：

1. 作者在本地目录创建或打开 Skill，修复结构和宿主兼容问题。
2. 作者创建一个包含输入、预期和禁止行为的测试案例。
3. 作者先在 Codex 中运行选定的 Skill 版本和测试案例；后续阶段再将相同验证扩展到 Hermes。
4. 系统保留原始事件并生成有证据支撑的结果；双宿主比较只在两边都具备可比执行时开放。
5. 作者基于差异形成修改草稿，审核后另存为新版本，再运行相同案例。

## 3. 方案边界

### 3.1 SkillStudio 拥有的职责

- Skill 包的扫描、读取、编辑、版本指纹、静态诊断和导出。
- Harness 的发现、版本探测、能力协商和兼容诊断。
- 测试案例、验证计划、串行调度、幂等启动、取消和状态恢复。
- 原始事件留存、规范化、确定性评价、人工评价和差异展示。
- 建议修改的差异预览、人工确认和文件冲突保护。

### 3.2 Harness 拥有的职责

- 模型认证、选择和调用。
- 系统提示、工具注册和 Agent Loop。
- 实际文件、网络、终端和其他工具的权限执行。
- 宿主自己的会话格式、上下文压缩、重试和内部遥测。

SkillStudio 不假设不同 Harness 的同名权限、事件或成功状态含义一致。适配器必须映射能力和证据，无法映射时返回 unknown，而不是猜测。

## 4. 信息架构

一级导航包含四个区域：

| 区域 | 用户任务 | 主要对象 |
| --- | --- | --- |
| Skill 库 | 发现、阅读、编辑和查看版本 | Skill、SkillRevision、Diagnostic |
| 验证中心 | 管理案例、创建验证计划、比较结果 | TestCase、ValidationPlan、Evaluation、Comparison |
| 运行记录 | 查看单次执行、事件、日志和失败恢复 | Execution、NormalizedEvent |
| Harness | 连接宿主、查看版本、能力和发现路径 | HarnessInstallation、HarnessProfile、CapabilityReport |

用户选择 Skill 后进入“Skill 工作台”，它是主工作面而不是独立仪表盘：

- 概览：说明、来源、当前版本和最近验证结论。
- 编辑：SKILL.md 与包内受支持文件、草稿诊断和冲突恢复。
- 兼容性：按 Harness 展示格式、发现、依赖、平台和运行准备状态。
- 测试案例：与该 Skill 关联的案例及最近结果。
- 版本：内容指纹、时间、来源和验证覆盖，不在 MVP 中伪造 Git 历史。

## 5. 核心交互

### 5.1 创建与静态诊断

用户选择目标目录和基础模板后创建 Skill。编辑器同时显示四层诊断：通用格式、开放 Skill 约定、Harness 专属兼容、运行前能力。前两层基于内容；Harness 层必须标注规则版本和来源；运行前能力只对已探测安装有效。

“格式通过”“Harness 可加载”“准备运行”和“验证通过”是四种独立状态。任何绿色状态均不得暗示内容安全。

### 5.2 创建测试案例

TestCase 包含：名称、任务输入、工作目录策略、夹具引用、预期行为、禁止行为、超时、确定性断言和人工检查项。

首版断言类型限制为：进程终态、最终文本包含/不包含、正则匹配、要求文件存在/未变化、JSON Schema 结果、最大耗时。文件断言只允许测试夹具目录，不能用真实重要目录。

测试案例默认不含模型密钥和真实客户数据。导出前扫描绝对用户路径、常见凭据模式和大文件，并要求用户复核警告。

### 5.3 建立验证计划

用户选定精确 SkillRevision、一个或多个 TestCase，以及 Codex、Hermes 中至少一个 HarnessProfile。系统生成预检矩阵：

| 维度 | 结果 |
| --- | --- |
| 安装与版本 | ready / blocked / unknown |
| Skill 发现 | 精确加载路径、优先级和同名冲突 |
| 内容兼容 | error / warning / pass |
| 工具与环境 | available / missing / unknown |
| 权限 | 请求能力、用户授权和宿主实际策略 |
| 工作目录 | 测试副本路径、Git 状态和写入隔离 |

blocked 阻止对应执行；unknown 需要用户明确接受后才能继续，且结果保留该不确定性。一个宿主被阻止不影响查看另一个宿主的就绪状态。

### 5.4 执行与采集

同一验证计划的宿主默认串行运行，顺序固定并显示。每个 Execution 使用独立测试工作副本，记录 Skill 内容指纹、案例版本、Harness 类型与版本、适配器版本、工作目录指纹、权限摘要、开始时间和随机性参数是否可知。

适配器以 argv 数组和 stdin 启动宿主，不拼接 shell 命令。原始 stdout、stderr 和宿主事件按到达顺序保存；规范化事件用于 UI。断线重连按序号补传，不重新启动执行。

取消、超时、连接器崩溃和宿主退出分别保留终态。退出码 0、宿主完成事件和断言结果相互独立；只有三者都有证据时，界面才能显示“执行完成且断言通过”。

### 5.5 评价与对比

Evaluation 分三层：

1. 确定性评价：由断言引擎运行，记录逐条输入、输出和证据。
2. 人工评价：用户按案例检查项选择通过、失败或无法判断，并可写备注。
3. 模型评价：后续可选能力；必须记录评审模型、提示词版本和原始输出，不能覆盖确定性与人工结论。

Comparison 只比较相同 SkillRevision、TestCase 版本和验证配置中的执行。默认维度为完成状态、断言通过率、耗时、工具调用摘要、文件变化和人工结论。Token 与成本仅在两个宿主都提供可信且口径一致的数据时并排；否则分别展示，不计算优胜者。

界面不自动宣布“最佳 Harness”。用户可基于具体测试案例标记偏好，并查看证据。

### 5.6 改进循环

系统根据失败断言、人工备注和宿主差异组织“改进输入”。自动建议只能生成未应用的补丁或修改说明，必须显示来源证据和影响文件。

用户接受修改前查看差异；保存沿用 baseVersion 冲突检测。接受后产生新的 SkillRevision，旧 Execution 仍指向旧版本。系统建议重新运行同一验证计划，不把旧结果继承为新版本结论。

## 6. 领域模型

| 对象 | 关键字段 | 不变量 |
| --- | --- | --- |
| Skill | id、rootId、relativePath、displayName | 身份由规范根和相对路径确定，不由 name 单独确定 |
| SkillRevision | id、skillId、contentHash、manifestHash、createdAt、source | 已运行版本不可原地改变 |
| HarnessInstallation | id、kind、executablePath、detectedVersion、status | 只记录探测结果，不存模型密钥 |
| HarnessProfile | id、installationId、label、configFingerprint、capabilities | 指纹只含可公开配置摘要，不含凭据值 |
| CapabilityReport | profileId、adapterVersion、checkedAt、items | 每项必须有状态、证据和恢复动作 |
| TestCase | id、skillId、version、input、workspacePolicy、assertions | 修改案例产生新版本 |
| ValidationPlan | id、revisionId、testCaseVersions、profileIds、executionOrder | 创建后配置冻结；变更产生新计划 |
| Execution | id、planId、profileId、status、evidenceRefs | 一个幂等键最多创建一次进程 |
| NormalizedEvent | executionId、seq、time、kind、payload、rawRef | seq 单调；rawRef 可追溯原始输入 |
| Evaluation | executionId、type、evaluatorVersion、verdict、evidence | 结论不可脱离证据 |
| Comparison | planId、executionIds、dimensions | 只接受可比执行，不跨版本混算 |

Skill 源文件及包资源是内容来源；测试案例、验证计划、人工评价和运行记录是用户数据；扫描索引和派生摘要可重建。这三类数据分开存储和迁移。

## 7. Harness 适配器契约

统一接口由六组能力组成：

```ts
interface HarnessAdapter {
  readonly kind: 'codex' | 'hermes' | 'deepseek';
  detect(): Promise<HarnessInstallation[]>;
  inspect(profile: HarnessProfile): Promise<CapabilityReport>;
  analyzeSkill(input: SkillPackageSnapshot, profile?: HarnessProfile): Promise<Diagnostic[]>;
  preflight(request: ExecutionRequest): Promise<PreflightResult>;
  execute(request: ExecutionRequest, sink: RawEventSink): Promise<ExecutionHandle>;
  cancel(handle: ExecutionHandle): Promise<CancelResult>;
}
```

适配器不得读写业务数据库；调度器传入不可变快照并持有状态机。适配器输出原始事件，独立 Normalizer 将其转换为公共事件：started、assistant_output、tool_call、tool_result、file_change、approval、warning、completed、failed、cancelled、unknown。

CodexAdapter 首版验证 `$skill`/发现路径、JSONL 事件、工作目录、沙箱、审批和取消。HermesAdapter 验证本地、external_dirs、project skill 优先级、trust 状态、工具集、运行入口和取消。DeepSeekAdapter 首版只实现 detect、inspect 和 analyzeSkill；preflight 返回 unsupported，execute 不注册为可用能力。

所有适配器采用显式版本范围。未知版本可以探测，但真实执行默认 blocked，用户开启实验模式后才能继续；实验结果带醒目标记，不进入基线比较。

## 8. 统一运行状态与事件

Execution 状态：draft → preflighting → ready/blocked → starting → running → evaluating → completed/failed/cancelled/timed_out/interrupted/cancel_failed。

状态转换只由调度器完成。适配器报告事实，不能直接把记录标为成功。连接器重启后，无法证明进程终态的活动执行变为 interrupted；cancel_failed 在确认进程退出前继续占用宿主运行锁。

原始事件追加保存，规范化事件可重建。日志单次上限 10 MiB，超过后继续排空进程管道并记录 truncation；最终状态、退出码和断言结果不依赖日志是否完整。

## 9. 错误处理与恢复

| 错误 | UI 结果 | 恢复动作 |
| --- | --- | --- |
| Harness 未安装 | Harness 卡片显示未连接 | 查看安装说明；外部安装后重新探测 |
| 未认证或配置缺失 | blocked，不索取聊天中的密钥 | 在宿主中配置后重新预检 |
| 同名 Skill 冲突 | 显示所有候选和实际优先级 | 改名、调整宿主目录或选择正确工作目录 |
| 宿主无法证明加载目标版本 | blocked | 查看发现路径；不能用拼接正文伪装原生 Skill |
| 版本在预检后变化 | 启动前中止 | 选择新版本并创建新计划 |
| 单宿主执行失败 | 保留另一执行和失败证据 | 修复配置或单独重跑；对比标为不完整 |
| 日志解析未知事件 | 保存 raw，公共事件标 unknown | 升级适配器后重建规范化事件 |
| 前端断线 | 执行继续，UI 重连补传 | 按 seq 恢复，不产生新进程 |
| 文件修改冲突 | 保留用户草稿 | 查看差异、复制草稿或重新载入 |

## 10. 安全与信任

- 本地连接器只监听 127.0.0.1，HTTP 和 WebSocket 均验证会话、Host 与 Origin。
- Skill 根目录授权、测试工作目录和 Harness 执行权限是三项独立授权。
- 每次验证使用专门测试副本；默认只读，文件写入测试必须显式选择工作区写权限。
- 不提供绕过全部审批与沙箱的 UI。宿主不支持某项限制时显示 unknown 或 blocked。
- Skill 内容属于不可信指令；预览禁止原始 HTML，日志按纯文本显示。
- 测试数据和运行输出可能交给宿主配置的远程模型，运行前显示数据去向；SkillStudio 不宣传离线运行。
- 自动建议没有写入权限；应用补丁必须经过差异确认和版本冲突检查。
- DeepSeek Harness 当前处于快速变化阶段，首版规则带来源版本，不把静态诊断等同于可执行兼容。

## 11. UI 方向

视觉核心是“验证证据”，不是监控仪表盘。桌面端采用稳定三段式工作区：可折叠一级导航、对象列表或案例列表、主内容区。只在结果对比页使用左右并排双栏。

### 11.1 Skill 工作台

顶部显示 Skill 名称、来源路径、内容指纹和保存状态。主导航为概览、编辑、兼容性、测试案例、版本。右上主动作随标签变化：编辑页为保存，测试案例页为新建案例，概览页为创建验证计划。

兼容性页按 Harness 使用行式矩阵，分别显示格式、发现、依赖、权限和运行状态。用户可展开证据和恢复动作；不用单一百分比分数掩盖阻断项。

### 11.2 验证计划

采用四步连续流程：选择版本与案例 → 选择 Harness → 查看预检矩阵 → 确认串行执行。每一步保留摘要，可返回修改；真正启动前只有一个主按钮。

### 11.3 结果对比

页首显示可比性声明和总体状态。中部按维度逐行比较 Codex 与 Hermes，优先展示最终输出、断言、文件变化和人工结论；工具调用与原始日志默认折叠。差异必须能回到对应原始事件。

颜色只表达局部状态，不用品牌色代表不同 Harness 的胜负。通过、失败、未知同时使用文字与图标。窄屏改为宿主切换标签，并保留“查看差异”模式。

旧定位下的三张概念图不能直接作为实现目标。新定位需要在书面规格确认后重新生成三个视觉方向，重点探索 Skill 工作台、验证计划和结果对比中的一个核心屏幕。

## 12. 验证策略

### 12.1 适配器契约测试

每个适配器使用伪 CLI 覆盖版本输出、发现成功与冲突、分块事件、未知事件、非零退出、取消、超时和巨量日志。同一契约套件验证三种适配器的状态和错误语义一致。

### 12.2 真实宿主认证

维护一组最小 Skill 包和测试仓库，分别验证 Codex 与 Hermes：精确 Skill 被加载、引用文件可用、同名优先级正确、中文及空格路径、只读和写入权限、取消进程树、升级后的事件兼容。每个认证结果记录宿主与适配器版本。

### 12.3 评价引擎测试

断言采用固定夹具进行单元测试；文件断言验证路径边界；JSON Schema、正则和超时使用恶意及极端输入。Comparison 必须拒绝不同 SkillRevision、TestCase 版本或不兼容配置的执行。

### 12.4 产品验收

- 作者能在 8 分钟内建立一个案例并完成 Codex/Hermes 双宿主验证。
- 使用者能在 3 分钟内判断指定 Skill 对目标宿主是否 ready、blocked 或 unknown，并找到证据。
- 用户能正确解释“格式通过”和“验证通过”的差别。
- 断线、单宿主失败和文件冲突不会丢失草稿或错误地产生成功结论。
- 键盘、200% 缩放、屏幕阅读器和 WCAG 2.2 AA 目标通过单独检查；截图不作为合规证明。

## 13. 分阶段交付

### 阶段 A：Skill 工作台基础

完成目录、Skill 包、编辑、版本指纹和通用诊断。建立领域契约，但不显示无法运行的假按钮。

### 阶段 B：Harness 能力层

先完成 Codex 探测、兼容诊断、能力矩阵和真实认证夹具；DeepSeek 静态规则独立标注。Hermes 探测与认证在扩展阶段实施。

### 阶段 C：单宿主验证

完成 TestCase、ValidationPlan、隔离测试副本、Codex 串行运行、事件留存和确定性评价。

### 阶段 D：双宿主对比

完成 Hermes 真实运行、统一事件、可比性检查、双栏对比和人工评价。

### 阶段 E：改进循环与质量门槛

完成建议补丁审核、新版本重跑、性能、可访问性、安全和安装验证。DeepSeek 真实运行只有在适配器能力和上游稳定性达到认证门槛后进入独立阶段。

每个阶段必须产生独立可验证的软件；阶段 B 的探测与诊断失败不能被 UI 文案包装为连接成功。

## 14. 决策记录

- 选择独立验证工作台，不实现统一运行网关或自有 Agent Loop。
- 先交付 Codex 真实运行；随后扩展 Hermes 真实运行与可比结果，DeepSeek 暂限静态诊断。
- 运行默认串行，保证本机资源、速率限制和结果解释更稳定。
- 结果以证据和维度呈现，不自动评选最佳 Harness。
- 改进建议只生成待审核差异，不自动修改源文件。
- 新设计取代旧规格中的“首版仅 Codex”“不包含多宿主适配”等冲突内容；旧规格的文件安全、保存冲突、本地认证和日志限制继续有效。
