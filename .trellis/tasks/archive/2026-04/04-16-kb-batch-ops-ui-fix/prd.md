# 知识库前端增强 — 批量操作 + 原生对话框替换 + 侧边栏 Active 高亮

**创建日期**：2026-04-16  
**执行人**：codex-agent  
**优先级**：P1  
**前置任务**：`04-16-kb-model-generation`（需先完成）  
**设计文档**：`docs/superpowers/specs/2026-04-16-knowledge-base-enhancements-design.md`（任务 2 部分）

---

## 背景

知识库管理后台存在三类前端问题：

1. **侧边栏无 active 高亮**：`layout.tsx` 中 `NavLink` 不感知当前路径
2. **9 处原生对话框**：`confirm()` × 7 + `prompt()` × 2，需替换为 UI 组件
3. **批量操作缺失**：4 个模块只有逐条操作，缺少批量删除/启用/停用/改书籍类型

---

## Part A：侧边栏 Active 高亮

### Step A1：修改 `src/app/admin/knowledge-base/layout.tsx`

将 `NavLink` 改为 client 组件（或将整个 layout 标记为 `"use client"`）以使用 `usePathname()`。

```typescript
"use client";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  // 总览页精确匹配；子页面前缀匹配
  const isActive = href === "/admin/knowledge-base"
    ? pathname === href
    : pathname.startsWith(href);

  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted hover:text-foreground",
        isActive ? "bg-muted text-foreground font-medium" : "text-muted-foreground"
      )}
    >
      {children}
    </Link>
  );
}
```

---

## Part B：原生对话框替换（9 处）

项目已有 `src/components/ui/alert-dialog.tsx`（基于 Radix UI）和 `src/components/ui/dialog.tsx`。

### 替换清单

| 文件 | 行 | 类型 | 替换方案 |
|------|----|------|---------|
| `surnames/page.tsx` | 133 | `confirm` | AlertDialog（deleteTarget state） |
| `title-filters/page.tsx` | 124 | `confirm` | AlertDialog（deleteTarget state） |
| `ner-rules/page.tsx` | 133 | `confirm` | AlertDialog（deleteTarget state） |
| `prompt-extraction-rules/page.tsx` | 148 | `confirm` | AlertDialog（deleteTarget state） |
| `book-types/page.tsx` | 79 | `confirm` | AlertDialog（deleteTarget state） |
| `alias-packs/page.tsx` | 396 | `confirm` | AlertDialog（deletePackTarget state） |
| `alias-packs/page.tsx` | 688 | `confirm` | AlertDialog（deleteEntryTarget state） |
| `alias-packs/page.tsx` | 652 | `prompt` | RejectNoteDialog（mode="single"） |
| `alias-packs/page.tsx` | 676 | `prompt` | RejectNoteDialog（mode="batch"） |

---

### Step B1：修复 5 个独立页面的 `confirm()` → AlertDialog

**适用文件**：`surnames`, `title-filters`, `ner-rules`, `prompt-extraction-rules`, `book-types`

每个文件统一步骤：

1. 在 imports 中增加 AlertDialog 组件：
```typescript
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
```

2. 在组件 state 中新增（以 surnames 为例）：
```typescript
const [deleteTarget, setDeleteTarget] = useState<SurnameItem | null>(null);
```

3. 将原删除函数中的 `if (!confirm(...)) return;` 改为 `setDeleteTarget(item)` 触发弹框，函数本身变为 `handleDeleteConfirmed(item: SurnameItem)`（无 confirm 前置）。

4. 原删除按钮 `onClick` 改为 `() => setDeleteTarget(item)`。

