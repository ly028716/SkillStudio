# 本地开发说明

SkillStudio 的产品目标是本地 Skill 验证工作台：管理和诊断 Skill，再通过受控运行与可追溯证据验证其在指定宿主中的表现。实施顺序是先完成 Codex 单宿主闭环，再根据认证结果扩展 Hermes；DeepSeek 暂定为静态兼容诊断。该顺序描述目标，不表示宿主运行已经实现或通过认证。

当前包含 M0 Harness 能力诊断和 M1 Skill 库及创作基础。支持登记多个本地目录、扫描/搜索/查看 `SKILL.md`，并新建、编辑和显式保存 Skill；目录登记状态在 Connector 重启后恢复，扫描索引会从磁盘重建。根目录默认只读，登记时可以单独授予写权限。保存使用 SHA-256 基准版本检测外部修改，冲突会保留草稿；基础诊断覆盖 YAML/frontmatter 结构与空正文提示，不代表 Harness 兼容认证。测试案例、Harness 真实运行、运行证据、评价和结果对比尚未实现。

## 前置条件

在仓库根目录使用 Node.js 25 和 npm。当前基线在 Node.js `v25.2.1`、npm `11.6.2` 的 Windows 环境中记录；Harness 的安装、登录或源代码检出不是运行本仓库测试、类型检查和构建的前置条件。

## 安装与验证

在仓库根目录按需执行以下命令：

```bash
npm install
npm run test
npm run typecheck
npm run build
```

`npm run test` 不依赖本机已安装的 Harness；它使用受控测试替身和夹具验证发现与状态契约。`npm run build` 会先运行类型检查，然后构建各工作区。

当前 authoring 专项测试 23/23 通过，完整测试集 47/47 通过，类型检查、生产构建和生产依赖审计通过。修复了 3 项旧 Harness/Web 测试：按 Headers API 验证请求头、恢复能力标题 helper 导出，并更新首页配对流程断言。当前环境无法通过内置浏览器连接本机开发服务器，因此编辑器键盘与视觉交互仍需本机人工验收。

## 启动本地界面

在两个终端中、均从仓库根目录运行：

```bash
npm run dev:connector
```

```bash
npm run dev:web
```

Connector 默认只监听 `http://127.0.0.1:4317`。启动后，Connector 终端会输出一个 30 分钟有效、仅可使用一次的浏览器配对码。打开 Web 页面并输入配对码；会话凭据由 `HttpOnly; SameSite=Strict` Cookie 保存，关闭标签页后需要重新配对。

Web 页面通过本地 Connector 添加目录。支持多个根目录；重复或彼此嵌套的根会被拒绝。根目录默认只读；若在添加时明确勾选写入许可，编辑器才能在该根内创建和保存 `SKILL.md`。扫描只查找名为 `SKILL.md` 的文件，跳过符号链接以及 `.git`、`node_modules` 等目录。不可读项目会以部分扫描结果呈现；`SKILL.md` 单文件上限为 1 MiB，目录深度上限为 32，Skill 数量上限为 10,000。创建只接受新目录，不覆盖同名目录；保存使用 `baseVersion` 防止静默覆盖外部修改。

根目录登记和写入授权存放在 `%LOCALAPPDATA%\SkillStudio\state.json`；可设置 `SKILLSTUDIO_DATA_DIR` 将 Connector 状态目录改到其他位置。重启 Connector 后重新扫描登记根目录。损坏或未知版本的状态不会自动清空或覆盖。移除根目录会取消登记并清除派生索引，不会删除磁盘文件。若 Connector 未运行，页面会显示本地连接错误。

## 当前安全边界

- Connector 仅绑定回环地址 `127.0.0.1`，不提供远程监听。
- 浏览器 API 请求要求本机 Host、受信任的本地开发/预览 Origin 和一次性配对建立的 HttpOnly 会话 Cookie。
- 只扫描用户明确添加的目录；根目录重叠会拒绝，扫描期间不跟随符号链接。
- Connector 只在用户单独授权写入的已登记根内创建/保存 `SKILL.md`；不删除用户文件，也不写入 Harness 配置。
- SHA-256 `baseVersion` 在保存前和替换前检测已发生的外部修改；同一 Connector 进程内的保存请求串行化。它不是跨进程文件锁：其他编辑器或另一个进程若恰在最后一次校验与替换之间写入，仍存在极窄竞态。目录符号链接/路径替换会被拒绝，但路径式文件系统操作无法对抗拥有同等本机权限的恶意进程持续并发篡改目录；该工作台不把本机同用户进程视为隔离的安全边界。
- M0 发现不能证明 Harness 已登录、可访问模型、已加载 Skill 或已经执行任务。
- Hermes 的源码版本证据不代表可执行：Python 3.11–3.13 运行时和认证必须分别验证。
- DeepSeek 在 M0 仅支持静态兼容性诊断，其执行状态是 `unsupported`。

能力状态和原始证据的含义见 [ADR 0001：M0 Harness 能力基线](decisions/0001-harness-capability-baseline.md)。

M1 尚未提供完整 Markdown/YAML 诊断、标签筛选或任何 Harness 运行能力。
