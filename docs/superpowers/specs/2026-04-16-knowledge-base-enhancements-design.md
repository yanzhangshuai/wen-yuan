# 知识库增强设计文档

**日期**：2026-04-16  
**状态**：已批准，待实现  
**执行人**：codex-agent

---

## 背景

KB 架构重构完成后，知识库管理后台存在以下问题：

1. **模型生成能力不完整**：NER 词典规则和 Prompt 提取规则缺少"模型生成"入口；泛化称谓的生成是同步阻塞，与其他模块异步模式不一致。
2. **批量操作缺失**：姓氏词库、泛化称谓、NER 词典规则、Prompt 提取规则四个模块只支持逐条删除，无批量删除/启停/改归属。
3. **前端 UI 问题**：侧边栏导航无选中状态高亮；9 处使用原生 `confirm()` / `prompt()` 而非 UI 组件对话框。

---

## 任务拆分

拆分为两个独立的 Trellis 任务顺序执行：

| 任务 | 范围 | 依赖 |
|------|------|------|
| 任务 1：模型生成 | 新增 NER/Prompt 规则生成 + 泛化称谓迁移为异步 | 无 |
| 任务 2：前端增强 | 批量操作 + UI 修复（侧边栏 active + 原生对话框替换） | 任务 1 完成后 |

---

## 任务 1：模型生成

### 目标

- NER 词典规则支持"模型生成 → 写入 DB（isActive=false）→ 管理员逐条启用"流程
- Prompt 提取规则同上
- 泛化称谓生成改为异步 job 模式（与姓氏词库对齐）

### 异步生成约定

所有生成均使用进程内 job store（`src/server/lib/knowledge-job-store.ts`，15 分钟 TTL）：

- `POST /api/admin/knowledge/{module}/generate` → 立即返回 `{ jobId }`，后台异步执行
- `GET  /api/admin/knowledge/{module}/generate?jobId=xxx` → 返回 `{ status, step, result?, error? }`
- 前端每 2 秒轮询，显示进度计时；完成后刷新列表

生成结果写入规则：`isActive=false`，`source="LLM_SUGGESTED"`

---

### 后端服务层

#### 新增文件

**`src/server/modules/knowledge/generateNerLexiconRules.ts`**

```typescript
// 接口
export async function previewNerLexiconGenerationPrompt(params: {
  ruleType              : string;    // HARD_BLOCK_SUFFIX | SOFT_BLOCK_SUFFIX | TITLE_STEM | POSITION_STEM
  targetCount           : number;
  bookTypeId?           : string;
  additionalInstructions?: string;
}): Promise<{ systemPrompt: string; userPrompt: string }>

export async function generateNerLexiconRules(params: {
  ruleType              : string;
  targetCount           : number;
  bookTypeId?           : string;
  additionalInstructions?: string;
  selectedModelId?      : string;
}): Promise<{
  created   : number;
  skipped   : number;
  model     : { id: string; provider: string; modelName: string };
}>
```

实现要点：
- 调用 `executeKnowledgeJsonGeneration()`（来自 `generation-utils.ts`）
- 输出 schema：`Array<{ content: string; confidence: number }>`
- 去重逻辑：跳过与现有同 ruleType + bookTypeId 内容完全相同的条目（`skipped++`）
- 写入：`prisma.nerLexiconRule.createMany()`，`isActive=false`，`sortOrder` 从当前最大值+1 递增

**`src/server/modules/knowledge/generatePromptExtractionRules.ts`**

```typescript
// 接口（与 generateNerLexiconRules 结构对称）
export async function previewPromptExtractionGenerationPrompt(params: {
  ruleType              : string;    // ENTITY | RELATIONSHIP
  targetCount           : number;
  bookTypeId?           : string;
  additionalInstructions?: string;
}): Promise<{ systemPrompt: string; userPrompt: string }>

export async function generatePromptExtractionRules(params: {
  ruleType              : string;
  targetCount           : number;
  bookTypeId?           : string;
  additionalInstructions?: string;
  selectedModelId?      : string;
}): Promise<{
  created: number;
  skipped: number;
  model  : { id: string; provider: string; modelName: string };
}>
```

