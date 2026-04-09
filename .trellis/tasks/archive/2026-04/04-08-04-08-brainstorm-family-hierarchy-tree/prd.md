# brainstorm: 层级树是否改为家族组织架构图

## Goal

明确图谱页“层级树（tree）”是否应演进为“家族关系组织架构图”，并收敛一个可实施的 MVP 方案，兼顾可读性、数据真实性与现有图谱交互一致性。

## What I already know

- 当前图谱布局有 `force / radial / tree` 三种模式，入口在工具栏布局面板。
- 当前 `tree` 实现是“通用 BFS 分层”：以影响力最高节点为根，按连通关系分层，并不基于家族语义。
- 当前关系边 `type` 是业务自由文本（如“父子/兄弟/师生/同僚”），没有强约束的亲属本体模型。
- 当前图谱数据源中边是有 `source/target` 的，但路径搜索与部分布局逻辑按“无向可达”处理，说明方向语义未被系统性使用。
- 当前快照中会混合所有关系类型；tree 模式没有默认“仅亲属关系”过滤。

## Assumptions (temporary)

- 用户希望“层级树”更符合直觉，重点表达家族谱系而不是通用关系网分层。
- 用户更看重可读性与认知一致性，不希望因强行树化而误导真实关系。
- MVP 可以先在前端布局层实现，不立即改造后端数据模型。

## Open Questions

- `tree` 模式是要“完全切换为家族图”，还是“保留通用 tree，同时新增家族树子模式”？

## Requirements (evolving)

- 层级树展示语义必须与名称一致，避免“看起来像家族树，实际是随机分层”。
- 若采用家族树语义，必须先定义亲属关系筛选口径（哪些 type 进入家族图）。
- 若关系不满足严格树结构（如兄弟/夫妻/姻亲横向关系），展示需有可解释的降级策略。
- 不破坏现有 `force / radial` 使用体验。

## Acceptance Criteria (evolving)

- [ ] 用户能明确理解 tree 模式到底表示什么（通用层级或家族层级）。
- [ ] 在代表性样本（含父子/兄弟/夫妻）中，布局结果符合直觉且不产生明显误导。
- [ ] tree 与其他布局切换稳定，无明显闪烁或状态错乱。
- [ ] 主题适配与当前高亮交互保持一致。

## Definition of Done (team quality bar)

- Tests added/updated (unit/integration where appropriate)
- Lint / typecheck / CI green
- Docs/notes updated if behavior changes
- Rollout/rollback considered if risky

## Out of Scope (explicit)

- 本次 brainstorm 不直接改数据库 schema（不新增家谱专用表）。
- 本次不处理跨书家族合并，仅讨论单书图谱展示语义。
- 本次不定义完整历史人物本体学，仅覆盖前端可视化语义与必要规则。

## Research Notes

### What similar tools do

- 通用知识图谱通常把“层级布局”用于 DAG/依赖关系，不默认等同家族谱系。
- 家谱/组织图通常会先做关系过滤与方向归一化，再布局；否则会出现“伪层级”。
- 当数据含横向关系（夫妻/兄弟）时，常见做法是同层横向连线，而非强行父子化。

### Constraints from our repo/project

- 当前关系类型是自由文本，缺少强约束枚举与方向语义校验。
- 现有 tree 逻辑是基于连通图 BFS，不具备“亲属优先 + 代际约束”的规则层。
- UI 已有 tree 入口，直接替换语义会影响既有用户心智。

### Feasible approaches here

**Approach A: 双模式（推荐）**

- How it works: 保留现有通用 tree；在 tree 面板新增“通用层级 / 家族关系”切换。家族关系模式先过滤亲属 type，再做代际布局。
- Pros: 兼容历史行为，风险可控；用户可按任务选择语义。
- Cons: UI 与实现复杂度上升，需要定义默认模式和文案。

**Approach B: tree 直接改为家族组织架构图**

- How it works: 现有 tree 全量替换为亲属关系树，非亲属边弱化或隐藏。
- Pros: 名称与视觉语义高度一致，结果更直观。
- Cons: 对当前把 tree 当“通用层级”的用户不兼容；非家族关系场景价值下降。

**Approach C: 保持单一 tree，但引入“亲属优先排序”**

- How it works: 不过滤边，只在布局时让亲属边优先决定层级，其他关系作为辅线。
- Pros: 改动较小，兼顾部分家族直觉。
- Cons: 语义折中，用户仍可能困惑“这到底是不是家族树”。

## Technical Notes

- 代码定位：`src/components/graph/force-graph.tsx`（tree 布局在 `layoutMode === "tree"` 分支）。
- 布局入口：`src/components/graph/graph-toolbar.tsx`（布局切换按钮）。
- 图谱状态容器：`src/components/graph/graph-view.tsx`（layoutMode 与筛选状态）。
- 关系类型与图谱快照：`src/server/modules/books/getBookGraph.ts`。
- 路径查询当前按无向可达：`src/server/modules/graph/findPersonaPath.ts`。
