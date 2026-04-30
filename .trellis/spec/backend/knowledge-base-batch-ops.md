# 知识库批量操作契约

> 适用范围：知识库管理台中“姓氏词库 / 泛化称谓 / NER 词典规则 / Prompt 提取规则 / 关系类型知识库”的批量删除、启用、停用、设置书籍类型、审核状态和分组类操作。

## Scenario: Admin Knowledge Batch Operations

### 1. Scope / Trigger

- Trigger: 新增或调整 `src/app/api/admin/knowledge/*/batch/route.ts`、`src/lib/services/*` 中的 `batch*Action`、`src/server/modules/knowledge/*` 中的 `batchDelete*` / `batchToggle*` / `batchChangeBookType*` / `batchUpdateRelationshipTypeStatus` / `batchChangeRelationshipTypeGroup`。
- 这是跨层契约：Client Component 组装 payload，client service 发送请求，Route Handler 做鉴权与 Zod 校验，server module 执行 Prisma 事务，最后通过统一 API envelope 返回 `{ count }`。
- 任一层新增 action、字段或错误分支时，必须同步更新本规范、调用方类型和对应测试。

### 2. Signatures

前端 service 输入必须保持 discriminated union，不能用宽泛对象：

```ts
type KnowledgeBatchActionInput =
  | { action: "delete" | "enable" | "disable"; ids: string[] }
  | { action: "changeBookType"; ids: string[]; bookTypeId: string | null };

type RelationshipTypeBatchActionInput =
  | { action: "delete" | "enable" | "disable" | "markPendingReview"; ids: string[] }
  | { action: "changeGroup"; ids: string[]; group: RelationshipTypeGroup };
```

公开 client service 函数：

```ts
batchSurnameAction(body): Promise<{ count: number }>;
batchGenericTitleAction(body): Promise<{ count: number }>;
batchNerLexiconRuleAction(body): Promise<{ count: number }>;
batchPromptExtractionRuleAction(body): Promise<{ count: number }>;
batchRelationshipTypeAction(body): Promise<{ count: number }>;
```

Route Handler：

```text
POST /api/admin/knowledge/surnames/batch
POST /api/admin/knowledge/title-filters/batch
POST /api/admin/knowledge/ner-rules/batch
POST /api/admin/knowledge/prompt-extraction-rules/batch
POST /api/admin/knowledge/relationship-types/batch
```

Server module 函数必须按资源拆分，避免 route 层直接感知 Prisma model：

```ts
batchDeleteSurnames(ids: string[]): Promise<{ count: number }>;
batchToggleSurnames(ids: string[], isActive: boolean): Promise<{ count: number }>;
batchChangeBookTypeSurnames(ids: string[], bookTypeId: string | null): Promise<{ count: number }>;
```

同样模式适用于 `GenericTitles`、`NerLexiconRules`、`PromptExtractionRules`。

关系类型知识库使用状态和分组专用函数：

```ts
batchUpdateRelationshipTypeStatus(
  ids: string[],
  status: "ACTIVE" | "INACTIVE" | "PENDING_REVIEW"
): Promise<{ count: number }>;
batchChangeRelationshipTypeGroup(ids: string[], group: RelationshipTypeGroup): Promise<{ count: number }>;
batchDeleteRelationshipTypes(ids: string[]): Promise<{ count: number }>;
```

### 3. Contracts

请求体由 `knowledgeBatchActionSchema` 统一校验：

```ts
const knowledgeBatchActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("delete"), ids: uuidArray }),
  z.object({ action: z.literal("enable"), ids: uuidArray }),
  z.object({ action: z.literal("disable"), ids: uuidArray }),
  z.object({
    action: z.literal("changeBookType"),
    ids: uuidArray,
    bookTypeId: z.string().uuid().nullable()
  })
]);
```

`ids` 规则：

- 必须是 UUID 数组。
- 最少 1 条。
- 最多 500 条。
- Route Handler 只在 schema 通过后调用 server module。

关系类型知识库请求体由 `relationshipTypeBatchActionSchema` 校验，复用相同 `ids` 规则：

```ts
const relationshipTypeBatchActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("delete"), ids: uuidArray }),
  z.object({ action: z.literal("enable"), ids: uuidArray }),
  z.object({ action: z.literal("disable"), ids: uuidArray }),
  z.object({ action: z.literal("markPendingReview"), ids: uuidArray }),
  z.object({
    action: z.literal("changeGroup"),
    ids: uuidArray,
    group: relationshipTypeGroupSchema
  })
]);
```

成功响应必须使用统一 API envelope：

```ts
{
  success: true,
  code: "ADMIN_SURNAMES_BATCH_UPDATED",
  message: "姓氏批量操作成功",
  data: { count: 2 },
  meta: { requestId, timestamp, path, durationMs }
}
```

资源对应成功码：

| Resource | Success Code | Path |
|----------|--------------|------|
| surnames | `ADMIN_SURNAMES_BATCH_UPDATED` | `/api/admin/knowledge/surnames/batch` |
| title-filters | `ADMIN_GENERIC_TITLES_BATCH_UPDATED` | `/api/admin/knowledge/title-filters/batch` |
| ner-rules | `ADMIN_NER_RULES_BATCH_UPDATED` | `/api/admin/knowledge/ner-rules/batch` |
| prompt-extraction-rules | `ADMIN_PROMPT_RULES_BATCH_UPDATED` | `/api/admin/knowledge/prompt-extraction-rules/batch` |
| relationship-types | `ADMIN_RELATIONSHIP_TYPES_BATCH_UPDATED` | `/api/admin/knowledge/relationship-types/batch` |

`changeBookType` 的资源差异：

