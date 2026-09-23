# SkillStudio

> 面向本地 `SKILL.md` 的创作与验证工作台：检查 Skill 在指定 Agent 宿主和条件下的表现，并用运行证据支持迭代。

## 产品定位

SkillStudio 服务于 Skill 作者和使用者，帮助他们管理本地 Skill、检查宿主兼容性，并通过受控验证回答：某个 Skill 在特定版本、宿主和环境下是否按预期工作？

SkillStudio 不提供模型或自有 Agent Loop。Agent 宿主仍负责模型、工具和权限执行；SkillStudio 负责 Skill 源文件、兼容诊断、测试案例、验证计划、运行证据和结果比较。产品结论必须附带适用条件和证据，不承诺 Skill 绝对安全、正确或跨宿主表现等价。

目标工作流是：**管理 Skill → 检查兼容性 → 编写验证案例 → 受控运行 → 查看证据与结果 → 修改并重新验证**。Skill 文件保留在用户明确授权的本地目录中。

## 首阶段范围

- 本地 Web 工作台和回环 Connector；只访问用户明确登记的 Skill 根目录。
- Skill 浏览、搜索、详情、创作、编辑、版本指纹和分层诊断。
- 优先打通一个宿主的验证闭环：先基于 Codex 完成预检、隔离运行、事件采集和确定性评价，再扩展 Hermes 并验证跨宿主比较。
- DeepSeek 当前仅规划静态兼容诊断；真实运行须另行验证和规划。
- Skill 文件是内容来源；运行记录、测试案例和用户状态与可重建索引分开管理。

以上是目标范围，不代表功能均已实现。当前状态见下方及 [本地开发说明](docs/development.md)。

## 明确不做

- 公共 Skill 市场、在线发布、评分或支付。
- 云端同步、账号体系、多人协作和组织治理。
- 自有模型供应商管理、Agent Loop、工具注册中心或多 Agent 编排。
- 默认自动改写 Skill；任何修改建议都应先展示差异并由用户确认。
- 未经验证就宣称 Skill 安全、Harness 已加载 Skill，或不同宿主结果可直接等价比较。

## 架构方向

```text
本地 Web 工作台（React + TypeScript）
  ├─ Skill 库与编辑器
  ├─ 兼容诊断与验证计划
  └─ 运行证据、评价与对比
              │ 本机 HTTP / 事件流
本地 Connector（Node.js）
  ├─ 授权目录扫描与受限文件访问
  ├─ Skill 解析、版本指纹与诊断
  ├─ Harness 适配器与运行前检查
  └─ 隔离运行、事件留存与本地状态
              │
用户明确授权的 Skill 目录 / 用户已安装的 Agent 宿主
```

安全边界、领域模型和验证原则见 [多 Harness 产品设计](docs/superpowers/specs/2026-09-05-skillstudio-multi-harness-design.md)。

## 当前开发状态

- **M0：** 本地 Harness 能力诊断、回环 Connector 和共享发现契约。
- **M1：** 已实现 Skill 库与创作基础：目录登记可跨 Connector 重启恢复；默认只读，可单独授予写入权限；支持新建、编辑、显式保存、SHA-256 版本冲突保护，以及 frontmatter/YAML 结构和基础正文诊断。
- **尚未实现：** 测试案例、Harness 运行、运行证据采集、评价和结果对比；当前静态诊断不是完整的 Harness 兼容认证。

移除目录只取消目录登记，不会删除磁盘文件。配对与启动方式见 [开发说明](docs/development.md)。Harness 能力证据见 [ADR 0001：M0 Harness 能力基线](docs/decisions/0001-harness-capability-baseline.md)。
