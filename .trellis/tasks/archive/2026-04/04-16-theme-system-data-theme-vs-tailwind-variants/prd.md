# brainstorm: 评估主题系统 data-theme 与 Tailwind 变体

## Goal

分析当前项目主题系统继续使用 `data-theme` 是否比改用 Tailwind CSS 变体更合理，给出符合现有代码、设计系统和后续维护成本的技术建议。

## What I already know

* 用户关心当前项目主题系统的实现取舍：现状使用 `data-theme`。
* 项目前端基于 Next.js App Router、React 19、Tailwind CSS v4。
* 本次是架构/实现方式评估，暂不直接修改业务代码。
* 当前项目是四套命名主题，而不是传统二元 light/dark：`danqing`、`suya`、`diancang`、`xingkong`。
* `src/app/layout.tsx` 通过 `next-themes` 使用 `attribute="data-theme"`，`enableSystem={false}`，主题偏好持久化在 `wen-yuan-theme`。
* `src/app/globals.css` 通过 `@theme inline` 把运行时 CSS 变量桥接成 Tailwind 语义 utility，例如 `bg-background`、`text-foreground`、`bg-primary`。
* 四套主题 token 分散在 `src/theme/tokens/<theme>/index.css`，每套通过 `[data-theme="<id>"]` 覆盖同一组语义变量。
* 设计系统规范明确要求“所有颜色通过 CSS 变量消费”，新增语义色需同时注册到 4 套主题 token 文件。

## Assumptions (temporary)

* 项目主题系统需要长期支持多套命名主题，而不仅是 light/dark。
* 项目同时存在全局 token、组件局部样式、第三方/自定义 CSS、Recharts、D3 图谱等非纯 Tailwind 场景。
* 最终目标是降低长期维护成本，而不是追求单一工具纯度。

## Open Questions

* 暂无阻塞问题，先通过仓库检查形成建议。

## Requirements (evolving)

* 对比 `data-theme` 与 Tailwind CSS 变体在当前项目中的适配性。
* 明确推荐方案、适用边界和迁移成本。
* 产出可执行的主题系统约定建议。
* 识别当前主题系统中与推荐方案不一致的风险点。

## Acceptance Criteria (evolving)

* [x] 定位当前主题系统相关文件与 Tailwind 配置。
* [x] 对比两种方案的优缺点与项目适配度。
* [x] 给出明确推荐结论。
* [x] 记录建议到本 PRD。

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
* 重点文件：
  * `src/app/layout.tsx`：`ThemeProvider attribute="data-theme"`、四套主题 ID、禁用 system。
  * `src/app/globals.css`：Tailwind v4 CSS-first 配置、`@theme inline` token bridge、当前 `@custom-variant dark (&:is(.dark *));`。
  * `src/theme/constants.ts`：四套主题受控枚举。
  * `src/theme/tokens/*/index.css`：每套主题的 runtime CSS 变量和少量主题结构性覆盖。
  * `.trellis/spec/frontend/design-system.md`：明确要求 CSS 变量驱动主题，业务组件不硬编码颜色。
  * `docs/v1/task-frontend.md`：旧方案也要求 next-themes `data-theme`、新增主题不改业务组件结构。
* Tailwind 官方文档支持两点：
  * 可用 `@custom-variant dark` 把 `dark:` 改成由 data attribute 触发。
  * 可用 `@custom-variant theme-midnight (&:where([data-theme="midnight"] *));` 这类自定义主题变体。
* 当前一致性风险：
  * `src/app/globals.css` 的 `dark:` 变体绑定 `.dark`，但根布局只设置 `data-theme`，因此 shadcn/ui 中大量 `dark:*` 类不会命中。
  * `src/components/ui/chart.tsx` 仍用 `.dark` 作为暗色 selector；如果图表配置依赖 light/dark theme 分支，也不会跟当前 `data-theme` 系统一致。
  * `src/components/graph/graph-view.tsx` 注释说 `resolvedTheme` 可能是 `"light" | "dark"`，但在 `enableSystem={false}` 且使用自定义主题时，`resolvedTheme` 与当前主题 ID 相同；代码用途基本正确，注释容易误导。

