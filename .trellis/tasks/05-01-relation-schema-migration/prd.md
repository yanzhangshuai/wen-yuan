# 子任务 A：关系结构 schema 改造与服务层 CRUD 同步

> **父任务**：[04-30-character-relation-entry-design](../04-30-character-relation-entry-design/prd.md)
> **依赖**：无（其余 4 个子任务全部依赖本任务）
> **验收点映射**：父 §7.1、§7.6
> **不在范围内**：AI 写入路径（→ 子任务 B）、mergePersonas（→ 子任务 C）、聚合 API（→ 子任务 D）、前端（→ 子任务 E）

---

## 1. 目标

1. 升级 `Relationship` 表为「书级唯一」，删除旧字段，新增 `bookId`。
2. 新增 `RelationshipEvent` 表挂在 `Relationship` 下，按章节录入事件。
3. 扩展 `RecordSource` 枚举，新增 `DRAFT_AI` 值。
4. 同步 [src/server/modules/relationships/](../../../src/server/modules/relationships/) 下 4 个 service（create/list/update/delete）至新 schema。
5. 同步 [src/app/api/books/[id]/relationships/route.ts](../../../src/app/api/books/[id]/relationships/route.ts) 与 [src/app/api/relationships/[id]/route.ts](../../../src/app/api/relationships/[id]/route.ts) 的 Zod schema 与响应类型。
6. 同步 [src/lib/services/relationships.ts](../../../src/lib/services/relationships.ts) 客户端类型。
7. 一刀切清空旧 `relationships` 数据。

---

## 2. Prisma Schema 改造

**文件**：[prisma/schema.prisma](../../../prisma/schema.prisma) 行 372-410。

### 2.1 `RecordSource` 枚举扩展

```prisma
enum RecordSource {
  AI
  MANUAL
  DRAFT_AI   // 新增：AI 待审稿，需通过审核才能升级为 AI 或 MANUAL
}
```

### 2.2 `Relationship` 模型最终形态

```prisma
model Relationship {
  id                   String           @id @default(uuid()) @db.Uuid
  bookId               String           @map("book_id") @db.Uuid                       // 新增 NOT NULL
  sourceId             String           @map("source_id") @db.Uuid
  targetId             String           @map("target_id") @db.Uuid
  relationshipTypeCode String           @map("relationship_type_code")                  // 升级为 NOT NULL
  recordSource         RecordSource     @default(DRAFT_AI) @map("record_source")        // 默认值改为 DRAFT_AI
  status               ProcessingStatus @default(PENDING) @map("status")
  createdAt            DateTime         @default(now()) @map("created_at")
  updatedAt            DateTime         @updatedAt @map("updated_at")
  deletedAt            DateTime?        @map("deleted_at")

  book                 Book                          @relation(fields: [bookId], references: [id], onDelete: Cascade)
  source               Persona                       @relation("SourcePersona", fields: [sourceId], references: [id], onDelete: Restrict)
  target               Persona                       @relation("TargetPersona", fields: [targetId], references: [id], onDelete: Restrict)
  relationshipType     RelationshipTypeDefinition    @relation(fields: [relationshipTypeCode], references: [code], onDelete: Restrict)
  events               RelationshipEvent[]

  @@unique([bookId, sourceId, targetId, relationshipTypeCode], map: "relationships_book_pair_type_key")
  @@index([sourceId, targetId])
  @@index([relationshipTypeCode])
  @@index([bookId, status, deletedAt])
  @@map("relationships")
}
```

**删除字段**：`chapterId / type / weight / description / evidence / confidence`。
**保留 Persona 关系名**：`SourcePersona` / `TargetPersona`（不改名，避免破坏其他模块）。

### 2.3 `RelationshipEvent` 模型（新增）