5. 在 JSX 末尾追加 AlertDialog：
```tsx
<AlertDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>确认删除</AlertDialogTitle>
      <AlertDialogDescription>
        确定删除「{deleteTarget?.surname /* 或 .title / .content 等 */}」吗？此操作不可恢复。
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>取消</AlertDialogCancel>
      <AlertDialogAction
        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
        onClick={() => { if (deleteTarget) void handleDeleteConfirmed(deleteTarget); }}
      >
        删除
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

各文件的 `deleteTarget` 字段名与描述文字：
- `surnames/page.tsx`：`deleteTarget?.surname`，描述"确定删除姓氏「X」吗？"
- `title-filters/page.tsx`：`deleteTarget?.title`，描述"确定删除称谓「X」吗？"
- `ner-rules/page.tsx`：描述"确定删除该词典规则吗？"
- `prompt-extraction-rules/page.tsx`：描述"确定删除该 Prompt 规则吗？"
- `book-types/page.tsx`：`deleteTarget?.name`，描述"确定删除书籍类型「X」吗？"

---

### Step B2：修复 alias-packs 的 `confirm()` × 2

**文件**：`src/app/admin/knowledge-base/alias-packs/page.tsx`

新增两个 state：
```typescript
const [deletePackTarget, setDeletePackTarget]   = useState<KnowledgePackItem | null>(null);
const [deleteEntryTarget, setDeleteEntryTarget] = useState<KnowledgeEntryItem | null>(null);
```

将 line 396 的 `if (!confirm(...)) return;` 改为 `setDeletePackTarget(pack)` 触发弹框。
将 line 688 的 `if (!confirm("确定删除该条目？")) return;` 改为 `setDeleteEntryTarget(entry)` 触发弹框。

追加两个 AlertDialog：

```tsx
{/* 删除知识包确认 */}
<AlertDialog open={deletePackTarget !== null} onOpenChange={(open) => { if (!open) setDeletePackTarget(null); }}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>确认删除知识包</AlertDialogTitle>
      <AlertDialogDescription>
        确定删除知识包「{deletePackTarget?.name}」及其所有条目吗？此操作不可恢复。
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>取消</AlertDialogCancel>
      <AlertDialogAction
        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
        onClick={() => { if (deletePackTarget) void handleDeletePackConfirmed(deletePackTarget); }}
      >
        删除
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>

{/* 删除条目确认 */}
<AlertDialog open={deleteEntryTarget !== null} onOpenChange={(open) => { if (!open) setDeleteEntryTarget(null); }}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>确认删除条目</AlertDialogTitle>
      <AlertDialogDescription>确定删除该条目吗？此操作不可恢复。</AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>取消</AlertDialogCancel>
      <AlertDialogAction
        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
        onClick={() => { if (deleteEntryTarget) void handleDeleteEntryConfirmed(deleteEntryTarget); }}
      >
        删除
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

---

### Step B3：修复 alias-packs 的 `prompt()` × 2 → RejectNoteDialog

**文件**：`src/app/admin/knowledge-base/alias-packs/page.tsx`

**新增 state**：
```typescript
const [rejectNoteOpen, setRejectNoteOpen]   = useState(false);
const [rejectNoteMode, setRejectNoteMode]   = useState<"single" | "batch">("single");
const [rejectTargetId, setRejectTargetId]   = useState<string>("");
```

**修改 `handleReject`**（单条拒绝，line 651）：
```typescript
const handleReject = (id: string) => {
  setRejectTargetId(id);
  setRejectNoteMode("single");
  setRejectNoteOpen(true);
};
```

**修改 `handleBatchReject`**（批量拒绝，line 674）：
```typescript
const handleBatchReject = () => {
  if (selected.size === 0) return;
  setRejectNoteMode("batch");
  setRejectNoteOpen(true);
};
```

**新增 `handleRejectConfirmed`**（执行拒绝的实际逻辑）：
```typescript
const handleRejectConfirmed = async (note: string) => {
  setRejectNoteOpen(false);
  try {
    if (rejectNoteMode === "single") {
      await rejectEntry(rejectTargetId, note || undefined);
      toast({ title: "已拒绝" });
    } else {
      await batchRejectEntries(pack.id, Array.from(selected), note || undefined);
      toast({ title: `成功拒绝 ${selected.size} 条` });
      setSelected(new Set());
    }
    await refreshAll();
  } catch (e) {
    toast({ title: "操作失败", description: String(e), variant: "destructive" });
  }
};
```

**新增 inline 组件 `RejectNoteDialog`**（在文件末尾）：

