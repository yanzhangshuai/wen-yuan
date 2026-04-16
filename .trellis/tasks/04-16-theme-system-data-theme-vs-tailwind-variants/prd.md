# brainstorm: 评估主题系统 data-theme 与 Tailwind 变体

## Goal

分析当前项目主题系统继续使用 `data-theme` 是否比改用 Tailwind CSS 变体更合理，给出符合现有代码、设计系统和后续维护成本的技术建议。

## What I already know

* 用户关心当前项目主题系统的实现取舍：现状使用 `data-theme`。
* 项目前端基于 Next.js App Router、React 19、Tailwind CSS v4。
* 本次是架构/实现方式评估，暂不直接修改业务代码。

## Assumptions (temporary)

* 主题系统需要支持至少亮/暗两套主题。
* 项目可能同时存在全局 token、组件局部样式、第三方/自定义 CSS 以及图谱等非纯 Tailwind 场景。
* 最终目标是降低长期维护成本，而不是追求单一工具纯度。

## Open Questions

* 暂无阻塞问题，先通过仓库检查形成建议。

## Requirements (evolving)

* 对比 `data-theme` 与 Tailwind CSS 变体在当前项目中的适配性。
* 明确推荐方案、适用边界和迁移成本。
* 产出可执行的主题系统约定建议。

## Acceptance Criteria (evolving)

* [ ] 定位当前主题系统相关文件与 Tailwind 配置。
* [ ] 对比两种方案的优缺点与项目适配度。
* [ ] 给出明确推荐结论。
* [ ] 记录建议到本 PRD。

## Definition of Done (team quality bar)

* Repo context inspected before conclusion.
* No business code changed during analysis.
* Recommendation includes rollout and future evolution considerations.

## Out of Scope (explicit)

* 本轮不实现主题系统迁移。
* 本轮不重构组件样式。
* 本轮不调整设计 token 视觉值。

## Technical Notes

* 已读取 `.trellis/workflow.md`、`.trellis/spec/frontend/index.md`、`.trellis/spec/shared/index.md`、`.trellis/spec/guides/index.md`。
* 待检查主题实现、全局 CSS、Tailwind 配置、组件样式使用方式。
