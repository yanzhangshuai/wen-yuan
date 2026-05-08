# 关系结构契约

> 适用范围：`Relationship` 单表模型，以及对应的 Prisma schema、service、API 与客户端类型。
>
> **变更记录 (2026-05-07)**：`RelationshipEvent` 表已删除，其字段（`chapterId`、`chapterNo`、`evidence`、`summary`、`attitudeTags`）合并入 `Relationship` 主表。`relationshipTypeCode` 改为中文自由文本。`unknownTypeProposal` 已从 AI 输出协议中移除。

## Scenario: Relationship Single-Table Model

### 1. Scope / Trigger

- Trigger: 关系数据模型从「书级结构关系 + 章节级事件明细」双表，简化为单表模型。AI 直接输出中文关系 code，不再走字典匹配 + 未知类型审批流程。
- 涉及层级：`prisma/schema.prisma`、`src/server/modules/relationships/*`、`src/app/api/books/[id]/relationships/route.ts`、`src/app/api/relationships/[id]/route.ts`、`src/lib/services/relationships.ts`。
- `Relationship` 同时承载结构关系声明与章节级证据/摘要/态度标签；不再分离到 `RelationshipEvent`。

### 2. Signatures

DB signature:

```prisma
model Relationship {
  id                   String           @id @default(uuid())
  bookId               String
  sourceId             String
  targetId             String
  relationshipTypeCode String           // 中文关系名（如 父子、师生）
  chapterId            String?          // 首次出现章节
  chapterNo            Int?             // 首次出现章回号
  evidence             String?          // 原文证据
  summary              String?          // 关系摘要
  attitudeTags         String[]         @default([]) // 态度标签
  recordSource         RecordSource     @default(DRAFT_AI)
  status               ProcessingStatus @default(DRAFT)
  deletedAt            DateTime?
}
```

Service signatures:

```ts
createBookRelationship(bookId, {
  sourceId,
  targetId,
  relationshipTypeCode  // 中文关系名，必填
});

patchRelationship(id, {
  relationshipTypeCode?,
  status?,
  recordSource?,
  evidence?,
  summary?,
  attitudeTags?
});

deleteRelationship(id);
listBookRelationships(bookId, filter?);
```

API signatures:

- `POST /api/books/:bookId/relationships`
  - body: `{ sourceId: uuid, targetId: uuid, relationshipTypeCode: string }`
- `GET /api/books/:bookId/relationships`
  - response item: `{ id, sourceId, targetId, relationshipTypeCode, recordSource, status, chapterNo, evidence, summary, attitudeTags }`
- `PATCH /api/relationships/:id`
  - body: partial `{ relationshipTypeCode, status, recordSource, evidence, summary, attitudeTags }`，至少一个字段。

### 3. Contracts

- Uniqueness: active rows are unique by `(bookId, sourceId, targetId, relationshipTypeCode)` where `deletedAt IS NULL`.
- Prisma cannot model that partial unique predicate; keep the active-row uniqueness guarantee in raw migration SQL.
- `relationshipTypeCode` 是中文自由文本，不再要求 reference `RelationshipTypeDefinition`。
- `RelationshipTypeDefinition` 保留为可选元数据表，用于控制图谱边方向（`directionMode`）和提供显示映射。无匹配定义时默认 `SYMMETRIC` 方向。
- 对于 `directionMode === "SYMMETRIC"`，service 必须按 UUID 字符串顺序 canonicalize 端点后再 lookup/create。
- Manual create/upsert always returns `recordSource = MANUAL` and `status = VERIFIED`。
- `RecordSource` is monotonic: `DRAFT_AI -> AI -> MANUAL`; downgrades are rejected.
- Deleting a relationship is a soft delete；不再需要级联删除 events。
- `evidence` 和 `summary` 合并自旧 `RelationshipEvent` 表；同一 pair + code 下若有多条 event 合并为一条 relationship，取最早 chapter 的数据。

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| `sourceId === targetId` | Throw `RelationshipInputError` |
| Book missing or soft-deleted | Throw `BookNotFoundError` |
| Either persona missing or soft-deleted | Throw `PersonaNotFoundError` |
| `patchRelationship({})` | Throw `RelationshipInputError("至少需要一个可更新字段")` |
| `recordSource` downgrade | Throw `RelationshipInputError("recordSource 不可降级")` |
| Delete unknown relationship | Throw `RelationshipNotFoundError` |
| Delete already-soft-deleted relationship | Return idempotent success |
| Concurrent create hits partial unique index | Retry the transaction and return/update the existing active relationship |