```prisma
model RelationshipEvent {
  id              String           @id @default(uuid()) @db.Uuid
  relationshipId  String           @map("relationship_id") @db.Uuid
  bookId          String           @map("book_id") @db.Uuid           // 冗余，便于按书查询
  chapterId       String           @map("chapter_id") @db.Uuid
  chapterNo       Int              @map("chapter_no")                 // 冗余排序键
  sourceId        String           @map("source_id") @db.Uuid         // 冗余，便于不 join Relationship 即可查询
  targetId        String           @map("target_id") @db.Uuid
  summary         String           @map("summary") @db.Text           // 事件摘要（AI/人工填）
  evidence        String?          @map("evidence") @db.Text          // 原文证据片段
  attitudeTags    String[]         @default([]) @map("attitude_tags") // 自由文本数组，最多 3 个
  paraIndex       Int?             @map("para_index")                 // 段落索引
  confidence      Float            @default(1) @map("confidence")
  recordSource    RecordSource     @default(DRAFT_AI) @map("record_source")
  status          ProcessingStatus @default(PENDING) @map("status")
  createdAt       DateTime         @default(now()) @map("created_at")
  updatedAt       DateTime         @updatedAt @map("updated_at")
  deletedAt       DateTime?        @map("deleted_at")

  relationship    Relationship @relation(fields: [relationshipId], references: [id], onDelete: Restrict)
  book            Book         @relation(fields: [bookId], references: [id], onDelete: Cascade)
  chapter         Chapter      @relation(fields: [chapterId], references: [id], onDelete: Cascade)
  source          Persona      @relation("EventSourcePersona", fields: [sourceId], references: [id], onDelete: Restrict)
  target          Persona      @relation("EventTargetPersona", fields: [targetId], references: [id], onDelete: Restrict)

  @@index([relationshipId, chapterNo])
  @@index([bookId, chapterId])
  @@index([bookId, status, deletedAt])
  @@map("relationship_events")
}
```

**关系名**：`EventSourcePersona` / `EventTargetPersona`（与 `Relationship` 区分，不冲突）。

### 2.4 `Book` / `Chapter` / `Persona` 反向关系补全

- `Book.relationships`：已有，无需改动。
- `Book.relationshipEvents`：**新增** `relationshipEvents RelationshipEvent[]`。
- `Chapter.relationshipEvents`：**新增** `relationshipEvents RelationshipEvent[]`。
- `Persona.eventsAsSource` / `eventsAsTarget`：**新增** 反向引用（关系名 `EventSourcePersona` / `EventTargetPersona`）。

---

## 3. 迁移文件

**目录**：`prisma/migrations/<timestamp>_relationship_event_split/`（由 `pnpm prisma migrate dev --name relationship_event_split` 自动生成）。

迁移 SQL 必须按以下顺序：

```sql
-- 1) 扩展枚举
ALTER TYPE "RecordSource" ADD VALUE 'DRAFT_AI';

-- 2) 删除旧索引
DROP INDEX "relationships_dedup_key";

-- 3) 清空旧数据（v3.5 §2.5 一刀切）
DELETE FROM "relationships";

-- 4) Relationship 表字段改造
ALTER TABLE "relationships"
  DROP COLUMN "chapter_id",
  DROP COLUMN "type",
  DROP COLUMN "weight",
  DROP COLUMN "description",
  DROP COLUMN "evidence",
  DROP COLUMN "confidence";

ALTER TABLE "relationships"
  ADD COLUMN "book_id" UUID NOT NULL;
ALTER TABLE "relationships"
  ADD CONSTRAINT "relationships_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE;

ALTER TABLE "relationships"
  ALTER COLUMN "relationship_type_code" SET NOT NULL;

ALTER TABLE "relationships"
  ALTER COLUMN "record_source" SET DEFAULT 'DRAFT_AI';

-- 5) 新增唯一键（部分索引：忽略软删行）
CREATE UNIQUE INDEX "relationships_book_pair_type_key"
  ON "relationships"("book_id", "source_id", "target_id", "relationship_type_code")
  WHERE "deleted_at" IS NULL;

CREATE INDEX "relationships_book_status_deleted_idx"
  ON "relationships"("book_id", "status", "deleted_at");

-- 6) 新建 RelationshipEvent 表
CREATE TABLE "relationship_events" (
  "id"              UUID PRIMARY KEY,
  "relationship_id" UUID NOT NULL REFERENCES "relationships"("id") ON DELETE RESTRICT,
  "book_id"         UUID NOT NULL REFERENCES "books"("id") ON DELETE CASCADE,
  "chapter_id"      UUID NOT NULL REFERENCES "chapters"("id") ON DELETE CASCADE,
  "chapter_no"      INT  NOT NULL,
  "source_id"       UUID NOT NULL REFERENCES "personas"("id") ON DELETE RESTRICT,
  "target_id"       UUID NOT NULL REFERENCES "personas"("id") ON DELETE RESTRICT,
  "summary"         TEXT NOT NULL,
  "evidence"        TEXT,
  "attitude_tags"   TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "para_index"      INT,
  "confidence"      DOUBLE PRECISION NOT NULL DEFAULT 1,
  "record_source"   "RecordSource" NOT NULL DEFAULT 'DRAFT_AI',
  "status"          "ProcessingStatus" NOT NULL DEFAULT 'PENDING',
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMP(3) NOT NULL,
  "deleted_at"      TIMESTAMP(3)
);
CREATE INDEX "relationship_events_relationship_chapter_idx" ON "relationship_events"("relationship_id", "chapter_no");
CREATE INDEX "relationship_events_book_chapter_idx" ON "relationship_events"("book_id", "chapter_id");
CREATE INDEX "relationship_events_book_status_deleted_idx" ON "relationship_events"("book_id", "status", "deleted_at");
```

