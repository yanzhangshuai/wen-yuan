# 前端知识库 UI 对齐 — KB 架构重构后修复

**创建日期**: 2026-04-15  
**执行人**: codex-agent  
**优先级**: P1  

## 背景与目标

KB 架构重构（`feat/kb-refactor`）已合并到 `dev` 分支，引入了以下变化：
- `ExtractionRule` 拆分为 `NerLexiconRule`（算法词典规则）和 `PromptExtractionRule`（Prompt 注入规则）
- `AliasPack.scope` 枚举由 `"GENRE"` 改为 `"BOOK_TYPE"`

但重构后遗留了 4 个错误，导致前端知识库管理页面功能异常。本任务修复这些问题并完成前端对齐。

---

## 问题清单（执行前必读）

| # | 文件 | 行号 | 问题 |
|---|------|------|------|
| E1 | `src/server/modules/knowledge/extraction-rules.ts` | 全文件 | 僵尸层：全部指向 `NerLexiconRule`，与 `ner-lexicon-rules.ts` 重复，需删除 |
| E2 | `src/app/api/admin/knowledge/ner-rules/route.ts` | 8,27-28 | 导入 `listExtractionRules`（zombie），应改为 `listNerLexiconRules` |
| E3 | `src/app/api/admin/knowledge/_shared.ts` | 34 | `scope: z.enum(["GENRE", "BOOK"])` — "GENRE" 已改名为 "BOOK_TYPE" |
| E4 | `src/app/api/admin/knowledge/ner-rules/` | 所有路由 | ruleType 参数 ENTITY/RELATIONSHIP 与 NerLexiconRule 实际存储类型不匹配，查询永远返回空 |
| E5 | `src/lib/knowledge-presentation.ts` | 2-6 | KNOWLEDGE_PACK_SCOPE_OPTIONS 的 "GENRE" 选项未更新为 "BOOK_TYPE" |
| E6 | 无 | — | `PromptExtractionRule` 没有任何 HTTP API 路由（管理员无法通过 UI 维护） |

---

## 执行步骤

### Step A：后端服务层

#### A1：`ner-lexicon-rules.ts` 补充 reorder 函数

**文件**: `src/server/modules/knowledge/ner-lexicon-rules.ts`

在文件末尾（第 61 行后）追加：

```typescript
export async function reorderNerLexiconRules(orderedIds: string[]) {
  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.nerLexiconRule.update({
        where: { id },
        data : { sortOrder: index + 1 }
      })
    )
  );
}
```

#### A2：`prompt-extraction-rules.ts` 补充 reorder + previewCombined

**文件**: `src/server/modules/knowledge/prompt-extraction-rules.ts`

在文件末尾（第 62 行后）追加：

```typescript
export async function reorderPromptExtractionRules(orderedIds: string[]) {
  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.promptExtractionRule.update({
        where: { id },
        data : { sortOrder: index + 1 }
      })
    )
  );
}

export async function previewCombinedPromptRules(ruleType: string, bookTypeId?: string) {
  const rules = await prisma.promptExtractionRule.findMany({
    where: {
      ruleType,
      isActive: true,
      OR      : [
        { bookTypeId: null },
        ...(bookTypeId ? [{ bookTypeId }] : [])
      ]
    },
    orderBy: { sortOrder: "asc" }
  });

  return {
    ruleType,
    bookTypeId: bookTypeId ?? null,
    count     : rules.length,
    combined  : rules.map((r, i) => `${i + 1}. ${r.content}`).join("\n"),
    rules     : rules.map(r => ({ id: r.id, content: r.content, bookTypeId: r.bookTypeId, sortOrder: r.sortOrder }))
  };
}
```

#### A3：`index.ts` — 删除 extraction-rules 导出，新增 prompt-extraction-rules 完整导出

**文件**: `src/server/modules/knowledge/index.ts`

将第 98-104 行（extraction-rules 块）：
```typescript
export {
  listExtractionRules,
  createExtractionRule,
  updateExtractionRule,
  deleteExtractionRule,
  reorderExtractionRules,
  previewCombinedRules
} from "./extraction-rules";
```

替换为：
```typescript
export {
  listNerLexiconRules,
  createNerLexiconRule,
  updateNerLexiconRule,
  deleteNerLexiconRule,
  reorderNerLexiconRules
} from "./ner-lexicon-rules";

export {
  listPromptExtractionRules,
  createPromptExtractionRule,
  updatePromptExtractionRule,
  deletePromptExtractionRule,
  reorderPromptExtractionRules,
  previewCombinedPromptRules
} from "./prompt-extraction-rules";
```

注意：同时删除文件末尾第 111-112 行的 `export * from "./ner-lexicon-rules"` 和 `export * from "./prompt-extraction-rules"` 重导出（因为现在已经显式导出，不再需要星号导出）。

#### A4：删除僵尸文件

删除整个文件：`src/server/modules/knowledge/extraction-rules.ts`

#### A5：`_shared.ts` — 修复 scope enum + 新增规则 schema

**文件**: `src/app/api/admin/knowledge/_shared.ts`

**修改 1**：第 34 行，修复 AliasPack scope enum：
```typescript
// 修改前
scope      : z.enum(["GENRE", "BOOK"]),

// 修改后
scope      : z.enum(["BOOK_TYPE", "BOOK"]),
```

**修改 2**：将第 175-196 行（NER 规则 schema 块）完整替换：

