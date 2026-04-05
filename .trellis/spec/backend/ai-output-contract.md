---
stage: mvp
---

# AI 输出契约规范

> 本项目核心功能是 AI 解析古典小说，AI 输出是最不稳定的外部数据源。
> 本规范约束：AI 输出如何校验、多模型如何保持一致、失败如何降级处理。

---

## 核心原则

**AI 输出 = 不可信外部输入。** 必须用 Zod schema 校验，任何字段都可能缺失、格式错误或产生幻觉。

---

## 1. 所有 AI 输出必须经过 Zod 校验

AI 客户端（Gemini、DeepSeek）返回的 JSON 在入库前必须通过 Zod `.safeParse()`。

```typescript
// src/types/analysis.ts — 将现有 interface 迁移为 Zod schema
import { z } from 'zod';

export const aiMentionSchema = z.object({
  personaName: z.string().min(1),
  rawText: z.string().min(1),
  summary: z.string().optional(),
  paraIndex: z.number().int().nonnegative().optional(),
});

export const aiBiographySchema = z.object({
  personaName: z.string().min(1),
  category: z.enum(['BIRTH', 'EXAM', 'CAREER', 'TRAVEL', 'SOCIAL', 'DEATH', 'EVENT']),
  event: z.string().min(1),
  title: z.string().optional(),
  location: z.string().optional(),
  virtualYear: z.string().optional(),
  ironyNote: z.string().optional(),
});

export const aiRelationshipSchema = z.object({
  sourceName: z.string().min(1),
  targetName: z.string().min(1),
  type: z.string().min(1),
  weight: z.number().min(0).max(10).optional(),
  description: z.string().optional(),
});

export const chapterAnalysisResponseSchema = z.object({
  biographies: z.array(aiBiographySchema).default([]),
  mentions: z.array(aiMentionSchema).default([]),
  relationships: z.array(aiRelationshipSchema).default([]),
});

// 类型从 schema 推导，不要重复手写 interface
export type ChapterAnalysisResponse = z.infer<typeof chapterAnalysisResponseSchema>;
```

---

## 2. 使用 `safeParse`，不用 `parse`

AI 客户端解析时使用 `safeParse`，让调用方决定如何处理失败，而不是直接抛错。

```typescript
// src/server/modules/analysis/ai/geminiClient.ts

async analyzeChapterChunk(input: AnalyzeChunkInput): Promise<ChapterAnalysisResponse> {
  const raw = await this.callGeminiApi(input);

  // 提取 JSON（AI 常把 JSON 包在 markdown 代码块里）
  const jsonString = extractJsonFromMarkdown(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    // JSON 解析失败：返回空结果，不让整章分析崩溃
    console.error('[GeminiClient] JSON.parse failed', { chunkIndex: input.chunkIndex });
    return { biographies: [], mentions: [], relationships: [] };
  }

  const result = chapterAnalysisResponseSchema.safeParse(parsed);
  if (!result.success) {
    // Schema 不匹配：记录警告，返回空结果（不是致命错误）
    console.warn('[GeminiClient] Schema validation failed', {
      chunkIndex: input.chunkIndex,
      errors: result.error.flatten(),
    });
    return { biographies: [], mentions: [], relationships: [] };
  }

  return result.data;
}
```

---

## 3. 多模型契约一致性

所有 AI 客户端必须实现 `AiAnalysisClient` 接口，输出必须通过同一个 Zod schema。

```typescript
// src/server/modules/analysis/ai/types.ts
export interface AiAnalysisClient {
  analyzeChapterChunk(input: AnalyzeChunkInput): Promise<ChapterAnalysisResponse>;
}

// GeminiClient 和 DeepSeekClient 都实现此接口
// 两者的 prompt 格式可以不同，但输出 schema 必须一致
```

**模型切换规则**（已在 `ChapterAnalysisService` 实现，规范在此记录）：

- 通过 `AI_PROVIDER` 环境变量切换：`gemini`（默认）或 `deepseek`。
- 切换模型不应影响下游的 Zod 校验和入库逻辑。
- 如果某个模型的输出与 schema 不符，修 prompt 而不是改 schema。

---

## 4. 幻觉处理规范

