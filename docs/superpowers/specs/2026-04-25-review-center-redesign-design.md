# 书籍审核中心页面重构设计

- 状态：Draft
- 日期：2026-04-25
- 作者：Brainstorming Session
- 范围：`/admin/review/[bookId]`、`/admin/review/[bookId]/relations`、`/admin/review/[bookId]/time`
- 验证目标书籍：《儒林外史》(`bookId = 05562920-129d-49b6-bdd4-22f03bdd6bf1`)

## 1. 背景与问题

当前审核中心三页（人物 × 章节 / 关系 / 人物 × 时间）共享类似的"左侧 w-44 书籍栏 + 右侧 ReviewModeNav + 工作区"模板。实际使用时暴露三类问题：

1. **缺少"书籍角色"一等公民**：角色被压扁为矩阵列头（仅显示 displayName + 三个计数），DTO 中已有的 `aliases`、`firstChapterNo`、`personaCandidateIds` 等关键信息被丢弃。
2. **角色显示不清晰**：列宽 224px，列头内容只两行；想要看一个角色全貌得横向滚动整个矩阵或跳到关系页。
3. **排版与交互拥挤**：三层水平嵌套（书籍栏 / 模式 Tab / 工具栏 / 矩阵），主区被挤占；筛选只能筛单元格，不能以"角色"为锚定点。

## 2. 目标

- 把"角色"提升为审核中心的导航中枢：左侧角色列表常驻，全方位展示角色信息。
- 三个审核页采用统一布局，减少重复代码并对齐操作员心智模型。
- 选中角色后默认在主区"高亮+滚动定位"，并提供"只看当前角色"开关一键切换为筛选模式（混合模式）。
- 不引入新的后端 API；通过组合现有 `getPersonaChapterMatrix` / `getRelationEditorView` / `getPersonaTimeMatrix` 输出在 client 内完成。

## 3. 整体布局（三页共用）

```
┌────────────────────────────────────────────────────────────────────────┐
│  面包屑：书库管理 / [书名] / 审核中心                                    │
├────────────────────────────────────────────────────────────────────────┤
│  ┌────────────────┐   [模式 Tab：人物 × 章节 │ 关系 │ 人物 × 时间]      │
│  │ 当前书籍 ▼    │                                                     │
│  │ (Popover 搜索)│   ┌───────────────────────────────────────────────┐ │
│  └────────────────┘   │ 工具栏（筛选、排序、"只看当前角色" Switch）  │ │
│  ┌────────────────┐   ├───────────────────────────────────────────────┤ │
│  │ 角色列表       │   │                                               │ │
│  │ ─ 搜索框       │   │  主审核区（矩阵 / 关系编辑器 / 时间矩阵）     │ │
│  │ ─ 排序 ▼       │   │                                               │ │
│  │ ─ 状态 chip    │   │                                               │ │
│  │ ┌──────────┐   │   │                                               │ │
│  │ │ PersonaCard│  │   │                                               │ │
│  │ │ PersonaCard│  │   │                                               │ │
│  │ │   ……虚拟滚动│  │   │                                               │ │
│  │ └──────────┘   │   │                                               │ │
│  └────────────────┘   └───────────────────────────────────────────────┘ │
│   w-72 sticky          flex-1 min-w-0                                   │
└────────────────────────────────────────────────────────────────────────┘
```

新增共享 client 组件 `<ReviewWorkbenchShell>` 承载三页公共结构：

- 顶部：`<BookSelector>`（替代旧 w-44 书籍栏）+ `<ReviewModeNav>`
- 左侧：`<PersonaSidebar>`
- 主区：`children` 插槽（每页传入自己的主审核组件）
- 状态：`selectedPersonaId`、`focusOnly`，通过 `useRouter().replace()` 同步到 URL（`?personaId=...&focus=1`），不触发 server 重新拉数据

## 4. 角色列表（PersonaSidebar）

### 4.1 结构

```
src/components/review/shared/persona-sidebar.tsx
src/components/review/shared/persona-card.tsx
src/components/review/shared/persona-list-summary.ts  // 纯函数：build / sort / filter
```

- 容器：`w-72 sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto`
- 头部（不滚动）：标题 + 搜索框 + 排序选择器 + 状态 chip
- 列表区：`PersonaCard[]`

### 4.2 PersonaCard 视觉

```
┌────────────────────────────────────────┐
│ 周进                          ⚠ 3      │  ← 姓名 + 冲突徽标（仅有冲突时）
│ 字蒙夜 · 别名 周老爹 +1                 │  ← 别名（最多两个 + "…+N"）
│ 首章 第2回                             │
│ ────────────────────────────────────── │
│ 事迹 24  关系 8  待审 5                │  ← tabular-nums，待审=PENDING+CONFLICTED
└────────────────────────────────────────┘
```

- 高度约 `h-24`，圆角 `rounded-lg`，外边框 `border`
- 选中：`ring-2 ring-primary` + `bg-primary/5`
- 悬停：`hover:bg-accent`
- 整体是 `<button type="button">`，`aria-pressed={isSelected}`