### 5. Good/Base/Bad Cases

- Good: Creating a symmetric relationship with reversed endpoints stores one canonical active row and repeated requests return the same relationship as `MANUAL + VERIFIED`。
- Base: A relationship with no `chapterId` lists with `chapterNo = null` and no evidence。
- Bad: 把 `relationshipTypeCode` 写成 hash code（如 `relationship_abc123`）或 UPPER_SNAKE_CASE（如 `FATHER_SON`）而非中文，破坏图谱显示和搜索体验。

### 6. Tests Required

- `createBookRelationship.test.ts`
  - first manual create; existing `DRAFT_AI` upgraded to `MANUAL`; existing `MANUAL` remains idempotent; symmetric canonicalization; self-loop rejected; soft-deleted endpoint rejected; unique-conflict retry。
- `updateRelationship.test.ts`
  - `DRAFT_AI -> AI`; `AI -> MANUAL`; downgrade rejection; status update independent from source update; evidence/summary/tags update。
- `deleteRelationship.test.ts`
  - active relationship soft-delete; already-deleted row is idempotent。
- `listBookRelationships.test.ts`
  - soft-deleted excluded; results are book-scoped。
- API/client tests must assert request body fields reflect single-table flat fields。

### 7. Wrong vs Correct

#### Wrong

```prisma
model Relationship {
  @@unique([sourceId, targetId, relationshipTypeCode])
}
```

This uses a global unique constraint that blocks recreation after soft delete.

#### Correct

```sql
CREATE UNIQUE INDEX "relationships_book_pair_type_key"
  ON "relationships"("book_id", "source_id", "target_id", "relationship_type_code")
  WHERE "deleted_at" IS NULL;
```

```ts
await prisma.relationship.update({
  where: { id: relationshipId },
  data : { status: ProcessingStatus.REJECTED, deletedAt }
});
```

The database owns active-row uniqueness, while service code owns soft-delete and monotonic source transitions.

---

## Scenario: AI Relationship Single Write

### 1. Scope / Trigger

- Trigger: 章节分析 AI 输出简化为单层 `relationships` 数组，直接使用中文 `relationshipTypeCode`。不再有 `relationshipEvents` 分离，不再有 `unknownTypeProposal`。
- 适用范围：`ChapterAnalysisService`、章节分析 Prompt、AI 输出 schema、analysis job 的章节校验 payload。
- AI 写入只产生草稿数据；人工审核、合并、聚合查询属于后续服务/API 层任务。

### 2. Signatures

AI output:

```ts
relationships: Array<{
  sourceName: string;
  targetName: string;
  relationshipTypeCode: string;  // 中文关系名（如 父子、师生），必填
  evidence?: string;
  summary?: string;
  attitudeTags: string[];
  confidence: number;
}>;
```

DB write:

```ts
await tx.relationship.create({
  data: {
    bookId,
    sourceId,
    targetId,
    relationshipTypeCode,  // AI 输出的中文 code，直接写入
    chapterId,
    chapterNo,
    evidence,
    summary,
    attitudeTags,
    recordSource: RecordSource.DRAFT_AI,
    status      : ProcessingStatus.DRAFT
  }
});
```

### 3. Contracts

- `relationshipTypeCode` 是中文自由文本，AI 被指示使用简洁的中文关系名（如 `父子`、`师生`、`同僚`）。若模型认为字典无法匹配，用最贴切的中文描述，禁止置空。
- 无 `relationshipTypeCode` 的 AI 输出记录被规范化阶段丢弃（以 `"missing_relationship_code"` 警告记录）。
- `RelationshipTypeDefinition` 表保留为可选元数据，不再注入 AI prompt 作为强制字典。Prompt 中可以列出常见类型作为示例，但不要求 AI 必须从中选择。
- 对于 `directionMode === "SYMMETRIC"`，端点按 persona UUID 字符串顺序 canonicalize 后再 lookup/create。
- AI-created rows use `RecordSource.DRAFT_AI` and `ProcessingStatus.DRAFT`。
- Sequential 和 twopass 管线必须传递相同的规范化 AI 输出契约。

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| `relationshipTypeCode` 为空或缺失 | 丢弃该条记录，输出 `"missing_relationship_code"` 警告 |
| Either endpoint cannot resolve to a persona | Skip write and count hallucinated endpoints |
| `sourceId === targetId` | Skip write |
| Symmetric relationship endpoints reversed | Canonicalize before lookup/create |
| Duplicate relationship in one chapter result | Reuse the same relationship id |
| `attitudeTags` contains blanks or duplicates | Trim, remove blanks, dedupe |
| `evidence` blank string | Store as `null` |

