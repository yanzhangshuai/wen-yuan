# brainstorm: 图谱关系箭头视觉优化

## Goal

优化图谱关系边末端“灰色三角箭头”的视觉表现，保持关系方向可读性，同时避免当前样式突兀、影响整体审美。方案需要兼容现有主题系统（含亮/暗和多主题 token），并与路径查找高亮行为协同。

## What I already know

* 当前灰色三角来自 `src/components/graph/force-graph.tsx` 的 SVG marker：`id="arrowhead"`，通过 `marker-end="url(#arrowhead)"` 应用于所有边。
* 箭头 fill 颜色当前是 `var(--muted-foreground)`，因此视觉上偏灰且在不同主题下可能不够协调。
* 图谱关系是有向语义：`GraphEdge` 使用 `source -> target`（`src/types/graph.ts`）。
* 路径查找已存在“节点/边高亮”和“自动适配视野”逻辑，边高亮颜色使用 `--color-graph-highlight`。

## Assumptions (temporary)

* 用户不希望完全失去“方向”信息，只是不满意当前三角形视觉。
* 默认要保证普通浏览和路径高亮两种状态下都可读。
* 本次优先做前端可视化层，不改后端关系模型。

## Open Questions

* 已确认：箭头改为更小更细、颜色随边色/高亮色，且常态不显示，仅在 hover 或路径高亮显示。

## Requirements (evolving)

* 方向表达必须保留，采用“按条件显示”：常态隐藏，hover/路径高亮显示。
* 箭头样式改为更小更细，避免当前粗灰三角突兀。
* 箭头颜色需随边色/路径高亮色变化，并适配所有主题。
* 与路径高亮协同：路径边在视觉上更明确，普通边降低噪声。
* 不影响现有交互（hover、选中、缩放、拖拽、路径查找结果高亮）。

## Acceptance Criteria (evolving)

* [ ] 常态浏览时，普通边不显示箭头。
* [ ] hover 某条边时，该边出现方向箭头。
* [ ] 路径查找高亮后，路径边显示方向箭头，非路径边不显示。
* [ ] 箭头样式明显更小更细，且颜色跟随边色/高亮色。
* [ ] 路径查找结果出现时，路径方向比普通边更清晰。
* [ ] 现有图谱交互行为无回归。

## Decision (ADR-lite)

**Context**: 当前全量灰色三角箭头影响观感，用户明确要求更轻量视觉且降低噪声。  
**Decision**: 采用组合方案：箭头改小改细并跟随边色/高亮色，同时常态隐藏，仅在 hover 或路径高亮显示。  
**Consequences**: 常态信息密度降低、界面更干净；仍保留方向语义且在关键场景更清晰。

## Definition of Done (team quality bar)

* Tests added/updated (unit/integration where appropriate)
* Lint / typecheck / CI green
* Docs/notes updated if behavior changes
* Rollout/rollback considered if risky

## Out of Scope (explicit)

* 重做整套图谱视觉语言（节点形状、布局算法、全局配色体系）。
* 后端图查询逻辑和关系存储模型变更。

## Technical Notes

* 关键文件：
  * `src/components/graph/force-graph.tsx`（marker 定义、edge 渲染、高亮样式）
  * `src/types/graph.ts`（有向关系契约）
  * `src/theme/tokens/*/index.css`（主题 token）
  * `src/app/globals.css`（token bridge）
* 实施后 marker：
  * `viewBox="0 -2.5 6 5"`
  * `markerWidth/Height=4`
  * `markerUnits="userSpaceOnUse"`
  * `d="M0,-2.2L6,0L0,2.2"`
  * fill = `context-stroke`（自动跟随边色/路径高亮色）
* 显示策略：
  * 常态：`marker-end="none"`
  * hover：`marker-end="url(#arrowhead)"`
  * 路径高亮边：`marker-end="url(#arrowhead)"`