```typescript
// ─── NER 词典规则 ──────────────────────────────────────────
export const createNerLexiconRuleSchema = z.object({
  ruleType  : z.enum(["HARD_BLOCK_SUFFIX", "SOFT_BLOCK_SUFFIX", "TITLE_STEM", "POSITION_STEM"]),
  content   : z.string().trim().min(1, "规则内容不能为空"),
  bookTypeId: z.string().uuid().optional(),
  sortOrder : z.number().int().optional(),
  changeNote: z.string().optional()
});

export const updateNerLexiconRuleSchema = z.object({
  content   : z.string().trim().min(1).optional(),
  bookTypeId: z.string().uuid().nullable().optional(),
  sortOrder : z.number().int().optional(),
  isActive  : z.boolean().optional(),
  changeNote: z.string().optional()
}).refine((v) => Object.keys(v).length > 0, { message: "至少提供一个可更新字段" });

export const reorderNerLexiconRulesSchema = z.object({
  orderedIds: z.array(z.string().uuid()).min(1)
});

// ─── Prompt 提取规则 ────────────────────────────────────────
export const createPromptExtractionRuleSchema = z.object({
  ruleType  : z.enum(["ENTITY", "RELATIONSHIP"]).default("ENTITY"),
  content   : z.string().trim().min(1, "规则内容不能为空"),
  bookTypeId: z.string().uuid().optional(),
  sortOrder : z.number().int().optional(),
  changeNote: z.string().optional()
});

export const updatePromptExtractionRuleSchema = z.object({
  content   : z.string().trim().min(1).optional(),
  bookTypeId: z.string().uuid().nullable().optional(),
  sortOrder : z.number().int().optional(),
  isActive  : z.boolean().optional(),
  changeNote: z.string().optional()
}).refine((v) => Object.keys(v).length > 0, { message: "至少提供一个可更新字段" });

export const reorderPromptExtractionRulesSchema = z.object({
  orderedIds: z.array(z.string().uuid()).min(1)
});
```

旧的 `createRuleSchema`、`updateRuleSchema`、`reorderRulesSchema` 三个导出**保留但重命名为上方新名称**（原名可直接删除，因为没有其他地方通过名称导入它们，只有 ner-rules 路由文件）。

#### A6：更新 ner-rules API 路由

**文件 1**：`src/app/api/admin/knowledge/ner-rules/route.ts`

- 第 8 行：将导入从 `listExtractionRules, createExtractionRule` 改为 `listNerLexiconRules, createNerLexiconRule`
- 第 12 行：将 `createRuleSchema` 改为 `createNerLexiconRuleSchema`（来自 `_shared.ts`）  
- 第 27 行：`listExtractionRules({ ruleType, bookTypeId })` → `listNerLexiconRules({ ruleType, bookTypeId })`
- 第 47 行：`createExtractionRule(parsed.data)` → `createNerLexiconRule(parsed.data)`
- 响应 code 从 `"ADMIN_NER_RULE_CREATED"` 保持不变（无需改）

完整修改后的 `route.ts`：
```typescript
import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { listNerLexiconRules, createNerLexiconRule } from "@/server/modules/knowledge";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson, createNerLexiconRuleSchema } from "../_shared";

const PATH = "/api/admin/knowledge/ner-rules";

export async function GET(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const url = new URL(request.url);
    const ruleType   = url.searchParams.get("ruleType") ?? undefined;
    const bookTypeId = url.searchParams.get("bookTypeId") ?? undefined;

    const data = await listNerLexiconRules({ ruleType, bookTypeId });
    return okJson({ path: PATH, requestId, startedAt, code: "ADMIN_NER_RULES_LISTED", message: "NER 规则列表获取成功", data });
  } catch (error) {
    return failJson({ path: PATH, requestId, startedAt, error, fallbackCode: ERROR_CODES.COMMON_INTERNAL_ERROR, fallbackMessage: "NER 规则列表获取失败" });
  }
}

export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const parsed = createNerLexiconRuleSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return badRequestJson(PATH, requestId, startedAt, parsed.error.issues[0]?.message ?? "参数不合法");
    }

    const data = await createNerLexiconRule(parsed.data);
    return okJson({ path: PATH, requestId, startedAt, code: "ADMIN_NER_RULE_CREATED", message: "NER 规则创建成功", data, status: 201 });
  } catch (error) {
    return failJson({ path: PATH, requestId, startedAt, error, fallbackCode: ERROR_CODES.COMMON_INTERNAL_ERROR, fallbackMessage: "NER 规则创建失败" });
  }
}
```

**文件 2**：`src/app/api/admin/knowledge/ner-rules/[id]/route.ts`

- 第 8 行：`updateExtractionRule, deleteExtractionRule` → `updateNerLexiconRule, deleteNerLexiconRule`
- 第 11 行：`updateRuleSchema` → `updateNerLexiconRuleSchema`
- 第 36 行：`updateExtractionRule(...)` → `updateNerLexiconRule(...)`
- 第 59 行：`deleteExtractionRule(...)` → `deleteNerLexiconRule(...)`

**文件 3**：`src/app/api/admin/knowledge/ner-rules/reorder/route.ts`

- 第 8 行：`reorderExtractionRules` → `reorderNerLexiconRules`
- 第 11 行：`reorderRulesSchema` → `reorderNerLexiconRulesSchema`
- 第 28 行：`reorderExtractionRules(parsed.data.ruleType, parsed.data.orderedIds)` → `reorderNerLexiconRules(parsed.data.orderedIds)`（NerLexiconRule reorder 不需要 ruleType 参数）