#### 修改文件

**`src/server/modules/knowledge/index.ts`**

新增导出：
```typescript
export { generateNerLexiconRules, previewNerLexiconGenerationPrompt } from "./generateNerLexiconRules";
export { generatePromptExtractionRules, previewPromptExtractionGenerationPrompt } from "./generatePromptExtractionRules";
// reviewGeneratedGenericTitles 已存在，无需改动
```

---

### HTTP API 层

#### 泛化称谓（同步→异步迁移）

**修改** `src/app/api/admin/knowledge/title-filters/generate/route.ts`：

```
当前：POST → await reviewGeneratedGenericTitles() → 返回候选数据（同步阻塞）
改为：POST → createJob() → void 后台执行 → 立即返回 { jobId }
      GET  → getJob(jobId) → 返回 { status, step, result?, error? }
```

#### NER 词典规则（新建）

新建文件：
- `src/app/api/admin/knowledge/ner-rules/generate/route.ts`
  - `POST`：接受 `{ ruleType, targetCount, bookTypeId?, additionalInstructions?, modelId? }` → 提交 job → 返回 `{ jobId }`
  - `GET`：`?jobId=xxx` → 返回 job 状态
- `src/app/api/admin/knowledge/ner-rules/generate/preview-prompt/route.ts`
  - `GET`：接受 query params → 返回 `{ systemPrompt, userPrompt }`

请求体 schema（在 `_shared.ts` 新增 `generateNerRulesSchema`）：
```typescript
z.object({
  ruleType              : z.enum(["HARD_BLOCK_SUFFIX", "SOFT_BLOCK_SUFFIX", "TITLE_STEM", "POSITION_STEM"]),
  targetCount           : z.number().int().min(1).max(200).default(20),
  bookTypeId            : z.string().uuid().optional(),
  additionalInstructions: z.string().max(500).optional(),
  modelId               : z.string().uuid().optional()
})
```

#### Prompt 提取规则（新建）

新建文件（结构与 NER 对称）：
- `src/app/api/admin/knowledge/prompt-extraction-rules/generate/route.ts`
- `src/app/api/admin/knowledge/prompt-extraction-rules/generate/preview-prompt/route.ts`

请求体 schema（新增 `generatePromptRulesSchema`）：
```typescript
z.object({
  ruleType              : z.enum(["ENTITY", "RELATIONSHIP"]),
  targetCount           : z.number().int().min(1).max(100).default(10),
  bookTypeId            : z.string().uuid().optional(),
  additionalInstructions: z.string().max(500).optional(),
  modelId               : z.string().uuid().optional()
})
```

---

### 前端 lib/services 层

#### 修改 `src/lib/services/title-filters.ts`

```typescript
// 修改前（同步）：
export async function reviewGeneratedGenericTitles(...): Promise<GenericTitleGenerationReviewResult>

// 修改后（异步）：
export async function reviewGeneratedGenericTitles(...): Promise<{ jobId: string }>
export async function pollTitleFilterGenerationJob(jobId: string): Promise<TitleFilterGenerationJobStatus>

export interface TitleFilterGenerationJobStatus {
  jobId : string;
  status: "pending" | "running" | "done" | "error";
  step  : string;
  result: GenericTitleGenerationReviewResult | null;
  error : string | null;
}
```

#### 修改 `src/lib/services/ner-rules.ts`

新增：
```typescript
export interface NerRuleGenerationResult {
  created: number;
  skipped: number;
  model  : { id: string; provider: string; modelName: string };
}

export interface NerRuleGenerationJobStatus {
  jobId : string;
  status: "pending" | "running" | "done" | "error";
  step  : string;
  result: NerRuleGenerationResult | null;
  error : string | null;
}

export async function previewNerLexiconGenerationPrompt(params: {
  ruleType              : string;
  targetCount           : number;
  bookTypeId?           : string;
  additionalInstructions?: string;
}): Promise<{ systemPrompt: string; userPrompt: string }>

export async function generateNerLexiconRules(data: {
  ruleType              : string;
  targetCount           : number;
  bookTypeId?           : string;
  additionalInstructions?: string;
  modelId?              : string;
}): Promise<{ jobId: string }>

export async function pollNerGenerationJob(jobId: string): Promise<NerRuleGenerationJobStatus>
```