### 4.3 排序与筛选

- 默认排序：`firstChapterNo` 升序（叙事顺序）
- 可选：`待审优先`（pendingClaimCount 降序）/ `事迹数`（totalEventCount 降序）
- 搜索：匹配 `displayName` + `aliases`，大小写不敏感
- 状态 chip 多选：`待审核`、`冲突`、`已完成`，分别基于 pendingClaimCount>0 / totalConflictCount>0 / 二者皆为 0

### 4.4 数据来源

`PersonaListItem` 由前端纯函数从 `PersonaChapterMatrixDto` 构造：

```ts
export interface PersonaListItem {
  personaId         : string;
  displayName       : string;
  aliases           : string[];
  firstChapterNo    : number | null;
  totalEventCount   : number;
  totalRelationCount: number;
  totalConflictCount: number;
  pendingClaimCount : number;  // 由 cells[].reviewStateSummary 聚合
}

export function buildPersonaListItems(matrix: PersonaChapterMatrixDto): PersonaListItem[];
export function sortPersonaListItems(items: PersonaListItem[], by: PersonaSortKey): PersonaListItem[];
export function filterPersonaListItems(
  items: PersonaListItem[],
  keyword: string,
  statusFilters: PersonaStatusFilter[]
): PersonaListItem[];
```

关系页与时间页的 server page 多并行拉一次 `getPersonaChapterMatrix({bookId})` 来构造 `PersonaListItem[]`，避免新增 API。

### 4.5 性能

百级角色规模下直接渲染 + `React.memo`；超过 200 时再考虑窗口化（接口预留）。

## 5. 主区联动（混合模式）

### 5.1 矩阵页（persona-chapter）

`PersonaChapterReviewPage` 新增 prop `selectedPersonaId | null`、`focusOnly: boolean`。

**高亮模式（`focusOnly=false`，默认）**

- `MatrixGrid` 接收 `highlightedPersonaId`
- 选中列：列头 `bg-primary/10 ring-1 ring-primary/40`；列内 cell 加 `border-x border-primary/30`
- `useEffect([selectedPersonaId])` → 计算 `selectedColumnIndex * columnWidth` 并写入 `scrollLeft`，复用现有 scroller 通道
- 全局视野不丢

**筛选模式（`focusOnly=true`）**

- `filterMatrixByPersonaKeyword` 之后追加 `filterMatrixByPersonaId(matrix, selectedPersonaId)`
- 矩阵退化为单列；列头放大（`min-w-72`），展示别名、首章、合并候选等额外信息
- 工具栏出现橙色提示条："仅显示「周进」相关单元格 · [清除聚焦]"

**工具栏调整 (`matrix-toolbar.tsx`)**

- 移除"搜索人物"输入（迁移到 sidebar）
- 新增 `<FocusOnlySwitch>`（shadcn `<Switch>`），`disabled={selectedPersonaId === null}`
- 保留：审核状态、冲突状态、跳转章节、重置、统计芯片

### 5.2 关系页（relation-editor）

- `RelationEditorPage` 新增 `selectedPersonaId`、`focusOnly`
- 高亮：`relation-pair-list` 中包含该 persona 的 pair 加 `bg-primary/5`，并 `scrollIntoView` 第一个匹配项
- 筛选：`pairSummaries.filter(p => p.fromPersonaId === id || p.toPersonaId === id)`
- 工具栏放置同样的开关与提示条

### 5.3 时间页（persona-time）

- `PersonaTimeReviewPage` 新增同样 props
- 高亮：选中 persona 列高亮 + 自动滚动
- 筛选：personas 单列保留；timeGroups/slices 不变

### 5.4 URL 同步

- `selectedPersonaId` → `?personaId=...`（与现有 query 同名同义）
- `focusOnly` → `?focus=1`（新字段）
- 通过 `router.replace` 仅前端 push，不触发 RSC 重新拉数据

### 5.5 空态衔接

- 角色搜索未命中 → sidebar 内 `<EmptyState>`
- 选中角色但矩阵中无 cell（极端：0 事迹）→ 主区 `<EmptyState>`：`"周进 在当前筛选下没有事迹/关系/冲突。可清除聚焦或调整状态筛选。"`

## 6. 数据契约（无后端改动）

| 现有 API | 用途 | 改动 |
|---|---|---|
| `reviewQueryService.getPersonaChapterMatrix` | matrix 页主数据 + 三页 sidebar 来源 | 无 |
| `reviewQueryService.getRelationEditorView` | 关系页主数据 | 无 |
| `reviewQueryService.getPersonaTimeMatrix` | 时间页主数据 | 无 |
| `listBooks` | 顶部书籍选择器 | 无 |

关系/时间页的 server page 各自多并行拉一次 `getPersonaChapterMatrix({bookId})`，仅取其 `personas` 维度构造 sidebar 数据，是可接受的额外查询成本。

## 7. 文件改动清单