**文件 4**：删除 `src/app/api/admin/knowledge/ner-rules/preview-combined/route.ts`

NerLexiconRule 是词典词条，不需要"合并预览"功能。

#### A7：新建 prompt-extraction-rules API 路由（4 个文件）

**文件 1**：新建 `src/app/api/admin/knowledge/prompt-extraction-rules/route.ts`

```typescript
import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { listPromptExtractionRules, createPromptExtractionRule } from "@/server/modules/knowledge";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson, createPromptExtractionRuleSchema } from "../_shared";

const PATH = "/api/admin/knowledge/prompt-extraction-rules";

export async function GET(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const url = new URL(request.url);
    const ruleType   = url.searchParams.get("ruleType") ?? undefined;
    const bookTypeId = url.searchParams.get("bookTypeId") ?? undefined;

    const data = await listPromptExtractionRules({ ruleType, bookTypeId });
    return okJson({ path: PATH, requestId, startedAt, code: "ADMIN_PROMPT_RULES_LISTED", message: "Prompt 规则列表获取成功", data });
  } catch (error) {
    return failJson({ path: PATH, requestId, startedAt, error, fallbackCode: ERROR_CODES.COMMON_INTERNAL_ERROR, fallbackMessage: "Prompt 规则列表获取失败" });
  }
}

export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const parsed = createPromptExtractionRuleSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return badRequestJson(PATH, requestId, startedAt, parsed.error.issues[0]?.message ?? "参数不合法");
    }

    const data = await createPromptExtractionRule(parsed.data);
    return okJson({ path: PATH, requestId, startedAt, code: "ADMIN_PROMPT_RULE_CREATED", message: "Prompt 规则创建成功", data, status: 201 });
  } catch (error) {
    return failJson({ path: PATH, requestId, startedAt, error, fallbackCode: ERROR_CODES.COMMON_INTERNAL_ERROR, fallbackMessage: "Prompt 规则创建失败" });
  }
}
```

**文件 2**：新建 `src/app/api/admin/knowledge/prompt-extraction-rules/[id]/route.ts`

```typescript
import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { updatePromptExtractionRule, deletePromptExtractionRule } from "@/server/modules/knowledge";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson, uuidParamSchema, updatePromptExtractionRuleSchema } from "../../_shared";

const PATH = "/api/admin/knowledge/prompt-extraction-rules/[id]";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const parsedParams = uuidParamSchema.safeParse(await context.params);
    if (!parsedParams.success) {
      return badRequestJson(PATH, requestId, startedAt, "ID 不合法");
    }

    const parsedBody = updatePromptExtractionRuleSchema.safeParse(await readJsonBody(request));
    if (!parsedBody.success) {
      return badRequestJson(PATH, requestId, startedAt, parsedBody.error.issues[0]?.message ?? "参数不合法");
    }

    const data = await updatePromptExtractionRule(parsedParams.data.id, parsedBody.data);
    return okJson({ path: PATH, requestId, startedAt, code: "ADMIN_PROMPT_RULE_UPDATED", message: "Prompt 规则更新成功", data });
  } catch (error) {
    return failJson({ path: PATH, requestId, startedAt, error, fallbackCode: ERROR_CODES.COMMON_INTERNAL_ERROR, fallbackMessage: "Prompt 规则更新失败" });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const parsedParams = uuidParamSchema.safeParse(await context.params);
    if (!parsedParams.success) {
      return badRequestJson(PATH, requestId, startedAt, "ID 不合法");
    }

    await deletePromptExtractionRule(parsedParams.data.id);
    return okJson({ path: PATH, requestId, startedAt, code: "ADMIN_PROMPT_RULE_DELETED", message: "Prompt 规则删除成功", data: null });
  } catch (error) {
    return failJson({ path: PATH, requestId, startedAt, error, fallbackCode: ERROR_CODES.COMMON_INTERNAL_ERROR, fallbackMessage: "Prompt 规则删除失败" });
  }
}
```

**文件 3**：新建 `src/app/api/admin/knowledge/prompt-extraction-rules/reorder/route.ts`

```typescript
import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { reorderPromptExtractionRules } from "@/server/modules/knowledge";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson, reorderPromptExtractionRulesSchema } from "../../_shared";

const PATH = "/api/admin/knowledge/prompt-extraction-rules/reorder";

export async function PUT(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const parsed = reorderPromptExtractionRulesSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return badRequestJson(PATH, requestId, startedAt, parsed.error.issues[0]?.message ?? "参数不合法");
    }

    await reorderPromptExtractionRules(parsed.data.orderedIds);
    return okJson({ path: PATH, requestId, startedAt, code: "ADMIN_PROMPT_RULES_REORDERED", message: "规则排序更新成功", data: null });
  } catch (error) {
    return failJson({ path: PATH, requestId, startedAt, error, fallbackCode: ERROR_CODES.COMMON_INTERNAL_ERROR, fallbackMessage: "规则排序更新失败" });
  }
}
```

**文件 4**：新建 `src/app/api/admin/knowledge/prompt-extraction-rules/preview-combined/route.ts`

