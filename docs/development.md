# M0 开发说明

M0 是 Harness 能力的本地只读诊断基线。它显示 Connector 返回的安装、版本、执行和 Skill 发现事实；它不启动任何 Harness，不验证认证，也不访问用户 Skill 文件。

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

## 启动本地界面

在两个终端中、均从仓库根目录运行：

```bash
npm run dev:connector
```

```bash
npm run dev:web
```

Connector 默认只监听 `http://127.0.0.1:4317`。Web 页面从本地 Connector 读取 `/api/harnesses`；如果 Connector 未运行，页面会显示“无法连接本地连接器”，而不会显示虚构的 Harness 结果。

## M0 安全边界

- Connector 仅绑定回环地址 `127.0.0.1`，不提供远程监听。
- M0 不读取、扫描、创建、修改或删除任何用户 Skill 文件，也不写入 Harness 配置。
- M0 发现不能证明 Harness 已登录、可访问模型、已加载 Skill 或已经执行任务。
- Hermes 的源码版本证据不代表可执行：Python 3.11–3.13 运行时和认证必须分别验证。
- DeepSeek 在 M0 仅支持静态兼容性诊断，其执行状态是 `unsupported`。

能力状态和原始证据的含义见 [ADR 0001：M0 Harness 能力基线](decisions/0001-harness-capability-baseline.md)。