> **注意**：`ALTER TYPE ... ADD VALUE` 在 PostgreSQL 中不能与同事务内其它语句混用。Prisma 会自动拆分为多个迁移步骤；如生成的迁移把它们合并，需手动拆成两个迁移文件（先扩枚举，再 ALTER 默认值）。

---

## 4. Service 层改造

### 4.1 [createBookRelationship.ts](../../../src/server/modules/relationships/createBookRelationship.ts)

**输入接口**（最终）：

```ts
export interface CreateBookRelationshipInput {
  sourceId            : string;
  targetId            : string;
  relationshipTypeCode: string;   // 必填
  // 删除：chapterId、type、weight、description、evidence、confidence
}
```

**核心流程**（事务内）：

1. 校验 `sourceId !== targetId`，否则抛 `RelationshipInputError`。
2. 校验 `book.deletedAt === null`，否则 `BookNotFoundError`。
3. 校验 `personas` 两端均存在且未软删，否则 `PersonaNotFoundError`。
4. 查 `RelationshipTypeDefinition` 字典，要求 `status='ACTIVE'`，否则 `RelationshipInputError("关系类型未启用")`。
5. **canonicalize**：若字典 `directionMode === 'SYMMETRIC'` 且 `sourceId > targetId`（UUID 字符串字典序），交换 `sourceId/targetId`。
6. `upsert` 关系：
   - `where: { bookId_sourceId_targetId_relationshipTypeCode }`
   - `update: { recordSource: MANUAL, status: VERIFIED, deletedAt: null }`（人工写入升级到 MANUAL）
   - `create: { ..., recordSource: MANUAL, status: VERIFIED }`
7. 返回 `{ id, bookId, sourceId, targetId, relationshipTypeCode, recordSource, status }`。

**单调升级实现**：upsert update 时只允许 `recordSource` 升级，不能降级。由于 MANUAL 是最高级别，人工写入直接覆写即可。

### 4.2 [updateRelationship.ts](../../../src/server/modules/relationships/updateRelationship.ts)

**允许字段**：`relationshipTypeCode`、`status`（DRAFT/VERIFIED/REJECTED）、`recordSource`（仅允许向上升级）。
**禁止字段**：`type / weight / description / evidence / confidence` 全部移除。

升级规则（service 内强制）：
- 当前 `recordSource = DRAFT_AI` 时，可升级为 `AI` 或 `MANUAL`。
- 当前 `recordSource = AI` 时，可升级为 `MANUAL`，**不能降级**为 `DRAFT_AI`。
- 当前 `recordSource = MANUAL` 时，**只允许保持 MANUAL**，否则抛 `RelationshipInputError("recordSource 不可降级")`。

### 4.3 [deleteRelationship.ts](../../../src/server/modules/relationships/deleteRelationship.ts)

软删时必须同事务级联软删该关系下所有 `RelationshipEvent`：

```ts
await tx.relationshipEvent.updateMany({
  where: { relationshipId: id, deletedAt: null },
  data : { deletedAt: now }
});
await tx.relationship.update({
  where: { id },
  data : { deletedAt: now, status: ProcessingStatus.REJECTED }
});
```

返回级联软删的事件数。

### 4.4 [listBookRelationships.ts](../../../src/server/modules/relationships/listBookRelationships.ts)

输出形态：

```ts
interface RelationshipListItem {
  id                  : string;
  sourceId            : string;
  targetId            : string;
  relationshipTypeCode: string;
  relationshipTypeName: string;          // join 字典
  recordSource        : RecordSource;
  status              : ProcessingStatus;
  eventCount          : number;          // 关联 RelationshipEvent 计数（deletedAt IS NULL）
  firstChapterNo      : number | null;   // MIN(events.chapter_no) WHERE deletedAt IS NULL
}
```

通过子查询或两步查询实现 `eventCount` / `firstChapterNo`，**不要 N+1**。

---