```typescript
function RejectNoteDialog({
  open,
  mode,
  count,
  onConfirm,
  onOpenChange
}: {
  open        : boolean;
  mode        : "single" | "batch";
  count?      : number;
  onConfirm   : (note: string) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [note, setNote] = useState("");

  useEffect(() => {
    if (open) setNote("");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === "single" ? "拒绝条目" : `批量拒绝 ${count ?? ""} 条`}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-2">
          <Label>拒绝原因（可选）</Label>
          <Textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="可不填，直接点确认"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={() => onConfirm(note)}>确认拒绝</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**追加 JSX**：
```tsx
<RejectNoteDialog
  open={rejectNoteOpen}
  mode={rejectNoteMode}
  count={rejectNoteMode === "batch" ? selected.size : undefined}
  onConfirm={(note) => void handleRejectConfirmed(note)}
  onOpenChange={setRejectNoteOpen}
/>
```

---

## Part C：批量操作

### Step C1：后端服务层 — 新增批量函数

**4 个服务文件各新增 3 个函数**，以 `surnames.ts` 为例：

```typescript
export async function batchDeleteSurnames(ids: string[]): Promise<{ count: number }> {
  const result = await prisma.$transaction(
    ids.map((id) => prisma.surnameRule.delete({ where: { id } }))
  );
  return { count: result.length };
}

export async function batchToggleSurnames(ids: string[], isActive: boolean): Promise<{ count: number }> {
  const result = await prisma.$transaction(
    ids.map((id) => prisma.surnameRule.update({ where: { id }, data: { isActive } }))
  );
  return { count: result.length };
}

export async function batchChangeBookTypeSurnames(
  ids      : string[],
  bookTypeId: string | null   // null = 改为通用（无书籍类型归属）
): Promise<{ count: number }> {
  const result = await prisma.$transaction(
    ids.map((id) => prisma.surnameRule.update({ where: { id }, data: { bookTypeId } }))
  );
  return { count: result.length };
}
```

其余三个文件对应 Prisma model：
- `generic-titles.ts` → `prisma.genericTitleRule`
- `ner-lexicon-rules.ts` → `prisma.nerLexiconRule`
- `prompt-extraction-rules.ts` → `prisma.promptExtractionRule`

**注意**：执行前通过 `pnpm prisma:generate` 确认上述 model 名称，按实际 schema 定义为准。

---

### Step C2：更新 `src/server/modules/knowledge/index.ts`

新增导出：
```typescript
export { batchDeleteSurnames, batchToggleSurnames, batchChangeBookTypeSurnames } from "./surnames";
export { batchDeleteGenericTitles, batchToggleGenericTitles, batchChangeBookTypeGenericTitles } from "./generic-titles";
export { batchDeleteNerLexiconRules, batchToggleNerLexiconRules, batchChangeBookTypeNerLexiconRules } from "./ner-lexicon-rules";
export { batchDeletePromptExtractionRules, batchTogglePromptExtractionRules, batchChangeBookTypePromptExtractionRules } from "./prompt-extraction-rules";
```

---

### Step C3：更新 `src/app/api/admin/knowledge/_shared.ts`

追加 schema：

```typescript
export const knowledgeBatchActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("delete"),
    ids   : z.array(z.string().uuid()).min(1).max(500)
  }),
  z.object({
    action  : z.literal("enable"),
    ids     : z.array(z.string().uuid()).min(1).max(500)
  }),
  z.object({
    action  : z.literal("disable"),
    ids     : z.array(z.string().uuid()).min(1).max(500)
  }),
  z.object({
    action    : z.literal("changeBookType"),
    ids       : z.array(z.string().uuid()).min(1).max(500),
    bookTypeId: z.string().uuid().nullable()
  })
]);
```

---

### Step C4：新建 4 个 batch API routes

模板（以 surnames 为例），新建 `src/app/api/admin/knowledge/surnames/batch/route.ts`：

```typescript
import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import {
  batchDeleteSurnames,
  batchToggleSurnames,
  batchChangeBookTypeSurnames
} from "@/server/modules/knowledge";
import { ERROR_CODES } from "@/types/api";
import { badRequestJson, knowledgeBatchActionSchema } from "../../_shared";

