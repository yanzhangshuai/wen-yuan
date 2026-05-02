# 重构知识库与角色资料前端模块

## Goal

文渊管理后台的两大数据维护板块——「知识库」（12 个子模块）与「角色资料工作台」（5 个 Tab）——前端长期独立演化，呈现以下问题：UI 风格不统一（Dialog / Sheet / 内联表单混用）、交互范式不一致、单文件超长（最长 2249 行）、抽屉里塞十几个字段使用体验糟糕、共性逻辑（CRUD 列表、批量操作、AI 生成、导入、删除确认）在每个模块各写一份导致重复 6000+ 行样板代码。

本任务对**两个模块整体重构**：抽象统一的页面骨架、列表组件、表单形态、批量操作与删除确认；明确「列表 + 编辑表单 + 删除确认」的标准三件套；让两块功能在视觉、交互、状态管理上看齐；同时保持业务功能 100% 等价、不破坏现有数据流与 API 契约。

## What I already know

见 `research/knowledge-base-frontend.md` 与 `research/role-workbench-frontend.md`。要点：

- 知识库 12 个 page 总计 ~10000 行；10 模块 Dialog、1 模块 Sheet
- 角色资料 5 Tab 总计 ~5630 行；混合 4 种编辑形态（内联 section / Sheet / 内联表单 / 路由 page）
- 现有 ui 基础组件齐备（Dialog/Sheet/AlertDialog/Table/Button/Input/Select/Badge/Checkbox/PageHeader/PageContainer/PageSection），缺的是更高一层抽象（DataTable / CrudPage / EntityForm / DeleteConfirmDialog）
- 状态管理：纯 useState，无 SWR/React Query，无全局 store
- 后端 API 全部统一在 `successResponse` 信封下，未做分页（前端取全量）

## Assumptions（temporary）

1. 用户希望「先把交互、视觉、抽象彻底统一」，再考虑性能/分页等次级优化
2. 不引入新的依赖（不上 react-hook-form / zustand / SWR），用项目现有 React + 自封 hook 即可
3. 后端 API 维持现状，重构只发生在前端层（pages + components + lib/services 客户端层）
4. 重构应分批 PR，避免一次性大改
5. 角色资料 5 Tab 仍同处一页（不强制路由化），但内部表单形态统一

## Open Questions

（已全部收敛到 Decision 章节）

## Requirements (evolving)

- 知识库 12 模块共用同一套「列表页骨架 + 编辑表单 + 删除确认 + 批量操作」抽象
- 角色资料工作台 5 Tab 的所有编辑入口统一形态
- 删除冗余文件（`role-management-tab.tsx`、`[bookId]/relations/`、`[bookId]/time/`）
- 知识库与角色资料模块视觉风格一致（同一 DataTable、同一 EntityForm 容器）
- 重构后单个 page 文件 < 400 行（业务字段配置除外）
- 现有功能、URL、API 契约、测试全部保持

## Acceptance Criteria (evolving)

- [ ] 抽象出 `<CrudPage>` / `<DataTable>` / `<EntityFormDialog>` / `<DeleteConfirmDialog>` / `<BatchActionBar>` 等基础组件并有单元测试
- [ ] 12 个知识库子模块全部迁移到新抽象
- [ ] 角色资料工作台所有编辑入口统一形态
- [ ] 删除空目录与重复组件
- [ ] `pnpm lint` `pnpm type-check` `pnpm test` 全绿
- [ ] 行覆盖率不低于 90%
- [ ] 视觉走查：两模块所有 CRUD 操作风格一致

## Definition of Done

- 测试更新（每个抽象组件自带 vitest）
- 单元测试覆盖率 ≥ 90%
- Lint / typecheck / 测试全绿
- 设计稿与实现一致（最终方案文档放入 `research/` 后引用）
- 渐进式 PR；每一步可单独回滚

## Out of Scope (explicit)

- 不改后端 API
- 不引入分页（保留现状；列表性能问题留下一阶段）
- 不重写图谱可视化组件
- 不调整鉴权 / 中间件
- 不动其他后台板块（books / model / review 子区不在本范围）
- 不做国际化