## 5. API 层改造

### 5.1 [src/app/api/books/[id]/relationships/route.ts](../../../src/app/api/books/[id]/relationships/route.ts)

**POST body Zod**：

```ts
const createRelationshipBodySchema = z.object({
  sourceId            : z.string().uuid(),
  targetId            : z.string().uuid(),
  relationshipTypeCode: z.string().min(1).max(64)
});
```

**GET 响应**：返回 `RelationshipListItem[]`。

### 5.2 [src/app/api/relationships/[id]/route.ts](../../../src/app/api/relationships/[id]/route.ts)

**PATCH body Zod**：

```ts
const patchRelationshipBodySchema = z.object({
  relationshipTypeCode: z.string().min(1).max(64).optional(),
  status              : z.enum(["DRAFT", "VERIFIED", "REJECTED"]).optional(),
  recordSource        : z.enum(["DRAFT_AI", "AI", "MANUAL"]).optional()
}).refine((b) => Object.keys(b).length > 0, { message: "至少提交一个字段" });
```

> **`status` 字段的前端值 `DRAFT`** 在服务端映射为 `ProcessingStatus.PENDING`（保留前端语义不破坏）。

### 5.3 [src/lib/services/relationships.ts](../../../src/lib/services/relationships.ts)

同步 TypeScript 类型；移除旧字段。

---

## 6. seed 与字典

[prisma/seed.ts](../../../prisma/seed.ts) **保持调用** `initializeCommonRelationshipTypes`（已交付子任务），无需修改。
迁移完成后执行 `pnpm db:seed` 应能正常通过。

---

## 7. 单元测试

| 文件 | 必须新增/重写的用例 |
| ---- | ---- |
| [createBookRelationship.test.ts](../../../src/server/modules/relationships/createBookRelationship.test.ts) | 1) MANUAL 写入 upsert（首次创建）；2) MANUAL 升级现有 DRAFT_AI；3) 不允许覆盖现有 MANUAL（幂等）；4) SYMMETRIC canonicalize；5) 字典 INACTIVE 拒绝；6) self-loop 拒绝；7) 软删 persona 端点拒绝 |
| [updateRelationship.test.ts](../../../src/server/modules/relationships/updateRelationship.test.ts) | 1) DRAFT_AI → AI；2) AI → MANUAL；3) MANUAL → AI（拒绝降级）；4) status 流转独立 |
| [deleteRelationship.test.ts](../../../src/server/modules/relationships/deleteRelationship.test.ts) | 1) 软删时级联软删事件；2) 已软删幂等 |
| [listBookRelationships.test.ts](../../../src/server/modules/relationships/listBookRelationships.test.ts) | 1) `eventCount` 排除软删事件；2) `firstChapterNo` = MIN(chapter_no)；3) 按 `bookId` 隔离 |

行覆盖率 ≥ 95%。

---

## 8. 验收清单

- [ ] `pnpm prisma:generate` 通过，新增 `RelationshipEvent` 模型在 `src/generated/prisma/` 下可见。
- [ ] `pnpm prisma:migrate dev --name relationship_event_split` 在干净 DB 上一次成功；`relationships` 表为空。
- [ ] `pnpm db:seed` 通过；关系类型字典完整初始化。
- [ ] `pnpm type-check` 全绿（API + service + 客户端类型同步）。
- [ ] `pnpm lint` 全绿。
- [ ] `pnpm test src/server/modules/relationships` 全绿，覆盖率 ≥ 95%。
- [ ] 手动通过 `POST /api/books/:id/relationships` 录入两条不同 typeCode 的关系，返回 201；重复请求返回幂等结果（不报 409）。
- [ ] 手动 `DELETE /api/relationships/:id`，事件随之软删。
- [ ] 父任务 §7.1（一对人一类型一行）与 §7.6（软删级联）人工抽样验证通过。

---

## 9. 风险与回退

- **枚举扩展失败**：`ALTER TYPE ... ADD VALUE` 必须独立事务；如 Prisma 生成的迁移合并了语句，需手动拆分为两个 `migration.sql`。
- **现有引用 `Relationship.type` 的代码**：搜索全仓 `relationship.*\.type\b`（不含 `relationshipType`），列入清理清单。已知触点：`mergePersonas.ts`（→ 子任务 C 处理）、`createBookRelationship.test.ts`（本任务重写）。
- **回退**：`pnpm prisma:migrate reset` + `pnpm db:seed` 恢复干净状态；本任务破坏性，不保留旧数据。