const PATH = "/api/admin/knowledge/surnames/batch";

export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const parsed = knowledgeBatchActionSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return badRequestJson(PATH, requestId, startedAt, parsed.error.issues[0]?.message ?? "参数不合法");
    }

    const { action, ids } = parsed.data;
    let count: number;

    switch (action) {
      case "delete":
        ({ count } = await batchDeleteSurnames(ids));
        break;
      case "enable":
        ({ count } = await batchToggleSurnames(ids, true));
        break;
      case "disable":
        ({ count } = await batchToggleSurnames(ids, false));
        break;
      case "changeBookType":
        ({ count } = await batchChangeBookTypeSurnames(ids, parsed.data.bookTypeId));
        break;
    }

    return okJson({
      path: PATH, requestId, startedAt,
      code   : "ADMIN_SURNAME_BATCH_ACTION",
      message: `批量操作完成，影响 ${count} 条`,
      data   : { count }
    });
  } catch (error) {
    return failJson({ path: PATH, requestId, startedAt, error,
      fallbackCode: ERROR_CODES.COMMON_INTERNAL_ERROR, fallbackMessage: "批量操作失败" });
  }
}
```

按相同模板创建：
- `src/app/api/admin/knowledge/title-filters/batch/route.ts`（调用 `batchDeleteGenericTitles` 等）
- `src/app/api/admin/knowledge/ner-rules/batch/route.ts`（调用 `batchDeleteNerLexiconRules` 等）
- `src/app/api/admin/knowledge/prompt-extraction-rules/batch/route.ts`（调用 `batchDeletePromptExtractionRules` 等）

---

### Step C5：更新前端 lib/services 层（4 个文件）

以 `src/lib/services/surnames.ts` 为例，追加：

```typescript
export async function batchSurnameAction(body: {
  action    : "delete" | "enable" | "disable" | "changeBookType";
  ids       : string[];
  bookTypeId?: string | null;
}): Promise<{ count: number }> {
  return clientFetch<{ count: number }>("/api/admin/knowledge/surnames/batch", {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(body)
  });
}
```

其余三个文件对应函数名和 endpoint：
- `src/lib/services/title-filters.ts` → `batchGenericTitleAction` → `/api/admin/knowledge/title-filters/batch`
- `src/lib/services/ner-rules.ts` → `batchNerLexiconRuleAction` → `/api/admin/knowledge/ner-rules/batch`
- `src/lib/services/prompt-extraction-rules.ts` → `batchPromptExtractionRuleAction` → `/api/admin/knowledge/prompt-extraction-rules/batch`

---

### Step C6：前端页面层 — 4 个模块添加批量操作 UI

**适用页面**：`surnames`, `title-filters`, `ner-rules`, `prompt-extraction-rules`

每个页面统一改造步骤：

#### 6-1. 新增 selected state

```typescript
const [selected, setSelected] = useState<Set<string>>(new Set());
```

#### 6-2. 表格首列加 Checkbox

在 `<TableHeader>` 首列：
```tsx
<TableHead className="w-10">
  <Checkbox
    checked={items.length > 0 && selected.size === items.length}
    data-state={selected.size > 0 && selected.size < items.length ? "indeterminate" : undefined}
    onCheckedChange={(checked) => {
      setSelected(checked ? new Set(items.map((item) => item.id)) : new Set());
    }}
  />
</TableHead>
```

在每个 `<TableRow>` 首列：
```tsx
<TableCell>
  <Checkbox
    checked={selected.has(item.id)}
    onCheckedChange={(checked) => {
      setSelected((prev) => {
        const next = new Set(prev);
        checked ? next.add(item.id) : next.delete(item.id);
        return next;
      });
    }}
  />