### 7.1 新增

```
src/components/review/shared/
  review-workbench-shell.tsx
  review-workbench-shell.test.tsx
  book-selector.tsx
  book-selector.test.tsx
  persona-sidebar.tsx
  persona-sidebar.test.tsx
  persona-card.tsx
  persona-card.test.tsx
  persona-list-summary.ts
  persona-list-summary.test.ts
  focus-only-switch.tsx
  focus-only-switch.test.tsx
```

### 7.2 修改

| 文件 | 改动概述 |
|---|---|
| `src/app/admin/review/[bookId]/page.tsx` | 删除内联 `<aside>` 书籍栏；用 `<ReviewWorkbenchShell mode="matrix">` 包裹；传入 `personas` 与初始 matrix；解析 `?focus=` |
| `src/app/admin/review/[bookId]/relations/page.tsx` | 同上；并行拉 matrix 摘要构造 personas |
| `src/app/admin/review/[bookId]/time/page.tsx` | 同上；并行拉 matrix 摘要构造 personas |
| `src/components/review/persona-chapter-matrix/persona-chapter-review-page.tsx` | 新 prop `selectedPersonaId / focusOnly`；新增 `filterMatrixByPersonaId`；URL 同步收敛到 shell |
| `src/components/review/persona-chapter-matrix/matrix-toolbar.tsx` | 移除"搜索人物"；接入 `<FocusOnlySwitch>` 与提示条 |
| `src/components/review/persona-chapter-matrix/matrix-grid.tsx` | `highlightedPersonaId` 列高亮；`scrollLeft` 自动定位 |
| `src/components/review/persona-chapter-matrix/matrix-cell.tsx` | `data-highlighted` 状态边框 |
| `src/components/review/relation-editor/relation-editor-page.tsx` | 接收 selected/focus；pair list 高亮+筛选 |
| `src/components/review/relation-editor/relation-pair-list.tsx` | 渲染高亮态 |
| `src/components/review/persona-time-matrix/persona-time-review-page.tsx` | 同矩阵页：高亮+筛选 |
| `src/components/review/persona-time-matrix/time-matrix-grid.tsx` | 列高亮 + scroll 定位 |

### 7.3 不动

- `src/app/admin/books/[id]/review-center/page.tsx`（迁移提示页）
- `src/components/review/shared/review-mode-nav.tsx`
- 所有 evidence-panel / cell-drilldown-sheet / claim-action-panel 系列

## 8. 测试策略

- **纯函数**：`persona-list-summary.test.ts` —— build / sort / filter 全分支
- **组件单测**：
  - `persona-card.test.tsx`：姓名、别名、计数、冲突徽标、选中态
  - `persona-sidebar.test.tsx`：搜索过滤、排序切换、chip 多选、空态、`onSelect` 回调
  - `book-selector.test.tsx`：下拉、搜索、当前书高亮
  - `focus-only-switch.test.tsx`：禁用态、回调
- **集成测试**：
  - `review-workbench-shell.test.tsx`：选中角色 → URL 同步 + 高亮 + focus 开关切换
  - 更新 `persona-chapter-review-page.test.tsx`：高亮模式 / 筛选模式
  - 更新 `relation-editor-page.test.tsx`、`persona-time-review-page.test.tsx`：同上
- **覆盖率门槛**：维持 90% 行覆盖率

## 9. 落地分阶段

1. 共享组件与纯函数（无 UI 集成压力，先合入）
2. matrix 页接入 → 视觉与交互验证（用 `05562920-129d-49b6-bdd4-22f03bdd6bf1` 验收）
3. relations 页接入
4. time 页接入
5. 删除三个 page 重复的 `<aside>` 与样板代码

## 10. 风险与对策

| 风险 | 对策 |
|---|---|
| 角色 > 200 时 sidebar 性能 | `React.memo` + 简单滚动；预留 windowing 接口 |
| 关系/时间页 DTO 缺 `firstChapterNo` 等字段 | server page 并行拉 matrix 摘要，统一构造 `PersonaListItem[]` |
| URL 字段冲突 | 复用 `personaId`；`focus` 是新字段 |
| 角色未在矩阵中 | matrix 摘要的 personas 来源是 evidence，覆盖完整；缺漏时 sidebar 项 disabled |
| 三页同步重构工作量 | 分阶段落地（第 9 节），每阶段独立可上线 |

## 11. 验证标准（DoD）

- 三页都展示左侧角色列表，且角色卡片包含别名、首章、计数、待审/冲突状态
- 顶部书籍选择器替代旧 w-44 书籍栏，主区获得更多水平空间
- 选中角色：默认列高亮且自动滚动到可见区域；开关"只看当前角色"后退化为单列
- 角色搜索/排序/状态 chip 与 URL `?personaId=&focus=` 同步
- 既有矩阵单元格 / 关系编辑 / 时间钻取交互保持向后兼容
- `pnpm lint && pnpm type-check && pnpm test` 全绿，覆盖率不下降