### 5. Good/Base/Bad Cases

- Good: AI outputs `relationships[{sourceName:"范进", targetName:"胡屠户", relationshipTypeCode:"岳婿", evidence:"...", summary:"..."}]`；service 创建或复用一条 book-level `Relationship`，附带章节证据和摘要。
- Base: AI outputs a relationship with code but no evidence/summary；service 创建 relationship 且 `evidence`/`summary` 为 null。
- Bad: AI outputs only `summary` but no `relationshipTypeCode`；规范化阶段丢弃该记录。

### 6. Tests Required

- Unit tests for empty/missing code skip, self-loop skip, hallucinated endpoint skip。
- Unit tests for symmetric canonicalization and idempotent relationship reuse。
- Prompt/schema tests proving `relationshipTypeCode` is required and Chinese。
- Job runner tests validating relationships are written correctly with flat fields。

### 7. Wrong vs Correct

#### Wrong

```ts
// 旧模式：字典匹配，不匹配就丢弃
const typeDef = activeTypes.find(t => t.code === aiCode);
if (!typeDef) return; // 静默丢弃

// 旧模式：事件分离写入
await tx.relationshipEvent.createMany({ data: events });
```

#### Correct

```ts
// 新模式：中文 code 直接写入，不经字典 gate
await tx.relationship.upsert({
  where: { bookId_sourceId_targetId_relationshipTypeCode: { ... } },
  create: {
    bookId, sourceId, targetId,
    relationshipTypeCode: aiCode.trim(), // 中文直接落库
    chapterId, chapterNo, evidence, summary, attitudeTags,
    recordSource: RecordSource.DRAFT_AI,
    status: ProcessingStatus.DRAFT
  },
  update: {} // 幂等
});
```

---

## Scenario: Persona Merge and Full Reanalysis Cleanup

### 1. Scope / Trigger

- Trigger: `mergePersonas(targetId, sourceId)` 需要把 loser 相关的关系重定向到 winner；`startBookAnalysis(bookId, options)` 在全量重跑前需要清理旧草稿关系。
- 涉及层级：`src/server/modules/personas/mergePersonas.ts`、`src/server/modules/books/startBookAnalysis.ts`、对应单测。

### 2. Signatures

```ts
mergePersonas({ targetId, sourceId }): {
  sourceId: string;
  targetId: string;
  redirectedRelationships: number;
  rejectedRelationships: number;
  redirectedBiographyCount: number;
  redirectedMentionCount: number;
}

startBookAnalysis(bookId, input?): Promise<StartBookAnalysisResult>
```

### 3. Contracts

- `Relationship` 以 `(bookId, sourceId, targetId, relationshipTypeCode)` 作为 active 唯一键语义。
- `RecordSource` 只允许单调升级：`DRAFT_AI -> AI -> MANUAL`。
- `mergePersonas` 合并同名边时，优先保留更高 `recordSource`；同级时保留 `id` 字典序更小者。
- `startBookAnalysis` 只在全量重跑时硬删除该书的 `DRAFT_AI` Relationship，且必须与创建 `AnalysisJob` 处于同一事务。
- 不再需要级联处理 `RelationshipEvent` 表（已删除）。

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| `sourceId === targetId` | Throw `PersonaMergeInputError` |
| 合并后 source/target 相同 | 软删关系 |
| `directionMode === "SYMMETRIC"` | 合并后按 UUID 字符串顺序 canonicalize |
| 唯一键冲突 | 按 `recordSource` 与 `id` 规则决定保留者 |
| 全量重跑 | 先清 `DRAFT_AI` 草稿，再创建 `AnalysisJob` |
| 章节子集重跑 | 不清草稿 |

### 5. Good/Base/Bad Cases

- Good: loser 的关系全部迁到 winner，端点与关系端点一致。
- Base: 对称关系在重定向后仍保持"小者在前"的 canonical 顺序。
- Bad: 在部分重跑时误删非草稿关系；或仍尝试操作不存在的 `RelationshipEvent` 表。

### 6. Tests Required

