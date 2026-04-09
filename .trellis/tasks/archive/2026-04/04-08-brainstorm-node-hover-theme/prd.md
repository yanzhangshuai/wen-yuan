# brainstorm: 图谱节点 hover 视觉与主题配色优化

## Goal

去掉图谱节点上不美观的“梯形阴影/碎影”视觉干扰，并将节点 hover 表达统一为“节点描边高亮”。该高亮需要在所有主题下都具备足够对比度和一致体验。

## What I already know

* 节点“梯形阴影”主要来自 `DRAFT` 节点描边虚线（`stroke-dasharray`）在缩放与抗锯齿下的视觉伪影。
* 当前节点 hover 色复用 `--color-graph-highlight`，尚未为“节点 hover”建立独立主题 token。
* 图谱节点 hover 已使用描边方式，不再依赖 filter glow，可继续沿用该交互方向。

## Assumptions (temporary)

* 用户希望保留 DRAFT 与 VERIFIED 的状态区分，但不接受 DRAFT 虚线带来的脏视觉。
* 本次仅调整前端视觉层，不改图谱数据结构与查询逻辑。

## Open Questions

* 无（用户已明确需求）。

## Requirements (evolving)

* 去掉节点“梯形阴影”来源：节点描边不再使用虚线。
* hover 节点时仅高亮该节点描边，不出现方形/脏阴影。
* 为所有主题提供独立的节点 hover 颜色 token，保证主题自适配。
* 不影响既有路径高亮、节点状态样式与图谱交互能力。

## Acceptance Criteria (evolving)

* [x] `DRAFT` 节点不再出现虚线描边导致的“梯形碎影”。
* [x] hover 节点时呈现清晰描边高亮，无额外阴影伪影。
* [x] 四个主题均配置节点 hover 色，并通过统一 token 接入图谱组件。
* [x] 现有 lint/type-check 通过，且无类型回归。

## Technical Approach

1. `force-graph.tsx`
   - 将节点 hover 描边颜色改为 `--color-graph-node-hover`。
   - 节点基础/hover 描边的 `stroke-dasharray` 固定为 `none`，移除 DRAFT 虚线。
2. 主题 token
   - 在 `danqing/suya/diancang/xingkong` 四套 token 中新增 `--graph-node-hover`。
3. token bridge
   - 在 `globals.css` 的 `@theme inline` 增加 `--color-graph-node-hover: var(--graph-node-hover)`。

## Decision (ADR-lite)

**Context**: 用户明确要求去掉节点“梯形阴影”，并要求 hover 高亮在所有主题下都自然。  
**Decision**: 采用“移除 DRAFT 虚线 + 新增独立 hover token”的组合方案。  
**Consequences**: 节点状态视觉更干净；hover 在主题间可控一致；新增一个 token 但维护成本很低。

## Definition of Done (team quality bar)

* Tests added/updated (unit/integration where appropriate)
* Lint / typecheck / CI green
* Docs/notes updated if behavior changes
* Rollout/rollback considered if risky

## Out of Scope (explicit)

* 重新设计整套图谱配色体系或节点形状体系。
* 修改路径查找算法、图数据库查询策略、后端关系写入逻辑。

## Technical Notes

* 目标文件：
  * `src/components/graph/force-graph.tsx`
  * `src/app/globals.css`
  * `src/theme/tokens/danqing/index.css`
  * `src/theme/tokens/suya/index.css`
  * `src/theme/tokens/diancang/index.css`
  * `src/theme/tokens/xingkong/index.css`
* 校验结果：
  * `pnpm exec eslint src/components/graph/force-graph.tsx` ✅
  * `pnpm type-check` ✅