## Technical Notes

- 抽象组件落位建议：`src/components/common/crud/`
- hook 落位建议：`src/hooks/use-entity-list.ts`、`use-entity-form.ts`、`use-dirty-guard.ts`
- 借鉴现有可复用资产：
  - `src/app/admin/knowledge-base/batch-action-controls.tsx`（批量操作雏形）
  - `src/components/layout/page-header.tsx`（页面骨架）
  - `src/components/ui/*` 已有 Dialog/Sheet/AlertDialog/Table 实现
- 表单字段定义参考 `role-review-utils.ts` 的形式：把字段映射、序列化、空表单都集中到模块级 utils
- 编辑形态最终决策直接进入「Decision (ADR-lite)」一节

## Research References

- [research/knowledge-base-frontend.md](research/knowledge-base-frontend.md) — 知识库 12 模块现状、交互不一致、可抽象点
- [research/role-workbench-frontend.md](research/role-workbench-frontend.md) — 角色资料 5 Tab 现状、4 种混合编辑形态、与知识库差异

## Decision (ADR-lite)

### D1：CRUD 编辑形态采用「分级混合」（方案 H）

**Context**
现有方案存在三类痛点：
- 右侧抽屉（`<Sheet>`）视觉割裂、`modal={false}` 又带来「未保存保护」的复杂性
- 居中 Dialog 在字段超过 ~10 个时拥挤
- 独立编辑页带来跳转割裂感

**Decision**
统一抛弃浮层（Dialog/Sheet）作为编辑容器，全部改为「列表与编辑同处一页」：

| 编辑形态 | 适用场景 | 适用模块 |
|---|---|---|
| **行内展开（InlineExpandRow）** | 字段 ≤ 8、扁平实体 | 知识库：surnames / title-filters / ner-rules / name-patterns / historical-figures / relationship-types / change-logs（只读） |
| **主从分栏（MasterDetail）** | 字段 > 8、含子项/审核流、详情即编辑 | 知识库：alias-packs / prompt-templates / prompt-extraction-rules / book-types；角色资料：Persona / Biography / ChapterEvent 等 |

两种形态共享同一套 `EntityForm` 字段层（字段定义、序列化、校验、dirty 跟踪），仅外层容器不同。

**Consequences**
- 优点：所有 CRUD 永远不离开列表上下文；视觉风格在两个模块间彻底统一；字段多寡都有最佳容器
- 代价：需要维护两个外层容器组件（`<InlineExpandRow>` 与 `<MasterDetailPage>`），但成本远低于现有 4 种混合形态
- 删除现有所有 `<Dialog>` / `<Sheet>` 编辑用法（仅保留 `<AlertDialog>` 用于删除确认与未保存保护）
- 角色资料工作台天然契合 MasterDetail，重构后 5 Tab 内部全部按此规范

### D2：角色资料工作台路由化（方案 1） + Tab 1 改 Section 滚动（Tab1-B）

**Context**
`RoleWorkbenchPanel` 单组件 539 行管 5 Tab × 3 路懒加载 × 5 fetch；最外层「来源筛选」其实只对 Tab 1 生效，造成误导。Tab 1 内部又有 4 个二级 Tab，层级过深。

**Decision**
- 5 个 Tab 拆为子路由：
  - `/admin/role-workbench/[bookId]/roles`（默认重定向到此）
  - `/admin/role-workbench/[bookId]/chapters`
  - `/admin/role-workbench/[bookId]/merge`
  - `/admin/role-workbench/[bookId]/aliases`
  - `/admin/role-workbench/[bookId]/validation`
- `[bookId]/layout.tsx` 共享 SSR：书籍信息 + Tab 徽标计数；各 Tab 在自己的 page.tsx 内 SSR 预取自身数据
- 「来源筛选」从顶部移到 `/roles` 工具栏内
- Tab 1 (`/roles`) 内部采用主从分栏（Master-Detail），右侧从上到下为分区滚动：
  1. **基础信息**（默认展开，含编辑入口）
  2. **关系**（次级列表 + 行内展开新增/编辑）
  3. **传记事件**（次级列表 + 行内展开）
  4. **别名映射**（次级列表 + 行内展开）