- `mergePersonas.test.ts`
  - 普通迁移更新关系端点。
  - 自环软删。
  - 对称关系重新 canonicalize。
  - 冲突按 `recordSource` 和 `id` 合并。
  - 不再 mock `relationshipEvent` 相关方法。
- `startBookAnalysis.test.ts`
  - 全量重跑清理 `DRAFT_AI` 关系。
  - 章节子集不清理。
  - 清理失败回滚且不创建 `AnalysisJob`。

### 7. Wrong vs Correct

#### Wrong

```ts
await tx.relationshipEvent.deleteMany({ where: { bookId, recordSource: RecordSource.DRAFT_AI } });
await tx.relationship.deleteMany({ where: { bookId, recordSource: RecordSource.DRAFT_AI } });
await tx.analysisJob.create(...);
```

#### Correct

```ts
await tx.$transaction(async (tx) => {
  await tx.relationship.deleteMany({
    where: { bookId, recordSource: RecordSource.DRAFT_AI }
  });
  await tx.analysisJob.create(...);
});
```

---

## Scenario: Persona Pair Aggregation API

### 1. Scope / Trigger

- Trigger: 前端 Pair 详情面板需要一次读取两个人物之间的结构关系，附带章节证据和态度标签。
- 涉及层级：`src/server/modules/relationships/getPersonaPair.ts`、`src/app/api/persona-pairs/[bookId]/[aId]/[bId]/route.ts`、`src/lib/services/persona-pairs.ts`、`src/types/persona-pair.ts`。

### 2. Signatures

```ts
GET /api/persona-pairs/:bookId/:aId/:bId

getPersonaPair({
  bookId: string;
  aId: string;
  bId: string;
}): Promise<PersonaPairResponse>
```

### 3. Contracts

- Route 只接受路径参数；无 body、无 query。
- 登录态即可访问；未登录返回 401。
- `personas` 返回 `[a, b]` 顺序的人物快照。
- `relationships` 必须覆盖 `a -> b` 与 `b -> a` 两个方向的 active 结构关系。
- 证据、摘要、态度标签、章节信息等字段直接从 `Relationship` 的 flat 字段读取，不再嵌套子查询。
- `status` 使用 `ProcessingStatus`：`DRAFT | VERIFIED | REJECTED`。
- `relationshipType.inverseLabel` 映射自 `RelationshipTypeDefinition.reverseEdgeLabel`（如有定义）；无定义时使用 `relationshipTypeCode` 本身。

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| 任一路径参数不是 UUID | 400 `BAD_REQUEST` |
| `aId === bId` | 400 `BAD_REQUEST` |
| 未登录 | 401 `UNAUTHORIZED` |
| 书籍不存在或软删 | 404 `BOOK_NOT_FOUND` |
| 任一人物不存在或软删 | 404 `PERSONA_NOT_FOUND` |

### 5. Good/Base/Bad Cases

- Good: 同一 pair 有多条不同 type 的结构关系，每条关系都带回 evidence/summary/attitudeTags。
- Base: pair 没有 active 关系时仍返回 200，且 `relationships: []`。
- Bad: 在 service 中按关系循环查询子表；现在子表已不存在，这种写法在编译期即报错。

### 6. Tests Required

- Service tests:
  - 双向关系均返回。
  - 软删关系被过滤。
  - `chapterNo`、`evidence`、`summary` 从 flat 字段直接读取。
  - 关系按 `relationshipTypeCode` 排序。
- Route tests:
  - 200、401、400、404 映射稳定。
- Client tests:
  - `bookId/aId/bId` 必须 `encodeURIComponent` 后拼接。

### 7. Wrong vs Correct

#### Wrong

```ts
// 旧模式：嵌套 events 子查询
await prisma.relationship.findMany({
  where: { ... },
  include: {
    events: {
      where: { deletedAt: null },
      include: { chapter: { select: { id: true, no: true, title: true } } }
    }
  }
});
```

#### Correct

```ts
// 新模式：flat 字段直接读取
await prisma.relationship.findMany({
  where: {
    bookId,
    deletedAt: null,
    OR: [
      { sourceId: aId, targetId: bId },
      { sourceId: bId, targetId: aId }
    ]
  },
  include: {
    relationshipType: true  // 可选元数据，用于方向控制
  },
  orderBy: { relationshipTypeCode: "asc" }
});
```

`evidence`、`summary`、`attitudeTags`、`chapterNo` 已经是 `Relationship` 的 flat 字段，无需额外 include。