#### 修改 `src/lib/services/prompt-extraction-rules.ts`

新增（结构与 ner-rules.ts 对称）：
```typescript
export interface PromptRuleGenerationResult {
  created: number;
  skipped: number;
  model  : { id: string; provider: string; modelName: string };
}

export interface PromptRuleGenerationJobStatus {
  jobId : string;
  status: "pending" | "running" | "done" | "error";
  step  : string;
  result: PromptRuleGenerationResult | null;
  error : string | null;
}

export async function previewPromptExtractionGenerationPrompt(params: {
  ruleType              : string;
  targetCount           : number;
  bookTypeId?           : string;
  additionalInstructions?: string;
}): Promise<{ systemPrompt: string; userPrompt: string }>

export async function generatePromptExtractionRules(data: {
  ruleType              : string;
  targetCount           : number;
  bookTypeId?           : string;
  additionalInstructions?: string;
  modelId?              : string;
}): Promise<{ jobId: string }>

export async function pollPromptRuleGenerationJob(jobId: string): Promise<PromptRuleGenerationJobStatus>
```

---

### 前端页面层

#### 泛化称谓 `src/app/admin/knowledge-base/title-filters/page.tsx`

`GenericTitleGenerationDialog` 内部改造：

```
当前流程：await reviewGeneratedGenericTitles() → onReviewed(result)
改为：
  1. POST → 获取 jobId
  2. setInterval 每 2s 轮询 pollTitleFilterGenerationJob(jobId)
  3. 显示进度（progressStep + elapsedSeconds 计时）
  4. status === "done" → stopPolling → onReviewed(job.result)
  5. status === "error" → stopPolling → toast 错误
```

新增 state：`generating`、`progressStep`、`elapsedSeconds`、`pollingRef`、`startTimeRef`（与 `SurnameGenerationDialog` 完全对齐）

#### NER 词典规则 `src/app/admin/knowledge-base/ner-rules/page.tsx`

**页面头部**新增"模型生成"按钮（与"新增规则"并列）。

**新增** `NerRuleGenerationDialog` 组件：

```
表单字段：
- 规则类型（Select，HARD_BLOCK_SUFFIX/SOFT_BLOCK_SUFFIX/TITLE_STEM/POSITION_STEM，默认与当前筛选器一致）
- 目标条数（Input number，默认 20，max 200）
- 书籍类型（Select，可选，来自 bookTypes props）
- 生成模型（Select，来自 useAdminModels）
- 补充要求（Textarea，可选）

操作按钮：
- "预览提示词" → GET preview-prompt → 展示 system/user prompt 预览区
- "开始生成" → POST generate → 进入 polling 状态（进度条 + 计时 + 禁止关闭）

完成后：
- toast: "生成完成：新增 N 条，跳过 M 条（已标为停用，请手动启用）"
- 关闭 dialog → 刷新列表
```

#### Prompt 提取规则 `src/app/admin/knowledge-base/prompt-extraction-rules/page.tsx`

同 NER 词典规则，新增 `PromptRuleGenerationDialog`（规则类型改为 ENTITY/RELATIONSHIP，目标条数 max 100）。

---

## 任务 2：前端增强

### 2-A. 侧边栏 NavLink Active 高亮

**文件**：`src/app/admin/knowledge-base/layout.tsx`

将 `NavLink` 改为独立的 `"use client"` 组件（或将 layout 客户端化），使用 `usePathname()`：

```typescript
// 匹配规则：精确匹配 /admin/knowledge-base，前缀匹配其他子路径
const isActive = href === "/admin/knowledge-base"
  ? pathname === href
  : pathname.startsWith(href);

// 命中时追加样式
className={cn(
  "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted hover:text-foreground",
  isActive
    ? "bg-muted text-foreground font-medium"
    : "text-muted-foreground"
)}
```

---

### 2-B. 原生对话框替换（9 处）

使用项目现有 `src/components/ui/alert-dialog.tsx` 和 `src/components/ui/dialog.tsx`。

