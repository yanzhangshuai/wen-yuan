# 多选框主题适配 + 书籍信息增强 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复四个主题下多选框不可见问题，并在书籍导入向导和书籍详情页补充缺失的书籍信息。

**Architecture:** 
1. Task A 是纯前端样式修复：在 Checkbox 组件添加 `bg-muted/20` 背景，并替换导入页的原生 checkbox。
2. Task B 是全栈扩展：后端 DTO 新增 `lastArchitecture` 字段，前端展示该字段；导入向导添加内联书籍信息条。

**Tech Stack:** Next.js App Router, React 19, TypeScript strict, Tailwind CSS v4, Radix UI, Prisma 7

---

## 前置检查

在开始任何修改前，先确认环境就绪：

```bash
cd /home/mwjz/code/wen-yuan
pnpm type-check   # 确认当前无类型错误
pnpm lint         # 确认当前无 lint 错误
```

---

## Task A：多选框可见性增强

### 文件清单
- Modify: `src/components/ui/checkbox.tsx`
- Modify: `src/app/admin/books/import/page.tsx`

---

### A-1：增强 Checkbox 组件未选中状态背景

**目标：** 在未选中状态下添加 `bg-muted/20`，使边框在四个主题下均可见。

- [ ] 打开 `src/components/ui/checkbox.tsx`

- [ ] 找到 `className={cn(` 所在行，将 `"peer border-border"` 改为 `"peer border-border bg-muted/20"`

  修改前（完整 className 字符串开头）：
  ```
  "peer border-border data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground ...
  ```
  修改后：
  ```
  "peer border-border bg-muted/20 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground ...
  ```

  > 注意：`data-[state=checked]:bg-primary` 会覆盖 `bg-muted/20`，选中状态不受影响。

- [ ] 更新文件注释，在维护说明中补充一行：
  ```
  * - `bg-muted/20` 为未选中状态提供轻量背景填充，提升四个主题下的边框对比度。
  ```

- [ ] 运行 `pnpm type-check` 确认无类型错误

- [ ] 提交：`fix(ui): enhance Checkbox unchecked visibility with bg-muted/20`

---

### A-2：替换导入向导第 3 步原生 checkbox

**目标：** 将 `src/app/admin/books/import/page.tsx` step 3 "CHAPTER_LIST" 模式的原生 `<input type="checkbox">` 替换为 `<Checkbox>` 组件。

- [ ] 打开 `src/app/admin/books/import/page.tsx`

- [ ] 确认文件顶部已有 `import { Checkbox } from "@/components/ui/checkbox";`
  - 若无，在其他 UI 组件 import 附近添加该行

- [ ] 找到以下代码块（在 `scope === "CHAPTER_LIST"` 条件渲染内）：
  ```tsx
  <input
    type="checkbox"
    aria-label={`选择 ${item.title}`}
    checked={selectedChapterIndices.has(item.index)}
    onChange={(e) => {
      setSelectedChapterIndices(prev => {
        const next = new Set(prev);
        if (e.target.checked) {
          next.add(item.index);
        } else {
          next.delete(item.index);
        }
        return next;
      });
    }}
  />
  ```

- [ ] 将其替换为：
  ```tsx
  <Checkbox
    aria-label={`选择 ${item.title}`}
    checked={selectedChapterIndices.has(item.index)}
    onCheckedChange={(checked) => {
      setSelectedChapterIndices(prev => {
        const next = new Set(prev);
        if (checked) {
          next.add(item.index);
        } else {
          next.delete(item.index);
        }
        return next;
      });
    }}
  />
  ```
  
  > 注意：Radix Checkbox 使用 `onCheckedChange` 而非 `onChange`；`checked` 参数类型为 `boolean | "indeterminate"`，直接用 truthy 判断即可。

- [ ] 运行 `pnpm type-check` 确认类型正确

- [ ] 运行 `pnpm lint` 确认无 lint 错误

- [ ] 提交：`fix(import): replace native checkbox with Checkbox component in step 3`

---

### A-3：全局搜索确认无其他原生 checkbox 残留

- [ ] 执行搜索：
  ```bash
  grep -rn 'type="checkbox"' src/app/admin --include="*.tsx"
  ```
  
- [ ] 若有其他原生 checkbox，逐一替换（参照 A-2 模式）

- [ ] 若无，跳过此步骤

---

## Task B：书籍信息增强

### 文件清单
- Modify: `src/types/book.ts`
- Modify: `src/server/modules/books/getBookById.ts`
- Test: `src/server/modules/books/getBookById.test.ts`
- Modify: `src/app/admin/books/[id]/page.tsx`
- Modify: `src/app/admin/books/import/page.tsx`

---

### B-1：扩展 BookLibraryListItem 类型添加 lastArchitecture

**目标：** 在共享类型文件中添加新字段，让前后端对字段语义达成一致。

- [ ] 打开 `src/types/book.ts`

- [ ] 找到 `currentModel` 字段定义，在其后面添加 `lastArchitecture`：
  ```ts
  /** 当前生效模型名称（可空），用于回溯分析结果来源。 */
  currentModel    : string | null;
  /** 最后一次解析架构（null = 从未解析过）。 */
  lastArchitecture: "sequential" | "twopass" | null;
  /** 最近错误摘要（可空），用于列表层快速诊断失败原因。 */
  lastErrorSummary: string | null;
  ```