```typescript
import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { previewCombinedPromptRules } from "@/server/modules/knowledge";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson } from "../../_shared";

const PATH = "/api/admin/knowledge/prompt-extraction-rules/preview-combined";

export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const body = await readJsonBody(request);
    if (!body || typeof body !== "object" || !("ruleType" in body) || typeof body.ruleType !== "string") {
      return badRequestJson(PATH, requestId, startedAt, "ruleType 字段为必填");
    }

    const bookTypeId = "bookTypeId" in body && typeof body.bookTypeId === "string" ? body.bookTypeId : undefined;
    const data = await previewCombinedPromptRules(body.ruleType, bookTypeId);
    return okJson({ path: PATH, requestId, startedAt, code: "ADMIN_PROMPT_RULES_PREVIEW", message: "规则组合预览成功", data });
  } catch (error) {
    return failJson({ path: PATH, requestId, startedAt, error, fallbackCode: ERROR_CODES.COMMON_INTERNAL_ERROR, fallbackMessage: "规则组合预览失败" });
  }
}
```

---

### Step B：前端 Service 层

#### B1：修复 `knowledge-presentation.ts` scope 选项

**文件**: `src/lib/knowledge-presentation.ts`

将第 1-12 行替换为：

```typescript
export const KNOWLEDGE_PACK_SCOPE_OPTIONS = [
  {
    value      : "BOOK_TYPE",
    label      : "书籍类型通用",
    description: "供同书籍类型的书籍共享使用"
  },
  {
    value      : "BOOK",
    label      : "书籍专用",
    description: "仅服务当前书籍"
  }
] as const;
```

#### B2：更新 `lib/services/ner-rules.ts` — 对齐 NerLexiconRule

**文件**: `src/lib/services/ner-rules.ts`

将全文替换为（字段名由 `genreKey` 改为 `bookTypeId`，ruleType 改为 string）：

```typescript
import { clientFetch, clientMutate } from "@/lib/client-api";

export type NerLexiconRuleType = "HARD_BLOCK_SUFFIX" | "SOFT_BLOCK_SUFFIX" | "TITLE_STEM" | "POSITION_STEM";

export interface NerLexiconRuleItem {
  id        : string;
  ruleType  : NerLexiconRuleType;
  content   : string;
  bookTypeId: string | null;
  sortOrder : number;
  isActive  : boolean;
  changeNote: string | null;
  createdAt : string;
  updatedAt : string;
}

export async function fetchNerLexiconRules(params?: {
  ruleType?  : NerLexiconRuleType;
  bookTypeId?: string;
}): Promise<NerLexiconRuleItem[]> {
  const sp = new URLSearchParams();
  if (params?.ruleType)   sp.set("ruleType", params.ruleType);
  if (params?.bookTypeId) sp.set("bookTypeId", params.bookTypeId);
  const qs = sp.toString() ? `?${sp.toString()}` : "";
  return clientFetch<NerLexiconRuleItem[]>(`/api/admin/knowledge/ner-rules${qs}`);
}

export async function createNerLexiconRule(data: {
  ruleType   : NerLexiconRuleType;
  content    : string;
  bookTypeId?: string;
  sortOrder? : number;
  changeNote?: string;
}): Promise<NerLexiconRuleItem> {
  return clientFetch<NerLexiconRuleItem>("/api/admin/knowledge/ner-rules", {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(data)
  });
}

export async function updateNerLexiconRule(id: string, data: {
  content?   : string;
  bookTypeId?: string | null;
  sortOrder? : number;
  isActive?  : boolean;
  changeNote?: string;
}): Promise<void> {
  await clientMutate(`/api/admin/knowledge/ner-rules/${id}`, {
    method : "PATCH",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(data)
  });
}

export async function deleteNerLexiconRule(id: string): Promise<void> {
  await clientMutate(`/api/admin/knowledge/ner-rules/${id}`, { method: "DELETE" });
}

export async function reorderNerLexiconRules(orderedIds: string[]): Promise<void> {
  await clientMutate("/api/admin/knowledge/ner-rules/reorder", {
    method : "PUT",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify({ orderedIds })
  });
}
```

注意：删除旧的 `ExtractionRuleItem`、`CombinedRulesPreview`、`fetchExtractionRules` 等导出。若有其他文件依赖这些旧名称，运行 `pnpm type-check` 后修复所有报错。

#### B3：新建 `lib/services/prompt-extraction-rules.ts`

**文件**: `src/lib/services/prompt-extraction-rules.ts`（新建）

```typescript
import { clientFetch, clientMutate } from "@/lib/client-api";

export type PromptRuleType = "ENTITY" | "RELATIONSHIP";

export interface PromptExtractionRuleItem {
  id        : string;
  ruleType  : PromptRuleType;
  content   : string;
  bookTypeId: string | null;
  sortOrder : number;
  isActive  : boolean;
  changeNote: string | null;
  createdAt : string;
  updatedAt : string;
}

export interface CombinedPromptRulesPreview {
  ruleType  : string;
  bookTypeId: string | null;
  count     : number;
  combined  : string;
  rules     : Array<Pick<PromptExtractionRuleItem, "id" | "content" | "bookTypeId" | "sortOrder">>;
}

export async function fetchPromptExtractionRules(params?: {
  ruleType?  : PromptRuleType;
  bookTypeId?: string;
}): Promise<PromptExtractionRuleItem[]> {
  const sp = new URLSearchParams();
  if (params?.ruleType)   sp.set("ruleType", params.ruleType);
  if (params?.bookTypeId) sp.set("bookTypeId", params.bookTypeId);
  const qs = sp.toString() ? `?${sp.toString()}` : "";
  return clientFetch<PromptExtractionRuleItem[]>(`/api/admin/knowledge/prompt-extraction-rules${qs}`);
}

export async function createPromptExtractionRule(data: {
  ruleType   : PromptRuleType;
  content    : string;
  bookTypeId?: string;
  sortOrder? : number;
  changeNote?: string;
}): Promise<PromptExtractionRuleItem> {
  return clientFetch<PromptExtractionRuleItem>("/api/admin/knowledge/prompt-extraction-rules", {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(data)
  });
}

export async function updatePromptExtractionRule(id: string, data: {
  content?   : string;
  bookTypeId?: string | null;
  sortOrder? : number;
  isActive?  : boolean;
  changeNote?: string;
}): Promise<void> {
  await clientMutate(`/api/admin/knowledge/prompt-extraction-rules/${id}`, {
    method : "PATCH",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(data)
  });
}

export async function deletePromptExtractionRule(id: string): Promise<void> {
  await clientMutate(`/api/admin/knowledge/prompt-extraction-rules/${id}`, { method: "DELETE" });
}

export async function reorderPromptExtractionRules(orderedIds: string[]): Promise<void> {
  await clientMutate("/api/admin/knowledge/prompt-extraction-rules/reorder", {
    method : "PUT",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify({ orderedIds })
  });
}

export async function previewCombinedPromptRules(
  ruleType  : PromptRuleType,
  bookTypeId?: string
): Promise<CombinedPromptRulesPreview> {
  return clientFetch<CombinedPromptRulesPreview>("/api/admin/knowledge/prompt-extraction-rules/preview-combined", {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify({ ruleType, bookTypeId })
  });
}
```

