# 知识库模型生成 — NER词典规则/Prompt提取规则新增 + 泛化称谓迁移为异步

**创建日期**：2026-04-16  
**执行人**：codex-agent  
**优先级**：P1  
**设计文档**：`docs/superpowers/specs/2026-04-16-knowledge-base-enhancements-design.md`（任务 1 部分）

---

## 背景

知识库现有模型生成能力：
- 别名知识包 ✅ 异步
- 姓氏词库 ✅ 异步
- 泛化称谓 ❌ 同步阻塞（需迁移）
- NER 词典规则 ❌ 无（需新建）
- Prompt 提取规则 ❌ 无（需新建）

目标：三个模块全部支持异步生成，模式与姓氏词库完全对齐。

---

## 参考模式（执行前必读）

### 后端服务参考
`src/server/modules/knowledge/generateSurnames.ts`

关键点：
- 调用 `executeKnowledgeJsonGeneration()` from `generation-utils.ts`
- 定义输出 Zod schema
- 去重逻辑（skipped 计数）
- 写入 DB

### HTTP 异步 job 参考
`src/app/api/admin/knowledge/surnames/generate/route.ts`

关键点：
- `POST`：`createJob()` → `void (async () => { ... })()` → 立即返回 `{ jobId }`
- `GET ?jobId=xxx`：`getJob(jobId)` → 返回 `{ status, step, result?, error? }`
- job store：`src/server/lib/knowledge-job-store.ts`

### 前端 polling 参考
`src/app/admin/knowledge-base/surnames/page.tsx` 中的 `SurnameGenerationDialog`

关键点：
- `pollingRef`（`useRef<ReturnType<typeof setInterval>>`）
- `elapsedSeconds` 计时
- `startTimeRef`
- `stopPolling` useCallback
- 弹框关闭时清理 interval
- `status === "done"` → 停止轮询 → toast + 刷新列表
- `status === "error"` → 停止轮询 → toast 错误

### lib/services 参考
`src/lib/services/surnames.ts`：`reviewGeneratedSurnames` + `pollSurnameGenerationJob`

---

## 执行步骤

---

### Step 1：新建后端服务 — `generateNerLexiconRules.ts`

**文件**：`src/server/modules/knowledge/generateNerLexiconRules.ts`

参照 `generateSurnames.ts` 实现以下两个函数：

#### `previewNerLexiconGenerationPrompt`

```typescript
export async function previewNerLexiconGenerationPrompt(params: {
  ruleType              : string;
  targetCount           : number;
  bookTypeId?           : string;
  additionalInstructions?: string;
}): Promise<{ systemPrompt: string; userPrompt: string }>
```

提示词要点：
- 系统提示词说明任务是为中国古典文学 NER 系统生成指定类型的词典规则
- ruleType 含义：
  - `HARD_BLOCK_SUFFIX`：绝对阻断后缀（如"先生"、"大人"，不可能是人名结尾）
  - `SOFT_BLOCK_SUFFIX`：软阻断后缀（大概率不是人名，但有例外）
  - `TITLE_STEM`：称谓词干（如"王爷"、"公子"）
  - `POSITION_STEM`：职位词干（如"知府"、"巡抚"）
- 用户提示词包含：ruleType 类型说明、目标条数、可选 bookTypeId 对应的书籍类型名、additionalInstructions
- 输出格式要求：JSON 数组 `[{ "content": "词条", "confidence": 0.0~1.0 }]`

#### `generateNerLexiconRules`