AI 提取到的人名可能不存在于原文（幻觉）。`PersonaResolver` 已有处理逻辑，规范如下：

- 幻觉判定由 `PersonaResolver.resolve()` 负责，返回 `status: 'hallucinated'`。
- 幻觉条目**跳过入库**，不报错，不影响整章分析。
- 幻觉条目**必须记录日志**（已有 `analysis.hallucination` 事件），便于后续 prompt 优化。
- 单章幻觉率（`hallucinationCount / totalMentions`）超过 30% 时，视为 prompt 退化信号。

```typescript
// 禁止：发现幻觉直接抛错，导致整章分析失败
if (res.status === 'hallucinated') {
  throw new Error(`幻觉人名: ${name}`);
}

// 正确：跳过 + 计数（ChapterAnalysisService 当前实现）
if (res.status === 'hallucinated') {
  hallucinationCount += 1;
  continue;
}
```

---

## 5. 重试规范

AI 调用失败（限流、超时、网络错误）时使用指数退避重试。`ChapterAnalysisService` 已实现，关键参数：

```typescript
const AI_MAX_RETRIES = 2;       // 最多重试 2 次（共 3 次调用）
const AI_RETRY_BASE_MS = 600;   // 首次等待 600ms，之后乘以 attempt+1
```

**可重试错误**（已在 `isRetryableAiError` 中定义）：

- HTTP 429（Rate Limit）
- 网络超时（timeout、ECONNRESET）
- 服务暂时不可用（temporarily unavailable）

**不可重试**：JSON 解析失败、Schema 校验失败——这些是 prompt 问题，重试无效。

---

## 6. Prompt 与输出 Schema 的绑定

Prompt 要求 AI 输出的 JSON 结构，必须与 `chapterAnalysisResponseSchema` 严格对齐。

修改 schema 时**必须同步更新 prompt**（[prompts.ts](../../src/server/modules/analysis/ai/prompts.ts)），反之亦然。两者不一致是幻觉率上升的主要原因之一。

```
修改 schema → 检查 prompt 中的字段名是否一致
修改 prompt → 跑一次真实分析，验证 Zod 校验通过率
```

---

## 7. 别名映射的“双状态契约”（防止同人拆分）

在人物解析链路中，别名映射至少有两种语义，禁止复用同一个字段：

- `reviewStatus`：审核语义（`PENDING / CONFIRMED / REJECTED`），用于审核台与人工流程。
- `resolverStatus`：解析消费语义（`ACTIVE / BLOCKED`），用于 `PersonaResolver` 是否可命中复用。

### 设计要求

1. `reviewStatus` 与 `resolverStatus` 必须独立存储和更新，避免“审核未确认”直接等价于“解析不可用”。
2. 满足以下条件的线索可 `resolverStatus=ACTIVE`（即使 `reviewStatus=PENDING`）：
   - 已绑定明确 `personaId`
   - 置信度达到在线命中阈值（例如 `>= 0.85`）
   - 有章节上下文证据（`evidence/contextHash`）
3. 发生冲突证据（同别名指向不同 persona）时，必须先降级 `resolverStatus=BLOCKED`，再进入人工复核。
4. `DUPLICATE_PERSONA -> MERGE` 属于兜底治理，不可替代前置命中防重。

```typescript
// 反例：一个 status 同时承载“审核”与“解析可用”
status = confidence >= 0.9 ? "CONFIRMED" : "PENDING";
resolverConsumes = status === "CONFIRMED" || status === "LLM_INFERRED";

// 正例：双状态解耦
reviewStatus = confidence >= 0.9 ? "CONFIRMED" : "PENDING";
resolverStatus = confidence >= 0.85 && hasPersonaId && hasEvidence ? "ACTIVE" : "BLOCKED";
```

---

## 禁用模式

- `chapterAnalysisResponseSchema.parse()`（校验失败时直接抛错，中断整章分析）。
- AI 返回的 JSON 不校验直接入库。
- 多个模型使用不同的输出 schema。
- 幻觉错误上抛导致事务回滚。
- 改 schema 但不同步更新 prompt。
- 把 `PENDING` 视为“解析一律不可用”，导致跨章节重复创建 persona。
