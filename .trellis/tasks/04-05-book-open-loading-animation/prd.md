# brainstorm: 首页进入角色图谱时增加书籍展开等待动画

## Goal

在阅读端首页（`/`）点击“已完成解析”的书籍后，进入角色图谱页面（`/books/:id/graph`）前，提供一个“书籍展开”的过渡等待动画，降低跳转等待感并强化产品叙事感（“翻开书卷进入图谱”）。

## What I already know

- 用户希望在“首页点击书籍 -> 进入角色图谱”这条链路增加“书籍展开等待效果动画”。
- 书籍点击入口在 `src/components/library/book-card.tsx`，已完成书籍用 `Link` 跳转到 `/books/${book.id}/graph`。
- 图谱页已有路由级 loading 骨架：`src/app/(viewer)/books/[id]/graph/loading.tsx`。
- 首页书库容器在 `src/components/library/library-home.tsx`，渲染 `BookCard` 网格。
- 全局样式在 `src/app/globals.css`，已有动画定义（如 shimmer/page-enter），可扩展为统一动画 token/关键帧。

## Assumptions (temporary)

- 动画只针对 `status === "COMPLETED"` 的可点击书籍触发。
- 首版（MVP）优先保证“感知等待优化”，不引入复杂 3D 物理模拟。
- 动画持续时间应较短（约 400ms-900ms），避免反向增加整体等待。

## Open Questions

- 已确认：每次进入图谱页都显示动画（不做“仅首次”策略）。

## Requirements (evolving)

- 在首页点击书籍进入图谱时，出现“书籍展开”视觉等待反馈。
- 动画机制需支持未来“多入口进入 `/books/:id/graph`”时统一复用。
- 主动画落在图谱路由 `src/app/(viewer)/books/[id]/graph/loading.tsx`，作为统一等待承载层。
- 动画与现有主题/样式保持一致，不破坏当前可访问性与交互语义。
- 对低性能设备和 `prefers-reduced-motion` 用户提供降级策略。

## Acceptance Criteria (evolving)

- [ ] 从首页点击可阅读书籍进入图谱页时，可见书籍展开等待动画。
- [ ] 从任意入口进入 `/books/:id/graph`（含未来新增入口）都可复用同一套等待动画机制。
- [ ] 动画实现位于图谱路由 `loading.tsx`，不依赖某个特定入口组件状态。
- [ ] 在常规网络条件下，动画不阻塞正常路由完成（图谱数据 ready 后自然进入目标页）。
- [ ] 在 `prefers-reduced-motion: reduce` 下，动画自动降级为最小过渡。
- [ ] 解析中/失败书籍（不可点击）不触发该动画。

## Definition of Done (team quality bar)

- Tests added/updated (unit/integration where appropriate)
- Lint / typecheck / CI green
- Docs/notes updated if behavior changes
- Rollout/rollback considered if risky

## Out of Scope (explicit)

- 本次不改造图谱数据加载链路（服务端并行拉取逻辑保持不变）。
- 本次不引入新的重型动画库（如需先以原生 CSS / 现有栈实现）。
- 本次不重设计首页书卡整体视觉系统。

## Research Notes

### What similar products commonly do

- 路由切换等待动画通常放在“目标页 loading 层”，因为不依赖点击来源，覆盖刷新/直达等入口更稳定。
- 为了缩短点击感知延迟，很多产品会在点击瞬间加一个极短反馈（press/flash），但主要动画仍由目标页 loading 承担。
- 动画普遍遵循“可中断、可降级”原则：数据准备好后立即切换，`prefers-reduced-motion` 下保留最小淡入。

### Constraints from our repo/project

- 现有点击跳转使用 `next/link`（`BookCard`），没有自定义 router push 流程。
- 目标路由已有 `loading.tsx`，天然适合承接“等待态动画”。
- 全局已有动画样式和 reduced-motion 防线（`src/app/globals.css`），可复用，避免新依赖。

### Feasible approaches here

**Approach A: Click Overlay Transition**

- How it works: 点击书卡后，在首页覆盖一个“书页展开”过渡层，再触发路由。
- Pros: 点击反馈最强，视觉叙事完整。
- Cons: 需要管理“何时开始跳转/何时结束”，实现复杂，且对直达图谱页无覆盖。

**Approach B: Graph Loading Book-Open Skeleton (Recommended)**

- How it works: 将 `/books/:id/graph/loading.tsx` 改为“书籍展开”骨架动画。
- Pros: 架构最顺滑，覆盖所有进入图谱的路径，实现风险低。
- Cons: 点击瞬间反馈不如 A 强，需要依赖路由切换速度。

**Approach C: Hybrid (Micro Feedback + Loading Main Animation)**

- How it works: 首页点击加 120ms-180ms 轻反馈，主动画放在 `loading.tsx`。
- Pros: 兼顾点击手感和架构稳定。
- Cons: 实现复杂度高于 B，需要把握节奏避免“动画重复”。

## Decision (ADR-lite)

**Context**: 需求不仅覆盖首页点击入口，还希望后续新增入口时维持一致过渡体验；因此需要与入口解耦的动画承载点。  
**Decision**: 选择 Approach B：在图谱路由 `loading.tsx` 实现“书籍展开”主动画，并将其作为统一机制。  
**Consequences**: 可覆盖首页点击、直达链接、未来新增入口；点击瞬时反馈较弱，但实现复杂度与维护风险最低。动画显示频率为“每次进入”。

## Technical Approach

- 在 `src/app/(viewer)/books/[id]/graph/loading.tsx` 将中心骨架替换为“书籍展开”动画舞台，保留工具栏/时间轴骨架结构。
- 在 `src/app/globals.css` 增加图谱 loading 专用 keyframes 与样式类（封面展开、页纹流动、光晕与节奏点）。
- 在 `prefers-reduced-motion: reduce` 下关闭动态动画，保留静态展开状态作为降级方案。
- 增加 `loading.test.tsx` 校验 loading 语义与关键动画结构，降低后续改动回归风险。

## Technical Notes

- 入口组件：`src/components/library/book-card.tsx`
- 首页容器：`src/components/library/library-home.tsx`
- 目标页 loading：`src/app/(viewer)/books/[id]/graph/loading.tsx`
- 目标页 page：`src/app/(viewer)/books/[id]/graph/page.tsx`
- 全局动画样式：`src/app/globals.css`
- 路由模式：阅读端首页为 `src/app/(viewer)/page.tsx`（Server Component），书卡为客户端交互组件。