- [ ] 运行 `pnpm type-check`，此时会出现类型错误（因为 `getBookById.ts` 还未映射该字段），记录错误位置

---

### B-2：getBookById 查询并映射 lastArchitecture

**目标：** 后端查询 `analysisJobs.architecture`，映射到 DTO 的 `lastArchitecture` 字段。

- [ ] 打开 `src/server/modules/books/getBookById.ts`

- [ ] 在 `BookDetailRow` 接口的 `analysisJobs` 数组类型中，添加 `architecture` 字段：
  ```ts
  analysisJobs: Array<{
    updatedAt   : Date;
    finishedAt  : Date | null;
    errorLog    : string | null;
    architecture: string;        // ← 新增
    phaseLogs   : Array<{...}>;
  }>;
  ```

- [ ] 在 Prisma 查询的 `analysisJobs.select` 中，添加 `architecture: true`：
  ```ts
  analysisJobs: {
    take   : 1,
    orderBy: { updatedAt: "desc" },
    select : {
      updatedAt   : true,
      finishedAt  : true,
      errorLog    : true,
      architecture: true,     // ← 新增
      phaseLogs   : { ... }
    }
  }
  ```

- [ ] 在 `mapBookDetail` 函数中，提取 `lastArchitecture` 并返回：
  ```ts
  const rawArchitecture = book.analysisJobs?.[0]?.architecture ?? null;
  const lastArchitecture = rawArchitecture === "twopass" ? "twopass" : rawArchitecture === "sequential" ? "sequential" : null;
  
  return {
    // ...existing fields...
    currentModel,
    lastArchitecture,   // ← 新增
    lastErrorSummary,
    // ...
  };
  ```

- [ ] 运行 `pnpm type-check` 确认类型错误已消除

---

### B-3：更新 getBookById 单元测试

**目标：** 在测试中覆盖 `lastArchitecture` 字段的映射逻辑。

- [ ] 打开 `src/server/modules/books/getBookById.test.ts`

- [ ] 找到现有测试用例中的 mock 数据，在 `analysisJobs` mock 数据中加入 `architecture: "sequential"` 字段

- [ ] 在返回值断言中，添加 `lastArchitecture: "sequential"` 验证

- [ ] 新增测试用例：当 `analysisJobs` 为空时，`lastArchitecture` 应为 `null`

- [ ] 新增测试用例：当 `architecture` 为 `"twopass"` 时，`lastArchitecture` 应为 `"twopass"`

- [ ] 运行测试：
  ```bash
  npx vitest run src/server/modules/books/getBookById.test.ts
  ```
  确认全部通过

---

### B-4：书籍详情页展示解析架构

**目标：** 在书籍详情页已有的元数据行（author/dynasty/currentModel）中，追加 `lastArchitecture` 的展示。

- [ ] 打开 `src/app/admin/books/[id]/page.tsx`

- [ ] 找到显示 `currentModel` 的那行：
  ```tsx
  {book.currentModel && <span>当前模型：{book.currentModel}</span>}
  ```

- [ ] 在其后追加：
  ```tsx
  {book.lastArchitecture && (
    <span>解析架构：{book.lastArchitecture === "sequential" ? "顺序式" : "两遍式"}</span>
  )}
  ```

- [ ] 运行 `pnpm type-check` 确认无类型错误

---

### B-5：导入向导添加当前书籍信息条

**目标：** 在步骤 2/3/4 的内容区上方，添加一个显示当前书籍标题的信息条，让管理员在多步骤操作中始终知道自己在操作哪本书。

- [ ] 打开 `src/app/admin/books/import/page.tsx`

- [ ] 找到步骤指示器的结束位置（`</div>` 关闭步骤指示器），在其后、步骤内容区 `<div className="space-y-6">` 之前，插入：
  ```tsx
  {/* 当前书籍信息条：步骤 2/3/4 保持上下文，避免多步骤操作中迷失 */}
  {step > 1 && createdBook && (
    <div className="flex items-center gap-2 px-4 py-2.5 rounded-md bg-muted/30 border border-border text-sm">
      <BookOpen size={14} className="text-muted-foreground shrink-0" />
      <span className="text-muted-foreground">当前书籍：</span>
      <strong className="text-foreground">《{createdBook.title}》</strong>
    </div>
  )}
  ```
  
  > 确认顶部已有 `import { BookOpen } from "lucide-react"`（文件中应已存在，若无则添加）

- [ ] 运行 `pnpm type-check` 和 `pnpm lint` 确认无错误

---

### B-6：最终验证

- [ ] 运行全量类型检查：
  ```bash
  pnpm type-check
  ```

- [ ] 运行全量 lint：
  ```bash
  pnpm lint
  ```

- [ ] 运行书籍相关测试：
  ```bash
  npx vitest run src/server/modules/books/
  ```

- [ ] 提交：`feat(books): add lastArchitecture to DTO, show in detail + import wizard`

---

## 最终提交总结

| 提交 | 内容 |
|------|------|
| `fix(ui): enhance Checkbox unchecked visibility with bg-muted/20` | A-1 |
| `fix(import): replace native checkbox with Checkbox component in step 3` | A-2 |
| `feat(books): add lastArchitecture to DTO, show in detail + import wizard` | B-1 到 B-5 |

共 3 次提交，每次独立可验证。
