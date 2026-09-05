# UI 概念生成记录

日期：2026-09-05。工具：内置 Image Gen；没有使用 CLI fallback；未提供或附加现有截图，因为仓库没有可用界面素材。

共生成三张独立图，不是可运行原型。以下为各次调用的完整提示词。文件按会话实际显示顺序保存；请求尺寸为 1440×1024，生成结果实际像素以文件为准，没有裁切或重绘。

## 01 — 01-library.png

```text
Use case: ui-mockup. Create realistic production-quality UI design for SkillStudio, a Chinese local desktop WEB app for SKILL.md authors and users equally. Concept name: Library Workbench. Target 1440 x 1024, app content only, no browser chrome. Focus one primary screen: library with selected skill detail. Crisp white and very pale cool grey surfaces, restrained indigo accent, 15px readable Chinese sans, monospace for paths. Full canvas app, 208px slim sidebar (Skill 库, 运行记录, 本地连接), central 390px list with search and 5 rows, generous right detail pane. Title Skill 库, small 新建 Skill secondary action. Sample rows code-review, writing-plans, pdf, skill-creator, systematic-debugging with meaningful Chinese descriptions and subtle text status. Selected code-review. Right content shows title code-review, description 审查代码变更并输出可执行建议, origin 本地目录, short sample path D:/Skills/code-review, 校验通过 with explicit caption 格式检查不代表内容安全. Primary action 运行 and secondary 编辑. A beautifully typeset short instructions preview with heading 工作方式 and 3 concise steps. Bottom sidebar connector status 本地连接正常. No charts, metrics, marketplace, accounts, team, decorative cards or illustrations. Use whitespace and row separators before borders, no nested cards, few badges. Generous spacing with genuine workbench usefulness and both editing and usage visible. Current date anchor 2026-09-05 if any dates used. Independent single design, not a collage.
```

## 02 — 02-studio.png

```text
Use case: ui-mockup. Create realistic production-quality UI design for SkillStudio, a Chinese localhost desktop web workbench for SKILL.md authors and users equally. Concept name: Focus Studio. One independent primary screen, 1440 x 1024 app only no browser chrome. Explore editorial two-column documentation studio with pale warm ivory canvas, graphite text, understated forest green accent, beautiful Chinese system sans body 15-16px and monospace code. Slim horizontal top navigation SkillStudio / Skill 库 / 运行记录 / 本地连接, small local status at far right. Left 260px compact skill navigator and search, code-review selected among 5 real skill names. Main large area shows breadcrumb Skill 库 / code-review, heading 代码审查, concise subtitle. Segmented 阅读 / 编辑 with 编辑 active. Main hero is airy SKILL.md markdown source editor with real short frontmatter name: code-review and description: 审查代码变更并输出可执行建议, 12 meaningful code lines, line numbers. Above it primary 保存 button, secondary 运行, subtle 未保存 indicator. Under source small integrated diagnostics strip 1 条建议：补充适用场景 and caption 草稿校验. Show quiet explanatory label 运行使用已保存版本. Use purposeful hierarchy and spacing rather than card grids, no nested cards, no dashboards/marketplace/accounts/AI chat. Keep both author editing and user read/run pathways visible, don't imply unsaved content already runnable. Current date anchor 2026-09-05 if dates needed. Only one design image.
```

## 03 — 03-console.png

```text
Use case: ui-mockup. Create realistic production-quality UI design of SkillStudio Chinese localhost desktop web application, supports SKILL.md authors and users equally. Concept name: Task Console. Exactly one independent image 1440 x 1024 no browser chrome. Distinct layout: sophisticated dark graphite/navy console with cyan accent, strong readable Chinese 15px typography, high contrast quiet separators, left narrow 190px navigation Skill 库 / 运行记录 / 本地连接, large main content. Hero workflow is inspect a selected Skill and configure its run without leaving library context. Breadcrumb Skill 库 / code-review; title code-review with description 审查代码变更并输出可执行建议, secondary 编辑 button. Below, spacious two columns with left readable instruction preview heading 使用说明, three short precise steps and 来源：本地目录 D:/Skills/code-review. Right roughly 400px integrated run settings area heading 运行配置, fields 工作目录 D:/Projects/demo, 任务描述 请审查当前未提交变更, permission label 只读, explicit note 将使用已保存版本 and 状态：待运行. One cyan primary 开始运行 action. A small bottom supporting 最近运行 row shows code-review / 已完成 / 09:41, no fake active stream. No automatic full access, no marketplace/accounts/chat/metrics, no busy nested cards or giant terminal. Use typography alignment whitespace and simple separators. Date anchor 2026-09-05 if any dates. Make a polished realistic quiet desktop tool and one single coherent screen, not collage.
```