</TableCell>
```

#### 6-3. 批量操作工具栏

在 filter 行与 table 之间（`selected.size > 0` 时才渲染）：

```tsx
{selected.size > 0 ? (
  <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
    <span className="text-sm text-muted-foreground">已选 {selected.size} 条</span>
    <div className="ml-auto flex flex-wrap gap-2">
      <Button size="sm" variant="outline" onClick={() => void handleBatchEnable()}>批量启用</Button>
      <Button size="sm" variant="outline" onClick={() => void handleBatchDisable()}>批量停用</Button>
      <Button size="sm" variant="outline" onClick={() => setBatchBookTypeOpen(true)}>批量改书籍类型</Button>
      <Button size="sm" variant="destructive" onClick={() => setBatchDeleteOpen(true)}>批量删除</Button>
      <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>清空选择</Button>
    </div>
  </div>
) : null}
```

#### 6-4. 批量操作 handlers

```typescript
async function handleBatchEnable() {
  await batchXxxAction({ action: "enable", ids: Array.from(selected) });
  toast({ title: `成功启用 ${selected.size} 条` });
  setSelected(new Set());
  void load();
}

async function handleBatchDisable() {
  await batchXxxAction({ action: "disable", ids: Array.from(selected) });
  toast({ title: `成功停用 ${selected.size} 条` });
  setSelected(new Set());
  void load();
}
```

#### 6-5. 批量改书籍类型 Dialog

新增 state：`batchBookTypeOpen`（boolean）、`batchBookTypeId`（string，sentinel `"__GLOBAL__"` 表示通用）

```tsx
<Dialog open={batchBookTypeOpen} onOpenChange={setBatchBookTypeOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>批量改书籍类型</DialogTitle>
    </DialogHeader>
    <div className="grid gap-2">
      <Label>目标书籍类型</Label>
      <Select value={batchBookTypeId} onValueChange={setBatchBookTypeId}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__GLOBAL__">通用（不绑定书籍类型）</SelectItem>
          {bookTypes.map((bt) => (
            <SelectItem key={bt.id} value={bt.id}>{bt.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
    <DialogFooter>
      <Button variant="outline" onClick={() => setBatchBookTypeOpen(false)}>取消</Button>
      <Button onClick={() => void handleBatchChangeBookType()}>确认</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

```typescript
async function handleBatchChangeBookType() {
  const bookTypeId = batchBookTypeId === "__GLOBAL__" ? null : batchBookTypeId;
  await batchXxxAction({ action: "changeBookType", ids: Array.from(selected), bookTypeId });
  toast({ title: `已更新 ${selected.size} 条的书籍类型归属` });
  setBatchBookTypeOpen(false);
  setSelected(new Set());
  void load();
}
```

#### 6-6. 批量删除 AlertDialog

新增 state：`batchDeleteOpen`（boolean）

```tsx
<AlertDialog open={batchDeleteOpen} onOpenChange={setBatchDeleteOpen}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>确认批量删除</AlertDialogTitle>
      <AlertDialogDescription>
        确定删除已选 {selected.size} 条吗？此操作不可恢复。
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>取消</AlertDialogCancel>
      <AlertDialogAction
        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
        onClick={() => void handleBatchDelete()}
      >
        删除
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

```typescript
async function handleBatchDelete() {
  await batchXxxAction({ action: "delete", ids: Array.from(selected) });
  toast({ title: `成功删除 ${selected.size} 条` });
  setBatchDeleteOpen(false);
  setSelected(new Set());
  void load();
}
```

---

## 验收（DoD）

```bash
# 1. 类型检查
pnpm type-check

# 2. 测试
pnpm test

# 3. 确认无原生对话框残留
grep -n "confirm\|window\.confirm\|window\.prompt\b" src/app/admin/knowledge-base/**/*.tsx \
  && echo "FAIL: 仍有原生对话框" || echo "OK: 已全部替换"

# 4. 手动验证（pnpm dev 后浏览器）
# - 侧边栏：切换各模块页，当前项目高亮
# - 各模块删除按钮：弹 AlertDialog，取消不删，确认删除
# - alias-packs 拒绝：弹 RejectNoteDialog，可输入原因，确认拒绝
# - 四个模块：勾选条目，工具栏出现，执行批量启用/停用/改书籍类型/删除
```

---

## 不在本任务范围内

- 模型生成功能 — 见 `04-16-kb-model-generation`
- alias-packs 的批量操作（batchVerify/batchReject）— 已有，不改动
- 书籍类型页面的批量操作 — 条目数量少，不需要
