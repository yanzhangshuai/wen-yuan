---
stage: growth
---

# 知识库管理台 UI 契约

> 适用范围：`src/app/admin/knowledge-base/**` 下的导航、批量操作工具栏、确认/输入弹窗。

## Scenario: Server Layout + Client Navigation Boundary

### 1. Scope / Trigger

- Trigger: 修改 `src/app/admin/knowledge-base/layout.tsx` 与 `knowledge-base-nav.tsx` 的 props、图标、active 状态或导航链接。
- 这是 Next.js RSC 边界：Server Component 可以渲染 Client Component，但传入 props 必须是可序列化 plain data，不能包含 React component、函数、class instance 或带方法对象。

### 2. Signatures

Server layout 只能传 `KnowledgeBaseNavLink`：

```ts
export interface KnowledgeBaseNavLink {
  href: string;
  label: string;
  iconKey: KnowledgeBaseNavIconKey;
}
```

Client nav 在本地解析图标：

```ts
const knowledgeBaseNavIcons: Record<KnowledgeBaseNavIconKey, LucideIcon> = {
  overview: BookMarked,
  "book-type": BookOpenText
};
```

### 3. Contracts

- `layout.tsx` 保持 Server Component，不为读取 pathname 整体加 `"use client"`。
- `knowledge-base-nav.tsx` 是唯一读取 `usePathname()` 的客户端边界。
- 总览页必须精确匹配 `/admin/knowledge-base`。
- 子页面使用前缀匹配，如 `/admin/knowledge-base/surnames`。
- active 链接必须设置 `aria-current="page"`。

### 4. Validation & Error Matrix

| Case | Required Behavior | Regression Test |
|------|-------------------|-----------------|
| Server props 包含 icon component | Next.js 抛出 “Only plain objects can be passed to Client Components” | `layout.test.tsx` 必须断言不存在函数型 `icon` prop |
| 总览页路径 | 只高亮“总览” | `knowledge-base-nav.test.tsx` 精确匹配 |
| 子页面路径 | 只高亮对应子模块，不高亮“总览” | `knowledge-base-nav.test.tsx` 前缀匹配 |
| 新增导航项 | 必须新增 `KnowledgeBaseNavIconKey` 与 icon map 项 | TypeScript `satisfies ReadonlyArray<KnowledgeBaseNavLink>` 兜底 |

### 5. Wrong vs Correct

Wrong:

```tsx
const links = [
  { href: "/admin/knowledge-base/surnames", label: "姓氏词库", icon: UserRoundSearch }
];

<KnowledgeBaseNav links={links} />;
```

Correct:

```tsx
const links = [
  { href: "/admin/knowledge-base/surnames", label: "姓氏词库", iconKey: "surname" }
] as const satisfies ReadonlyArray<KnowledgeBaseNavLink>;
```

原因：React component 本质上是函数，不能从 Server Component 作为 props 透传给 Client Component；使用 `iconKey` 可把跨边界数据保持为字符串。

## Scenario: Batch Action Controls

### 1. Scope / Trigger

- Trigger: 给知识库表格新增批量操作、修改 `BatchActionControls`、调整书籍类型选择、替换原生 `confirm()` / `prompt()`。
- 批量工具栏是交互状态机，必须把选择状态、异步请求、确认弹窗生命周期放在同一组件边界内。

### 2. Signatures

```ts
export interface BatchActionControlsProps {
  selectedCount: number;
  bookTypes: Array<{ id: string; name: string }>;
  onEnable: () => Promise<void>;
  onDisable: () => Promise<void>;
  onDelete: () => Promise<void>;
  onClear: () => void;
  onChangeBookType: (bookTypeId: string | null) => Promise<void>;
}
```

`SelectItem` 的全局/无豁免选项必须使用稳定 sentinel：

```ts
export const GLOBAL_BOOK_TYPE_VALUE = "__GLOBAL_BOOK_TYPE__";
```

### 3. Contracts

- `selectedCount <= 0` 时不渲染工具栏。
- 启用、停用、删除、设置书籍类型都必须在 pending 期间禁用按钮。
- 删除必须走 `AlertDialog`，不能使用原生 `confirm()`。
- 设置书籍类型必须走 `Dialog + Select`，不能使用原生 `prompt()`。
- `GLOBAL_BOOK_TYPE_VALUE` 提交前必须转换为 `null`。
- 异步操作成功后才关闭弹窗；失败时保留弹窗或选择上下文，方便重试。
- 页面级 `runBatchAction` 捕获错误后必须 toast，并重新抛出错误给 `BatchActionControls`，让控件知道本次操作失败。

### 4. Good / Base / Bad Cases

Good case:

```tsx
<BatchActionControls
  selectedCount={selected.size}
  bookTypes={bookTypes}
  onChangeBookType={(bookTypeId) => runBatchAction({
    action: "changeBookType",
    ids: Array.from(selected),
    bookTypeId
  }, "已更新书籍类型")}
/>
```

Base case:

```tsx
<SelectItem value={GLOBAL_BOOK_TYPE_VALUE}>通用</SelectItem>
```

Bad case:

```tsx
// Radix Select 不允许空字符串作为业务值。
<SelectItem value="">通用</SelectItem>
```

### 5. Tests Required

- `batch-action-controls.test.tsx` 必须覆盖 `GLOBAL_BOOK_TYPE_VALUE -> null`。
- 必须覆盖异步操作未完成前按钮 pending 与弹窗保持打开。
- 必须覆盖删除确认框成功后关闭。
- 页面级批量操作测试应覆盖失败 toast 与选择状态不提前清空。
- 新增或调整导航 props 时必须跑 `layout.test.tsx` 和 `knowledge-base-nav.test.tsx`。

## 落地参考

- `src/app/admin/knowledge-base/layout.tsx`
- `src/app/admin/knowledge-base/knowledge-base-nav.tsx`
- `src/app/admin/knowledge-base/batch-action-controls.tsx`
- `src/app/admin/knowledge-base/surnames/page.tsx`
- `.trellis/spec/backend/knowledge-base-batch-ops.md`
