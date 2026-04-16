# Zod-First 类型规范

> 适用于本项目所有涉及外部数据（AI 输出、API 请求体、URL 参数）的类型定义场景。

---

## 核心原则：Schema 优先，类型推导

有 Zod schema 的地方，**禁止手动重复声明 interface/type**。
Schema 是唯一事实来源，TypeScript 类型从 schema 推导。

```typescript
import { z } from 'zod';

// 1. 先定义 schema
export const characterSchema = z.object({
  name: z.string(),
  aliases: z.array(z.string()),
  faction: z.string().optional(),
  relationships: z.array(z.object({
    target: z.string(),
    type: z.enum(['父子', '姻亲', '师生', '敌对', '挚友', '债务']),
    evidence: z.string(),   // 原文证据片段
  })),
});

// 2. 类型自动推导，不要手写
export type Character = z.infer<typeof characterSchema>;

// 反例：与 schema 重复的手写类型
interface Character {          // 禁止
  name: string;
  aliases: string[];
  // ...
}
```

---

## 适用场景（本项目重点）

### AI 输出解析

AI 返回的 JSON 结构不稳定，必须用 Zod 校验。

```typescript
// src/types/analysis.ts
export const chapterAnalysisSchema = z.object({
  characters: z.array(characterSchema),
  relationships: z.array(relationshipSchema),
  locations: z.array(locationSchema).optional(),
  timeEvents: z.array(timeEventSchema).optional(),
});

export type ChapterAnalysis = z.infer<typeof chapterAnalysisSchema>;

// 解析时捕获错误，不要 blind cast
export function parseAiOutput(raw: unknown): ChapterAnalysis {
  const result = chapterAnalysisSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`AI 输出格式非法: ${result.error.message}`);
  }
  return result.data;
}
```

### API 请求体校验

```typescript
// src/app/api/analyze/route.ts
const requestBodySchema = z.object({
  bookId: z.string().cuid(),
  chapterId: z.string().cuid(),
  modelId: z.enum(['gemini-flash', 'deepseek-v3', 'gpt-4o']),
});

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = requestBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ success: false, code: 'INVALID_INPUT' }, { status: 400 });
  }
  const { bookId, chapterId, modelId } = parsed.data;
  // ...
}
```

### 可复用基础 Schema

```typescript
// src/types/common.ts
export const paginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
});

export const timestampsSchema = z.object({
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// 组合复用
export const paginatedCharactersSchema = paginationSchema.extend({
  bookId: z.string(),
  faction: z.string().optional(),
});
```

---

## 可辨识联合（discriminated union）

```typescript
// AI 分析结果的多状态
export const analysisResultSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('success'),
    data: chapterAnalysisSchema,
  }),
  z.object({
    status: z.literal('partial'),
    data: chapterAnalysisSchema,
    warnings: z.array(z.string()),
  }),
  z.object({
    status: z.literal('failed'),
    reason: z.string(),
  }),
]);

type AnalysisResult = z.infer<typeof analysisResultSchema>;

// 收窄类型时用 === 严格比较
if (result.status === 'success') {
  console.log(result.data);  // TypeScript 知道 data 存在
}
```

---

## 禁用模式

```typescript
// 禁止：无校验的 as 断言
const character = data as Character;

// 禁止：any
function parseAi(data: any) { ... }

// 禁止：非空断言
const name = character!.name;

// 正确做法
const result = characterSchema.safeParse(data);
if (result.success) {
  const name = result.data.name;
}
```

---

## 与现有 type-safety.md 的关系

- `type-safety.md` 定义项目范围内的校验边界与 `ApiResponse<T>` 规范。
- 本规范定义**如何用 Zod 声明 schema**，是 `type-safety.md` 运行时校验规则的实现方式。
- 两者互补，不冲突。外部输入校验优先使用 Zod；组件 props interface 仍用 TypeScript 手写。

---

## 安装

```bash
pnpm add zod
```