- `surnames`、`ner-rules`、`prompt-extraction-rules`：`bookTypeId` 直接写入对应记录的 `bookTypeId`；`null` 表示全局通用。
- `title-filters`：`bookTypeId` 写入 `exemptInBookTypeIds`；非空值表示该称谓对该书籍类型豁免，`null` 表示清空豁免列表。

### 4. Validation & Error Matrix

| Case | Validation Owner | HTTP | Code | Required Behavior |
|------|------------------|------|------|-------------------|
| 未登录 | `requireAdmin` / `failJson` | 401 | `AUTH_UNAUTHORIZED` | 客户端跳转登录页 |
| 非管理员 | `requireAdmin` / `failJson` | 403 | `AUTH_FORBIDDEN` | 客户端展示无权限错误 |
| `ids` 为空 | `knowledgeBatchActionSchema` | 400 | `COMMON_BAD_REQUEST` | 不调用任何 batch server function |
| `ids` 超过 500 | `knowledgeBatchActionSchema` | 400 | `COMMON_BAD_REQUEST` | 不调用任何 batch server function |
| `ids` 非 UUID | `knowledgeBatchActionSchema` | 400 | `COMMON_BAD_REQUEST` | `error.type` 为 `ValidationError` |
| `changeBookType` 缺少 `bookTypeId` | `knowledgeBatchActionSchema` | 400 | `COMMON_BAD_REQUEST` | 不调用 `batchChangeBookType*` |
| `changeGroup` 缺少或传入非法 `group` | `relationshipTypeBatchActionSchema` | 400 | `COMMON_BAD_REQUEST` | 不调用 `batchChangeRelationshipTypeGroup` |
| 关系类型批量删除包含已被角色关系引用项 | `batchDeleteRelationshipTypes` | 500 | `COMMON_INTERNAL_ERROR` | 拒绝整批删除；UI 提示改为批量停用 |
| 删除 SAFETY 泛化称谓 | `batchDeleteGenericTitles` | 500 | `COMMON_INTERNAL_ERROR` | 当前实现通过 service guard 拒绝，UI 必须保留可重试上下文 |
| Prisma 删除/更新失败 | server module / `failJson` | 500 | `COMMON_INTERNAL_ERROR` | 返回 fallbackMessage，客户端 toast 展示错误 |

新增业务 guard 时，优先在 route 层转换成稳定错误码；若沿用 server module 抛错，必须补充 UI 失败路径测试，确认弹层或选择状态不会提前丢失。

### 5. Good / Base / Bad Cases

Good case:

```ts
await batchSurnameAction({
  action: "changeBookType",
  ids: ["11111111-1111-4111-8111-111111111111"],
  bookTypeId: null
});
```

Base case:

```ts
await batchNerLexiconRuleAction({
  action: "enable",
  ids: ["22222222-2222-4222-8222-222222222222"]
});
```

Relationship type case:

```ts
await batchRelationshipTypeAction({
  action: "changeGroup",
  ids: ["33333333-3333-4333-8333-333333333333"],
  group: "姻亲"
});
```

Bad case:

```ts
await batchPromptExtractionRuleAction({
  action: "changeBookType",
  ids: [],
  bookTypeId: "not-a-uuid"
});
```

Bad case must be rejected at `knowledgeBatchActionSchema` and must not reach Prisma.

### 6. Tests Required

- Component: `src/app/admin/knowledge-base/batch-action-controls.test.tsx` must assert selected count rendering, async pending state, delete confirmation lifecycle, and global sentinel -> `null` mapping.
- Route: each `src/app/api/admin/knowledge/*/routes.test.ts` batch section must assert all four actions dispatch to the expected server function and invalid payload returns 400 without dispatch.
- Client service: each `src/lib/services/*.test.ts` batch case must assert URL, method, JSON body, and returned `{ count }`.
- Server module: `src/server/modules/knowledge/catalog-services.test.ts` must assert Prisma `$transaction` call shape and returned affected count.
- Relationship types:
  - `src/app/api/admin/knowledge/relationship-types/routes.test.ts` must assert `delete` / `enable` / `disable` / `markPendingReview` / `changeGroup` dispatch and invalid payload rejection.
  - `src/lib/services/relationship-types.test.ts` must assert `batchRelationshipTypeAction` posts to `/api/admin/knowledge/relationship-types/batch`.
  - `src/server/modules/knowledge/relationship-types.test.ts` must assert referenced records reject batch delete and status/group updates call `updateMany`.
- Contract assertion: success path should verify `success/code/data/meta` when testing through Route Handler; validation path should verify `COMMON_BAD_REQUEST` where the test reads payload.

### 7. Wrong vs Correct

Wrong:

```ts
// Route 层绕过共享 schema，导致四个资源的 payload 规则漂移。
const body = await request.json();
await batchToggleSurnames(body.ids, body.enabled);
```

Correct:

```ts
const parsed = knowledgeBatchActionSchema.safeParse(await readJsonBody(request));
if (!parsed.success) {
  return badRequestJson(PATH, requestId, startedAt, parsed.error.issues[0]?.message ?? "参数不合法");
}
```

Wrong:

```ts
// 泛化称谓直接写 bookTypeId，会把“豁免书籍类型”误建模为归属关系。
await prisma.genericTitleRule.update({ where: { id }, data: { bookTypeId } });
```

Correct:

```ts
await prisma.genericTitleRule.update({
  where: { id },
  data: { exemptInBookTypeIds: bookTypeId ? [bookTypeId] : [] }
});
```

## 落地参考

- `src/app/api/admin/knowledge/_shared.ts`
- `src/app/api/admin/knowledge/surnames/batch/route.ts`
- `src/lib/services/surnames.ts`
- `src/server/modules/knowledge/surnames.ts`
- `src/app/admin/knowledge-base/batch-action-controls.tsx`
