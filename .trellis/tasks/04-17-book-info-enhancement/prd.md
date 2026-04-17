# feat: 书籍详情显示解析架构 + 导入向导持久书籍信息条

## Goal

1. 扩展 `getBookById` DTO，添加 `lastArchitecture` 字段，在书籍详情页元数据区展示最后一次解析所用的架构（顺序式/两遍式）。
2. 导入向导第 2/3/4 步顶部添加"当前书籍"信息条，让管理员在多步骤操作中始终保持上下文。

## What I already know

- `analysis_jobs` 表已有 `architecture` 字段（`schema.prisma` line 377），默认值 `"sequential"`。
- `getBookById.ts` 当前 `analysisJobs.select` 中未查询该字段，`mapBookDetail` 未映射。
- `BookLibraryListItem` 类型中无 `lastArchitecture` 字段，需新增。
- 导入向导 `createdBook` 状态只有 `{ id, title }` 两个字段，足够用于显示书名信息条。
- 步骤 2 的 CardDescription 里已有 `《{createdBook?.title}》`，但位置不突出；步骤 3/4 无任何书籍上下文。

## Assumptions

- `lastArchitecture: null` 表示该书籍从未分析过，前端条件渲染不显示该字段。
- 信息条不需要抽取为独立组件，保持内联 JSX 即可（遵循 YAGNI）。
- `BookOpen` 图标已在 import/page.tsx 的 lucide-react 导入中（如不在则添加）。

## Requirements

### 后端（getBookById）
- `analysisJobs.select` 新增 `architecture: true`
- `BookDetailRow` 接口的 `analysisJobs` 类型中加 `architecture: string`
- `mapBookDetail` 新增 `lastArchitecture` 映射（白名单安全转换）
- `BookLibraryListItem` 新增 `lastArchitecture: "sequential" | "twopass" | null`

### 书籍详情页（`/admin/books/[id]/page.tsx`）
- 在 `currentModel` 同行追加 `lastArchitecture` 显示
- 中文映射：`sequential` → "顺序式"，`twopass` → "两遍式"

### 导入向导（`/admin/books/import/page.tsx`）
- 步骤 2/3/4 顶部显示：`当前书籍：《{createdBook.title}》`
- 条件：`step > 1 && createdBook` 时渲染
- 样式：`bg-muted/30 border border-border`，小字，带 BookOpen 图标

## Acceptance Criteria

- [ ] 书籍详情页显示"解析架构：顺序式"或"解析架构：两遍式"
- [ ] 从未解析的书籍，详情页不显示该行
- [ ] 导入向导步骤 2/3/4 均有当前书籍信息条
- [ ] `getBookById.test.ts` 覆盖 lastArchitecture 为 null 和 "sequential"/"twopass" 的场景
- [ ] `pnpm type-check` 通过
- [ ] `pnpm lint` 通过
- [ ] `npx vitest run src/server/modules/books/` 全部通过

## Definition of Done

- 代码修改完毕，3 个测试场景覆盖
- 手动验证：详情页、导入向导步骤 3 均有预期信息

## Out of Scope

- 不修改 `startBookAnalysis.ts` 的架构处理逻辑
- 不在列表页显示架构信息
- 不修改 Checkbox 组件（另一个任务）

## Technical Notes

### B-1: types/book.ts 变更
在 `currentModel: string | null;` 下方插入：
```ts
/** 最后一次解析架构（null = 从未解析过）。 */
lastArchitecture: "sequential" | "twopass" | null;
```

### B-2: getBookById.ts 变更

**BookDetailRow 接口**（`analysisJobs` 数组类型）新增：
```ts
architecture: string;
```

**Prisma 查询**（`analysisJobs.select`）新增：
```ts
architecture: true,
```

**mapBookDetail** 新增（在 `currentModel` 提取后）：
```ts
const rawArch = book.analysisJobs?.[0]?.architecture ?? null;
const lastArchitecture: "sequential" | "twopass" | null =
  rawArch === "twopass" ? "twopass" : rawArch === "sequential" ? "sequential" : null;
```

在返回对象中添加 `lastArchitecture,`。

### B-3: getBookById.test.ts 变更

找到现有 mock 的 `analysisJobs` 数组，在每个元素中加 `architecture: "sequential"`。在断言中加 `lastArchitecture: "sequential"`。

新增两个测试用例：
1. `analysisJobs: []` → `lastArchitecture: null`
2. `analysisJobs: [{ architecture: "twopass", ... }]` → `lastArchitecture: "twopass"`

### B-4: books/[id]/page.tsx 变更

在 `{book.currentModel && <span>...}` 后插入：
```tsx
{book.lastArchitecture && (
  <span>解析架构：{book.lastArchitecture === "sequential" ? "顺序式" : "两遍式"}</span>
)}
```

### B-5: import/page.tsx 变更

在步骤指示器结束处（`</div>` 关闭步骤导航）与内容区 `<div className="space-y-6">` 之间插入：
```tsx
{step > 1 && createdBook && (
  <div className="flex items-center gap-2 px-4 py-2.5 rounded-md bg-muted/30 border border-border text-sm">
    <BookOpen size={14} className="text-muted-foreground shrink-0" />
    <span className="text-muted-foreground">当前书籍：</span>
    <strong className="text-foreground">《{createdBook.title}》</strong>
  </div>
)}
```

确认 `BookOpen` 在 lucide-react import 中，若无则加入。

## 参考计划文档

`docs/superpowers/plans/2026-04-17-checkbox-book-info-plan.md` — Task B 部分（B-1 至 B-6）