- 右侧顶部加锚点导航（Quick jump）缓解长滚动

**Consequences**
- 优点：每个 Tab page < 200 行；可深链接；浏览器后退切 Tab；徽标计数走 layout 共享数据；筛选语义清晰
- 代价：Tab 切换有 SSR 跳转（用 `<Suspense>` + 共享 layout 缓解闪烁）
- 现存空目录 `[bookId]/relations/` `[bookId]/time/` 顺势删除（被新结构覆盖）
- `role-management-tab.tsx` 删除（功能已被 `role-review-workbench` 覆盖）
- `role-workbench-panel.tsx` 完全移除（Tab 容器逻辑下沉到 layout + 各 page）

### D3：批量 / AI 生成 / 导入 沿用 Dialog（Q4-1.a）

**Decision**
- 主表格上方挂 `<BatchActionBar>`（沿用现有 `batch-action-controls.tsx` 思路），选中后出现，含批量启停 / 批量删除 / 清空选择
- 「AI 生成」「导入」作为次级动作，统一抽成 `<AIGenerateDialog>` / `<ImportDialog>`，居中弹层，字段少，可控
- 编辑表单不再用 Dialog（D1 已决），但**这两个次级动作**保留 Dialog 形态——它们不是「编辑实体」，是「批量动作配置」，Dialog 是合适容器
- 删除现有各模块自写的「AI 生成 Dialog」「导入 Dialog」，改用统一组件 + 模块传配置

### D4：删除影响预览统一接口、按需启用（Q4-2.a）

**Decision**
- 统一 `<DeleteConfirmDialog>`，props：
  ```ts
  {
    open, onOpenChange, onConfirm,
    title, description,
    previewLoader?: () => Promise<DeletePreview>, // 可选
    renderPreview?: (preview) => ReactNode,        // 可选自定义
  }
  ```
- 提供 `previewLoader` 时：打开 → loading → 渲染 preview → 确认按钮在 loading 期间禁用
- 不提供时：纯文字 + 确认/取消
- 现有 `PersonaDeletePreview` 用法迁移到此组件
- 知识库各模块按需补 `previewLoader`（默认不补，保持轻量）

### D5：自底向上分批 PR（Q4-3.a）

**Decision**
按以下顺序提交 5 个独立 PR，每个都可单独回滚：

| PR | 范围 | 内容 |
|----|------|------|
| **PR1** | 抽象层 | `src/components/common/crud/` 新增：`<CrudPage>` `<DataTable>` `<InlineExpandRow>` `<MasterDetailLayout>` `<EntityForm>` `<BatchActionBar>` `<DeleteConfirmDialog>` `<AIGenerateDialog>` `<ImportDialog>`；`src/hooks/`：`useEntityList` `useEntityForm` `useDirtyGuard`；全部含 vitest |
| **PR2** | 知识库简单组（6 模块）| surnames / title-filters / ner-rules / name-patterns / historical-figures / relationship-types 迁移到 InlineExpandRow |
| **PR3** | 知识库复杂组（4 模块）| alias-packs / prompt-templates / prompt-extraction-rules / book-types 迁移到 MasterDetail；change-logs 保留只读表格风格但同步视觉规范 |
| **PR4** | 角色资料路由化 | 拆 `RoleWorkbenchPanel` → 5 个子 page + 共享 layout；Tab1 改 Section 滚动；统一 InlineExpandRow（关系/传记/别名）|
| **PR5** | 收尾 | 删除冗余：`role-management-tab.tsx`、空目录 `[bookId]/relations/` `[bookId]/time/`、各模块旧 Dialog/Sheet 编辑代码；视觉走查；文档 |

每个 PR 独立通过 `pnpm lint && pnpm type-check && pnpm test`；PR4 之前 PR1-3 不会动到角色资料模块；PR5 仅删除，不改业务行为。
