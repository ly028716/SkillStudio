# ADR 0001：M0 Harness 能力基线

- 状态：已接受
- 日期：2026-09-13
- 范围：M0 本地只读诊断

## 决策

M0 以可复现的本地发现证据描述 Harness 能力，不启动 Harness、不执行任务、不验证认证状态，也不读取或写入用户 Skill 文件。页面和 API 必须把“已发现”“版本已证实”“执行受阻”“待验证”与“M0 不支持”分开表达；静态源码证据不能被表述为可执行能力。

- **Codex**：`codex --version` 的结果是已验证的命令和版本证据。它支持安装与版本事实；不支持登录、模型访问、Skill 加载或任务执行已经验证的结论。
- **Hermes**：提供的源码检出已由项目元数据证实为 `0.21.0`。执行仍处于受阻边界，直到 Python 3.11–3.13 运行时和认证分别完成验证；本次只观察到 `py` 启动器注册，未启动解释器、Hermes 或认证流程。
- **DeepSeek**：提供的源码检出已由根 `package.json` 证实为 `0.1.3-alpha.1`。M0 中执行事实必须是 **`unsupported`**；该检出仅支持静态兼容性诊断，不能降级表述为“可运行但尚未测试”。

## 观测基线

观测时间：2026-09-13T21:06:06+08:00。操作系统报告为 `Microsoft Windows [Version 10.0.26200.9445]`；注册表产品名报告为 `Windows 10 Pro`、版本 `25H2`、内部版本 `26200`。本记录保留命令和结果，不包含用户主目录路径或环境变量。

| 命令 | 结果 | 支持的事实 |
| --- | --- | --- |
| `codex --version` | `codex-cli 0.154.0-alpha.6.2` | Codex 命令和检测到的版本有直接命令证据。 |
| `Get-Command hermes -ErrorAction SilentlyContinue` | 无输出 | 当前 PowerShell 会话未解析到 `hermes` 命令。 |
| `Get-Command hermes-agent -ErrorAction SilentlyContinue` | 无输出 | 当前 PowerShell 会话未解析到 `hermes-agent` 命令。 |
| `Get-Command py -ErrorAction SilentlyContinue` | `py.exe`，类型为 `Application`，版本 `3.12.9150.1013` | Python 启动器已注册；这不是解释器可用性、依赖安装或认证的验证。 |
| `Get-Content D:\IDEWorkplaces\GitHub\hermes-agent\pyproject.toml -TotalCount 20` | `[project]` 中的 `name = "hermes-agent"`、`version = "0.21.0"` 与 `requires-python = ">=3.11,<3.14"` | 提供的 Hermes 源码检出及其版本和 Python 声明有静态证据。 |
| `Get-Content D:\IDEWorkplaces\GitHub\deepseek-harness\package.json -TotalCount 20` | `name = "@deepseek-ai/dsh-root"`、`version = "0.1.3-alpha.1"`，并声明 Node `^22.19.0 || >=24.0.0` | 提供的 DeepSeek 源码检出及其根包版本有静态证据。 |

这些探针均为非变更性读取。它们没有运行 `py --version`、Hermes、DeepSeek 或 Codex 任务，没有查询认证，也没有扫描 Skill 目录。因此，任何执行、认证或运行时 Skill 发现状态都不能从本表推导出来。

## `HarnessReport` 语义

发现结果使用共享的 `HarnessReport` 契约（schema 版本 `2026-09-10`）：

| 字段 | 语义 |
| --- | --- |
| `kind`、`displayName` | 稳定的 Harness 标识与显示名。 |
| `executablePath` | 本地发现到的可执行文件路径；未发现或仅有源码证据时为 `null`。路径不是执行成功的证据。 |
| `detectedVersion` | 从命令输出规范化得到或从源码元数据读取到的版本；无法证明时为 `null`。 |
| `facts` | 由 `installation`、`version`、`execution` 和 `skillDiscovery` 组成的独立能力事实，不能以一个状态代替全部能力。 |
| `facts[].status` | `ready`、`blocked`、`not_installed`、`unknown` 或 `unsupported`。`unsupported` 表示 M0 明确不提供该能力，`unknown` 表示尚无足够证据，两者不可互换。 |
| `facts[].evidence` 与 `checkedAt` | 原始或归纳的发现依据及其检查时间，供 UI 展开显示和后续复核。 |

对于本决定，Codex 的 `installation` 和 `version` 可由命令证据支持，而 `execution` 与 `skillDiscovery` 必须保持 `unknown`。Hermes 的源码和版本可被报告，但在 Python 运行时不可用时，`execution` 是 `blocked`；即使以后发现合格 Python，未执行启动器和未验证认证也只能使其成为 `unknown`，绝不能成为 `ready`。DeepSeek 的 `execution` 一律为 `unsupported`，其源码证据只用于静态诊断。

## 后果

M0 的状态页只显示 Connector 返回的证据，不提供伪造的运行操作。后续要把任一执行事实标记为 `ready`，必须单独记录实际启动、认证、受控工作目录和 Skill 发现验证；这项 ADR 不能作为该授权或成功证据。
