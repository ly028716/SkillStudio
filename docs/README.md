# SkillStudio 设计与规划

更新日期：2026-09-23。产品方向：**本地 Skill 验证工作台**。本页区分当前产品方向、目标设计和历史资料；目标设计不是已交付功能。

SkillStudio 面向 Skill 作者和使用者，帮助他们维护本地 Skill、检查指定 Agent 宿主的兼容性，并通过测试案例、受控运行和证据比较判断 Skill 是否按预期工作。宿主继续负责模型、工具和权限执行；SkillStudio 不承诺 Skill 绝对安全或跨宿主表现等价。

## 阅读顺序

1. [多 Harness 产品设计](superpowers/specs/2026-09-05-skillstudio-multi-harness-design.md)：产品定位、系统边界、目标流程、领域模型和验证原则。实施顺序调整为先完成 Codex 单宿主闭环，再扩展 Hermes；DeepSeek 暂为静态兼容诊断。具体能力仍须以实际验证为准。
2. [项目现状与关键决策](analysis.md)：基于早期仓库状态形成的需求分析和风险记录；其中实现状态只反映记录当时的快照。
3. [原产品需求](superpowers/specs/2026-09-05-skillstudio-product.md)：单宿主阶段的详细文件与运行规则；与当前定位冲突时，以本页及多 Harness 产品设计为准。
4. [原 UI 与交互设计](superpowers/specs/2026-09-05-skillstudio-ui.md)：旧定位下的概念设计，不能视为当前 UI 规格或已实现界面。
5. [原实施路线图](superpowers/plans/2026-09-05-skillstudio-roadmap.md)：历史计划，保留为安全和工作量参考；不代表当前实施计划。

旧视觉概念使用此前的单宿主定位生成，不是本地验证工作台的新视觉目标或应用截图。 [生成提示词](design/prompts.md) 保留原设计输入。

当前实现进度、启动方式和本地安全边界见 [开发说明](development.md)。开发状态以仓库代码和开发说明为准；本页与产品设计文档描述的是产品方向和规划。