---

### Step C：前端 Page 层

#### C1：重写 `ner-rules/page.tsx` — 改为 NerLexiconRule 词典管理

**文件**: `src/app/admin/knowledge-base/ner-rules/page.tsx`

完整替换为以下内容（保持文件名和 URL 不变，功能改为管理 NerLexiconRule）：

```typescript
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  PageContainer,
  PageHeader,
  PageSection
} from "@/components/layout/page-header";
import { useToast } from "@/hooks/use-toast";
import {
  fetchNerLexiconRules,
  createNerLexiconRule,
  updateNerLexiconRule,
  deleteNerLexiconRule,
  reorderNerLexiconRules,
  type NerLexiconRuleItem,
  type NerLexiconRuleType
} from "@/lib/services/ner-rules";

const RULE_TYPE_OPTIONS: { value: NerLexiconRuleType; label: string }[] = [
  { value: "HARD_BLOCK_SUFFIX", label: "强阻断后缀" },
  { value: "SOFT_BLOCK_SUFFIX", label: "软阻断后缀" },
  { value: "TITLE_STEM",        label: "称谓词干" },
  { value: "POSITION_STEM",     label: "职位词干" }
];

export default function NerRulesPage() {
  const [items, setItems] = useState<NerLexiconRuleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [ruleType, setRuleType] = useState<NerLexiconRuleType>("HARD_BLOCK_SUFFIX");
  const [bookTypeId, setBookTypeId] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<NerLexiconRuleItem | null>(null);
  const { toast } = useToast();

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchNerLexiconRules({
        ruleType,
        bookTypeId: bookTypeId.trim() || undefined
      });
      setItems(data.sort((a, b) => a.sortOrder - b.sortOrder));
    } catch (error) {
      toast({ title: "加载失败", description: String(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [bookTypeId, ruleType, toast]);

  useEffect(() => { void load(); }, [load]);

  const orderedIds = useMemo(() => items.map((item) => item.id), [items]);

  function moveItem(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= items.length) return;
    const next = [...items];
    const [moved] = next.splice(index, 1);
    next.splice(targetIndex, 0, moved);
    setItems(next.map((item, itemIndex) => ({ ...item, sortOrder: itemIndex + 1 })));
  }

  async function persistOrder() {
    try {
      await reorderNerLexiconRules(orderedIds);
      toast({ title: "排序已保存" });
      await load();
    } catch (error) {
      toast({ title: "排序保存失败", description: String(error), variant: "destructive" });
    }
  }

  async function handleDelete(item: NerLexiconRuleItem) {
    if (!confirm("确定删除该规则吗？")) return;
    try {
      await deleteNerLexiconRule(item.id);
      toast({ title: "删除成功" });
      await load();
    } catch (error) {
      toast({ title: "删除失败", description: String(error), variant: "destructive" });
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="NER 词典规则"
        description="维护命名实体识别的词典规则（后缀阻断、称谓词干、职位词干）。"
        breadcrumbs={[
          { label: "管理后台", href: "/admin" },
          { label: "知识库", href: "/admin/knowledge-base" },
          { label: "NER 词典规则" }
        ]}
      >
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void persistOrder()} disabled={items.length === 0}>
            保存排序
          </Button>
          <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }}>
            <Plus className="mr-1 h-4 w-4" />
            新增规则
          </Button>
        </div>
      </PageHeader>

      <PageSection>
        <div className="mb-4 grid gap-3 md:grid-cols-[180px_240px_auto]">
          <Select value={ruleType} onValueChange={(value) => setRuleType(value as NerLexiconRuleType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {RULE_TYPE_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input value={bookTypeId} onChange={(e) => setBookTypeId(e.target.value)} placeholder="书籍类型 ID（可选）" />
          <Button variant="outline" onClick={() => void load()}>刷新</Button>
        </div>

        {loading ? (
          <div className="py-12 text-center text-muted-foreground">加载中...</div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">排序</TableHead>
                  <TableHead>词典内容</TableHead>
                  <TableHead className="w-32">书籍类型</TableHead>
                  <TableHead className="w-24">状态</TableHead>
                  <TableHead className="w-28">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, index) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <span>{item.sortOrder}</span>
                        <Button variant="ghost" size="sm" onClick={() => moveItem(index, -1)} disabled={index === 0}>
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => moveItem(index, 1)} disabled={index === items.length - 1}>
                          <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{item.content}</TableCell>
                    <TableCell className="text-muted-foreground">{item.bookTypeId ?? "通用"}</TableCell>
                    <TableCell>
                      <Badge variant={item.isActive ? "success" : "secondary"}>{item.isActive ? "启用" : "停用"}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" onClick={() => { setEditing(item); setDialogOpen(true); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => void handleDelete(item)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">暂无规则</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </PageSection>

      <NerRuleDialog
        open={dialogOpen}
        editing={editing}
        ruleType={ruleType}
        onOpenChange={setDialogOpen}
        onSaved={load}
      />
    </PageContainer>
  );
}

function NerRuleDialog({
  open,
  editing,
  ruleType,
  onOpenChange,
  onSaved
}: {
  open        : boolean;
  editing     : NerLexiconRuleItem | null;
  ruleType    : NerLexiconRuleType;
  onOpenChange: (open: boolean) => void;
  onSaved     : () => Promise<void>;
}) {
  const [localRuleType, setLocalRuleType] = useState<NerLexiconRuleType>(ruleType);
  const [content, setContent] = useState("");
  const [bookTypeId, setBookTypeId] = useState("");
  const [sortOrder, setSortOrder] = useState(1);
  const [changeNote, setChangeNote] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    setLocalRuleType(editing?.ruleType ?? ruleType);
    setContent(editing?.content ?? "");
    setBookTypeId(editing?.bookTypeId ?? "");
    setSortOrder(editing?.sortOrder ?? 1);
    setChangeNote(editing?.changeNote ?? "");
    setIsActive(editing?.isActive ?? true);
  }, [editing, open, ruleType]);

  async function handleSubmit() {
    setSaving(true);
    try {
      if (editing) {
        await updateNerLexiconRule(editing.id, {
          content,
          bookTypeId: bookTypeId.trim() || null,
          sortOrder,
          changeNote: changeNote || undefined,
          isActive
        });
      } else {
        await createNerLexiconRule({
          ruleType  : localRuleType,
          content,
          bookTypeId: bookTypeId.trim() || undefined,
          sortOrder,
          changeNote: changeNote || undefined
        });
      }
      toast({ title: editing ? "更新成功" : "创建成功" });
      onOpenChange(false);
      await onSaved();
    } catch (error) {
      toast({ title: "保存失败", description: String(error), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "编辑词典规则" : "新增词典规则"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>规则类型</Label>
            <Select value={localRuleType} onValueChange={(value) => setLocalRuleType(value as NerLexiconRuleType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {RULE_TYPE_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>词典内容（词条、后缀或词干）</Label>
            <Textarea rows={4} value={content} onChange={(e) => setContent(e.target.value)} placeholder="每行一个词条，或输入单个模式" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>书籍类型 ID</Label>
              <Input value={bookTypeId} onChange={(e) => setBookTypeId(e.target.value)} placeholder="通用可留空" />
            </div>
            <div className="grid gap-2">
              <Label>排序</Label>
              <Input type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>变更说明</Label>
            <Input value={changeNote} onChange={(e) => setChangeNote(e.target.value)} />
          </div>
          {editing && (
            <div className="flex items-center gap-2">
              <Switch checked={isActive} onCheckedChange={setIsActive} />
              <Label>启用</Label>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={() => void handleSubmit()} disabled={saving || !content.trim()}>
            {saving ? "保存中..." : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

#### C2：新建 `prompt-extraction-rules/page.tsx`

**文件**: `src/app/admin/knowledge-base/prompt-extraction-rules/page.tsx`（新建）

```typescript
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Eye, Pencil, Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  PageContainer,
  PageHeader,
  PageSection
} from "@/components/layout/page-header";
import { useToast } from "@/hooks/use-toast";
import {
  fetchPromptExtractionRules,
  createPromptExtractionRule,
  updatePromptExtractionRule,
  deletePromptExtractionRule,
  reorderPromptExtractionRules,
  previewCombinedPromptRules,
  type PromptExtractionRuleItem,
  type PromptRuleType,
  type CombinedPromptRulesPreview
} from "@/lib/services/prompt-extraction-rules";