```typescript
export async function generateNerLexiconRules(params: {
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

实现要点：
1. 构造 systemPrompt / userPrompt（复用 `previewNerLexiconGenerationPrompt` 的构造逻辑）
2. 调用 `executeKnowledgeJsonGeneration({ schema: z.array(z.object({ content: z.string(), confidence: z.number() })) })`
3. 查询已有同 ruleType + bookTypeId 的 content 集合（去重用）
4. 批量 `prisma.nerLexiconRule.createMany()`，每条：
   - `isActive: false`
   - `sortOrder`：从当前该 ruleType + bookTypeId 分组最大 sortOrder + 1 开始递增
   - 与已有内容完全相同（trim 比较）→ `skipped++`，不写入
5. 返回 `{ created, skipped, model }`

---

### Step 2：新建后端服务 — `generatePromptExtractionRules.ts`

**文件**：`src/server/modules/knowledge/generatePromptExtractionRules.ts`

结构与 Step 1 完全对称，区别：

- 函数名：`previewPromptExtractionGenerationPrompt` / `generatePromptExtractionRules`
- ruleType 取值：`ENTITY`（实体提取规则） | `RELATIONSHIP`（关系提取规则）
- 提示词说明：生成拼接进 Prompt 的提取指令，用于引导模型识别人物实体或关系
- 写入表：`prisma.promptExtractionRule`

---

### Step 3：更新 `src/server/modules/knowledge/index.ts`

在现有导出末尾追加：

```typescript
export {
  previewNerLexiconGenerationPrompt,
  generateNerLexiconRules
} from "./generateNerLexiconRules";

export {
  previewPromptExtractionGenerationPrompt,
  generatePromptExtractionRules
} from "./generatePromptExtractionRules";
```

---

### Step 4：更新 `src/app/api/admin/knowledge/_shared.ts`

在文件末尾追加两个 Zod schema：

```typescript
export const generateNerRulesSchema = z.object({
  ruleType              : z.enum(["HARD_BLOCK_SUFFIX", "SOFT_BLOCK_SUFFIX", "TITLE_STEM", "POSITION_STEM"]),
  targetCount           : z.number().int().min(1).max(200).default(20),
  bookTypeId            : z.string().uuid().optional(),
  additionalInstructions: z.string().max(500).optional(),
  modelId               : z.string().uuid().optional()
});

export const generatePromptRulesSchema = z.object({
  ruleType              : z.enum(["ENTITY", "RELATIONSHIP"]),
  targetCount           : z.number().int().min(1).max(100).default(10),
  bookTypeId            : z.string().uuid().optional(),
  additionalInstructions: z.string().max(500).optional(),
  modelId               : z.string().uuid().optional()
});
```

---

### Step 5：迁移泛化称谓 generate route 为异步

**文件**：`src/app/api/admin/knowledge/title-filters/generate/route.ts`

对照 `src/app/api/admin/knowledge/surnames/generate/route.ts` 重写：

```typescript
import { createJob, getJob, updateJob } from "@/server/lib/knowledge-job-store";
import type { GenericTitleGenerationReviewResult } from "@/server/modules/knowledge/generateGenericTitles";

// GET — 轮询 job 状态
export async function GET(request: Request): Promise<Response> { ... }

