# SkillStudio 设计与规划

更新日期：2026-09-05。状态：**评审稿，尚未实施**。

已确认：作者与使用者并重；定位为“连接不同 Agent Harness 的 Skill 创作与验证工作台”；采用独立验证工作台方案；首版真实运行 Codex 与 Hermes，DeepSeek Harness 提供兼容诊断和适配器预留。

## 阅读顺序

1. [多 Harness 产品设计](superpowers/specs/2026-09-05-skillstudio-multi-harness-design.md)：已批准的定位、系统边界、用户流程、领域模型、适配器和验证方法。
2. [项目现状与关键决策](analysis.md)：初始证据、缺口、方案取舍和风险。
3. [原产品需求](superpowers/specs/2026-09-05-skillstudio-product.md)：单宿主阶段的详细文件与运行规则；与新设计冲突时以多 Harness 产品设计为准。
4. [原 UI 与交互设计](superpowers/specs/2026-09-05-skillstudio-ui.md)：基础编辑体验和旧定位概念图；需按新设计重新进行视觉探索。
5. [原实施路线图](superpowers/plans/2026-09-05-skillstudio-roadmap.md)：作为工作量与安全验证参考；需在新规格确认后重写。

现有视觉概念使用旧单宿主定位生成，属于历史设计探索，不是新定位的视觉目标或应用截图。[生成提示词](design/prompts.md)保留原设计输入。

本次未初始化应用、安装项目依赖、执行真实 Agent 任务或提交 Git。应用开发须在设计选择后按阶段实施。
