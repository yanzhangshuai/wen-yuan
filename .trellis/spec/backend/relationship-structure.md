# 关系结构契约

> 适用范围：`Relationship` 书级结构关系、`RelationshipEvent` 章节级关系事件，以及对应的 Prisma schema、service、API 与客户端类型。

## Scenario: Relationship / RelationshipEvent Split

### 1. Scope / Trigger

- Trigger: 关系数据模型从“章节级单行关系”迁移为“书级唯一结构关系 + 章节级事件明细”。
- 涉及层级：`prisma/schema.prisma`、`src/server/modules/relationships/*`、`src/app/api/books/[id]/relationships/route.ts`、`src/app/api/relationships/[id]/route.ts`、`src/lib/services/relationships.ts`。
- `Relationship` 只表达一对人物在一本书中的结构关系；证据、摘要、章节号、段落索引和置信度只能写入 `RelationshipEvent`。

### 2. Signatures

DB signatures:

```prisma
model Relationship {
  bookId               String
  sourceId             String
  targetId             String
  relationshipTypeCode String
  recordSource         RecordSource     @default(DRAFT_AI)
  status               ProcessingStatus @default(DRAFT)
  deletedAt            DateTime?
}

model RelationshipEvent {
  relationshipId String
  bookId         String
  chapterId      String
  chapterNo      Int
  sourceId       String
  targetId       String
  summary        String
  evidence       String?
  attitudeTags   String[]
  paraIndex      Int?
  confidence     Float
  recordSource   RecordSource
  status         ProcessingStatus
  deletedAt      DateTime?
}
```

Service signatures:

```ts
createBookRelationship(bookId, {
  sourceId,
  targetId,
  relationshipTypeCode
});

updateRelationship(relationshipId, {
  relationshipTypeCode?,
  status?,
  recordSource?
});

deleteRelationship(relationshipId);
listBookRelationships(bookId, filter?);
```

API signatures:

- `POST /api/books/:bookId/relationships`
  - body: `{ sourceId: uuid, targetId: uuid, relationshipTypeCode: string }`
- `GET /api/books/:bookId/relationships`
  - response item: `{ id, sourceId, targetId, relationshipTypeCode, relationshipTypeName, recordSource, status, eventCount, firstChapterNo }`
- `PATCH /api/relationships/:id`
  - body: partial `{ relationshipTypeCode, status, recordSource }`，至少一个字段。

### 3. Contracts

- Uniqueness: active rows are unique by `(book_id, source_id, target_id, relationship_type_code)` where `deleted_at IS NULL`.
- Prisma cannot model that partial unique predicate; keep the active-row uniqueness guarantee in raw migration SQL.
- `relationshipTypeCode` must reference an `ACTIVE` `RelationshipTypeDefinition`.
- For `directionMode === "SYMMETRIC"`, service must canonicalize by UUID string order before lookup/create.
- Manual create/upsert always returns `recordSource = MANUAL` and `status = VERIFIED`.
- `RecordSource` is monotonic: `DRAFT_AI -> AI -> MANUAL`; downgrades are rejected.
- Deleting a relationship is a soft delete and must soft-delete active `RelationshipEvent` rows in the same transaction.
- Listing relationships must compute `eventCount` and `firstChapterNo` without N+1 queries.

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| `sourceId === targetId` | Throw `RelationshipInputError` |
| Book missing or soft-deleted | Throw `BookNotFoundError` |
| Either persona missing or soft-deleted | Throw `PersonaNotFoundError` |
| Relationship type missing or inactive | Throw `RelationshipInputError("关系类型未启用")` |
| `updateRelationship({})` | Throw `RelationshipInputError("至少需要一个可更新字段")` |
| `recordSource` downgrade | Throw `RelationshipInputError("recordSource 不可降级")` |
| Delete unknown relationship | Throw `RelationshipNotFoundError` |
| Delete already-soft-deleted relationship | Return idempotent success with `softDeletedEventCount = 0` |
| Concurrent create hits partial unique index | Retry the transaction and return/update the existing active relationship |

### 5. Good/Base/Bad Cases

- Good: Creating a symmetric relationship with reversed endpoints stores one canonical active row and repeated requests return the same relationship as `MANUAL + VERIFIED`.
- Base: A relationship with no active events lists with `eventCount = 0` and `firstChapterNo = null`.
- Bad: Writing `summary`, `evidence`, `confidence`, or `chapterId` to `Relationship` reintroduces the old mixed model and breaks pair aggregation.

### 6. Tests Required

- `createBookRelationship.test.ts`
  - first manual create; existing `DRAFT_AI` upgraded to `MANUAL`; existing `MANUAL` remains idempotent; symmetric canonicalization; inactive type rejected; self-loop rejected; soft-deleted endpoint rejected; unique-conflict retry.
- `updateRelationship.test.ts`
  - `DRAFT_AI -> AI`; `AI -> MANUAL`; downgrade rejection; status update independent from source update.
- `deleteRelationship.test.ts`
  - active relationship soft-delete cascades active events; already-deleted row is idempotent.
- `listBookRelationships.test.ts`
  - soft-deleted events excluded from count; `firstChapterNo` uses active event min; results are book-scoped.
- API/client tests must assert request body fields no longer include old relationship columns.

### 7. Wrong vs Correct

#### Wrong

```prisma
model Relationship {
  chapterId  String
  evidence   String?
  confidence Float

  @@unique([sourceId, targetId, relationshipTypeCode])
}
```

This mixes structure and evidence, and it blocks recreation after soft delete.

#### Correct

```sql
CREATE UNIQUE INDEX "relationships_book_pair_type_key"
  ON "relationships"("book_id", "source_id", "target_id", "relationship_type_code")
  WHERE "deleted_at" IS NULL;
```

```ts
await prisma.$transaction(async (tx) => {
  await tx.relationshipEvent.updateMany({
    where: { relationshipId, deletedAt: null },
    data : { deletedAt }
  });
  await tx.relationship.update({
    where: { id: relationshipId },
    data : { status: ProcessingStatus.REJECTED, deletedAt }
  });
});
```

The database owns active-row uniqueness, while service code owns soft-delete cascade and monotonic source transitions.