## Research Notes

### What Similar Tools / Official Docs Support

* Tailwind v4 的 `@theme` 负责把设计 token 映射成 utility API；这适合当前项目的 `bg-background`、`text-foreground` 等语义 utility。
* Tailwind 的 variant 适合“条件触发样式”，例如 hover/focus、Radix `data-state`、`dark:`、或自定义 `[data-theme]` 条件。
* Tailwind 官方示例允许把 `dark:` 改成 `[data-theme=dark]` 触发，也允许注册自定义主题变体如 `theme-midnight:*`。
* next-themes 支持 `attribute="data-theme"`，并说明当不处于 system 模式时 `resolvedTheme` 与 `theme` 相同；这与当前多主题 ID 用法兼容。

### Constraints From This Repo

* 主题不是二元 light/dark，而是四套命名主题，且其中 `danqing`、`diancang`、`xingkong` 都是暗色系，`suya` 是亮色系。
* 设计规范要求业务组件“不感知主题”，新增主题主要新增 token 文件，而不是改所有组件 className。
* 图谱、背景装饰、Toast、Recharts 等场景需要 CSS 变量或 JS token，不适合只靠 Tailwind class 变体解决。
* 组件库中已经存在大量 `dark:*` shadcn 默认类，但当前 `.dark` selector 与 `data-theme` 状态源不一致。

### Feasible Approaches Here

**Approach A: Keep `data-theme` as source of truth + CSS variables + Tailwind semantic utilities** (Recommended)

* How it works: `data-theme` 承载主题 ID，主题 CSS 文件赋值变量，Tailwind `@theme inline` 暴露语义 utility，组件使用 `bg-background`、`text-foreground`、`border-border`。
* Pros: 最符合四套主题；新增主题不需要批量改组件；D3/Recharts/第三方 CSS/inline style 都能复用变量；符合现有设计系统规范。
* Cons: 需要维护 token 完整性；对少量结构性差异仍要写 CSS selector 或极少量 custom variant。

**Approach B: Tailwind custom variants per theme as primary mechanism**

* How it works: 注册 `danqing:*`、`suya:*`、`diancang:*`、`xingkong:*` 或 `theme-danqing:*`，组件 className 中直接写主题差异。
* Pros: 单个组件局部差异直观；对少量组件结构性差异方便。
* Cons: 四主题会导致 className 膨胀；业务组件感知主题；新增主题需要修改大量组件；不覆盖 D3/第三方 CSS/inline style；违背“新增主题不改业务组件结构”的现有规范。

**Approach C: Hybrid, but variants only as compatibility / exception layer**

* How it works: 主系统仍用 Approach A；把 `dark:` 变体改为匹配暗色主题的 `[data-theme]`；必要时为极少量结构差异注册 `theme-xingkong:*` 等 custom variant。
* Pros: 能兼容 shadcn 的 `dark:*` 习惯；保留 token 驱动架构；避免 per-theme variants 泛滥。
* Cons: 需要明确团队约束，否则容易滑向 Approach B 的组件级主题分支。

## Decision (ADR-lite)

**Context**: 当前项目主题是四套命名主题，且设计系统明确要求 CSS 变量驱动、业务组件不感知主题；同时代码里已有 Tailwind v4 `@theme inline` 桥接和大量 `[data-theme]` token。

**Decision**: 保持 `data-theme` 作为主题状态源，继续用 CSS 变量作为主题 token，Tailwind 只作为语义 utility 消费层。Tailwind 变体不应替代主题系统，只应作为状态/兼容/少量结构性例外使用。

**Consequences**:
* 推荐短期修正 `dark:` 与 `data-theme` 的不一致，让暗色组主题能触发 shadcn 默认暗色变体。
* 新增主题时继续新增 `src/theme/tokens/<theme>/index.css` 和 TS token，不应在业务组件里堆 per-theme class。
* 对无法用变量表达的局部结构差异，优先放在主题 token CSS 文件中；只有复用频率高且 class 语义清晰时再加 custom variant。