#### confirm() → AlertDialog（7 处）

每处替换模式（以删除为例）：

```typescript
// 删除前状态
const [deleteTarget, setDeleteTarget] = useState<T | null>(null);

// 触发
<Button onClick={() => setDeleteTarget(item)}>删除</Button>

// AlertDialog
<AlertDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>确认删除</AlertDialogTitle>
      <AlertDialogDescription>确定删除「{deleteTarget?.name}」吗？此操作不可恢复。</AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>取消</AlertDialogCancel>
      <AlertDialogAction onClick={() => void handleDelete(deleteTarget!)}>删除</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

涉及文件及 state 命名：

| 文件 | state | 用途 |
|------|-------|------|
| `surnames/page.tsx` | `deleteSurnameTarget` | 删除姓氏 |
| `title-filters/page.tsx` | `deleteTitleTarget` | 删除称谓 |
| `ner-rules/page.tsx` | `deleteRuleTarget` | 删除 NER 规则 |
| `prompt-extraction-rules/page.tsx` | `deleteRuleTarget` | 删除 Prompt 规则 |
| `book-types/page.tsx` | `deleteBookTypeTarget` | 删除书籍类型 |
| `alias-packs/page.tsx` | `deletePackTarget` | 删除知识包 |
| `alias-packs/page.tsx` | `deleteEntryTarget` | 删除条目 |

#### prompt() → RejectNoteDialog（2 处，仅 alias-packs）

**新增** inline 组件 `RejectNoteDialog`（在 alias-packs page 内）：

```typescript
interface RejectNoteDialogProps {
  open        : boolean;
  mode        : "single" | "batch";
  count?      : number;           // batch 模式下显示"拒绝 N 条"
  onConfirm   : (note: string) => void;
  onOpenChange: (open: boolean) => void;
}
```

Dialog 内容：
- 标题：`mode === "single" ? "拒绝条目" : "批量拒绝 N 条"`
- Textarea：拒绝原因（可选，placeholder="可不填，直接点确认"）
- 按钮：取消 / 确认拒绝

调用处：
- 单条拒绝：`setRejectMode("single"); setRejectDialogOpen(true)` → `onConfirm(note)` 时调用 `rejectEntry(id, note)`
- 批量拒绝：`setRejectMode("batch"); setRejectDialogOpen(true)` → `onConfirm(note)` 时调用 `batchRejectEntries(..., note)`

---

### 2-C. 批量操作

#### 后端服务层

##### `src/server/modules/knowledge/surnames.ts`

新增：
```typescript
export async function batchDeleteSurnames(ids: string[]): Promise<{ count: number }>
export async function batchToggleSurnames(ids: string[], isActive: boolean): Promise<{ count: number }>
export async function batchChangeBookTypeSurnames(ids: string[], bookTypeId: string | null): Promise<{ count: number }>
```

实现：`prisma.$transaction([ids.map(id => prisma.surnameRule.update(...))])`

##### `src/server/modules/knowledge/generic-titles.ts`

新增（结构与 surnames 对称）：
```typescript
export async function batchDeleteGenericTitles(ids: string[]): Promise<{ count: number }>
export async function batchToggleGenericTitles(ids: string[], isActive: boolean): Promise<{ count: number }>
export async function batchChangeBookTypeGenericTitles(ids: string[], bookTypeId: string | null): Promise<{ count: number }>
```

##### `src/server/modules/knowledge/ner-lexicon-rules.ts`

新增（结构对称）：
```typescript
export async function batchDeleteNerLexiconRules(ids: string[]): Promise<{ count: number }>
export async function batchToggleNerLexiconRules(ids: string[], isActive: boolean): Promise<{ count: number }>
export async function batchChangeBookTypeNerLexiconRules(ids: string[], bookTypeId: string | null): Promise<{ count: number }>
```

##### `src/server/modules/knowledge/prompt-extraction-rules.ts`

新增（结构对称）：
```typescript
export async function batchDeletePromptExtractionRules(ids: string[]): Promise<{ count: number }>
export async function batchTogglePromptExtractionRules(ids: string[], isActive: boolean): Promise<{ count: number }>
export async function batchChangeBookTypePromptExtractionRules(ids: string[], bookTypeId: string | null): Promise<{ count: number }>
```

**index.ts**：新增上述 12 个函数的导出。

#### HTTP API 层

四个模块各新增：

```
POST /api/admin/knowledge/surnames/batch
POST /api/admin/knowledge/title-filters/batch
POST /api/admin/knowledge/ner-rules/batch
POST /api/admin/knowledge/prompt-extraction-rules/batch
```

统一请求体 schema（在 `_shared.ts` 新增 `knowledgeBatchActionSchema`）：
```typescript
const knowledgeBatchActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("delete"),         ids: z.array(z.string().uuid()).min(1) }),
  z.object({ action: z.literal("enable"),          ids: z.array(z.string().uuid()).min(1) }),
  z.object({ action: z.literal("disable"),         ids: z.array(z.string().uuid()).min(1) }),
  z.object({ action: z.literal("changeBookType"),  ids: z.array(z.string().uuid()).min(1), bookTypeId: z.string().uuid().nullable() })
]);
```

响应统一返回 `{ count: number }`。

新建文件（4 个）：
- `src/app/api/admin/knowledge/surnames/batch/route.ts`
- `src/app/api/admin/knowledge/title-filters/batch/route.ts`
- `src/app/api/admin/knowledge/ner-rules/batch/route.ts`
- `src/app/api/admin/knowledge/prompt-extraction-rules/batch/route.ts`

#### 前端 lib/services 层

四个 services 文件各新增：
```typescript
export async function batchXxx(body: {
  action    : "delete" | "enable" | "disable" | "changeBookType";
  ids       : string[];
  bookTypeId?: string | null;
}): Promise<{ count: number }>
```

具体函数名：
- `batchSurnameAction` → `POST /api/admin/knowledge/surnames/batch`
- `batchGenericTitleAction` → `POST /api/admin/knowledge/title-filters/batch`
- `batchNerLexiconRuleAction` → `POST /api/admin/knowledge/ner-rules/batch`
- `batchPromptExtractionRuleAction` → `POST /api/admin/knowledge/prompt-extraction-rules/batch`

#### 前端页面层（四个模块统一交互模式）

**表格变更**：
- 首列新增 `<Checkbox>` 列（宽度 `w-10`）
- Header 行 Checkbox 实现全选/全不选（`indeterminate` 状态：部分选中时显示横线）

**批量操作工具栏**（仅在 `selected.size > 0` 时显示，位于 filter 行与 table 之间）：

```
已选 N 条  [批量启用] [批量停用] [批量改书籍类型 ▼] [批量删除]  [清空选择 ×]
```

- **批量启用/停用**：直接调用 `batchXxxAction({ action: "enable"/"disable", ids })`，无需确认
- **批量改书籍类型**：弹小 Dialog（Select 选择目标 bookType，含"通用"选项 → `bookTypeId: null`）→ 确认后调用
- **批量删除**：弹 AlertDialog 确认（`确定删除已选 N 条？此操作不可恢复`）→ 确认后调用

操作完成后：`setSelected(new Set())` + `void load()`

**涉及页面**：
- `src/app/admin/knowledge-base/surnames/page.tsx`
- `src/app/admin/knowledge-base/title-filters/page.tsx`
- `src/app/admin/knowledge-base/ner-rules/page.tsx`
- `src/app/admin/knowledge-base/prompt-extraction-rules/page.tsx`

---

## 文件变更清单

### 任务 1

**新建（后端服务）**
- `src/server/modules/knowledge/generateNerLexiconRules.ts`
- `src/server/modules/knowledge/generatePromptExtractionRules.ts`

**新建（API 路由）**
- `src/app/api/admin/knowledge/ner-rules/generate/route.ts`
- `src/app/api/admin/knowledge/ner-rules/generate/preview-prompt/route.ts`
- `src/app/api/admin/knowledge/prompt-extraction-rules/generate/route.ts`
- `src/app/api/admin/knowledge/prompt-extraction-rules/generate/preview-prompt/route.ts`

**修改（API 路由）**
- `src/app/api/admin/knowledge/title-filters/generate/route.ts`（同步→异步 job）
- `src/app/api/admin/knowledge/_shared.ts`（新增 `generateNerRulesSchema`、`generatePromptRulesSchema`）

**修改（前端 lib/services）**
- `src/lib/services/title-filters.ts`（async job 接口）
- `src/lib/services/ner-rules.ts`（新增生成接口）
- `src/lib/services/prompt-extraction-rules.ts`（新增生成接口）

**修改（前端页面）**
- `src/app/admin/knowledge-base/title-filters/page.tsx`（GenerationDialog 改为 polling）
- `src/app/admin/knowledge-base/ner-rules/page.tsx`（新增生成按钮 + Dialog）
- `src/app/admin/knowledge-base/prompt-extraction-rules/page.tsx`（新增生成按钮 + Dialog）

**修改（knowledge index）**
- `src/server/modules/knowledge/index.ts`（新增生成函数导出）

### 任务 2

**修改（布局）**
- `src/app/admin/knowledge-base/layout.tsx`（NavLink active 高亮）

**修改（原生对话框替换，7 处 confirm + 2 处 prompt）**
- `src/app/admin/knowledge-base/surnames/page.tsx`
- `src/app/admin/knowledge-base/title-filters/page.tsx`
- `src/app/admin/knowledge-base/ner-rules/page.tsx`
- `src/app/admin/knowledge-base/prompt-extraction-rules/page.tsx`
- `src/app/admin/knowledge-base/book-types/page.tsx`
- `src/app/admin/knowledge-base/alias-packs/page.tsx`（2 处 confirm + 2 处 prompt）

**修改（后端服务，批量操作）**
- `src/server/modules/knowledge/surnames.ts`
- `src/server/modules/knowledge/generic-titles.ts`
- `src/server/modules/knowledge/ner-lexicon-rules.ts`
- `src/server/modules/knowledge/prompt-extraction-rules.ts`
- `src/server/modules/knowledge/index.ts`

**新建（API 路由，批量操作）**
- `src/app/api/admin/knowledge/surnames/batch/route.ts`
- `src/app/api/admin/knowledge/title-filters/batch/route.ts`
- `src/app/api/admin/knowledge/ner-rules/batch/route.ts`
- `src/app/api/admin/knowledge/prompt-extraction-rules/batch/route.ts`

#### 修改（API 共享 schema）

- `src/app/api/admin/knowledge/_shared.ts`（新增 `knowledgeBatchActionSchema`）

**修改（前端 lib/services，批量操作）**
- `src/lib/services/surnames.ts`
- `src/lib/services/title-filters.ts`
- `src/lib/services/ner-rules.ts`
- `src/lib/services/prompt-extraction-rules.ts`

**修改（前端页面，批量操作）**
- `src/app/admin/knowledge-base/surnames/page.tsx`
- `src/app/admin/knowledge-base/title-filters/page.tsx`
- `src/app/admin/knowledge-base/ner-rules/page.tsx`
- `src/app/admin/knowledge-base/prompt-extraction-rules/page.tsx`

---

## 验收标准

### 任务 1

- [ ] NER 词典规则页：有"模型生成"按钮，点击弹框，选模型/规则类型/条数，生成期间显示进度计时，完成后列表刷新，新条目显示"停用"
- [ ] Prompt 提取规则页：同上
- [ ] 泛化称谓页：生成不再阻塞，有进度展示，行为与姓氏词库一致
- [ ] `pnpm type-check` 无错误
- [ ] `pnpm test` 通过

### 任务 2

- [ ] 侧边栏当前页链接有高亮样式
- [ ] 全站知识库模块无 `confirm()` / `prompt()` 调用
- [ ] 四个模块表格有 Checkbox 列；选中后工具栏出现
- [ ] 批量启用/停用直接执行并刷新
- [ ] 批量改书籍类型：弹 Dialog 选类型，确认后执行
- [ ] 批量删除：弹 AlertDialog 确认，确认后执行
- [ ] `pnpm type-check` 无错误
- [ ] `pnpm test` 通过