// POST — 提交 job，立即返回 jobId
export async function POST(request: Request): Promise<Response> {
  // ...
  const jobId = randomUUID();
  createJob<GenericTitleGenerationReviewResult>(jobId);

  void (async () => {
    updateJob(jobId, { status: "running", step: "正在连接模型，准备生成…" });
    try {
      const result = await reviewGeneratedGenericTitles(parsed.data);
      updateJob<GenericTitleGenerationReviewResult>(jobId, {
        status: "done",
        step  : "生成完成",
        result
      });
    } catch (err) {
      updateJob(jobId, {
        status: "error",
        step  : "生成失败",
        error : err instanceof Error ? err.message : String(err)
      });
    }
  })();

  return okJson({ ..., data: { jobId } });
}
```

---

### Step 6：新建 NER 词典规则 generate routes

**文件 1**：`src/app/api/admin/knowledge/ner-rules/generate/route.ts`

参照 `surnames/generate/route.ts` 实现，使用 `generateNerRulesSchema`，调用 `generateNerLexiconRules()`。

response code：
- POST：`"ADMIN_NER_RULE_GENERATION_JOB_SUBMITTED"`
- GET：`"ADMIN_NER_RULE_GENERATION_JOB_STATUS"`

**文件 2**：`src/app/api/admin/knowledge/ner-rules/generate/preview-prompt/route.ts`

参照 `surnames/generate/preview-prompt/route.ts` 实现，调用 `previewNerLexiconGenerationPrompt()`。

GET query params：`ruleType`, `targetCount`, `bookTypeId`（可选）, `additionalInstructions`（可选）

---

### Step 7：新建 Prompt 提取规则 generate routes

**文件 1**：`src/app/api/admin/knowledge/prompt-extraction-rules/generate/route.ts`

参照 Step 6，使用 `generatePromptRulesSchema`，调用 `generatePromptExtractionRules()`。

response code：
- POST：`"ADMIN_PROMPT_RULE_GENERATION_JOB_SUBMITTED"`
- GET：`"ADMIN_PROMPT_RULE_GENERATION_JOB_STATUS"`

**文件 2**：`src/app/api/admin/knowledge/prompt-extraction-rules/generate/preview-prompt/route.ts`

参照 Step 6，调用 `previewPromptExtractionGenerationPrompt()`。

---

### Step 8：更新 `src/lib/services/title-filters.ts`

在文件中：
1. 修改 `reviewGeneratedGenericTitles` 的返回类型为 `Promise<{ jobId: string }>`（改为 POST 后取 data.jobId 返回）
2. 新增接口和函数：

```typescript
export interface TitleFilterGenerationJobStatus {
  jobId : string;
  status: "pending" | "running" | "done" | "error";
  step  : string;
  result: GenericTitleGenerationReviewResult | null;
  error : string | null;
}

export async function pollTitleFilterGenerationJob(jobId: string): Promise<TitleFilterGenerationJobStatus> {
  return clientFetch<TitleFilterGenerationJobStatus>(
    `/api/admin/knowledge/title-filters/generate?jobId=${encodeURIComponent(jobId)}`
  );
}
```

---

### Step 9：更新 `src/lib/services/ner-rules.ts`

追加：

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
}): Promise<{ systemPrompt: string; userPrompt: string }> {
  const sp = new URLSearchParams();
  sp.set("ruleType", params.ruleType);
  sp.set("targetCount", String(params.targetCount));
  if (params.bookTypeId) sp.set("bookTypeId", params.bookTypeId);
  if (params.additionalInstructions) sp.set("additionalInstructions", params.additionalInstructions);
  return clientFetch(`/api/admin/knowledge/ner-rules/generate/preview-prompt?${sp.toString()}`);
}

export async function generateNerLexiconRules(data: {
  ruleType              : string;
  targetCount           : number;
  bookTypeId?           : string;
  additionalInstructions?: string;
  modelId?              : string;
}): Promise<{ jobId: string }> {
  return clientFetch("/api/admin/knowledge/ner-rules/generate", {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(data)
  });
}

export async function pollNerGenerationJob(jobId: string): Promise<NerRuleGenerationJobStatus> {
  return clientFetch(
    `/api/admin/knowledge/ner-rules/generate?jobId=${encodeURIComponent(jobId)}`
  );
}
```

---

### Step 10：更新 `src/lib/services/prompt-extraction-rules.ts`

追加（结构与 Step 9 对称）：

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