export default function PromptExtractionRulesPage() {
  const [items, setItems] = useState<PromptExtractionRuleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [ruleType, setRuleType] = useState<PromptRuleType>("ENTITY");
  const [bookTypeId, setBookTypeId] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<CombinedPromptRulesPreview | null>(null);
  const [editing, setEditing] = useState<PromptExtractionRuleItem | null>(null);
  const { toast } = useToast();

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchPromptExtractionRules({
        ruleType,
        bookTypeId: bookTypeId.trim() || undefined
      });
      setItems(data.sort((a, b) => a.sortOrder - b.sortOrder));
    } catch (error) {
      toast({ title: "加载失败", description: String(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [bookTypeId, ruleType, toast]);

  useEffect(() => { void load(); }, [load]);

  const orderedIds = useMemo(() => items.map((item) => item.id), [items]);

  function moveItem(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= items.length) return;
    const next = [...items];
    const [moved] = next.splice(index, 1);
    next.splice(targetIndex, 0, moved);
    setItems(next.map((item, itemIndex) => ({ ...item, sortOrder: itemIndex + 1 })));
  }

  async function persistOrder() {
    try {
      await reorderPromptExtractionRules(orderedIds);
      toast({ title: "排序已保存" });
      await load();
    } catch (error) {
      toast({ title: "排序保存失败", description: String(error), variant: "destructive" });
    }
  }

  async function handlePreview() {
    try {
      const data = await previewCombinedPromptRules(ruleType, bookTypeId.trim() || undefined);
      setPreviewData(data);
      setPreviewOpen(true);
    } catch (error) {
      toast({ title: "预览失败", description: String(error), variant: "destructive" });
    }
  }

  async function handleDelete(item: PromptExtractionRuleItem) {
    if (!confirm("确定删除该规则吗？")) return;
    try {
      await deletePromptExtractionRule(item.id);
      toast({ title: "删除成功" });
      await load();
    } catch (error) {
      toast({ title: "删除失败", description: String(error), variant: "destructive" });
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="Prompt 提取规则"
        description="维护实体和关系抽取时拼接进 Prompt 的规则列表。"
        breadcrumbs={[
          { label: "管理后台", href: "/admin" },
          { label: "知识库", href: "/admin/knowledge-base" },
          { label: "Prompt 提取规则" }
        ]}
      >
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void handlePreview()}>
            <Eye className="mr-1 h-4 w-4" />
            组合预览
          </Button>
          <Button variant="outline" size="sm" onClick={() => void persistOrder()} disabled={items.length === 0}>
            保存排序
          </Button>
          <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }}>
            <Plus className="mr-1 h-4 w-4" />
            新增规则
          </Button>
        </div>
      </PageHeader>

      <PageSection>
        <div className="mb-4 grid gap-3 md:grid-cols-[180px_240px_auto]">
          <Select value={ruleType} onValueChange={(value) => setRuleType(value as PromptRuleType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ENTITY">实体规则</SelectItem>
              <SelectItem value="RELATIONSHIP">关系规则</SelectItem>
            </SelectContent>
          </Select>
          <Input value={bookTypeId} onChange={(e) => setBookTypeId(e.target.value)} placeholder="书籍类型 ID（可选）" />
          <Button variant="outline" onClick={() => void load()}>刷新</Button>
        </div>

        {loading ? (
          <div className="py-12 text-center text-muted-foreground">加载中...</div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">排序</TableHead>
                  <TableHead>规则内容</TableHead>
                  <TableHead className="w-32">书籍类型</TableHead>
                  <TableHead className="w-24">状态</TableHead>
                  <TableHead className="w-28">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, index) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <span>{item.sortOrder}</span>
                        <Button variant="ghost" size="sm" onClick={() => moveItem(index, -1)} disabled={index === 0}>
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => moveItem(index, 1)} disabled={index === items.length - 1}>
                          <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-pre-wrap">{item.content}</TableCell>
                    <TableCell className="text-muted-foreground">{item.bookTypeId ?? "通用"}</TableCell>
                    <TableCell>
                      <Badge variant={item.isActive ? "success" : "secondary"}>{item.isActive ? "启用" : "停用"}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" onClick={() => { setEditing(item); setDialogOpen(true); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => void handleDelete(item)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">暂无规则</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </PageSection>

      <PromptRuleDialog
        open={dialogOpen}
        editing={editing}
        ruleType={ruleType}
        onOpenChange={setDialogOpen}
        onSaved={load}
      />

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>规则组合预览</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              当前共 {previewData?.count ?? 0} 条规则，类型：{previewData?.ruleType ?? ""}
            </div>
            <pre className="max-h-[460px] overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap">
              {previewData?.combined ?? ""}
            </pre>
          </div>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

function PromptRuleDialog({
  open,
  editing,
  ruleType,
  onOpenChange,
  onSaved
}: {
  open        : boolean;
  editing     : PromptExtractionRuleItem | null;
  ruleType    : PromptRuleType;
  onOpenChange: (open: boolean) => void;
  onSaved     : () => Promise<void>;
}) {
  const [localRuleType, setLocalRuleType] = useState<PromptRuleType>(ruleType);
  const [content, setContent] = useState("");
  const [bookTypeId, setBookTypeId] = useState("");
  const [sortOrder, setSortOrder] = useState(1);
  const [changeNote, setChangeNote] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    setLocalRuleType(editing?.ruleType ?? ruleType);
    setContent(editing?.content ?? "");
    setBookTypeId(editing?.bookTypeId ?? "");
    setSortOrder(editing?.sortOrder ?? 1);
    setChangeNote(editing?.changeNote ?? "");
    setIsActive(editing?.isActive ?? true);
  }, [editing, open, ruleType]);

  async function handleSubmit() {
    setSaving(true);
    try {
      if (editing) {
        await updatePromptExtractionRule(editing.id, {
          content,
          bookTypeId: bookTypeId.trim() || null,
          sortOrder,
          changeNote: changeNote || undefined,
          isActive
        });
      } else {
        await createPromptExtractionRule({
          ruleType  : localRuleType,
          content,
          bookTypeId: bookTypeId.trim() || undefined,
          sortOrder,
          changeNote: changeNote || undefined
        });
      }
      toast({ title: editing ? "更新成功" : "创建成功" });
      onOpenChange(false);
      await onSaved();
    } catch (error) {
      toast({ title: "保存失败", description: String(error), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "编辑规则" : "新增规则"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>规则类型</Label>
            <Select value={localRuleType} onValueChange={(value) => setLocalRuleType(value as PromptRuleType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ENTITY">ENTITY（实体）</SelectItem>
                <SelectItem value="RELATIONSHIP">RELATIONSHIP（关系）</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>规则内容</Label>
            <Textarea rows={6} value={content} onChange={(e) => setContent(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>书籍类型 ID</Label>
              <Input value={bookTypeId} onChange={(e) => setBookTypeId(e.target.value)} placeholder="通用可留空" />
            </div>
            <div className="grid gap-2">
              <Label>排序</Label>
              <Input type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>变更说明</Label>
            <Input value={changeNote} onChange={(e) => setChangeNote(e.target.value)} />
          </div>
          {editing && (
            <div className="flex items-center gap-2">
              <Switch checked={isActive} onCheckedChange={setIsActive} />
              <Label>启用</Label>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={() => void handleSubmit()} disabled={saving || !content.trim()}>
            {saving ? "保存中..." : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

#### C3：更新 `knowledge-base/page.tsx` — 修改 ner-rules 描述 + 新增 prompt-extraction-rules 卡片

**文件**: `src/app/admin/knowledge-base/page.tsx`

将第 11-54 行的 `knowledgeModules` 数组替换为：

```typescript
const knowledgeModules = [
  {
    href       : "/admin/knowledge-base/book-types",
    title      : "书籍类型",
    description: "维护书籍类型与 NER 调谐配置。",
    icon       : BookOpenText
  },
  {
    href       : "/admin/knowledge-base/alias-packs",
    title      : "别名知识包",
    description: "管理人物标准名、别名与 AI 生成导入。",
    icon       : Sparkles
  },
  {
    href       : "/admin/knowledge-base/surnames",
    title      : "姓氏词库",
    description: "维护单姓/复姓识别所需的运行时词表。",
    icon       : UserRoundSearch
  },
  {
    href       : "/admin/knowledge-base/title-filters",
    title      : "泛化称谓",
    description: "配置安全泛称、默认泛称及书籍类型豁免。",
    icon       : Filter
  },
  {
    href       : "/admin/knowledge-base/prompt-templates",
    title      : "提示词模板",
    description: "查看版本、激活模板并预览渲染结果。",
    icon       : ScrollText
  },
  {
    href       : "/admin/knowledge-base/ner-rules",
    title      : "NER 词典规则",
    description: "维护命名实体识别的词典规则（后缀阻断、词干）。",
    icon       : BookMarked
  },
  {
    href       : "/admin/knowledge-base/prompt-extraction-rules",
    title      : "Prompt 提取规则",
    description: "维护实体/关系抽取时拼接进 Prompt 的规则列表。",
    icon       : BookMarked
  },
  {
    href       : "/admin/knowledge-base/change-logs",
    title      : "变更日志",
    description: "审计知识库对象的创建、修改、激活与导入。",
    icon       : FileClock
  }
] as const;
```

注意：需在文件顶部 import 列表中确认 `BookMarked` 已导入两次是允许的（同一个 icon 用于两个模块），当前 import 已包含，无需修改 import 行。

---

## DoD（完成标准）

```bash
# 1. 类型检查通过
pnpm type-check

# 2. 测试通过
pnpm test

# 3. 关键文件验证
# 僵尸文件已删除
test ! -f src/server/modules/knowledge/extraction-rules.ts

# 新 API 路由存在
test -f src/app/api/admin/knowledge/prompt-extraction-rules/route.ts
test -f src/app/api/admin/knowledge/prompt-extraction-rules/[id]/route.ts
test -f src/app/api/admin/knowledge/prompt-extraction-rules/reorder/route.ts
test -f src/app/api/admin/knowledge/prompt-extraction-rules/preview-combined/route.ts

# 旧 preview-combined 路由已删除
test ! -f src/app/api/admin/knowledge/ner-rules/preview-combined/route.ts

# 新页面文件存在
test -f src/app/admin/knowledge-base/prompt-extraction-rules/page.tsx

# 4. scope enum 已修复
grep "BOOK_TYPE" src/app/api/admin/knowledge/_shared.ts
grep -v "GENRE" src/app/api/admin/knowledge/_shared.ts | grep "scope"

# 5. knowledge-presentation 已更新
grep "BOOK_TYPE" src/lib/knowledge-presentation.ts
grep -v '"GENRE"' src/lib/knowledge-presentation.ts | grep "value"

# 6. ner-rules 路由不再使用旧函数
grep -r "listExtractionRules\|createExtractionRule\|updateExtractionRule\|deleteExtractionRule\|reorderExtractionRules" \
  src/app/api/admin/knowledge/ner-rules/ | wc -l
# 上面命令应返回 0
```

## 注意事项

1. `_shared.ts` 中旧的 `createRuleSchema`、`updateRuleSchema`、`reorderRulesSchema` 在修改前确认没有其他文件通过名称导入（只有 ner-rules 路由文件使用）。可通过 `grep -r "createRuleSchema\|updateRuleSchema\|reorderRulesSchema" src/` 验证。

2. Step B2 替换 `ner-rules.ts` 后，`ner-rules/page.tsx` 中所有对旧导出名称（`fetchExtractionRules`、`ExtractionRuleItem` 等）的引用会被 C1 步骤中的完整重写覆盖，不需要单独处理。

3. 不需要数据迁移：`NerLexiconRule` 表已有数据（由 `kb:seed-phase7` 填充的算法规则），`PromptExtractionRule` 表为空，上线后管理员可通过新 UI 添加规则。

4. 书籍导入流程（`import/page.tsx`）和书籍审核（`review/`）**不需要任何修改**。