export async function previewPromptExtractionGenerationPrompt(...)
export async function generatePromptExtractionRules(...)
export async function pollPromptRuleGenerationJob(jobId: string): Promise<PromptRuleGenerationJobStatus>
```

endpoint paths：
- preview: `/api/admin/knowledge/prompt-extraction-rules/generate/preview-prompt`
- generate: `/api/admin/knowledge/prompt-extraction-rules/generate`
- poll: `/api/admin/knowledge/prompt-extraction-rules/generate?jobId=...`

---

### Step 11：更新泛化称谓页面 — `title-filters/page.tsx`

将 `GenericTitleGenerationDialog` 内部从 **同步调用** 改为 **job polling**。

改造方式：参照 `src/app/admin/knowledge-base/surnames/page.tsx` 中的 `SurnameGenerationDialog`，**逐字段对照实现**：

新增 state：
```typescript
const [generating, setGenerating]       = useState(false);
const [progressStep, setProgressStep]   = useState("");
const [elapsedSeconds, setElapsedSeconds] = useState(0);
const pollingRef  = useRef<ReturnType<typeof setInterval> | null>(null);
const startTimeRef = useRef<number>(0);
```

新增 `stopPolling` useCallback（清理 pollingRef.current）。

`handleGenerate` 改为：
1. `POST generate` → 获取 `jobId`
2. `setGenerating(true)`
3. `setInterval 2000ms` → `pollTitleFilterGenerationJob(jobId)` → 更新 progressStep
4. `status === "done"` → `stopPolling()` → `setGenerating(false)` → `onReviewed(job.result)`
5. `status === "error"` → `stopPolling()` → `setGenerating(false)` → toast 错误

弹框关闭时清理（`useEffect([open])`）：`stopPolling(); setGenerating(false); setProgressStep(""); setElapsedSeconds(0);`

---

### Step 12：更新 NER 词典规则页面 — `ner-rules/page.tsx`

**A. 页面头部**：在"新增规则"按钮旁新增：

```tsx
<Button variant="outline" size="sm" onClick={() => setGenerateDialogOpen(true)}>
  <Sparkles className="mr-1 h-4 w-4" />
  模型生成
</Button>
```

新增 state：`generateDialogOpen`（boolean）

**B. 新增 `NerRuleGenerationDialog` 组件**（在文件末尾）：

Props：
```typescript
{
  open        : boolean;
  ruleType    : NerLexiconRuleType;   // 默认值：当前页面筛选的 ruleType
  bookTypes   : BookTypeItem[];
  onOpenChange: (open: boolean) => void;
  onGenerated : () => void;           // 生成完成后刷新列表
}
```

表单字段（参照 `SurnameGenerationDialog` 布局）：
- **规则类型**（Select，HARD_BLOCK_SUFFIX/SOFT_BLOCK_SUFFIX/TITLE_STEM/POSITION_STEM，默认为 props.ruleType）
- **目标条数**（Input number，默认 20，min 1，max 200）
- **书籍类型**（Select，可选，含"通用场景"选项）
- **生成模型**（Select，来自 `useAdminModels({ onlyEnabled: true })`）
- **补充要求**（Textarea，可选，placeholder 提示具体说明）

按钮：
- "预览提示词" → `previewNerLexiconGenerationPrompt()` → 展示 system/user prompt 预览区（同 SurnameGenerationDialog）
- "开始生成" → `generateNerLexiconRules()` → polling 进度 → 完成后：
  ```
  toast: `生成完成：新增 ${result.created} 条，跳过 ${result.skipped} 条（已标为停用，请手动启用）`
  onOpenChange(false)
  onGenerated()   // 刷新列表
  ```

在生成进行中禁止关闭弹框（`onOpenChange={(next) => { if (generating) return; onOpenChange(next); }}`）。

---

### Step 13：更新 Prompt 提取规则页面 — `prompt-extraction-rules/page.tsx`

同 Step 12，新增 `PromptRuleGenerationDialog`：

区别：
- 规则类型：ENTITY（实体规则）/ RELATIONSHIP（关系规则）
- 目标条数：默认 10，max 100
- 生成完成 toast：同 Step 12 格式

---

## 验收（DoD）

```bash
# 1. 类型检查
pnpm type-check

# 2. 测试
pnpm test

# 3. 手动验证清单（pnpm dev 后浏览器验证）
# - 泛化称谓页面：点击「模型生成」→ 弹框内显示进度 spinner + 计时 → 完成后弹出 ReviewDialog
# - NER 词典规则页面：点击「模型生成」→ 配置并生成 → 完成 toast 含"新增 N 条，跳过 M 条（已标为停用）"→ 列表刷新，新条目显示"停用"
# - Prompt 提取规则页面：同上
```

---

## 不在本任务范围内

- 别名知识包、姓氏词库的生成逻辑 — 已是异步，不改动
- 批量操作、UI 修复 — 见 `04-16-kb-batch-ops-ui-fix`
