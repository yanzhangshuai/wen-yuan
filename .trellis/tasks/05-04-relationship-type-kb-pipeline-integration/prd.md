# 关系类型 KB 化后的书籍解析链路升级（MVP，v2）

> **执行约束**：本 PRD 由 Codex 自动执行。无需兼容老数据，可重置数据库；按"最优方案"一次性收口。
> 两条 pipeline（Sequential / TwoPass）共用 `ChapterAnalysisService`，本 PRD 改动落在共享层 + 运行时知识网关即可同时生效。
>
> **架构立场**：本任务不是给当前半成品做兼容补丁，而是把关系类型 KB 化链路重构为正统目标架构。允许删除/替换旧字段、旧 prompt 形态与旧中间结构；数据库允许 reset/migrate，不做历史数据兼容迁移。
>
> **v2 修订（基于代码事实复核）**：
> - 关系类型 `code` 由系统哈希生成，**LLM 不允许自创 code**；未知关系仅以 `proposed*` 字段提交审核草稿。
> - 运行时字典统一走 `loadFullRuntimeKnowledge`（唯一网关）；该网关内部负责读取 Book 的 `bookTypeId` / `bookType.key`，分析模块不得旁路查询关系类型。
> - 不再对 `AnalysisPhaseLog.metadata` 做改动（该列不存在），也不在 `AnalysisJob` 增加冗余计数字段；`UnknownRelationshipTypeDraft` 表作为持久事实源，`unknownRelationshipDrafts` 只通过 `ChapterAnalysisResult` / pipeline / job 日志汇总。
> - Draft 采用"聚合草稿主表 + 证据样本表"：主表表达一个待审核关系类型提案，样本表保存出现章节、人物对与证据，避免每对人物都生成重复审核项。
> - 体裁过滤只影响运行时字典选择；关系类型 name/aliases 采用全局非停用唯一，不按体裁放宽。
> - `Relationship` 不在 Prisma 层加 `@@unique`，沿用 raw partial unique index。

---

## Goal

让 `RelationshipTypeDefinition`（关系类型知识库）成为书籍解析的"运行时单一来源"，覆盖召回、方向语义、未知类型审核闭环、体裁过滤、性能与降级，使 `Relationship` / `RelationshipEvent` 的产出与 KB 完全对齐。

---

## Scope（MVP 一次性完成）

### 1. Prompt 字典升级（提高召回）

- 扩展 `RelationshipTypeDictionaryPromptEntry`（[src/server/modules/analysis/services/prompts.ts](src/server/modules/analysis/services/prompts.ts)）字段：
  - `aliases: string[]`
  - `sourceRoleLabel?: string | null`
  - `targetRoleLabel?: string | null`
  - `examples: string[]`（最多取前 2 条，防 token 膨胀）
- `formatRelationshipTypeDictionary` 输出形如：
  ```
  【血缘】
  - relationship_a1b2c3d4e5 · 父子 · INVERSE · 父→子 · 别名: 父亲/儿子 · 例: 范进→范老太
  - relationship_f6789abcde · 兄弟姐妹 · SYMMETRIC · 别名: 兄/弟/姊妹
  ```
  注意：code 是哈希形式（`relationship_<sha10>`），LLM 必须**整段复制**字典里的 code，不允许自创。
- 字典查询字段在 `loadFullRuntimeKnowledge` 中拉取（不再在 `ChapterAnalysisService` 自查），select 一并取出 `aliases / sourceRoleLabel / targetRoleLabel / examples`。

### 2. Prompt 文案明确"自创 code 禁止 + 提案机制"

[src/server/modules/knowledge/prompt-template-baselines.ts](src/server/modules/knowledge/prompt-template-baselines.ts) 的 systemPrompt **保留**"relationshipTypeCode 必须从字典挑选，不要自创"，并新增提案条款：

> 若本章存在标准字典完全无法表达的关系类型（仅在确有强证据时），可在 `relationships`/`relationshipEvents` 元素中省略 `relationshipTypeCode`（或填 `null`），改为返回 `unknownTypeProposal: { proposedName, proposedGroup, proposedDirectionMode, proposedSourceRoleLabel?, proposedTargetRoleLabel?, evidence }`。系统会作为审核草稿登记，不会写入正式关系。

硬约束（必须显式写入 systemPrompt）：
- 非空 `relationshipTypeCode` 与 `unknownTypeProposal` **不能并存**，必须二选一；使用 proposal 时 `relationshipTypeCode` 需省略或为 `null`。
- **绝不允许自创 `relationshipTypeCode` 字符串**；任何不在字典里的 code 都会被丢弃并记为脏数据。
- 不确定时优先返回 `unknownTypeProposal`，不要硬塞一个不准确的字典 code。

避免"鼓励自创"导致噪声。

### 3. AI 输出 Schema 调整

[src/types/analysis.ts](src/types/analysis.ts):

```ts
const unknownRelationshipTypeProposalSchema = z.object({
  proposedName            : z.string().min(1).max(80),
  proposedGroup           : z.string().min(1).max(40),
  proposedDirectionMode   : z.enum(["SYMMETRIC", "INVERSE", "DIRECTED"]),
  proposedSourceRoleLabel : z.string().max(80).optional(),
  proposedTargetRoleLabel : z.string().max(80).optional(),
  evidence                : z.string().optional()
});

// aiRelationshipSchema:
//   relationshipTypeCode 改为 z.string().min(1).nullable().optional()
//   新增 unknownTypeProposal: unknownRelationshipTypeProposalSchema.optional()
//   refine：必须二选一（非空 code 或有 proposal）；null 按未提供 code 处理

// aiRelationshipEventSchema 同上
```

`parseChapterAnalysisResponse` 同步透传。容错策略：
- 若一条记录的 `unknownTypeProposal.proposedDirectionMode = INVERSE` 但缺 `proposedSourceRoleLabel` 或 `proposedTargetRoleLabel`，或 `= DIRECTED` 但缺 `proposedSourceRoleLabel` → **丢弃该条**（不入 draft、不入正式 `Relationship`），记一条 warn 日志，**不影响整段响应解析**。
- 若一条记录同时给出非空 `relationshipTypeCode` 和 `unknownTypeProposal` → 丢弃该条 + warn（违反互斥约束）。
- 删除旧的扁平字段形态：`unknownTypeProposed` / `proposedName` / `proposedGroup` 不再作为 `relationships` 或 `relationshipEvents` 的顶层字段存在，避免与结构化 `unknownTypeProposal` 双轨并存。

### 4. 未知类型草稿模型

新增 `UnknownRelationshipTypeDraft` + `UnknownRelationshipTypeOccurrence`。主表是待审核类型提案，样本表是该提案在文本中的出现证据。

设计目标：
- 管理员审核的是"关系类型"，不是某一对人物的一条关系。
- 同一个未知类型在多个章节、多对人物中出现时，只形成一个审核草稿，后台展示 occurrence 列表供判断。
- 命中已有草稿时只追加 occurrence / 累加次数，不覆盖主表语义字段；主表语义以首次有效 proposal 为准，后续修正通过人工编辑完成。

```prisma
model UnknownRelationshipTypeDraft {
  id                      String   @id @default(uuid()) @db.Uuid
  bookId                  String   @map("book_id") @db.Uuid
  firstChapterId          String   @map("first_chapter_id") @db.Uuid
  firstJobId              String?  @map("first_job_id") @db.Uuid

  // service 侧按 proposedName + directionMode + role labels 归一化生成，避免 nullable unique 的 PostgreSQL 陷阱
  signature               String   @db.VarChar(200)
  proposedName            String   @map("proposed_name") @db.VarChar(80)
  proposedGroup           String   @map("proposed_group") @db.VarChar(40)
  proposedDirectionMode   String   @map("proposed_direction_mode") @db.VarChar(20)
  proposedSourceRoleLabel String?  @map("proposed_source_role_label") @db.VarChar(80)
  proposedTargetRoleLabel String?  @map("proposed_target_role_label") @db.VarChar(80)

  occurrenceCount         Int      @default(1) @map("occurrence_count")
  status                  String   @default("PENDING") @db.VarChar(20)  // PENDING|APPROVED|REJECTED|MERGED
  rejectionReason         String?  @map("rejection_reason") @db.Text
  approvedTypeCode        String?  @map("approved_type_code") @db.VarChar(120)
  mergedIntoDraftId       String?  @map("merged_into_draft_id") @db.Uuid

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  book            Book                           @relation(fields: [bookId], references: [id], onDelete: Cascade)
  firstChapter    Chapter                        @relation("UnknownRelationshipTypeDraftFirstChapter", fields: [firstChapterId], references: [id], onDelete: Cascade)
  firstJob        AnalysisJob?                    @relation("UnknownRelationshipTypeDraftFirstJob", fields: [firstJobId], references: [id], onDelete: SetNull)
  mergedIntoDraft UnknownRelationshipTypeDraft?   @relation("UnknownRelationshipTypeDraftMerge", fields: [mergedIntoDraftId], references: [id], onDelete: SetNull)
  mergedDrafts    UnknownRelationshipTypeDraft[]  @relation("UnknownRelationshipTypeDraftMerge")
  occurrences     UnknownRelationshipTypeOccurrence[]

  @@unique([bookId, signature], map: "unknown_rel_draft_book_signature_key")
  @@index([bookId, status], map: "unknown_rel_draft_book_status_idx")
  @@index([approvedTypeCode], map: "unknown_rel_draft_approved_code_idx")
  @@map("unknown_relationship_type_drafts")
}

model UnknownRelationshipTypeOccurrence {
  id              String   @id @default(uuid()) @db.Uuid
  draftId         String   @map("draft_id") @db.Uuid
  bookId          String   @map("book_id") @db.Uuid
  chapterId       String   @map("chapter_id") @db.Uuid
  jobId           String?  @map("job_id") @db.Uuid
  sourceName      String   @map("source_name")
  targetName      String   @map("target_name")
  sourcePersonaId String?  @map("source_persona_id") @db.Uuid
  targetPersonaId String?  @map("target_persona_id") @db.Uuid
  evidence        String?  @db.Text
  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  draft         UnknownRelationshipTypeDraft @relation(fields: [draftId], references: [id], onDelete: Cascade)
  book          Book                         @relation(fields: [bookId], references: [id], onDelete: Cascade)
  chapter       Chapter                      @relation(fields: [chapterId], references: [id], onDelete: Cascade)
  job           AnalysisJob?                 @relation("UnknownRelationshipTypeOccurrenceJob", fields: [jobId], references: [id], onDelete: SetNull)
  sourcePersona Persona?                     @relation("UnknownRelationshipTypeOccurrenceSourcePersona", fields: [sourcePersonaId], references: [id], onDelete: SetNull)
  targetPersona Persona?                     @relation("UnknownRelationshipTypeOccurrenceTargetPersona", fields: [targetPersonaId], references: [id], onDelete: SetNull)

  @@unique([draftId, chapterId, sourceName, targetName], map: "unknown_rel_occurrence_unique_key")
  @@index([bookId, chapterId], map: "unknown_rel_occurrence_book_chapter_idx")
  @@map("unknown_relationship_type_occurrences")
}
```

- Book / Chapter / AnalysisJob / Persona 反向关系一并补齐；`mergedIntoDraftId` 使用自关联，不存裸 ID。
- `signature` 必须使用统一归一化函数生成，例如：`normalize(proposedName) + "|" + proposedDirectionMode + "|" + normalize(sourceRoleLabel) + "|" + normalize(targetRoleLabel)`。
- 相同 `bookId + signature` 的 proposal 复用同一 draft；新增 occurrence 时才增加 `occurrenceCount`。
- 字段长度（`proposedName VarChar(80)` / `proposedGroup VarChar(40)` / role label `VarChar(80)`）应与 `RelationshipTypeDefinition` 对应列保持一致。

旧的单表结构（按 `rawCode + sourceName + targetName` 去重）不再采用：它会把同一个关系类型拆成大量人物对草稿，并把模型幻觉 code 误当成可审核类型。

### 5. ChapterAnalysisService 落库行为

`persistResult` 改造：

- 字典 + 映射来自 `runtimeKnowledge.relationshipTypes`（见 §8），**不再现场查表**。
- LLM 输出的元素：
  - 有 `relationshipTypeCode` 且命中字典 → 正常落 `Relationship` / `RelationshipEvent`。
  - 有 `relationshipTypeCode` 但未命中字典（理论上不应发生，因为 prompt 强制选字典）→ 视为脏数据，丢弃该条并记 warn；**不写入 draft**，避免把幻觉 code 变成人工审核对象。
  - 无 `relationshipTypeCode` 或 `relationshipTypeCode = null`，但有 `unknownTypeProposal` → 按 proposal signature upsert draft，并追加 occurrence 样本；不写正式 `Relationship` / `RelationshipEvent`。
  - 二者皆无 → 静默丢弃 + warn。
- 不写入正式 `Relationship` / `RelationshipEvent`。

返回值新增 `unknownRelationshipDrafts: number`，含义为本章新增或命中的 proposal occurrence 数；并向上汇总到 pipeline / job 日志（用于 admin 仪表与运行观测，不入 `AnalysisPhaseLog`，不新增 `AnalysisJob` 冗余列）。未命中字典的脏 code 只进入 warn 日志，不计入该字段。

### 6. DirectionMode 三态全覆盖

`resolveRelationshipPair`：

| directionMode | 处理 |
|---|---|
| `SYMMETRIC` | `sourceId > targetId` 时交换（保持现状） |
| `INVERSE`   | 不交换；保留 LLM 顺序，语义由 `sourceRoleLabel`/`targetRoleLabel` 承载 |
| `DIRECTED`  | 不交换；保留 LLM 顺序 |

对 `INVERSE` / `DIRECTED`，`(A→B)` 与 `(B→A)` 是两条独立 `Relationship` 行（不同语义角度，例如"A 是 B 的师父"与"B 是 A 的徒弟"），由 partial unique index `(bookId, sourceId, targetId, relationshipTypeCode)` 自然区分；前端图谱合并展示由后续任务处理。

不在 Prisma 层加 `@@unique`，沿用现有 raw partial unique index（"未软删行"语义）。新增 migration 时不要把 partial index 撤掉。

新增单元测试 `ChapterAnalysisService.relationship.test.ts` 覆盖：SYMMETRIC 排序合并、INVERSE 双向不互覆盖、DIRECTED 顺序保留、未命中字典 code 丢弃、含 proposal 写入 draft + occurrence、同 proposal 多次只复用主草稿并追加样本。

### 7. 体裁过滤（明确冲突规则）

`RelationshipTypeDefinition` 新增列：

```prisma
bookTypeId String? @map("book_type_id") @db.Uuid
bookType   BookType? @relation(fields: [bookTypeId], references: [id], onDelete: SetNull)

@@index([bookTypeId, status, sortOrder], map: "rt_def_book_type_status_sort_idx")
```

- `bookTypeId IS NULL` 视为"通用类型"。
- 读取规则（在 `loadFullRuntimeKnowledge` 中执行）：
  - 书有 `bookTypeId`：`status='ACTIVE' AND (bookTypeId = book.bookTypeId OR bookTypeId IS NULL)`
  - 否则：`status='ACTIVE' AND bookTypeId IS NULL`

**冲突规则（修改 `assertNoActiveNameOrAliasConflict`）**：

- `bookTypeId` 只影响运行时过滤、列表筛选与表单归属，不参与 name/aliases 唯一性放宽。
- 任意两个非 `INACTIVE` 类型（`ACTIVE` + `PENDING_REVIEW`），只要 name/aliases 归一化后相同即报错。
- `INACTIVE` 视为历史停用记录，不参与新类型冲突；恢复为 `ACTIVE` / `PENDING_REVIEW` 时必须重新通过全局冲突校验。
- 即不同体裁不可有重名或别名交叉，通用类型与任意体裁同样不可重名。

> 操作建议：若同名概念在不同体裁需要差异化语义，请使用差异化命名（如"武侠师徒" vs "师徒"），name/aliases 全局唯一不会因 `bookTypeId` 而放宽。

KB 管理 UI（`/admin/knowledge-base/relationship-types`）：列表加"归属体裁"列与筛选；表单新增"归属体裁"下拉（默认通用 = NULL）。

### 8. 运行时知识网关扩展（唯一接入点）

[src/server/modules/knowledge/load-book-knowledge.ts](src/server/modules/knowledge/load-book-knowledge.ts) 是关系类型运行时字典唯一入口。目标签名调整为对象入参，网关内部读取 Book 的 `bookTypeId` 与 `bookType.key`，调用方不再传 `bookTypeKey`，避免调用方拼装过期或不完整的体裁上下文：

```ts
export async function loadFullRuntimeKnowledge(params: {
  bookId      : string;
  prisma      : PrismaClient;
  forceRefresh?: boolean;
}): Promise<FullRuntimeKnowledge>;
```

`FullRuntimeKnowledge` 新增字段：

```ts
bookTypeId: string | null;
bookTypeKey: string | null;
relationshipTypes: Array<{
  code            : string;
  name            : string;
  group           : string;
  directionMode   : "SYMMETRIC" | "INVERSE" | "DIRECTED";
  sourceRoleLabel : string | null;
  targetRoleLabel : string | null;
  aliases         : string[];
  examples        : string[];
}>;
relationshipTypeByCode      : Map<string, FullRuntimeKnowledge["relationshipTypes"][number]>;
relationshipTypeDictionaryText: string;  // 已 format
```

- 仍走 `runtimeKnowledgeCache`（per book），与现有 lexicon/aliases 同生命周期。
- 关系类型读取在该网关内执行，使用 §7 的 `bookTypeId` 过滤规则。`runAnalysisJob`、pipeline、`ChapterAnalysisService` 不得直接调用 `relationshipTypeDefinition.findMany(...)` 构建字典。
- `clearKnowledgeCache(bookId)` 只用于书籍自身知识包/别名包变化；任意关系类型 KB 写操作（create/update/status/bookType 调整/CREATE_NEW approve）必须调用 `clearKnowledgeCache()` 清空全量缓存，因为通用类型或体裁类型可能影响多本书。
- `BIND_EXISTING` approve 只改变 draft 状态，不改变 KB；不需要清缓存。`reject` / `merge` 同理不清缓存。

`ChapterAnalysisService.analyzeChapter` 改造：

- 删除现场 `prismaClient.relationshipTypeDefinition.findMany(...)` 查询。
- 改为消费 `runtimeKnowledge.relationshipTypeDictionaryText` / `relationshipTypeByCode`。

`runAnalysisJob` 启动任务时调用 `loadFullRuntimeKnowledge({ bookId, prisma, forceRefresh: true })`，把完整 `runtimeKnowledge` 透传到 sequential / twopass。**TwoPassPipeline.Pass3 必须把 `runtimeKnowledge` 完整透传到 `runSequentialChapterLoop`**（修复目前只传 `preloadedLexiconConfig` 的差异）。

### 9. 空 KB 启动拦截

[startBookAnalysis](src/server/modules/books/startBookAnalysis.ts)：

- 启动前通过 `loadFullRuntimeKnowledge({ bookId, prisma, forceRefresh: true })` 读取运行时知识，检查 `runtimeKnowledge.relationshipTypes.length`。
- 若 `runtimeKnowledge.relationshipTypes.length === 0`：抛 `EmptyRelationshipKnowledgeError`，前端提示"请先在知识库初始化关系类型，或运行『按本书生成候选』"。
- 单元测试覆盖体裁过滤场景下的 0/有 通用 / 有体裁 三种情况，并断言 `startBookAnalysis` 不直接拼装关系类型 where 条件。

### 10. 后台审核入口

新增 admin API + 页面 `/admin/knowledge-base/unknown-relationship-types`：

- `GET /api/admin/knowledge/unknown-relationship-types?bookId=&status=` 列表（含 chapter 信息便于评审）
- `POST /api/admin/knowledge/unknown-relationship-types/:id/approve`：
  - body 二选一：
    ```ts
    | { mode: "BIND_EXISTING"; relationshipTypeCode: string }
    | {
        mode             : "CREATE_NEW";
        // 完整 RelationshipTypeInput，必填 name/group/directionMode + 可选 role labels/aliases/examples
        // bookTypeId 可选；不强制与 draft.book.bookTypeId 一致（审核员可自由归类，bookTypeId 仅影响运行时字典过滤；name 已全局唯一）
        input            : RelationshipTypeInput;
      }
    ```
  - `CREATE_NEW` 调用现有 `createRelationshipType`（系统自动生成哈希 code），把生成的 code 回填 `approvedTypeCode`。
  - `BIND_EXISTING` 直接校验 code 存在且 ACTIVE。
  - 标记 `status='APPROVED'`，回填 `approvedTypeCode`。
  - `CREATE_NEW` 会写入 KB，必须调用 `clearKnowledgeCache()` 全量失效；`BIND_EXISTING` 不改变 KB，不清缓存。
  - **不**回填历史章节（明确 Out of Scope）。
- `POST /api/admin/knowledge/unknown-relationship-types/:id/reject` body `{ rejectionReason?: string }`：仅置 `status='REJECTED'` 并写入原因，**不调用 `clearKnowledgeCache`**（KB 未变化）。
- `POST /api/admin/knowledge/unknown-relationship-types/:id/merge` body `{ targetDraftId: string }`：用于合并语义重复但 signature 不同的草稿；将当前草稿置 `MERGED`，记录 `mergedIntoDraftId`，occurrence 可在 UI 上聚合展示，不改变 KB，不清缓存。
- 审核页以 draft 为主行，展开展示 occurrence 样本（章节、人物对、证据）。默认按 `occurrenceCount desc, updatedAt desc` 排序，降低重复审核成本。
- 顶部导航 `admin-header.tsx` + `knowledge-base/layout.tsx` 同步加入子链接。
- 前端服务层 `src/lib/services/unknown-relationship-types.ts` 同步提供 CRUD。

---

## Acceptance Criteria

- [ ] Schema：`UnknownRelationshipTypeDraft` + `UnknownRelationshipTypeOccurrence` 创建，`RelationshipTypeDefinition.bookTypeId` 列添加，Book / Chapter 反向关系完整；不保留旧 `rawCode + sourceName + targetName` 草稿模型。
- [ ] `pnpm prisma:migrate` 成功（允许 reset，不需考虑老数据）；不删除现有 `Relationship` partial unique index。
- [ ] `formatRelationshipTypeDictionary` 输出包含 aliases / 角色标签 / examples，按 group 有序，使用哈希 code 展示。
- [ ] `aiRelationshipSchema` / `aiRelationshipEventSchema` 改为 `relationshipTypeCode` 可省略或为 null + `unknownTypeProposal` 可选（refine 强制非空 code / proposal 二选一），删除旧扁平 `unknownTypeProposed/proposedName/proposedGroup` 字段，`parseChapterAnalysisResponse` 透传新增单测。
- [ ] `loadFullRuntimeKnowledge({ bookId, prisma, forceRefresh? })` 内部读取 Book 的 `bookTypeId` / `bookType.key`，暴露 `bookTypeId / relationshipTypes / relationshipTypeByCode / relationshipTypeDictionaryText`，按体裁过滤生效（单测覆盖：通用、特定体裁、混合）。
- [ ] `ChapterAnalysisService` 不再现场查关系类型表（断言：相关 prismaClient 调用计数为 0）。
- [ ] `TwoPassPipeline.Pass3` 把 `runtimeKnowledge` 完整透传到 sequential loop（断言：dictionary 文本与 sequential 路径一致）。
- [ ] `unknownTypeProposal` 写入 draft + occurrence；相同 signature 复用主草稿并追加 occurrence；未命中字典的 `relationshipTypeCode` 只 warn 丢弃、不写 draft；不污染 `Relationship` / `RelationshipEvent`（单测覆盖）。
- [ ] `INVERSE` / `DIRECTED` 方向不再被错误规范化（单测覆盖）。
- [ ] KB 管理 UI 可设置"归属体裁"，名称/别名冲突按"全局非停用唯一"规则校验（单测覆盖通过 / 拒绝路径，含跨体裁拒绝、INACTIVE 复用）。
- [ ] 空 KB 启动书籍解析直接报错，并通过 `loadFullRuntimeKnowledge` 检查关系类型，不在 books 模块重复拼 where（API 测试覆盖）。
- [ ] admin 审核页 + API 支持 `BIND_EXISTING` / `CREATE_NEW` / `MERGE`；`CREATE_NEW` 走现有 `createRelationshipType`（哈希 code 自动生成）并 `clearKnowledgeCache()` 全量失效；`BIND_EXISTING` / `REJECT` / `MERGE` 不清缓存。
- [ ] `pnpm lint`、`pnpm type-check`、`pnpm test` 全部通过。

---

## Definition of Done

- 模块清单（按 `wen-yuan-knowledge-base-checklist` 要求）：schema/migration → server service → API route → `lib/services/...` → admin 页面 → 顶层导航子链接 → 运行时接入（`loadFullRuntimeKnowledge` + `ChapterAnalysisService` + `TwoPassPipeline` 透传）→ 编译/验证证据。
- 不增加新硬编码 fallback；未启用 KB 类型一律走 KB；prompt 模板不允许 LLM 自创 code，只能走 proposal。
- Prompt 模板 `prompt-template-baselines.ts` 同步更新规则文案与 JSON schema 示例。
- `prisma/seed.ts` 不需要 seed 关系类型（仍由管理员初始化）。

---

## Out of Scope（明确不做）

- **关系类型 code 语义化重构**：保留现有哈希 code 体系，不引入 `PARENT_CHILD` 风格语义码（独立后续任务）。
- **历史章节回填**：审核同意后不重跑解析，不补 `Relationship`。
- **跨书 KB 协同 / draft 跨书共享**。
- **关系图谱前端样式调整**（本 PRD 不动 `src/components/graph/`）。
- **TwoPass Pipeline 关系预筛**（在 Pass1/Pass2 提前筛关系）。
- **Neo4j 同步策略调整**。
- **`AnalysisPhaseLog.metadata` 字段引入**（统计走 `ChapterAnalysisResult` + 章节日志）。

---

## Technical Approach（实施顺序，便于 Codex 单线程推进）

1. **Schema + migration** — 加 `UnknownRelationshipTypeDraft`、`UnknownRelationshipTypeOccurrence`、`RelationshipTypeDefinition.bookTypeId`、双向 relation；不删 / 不改 `Relationship` 现有 partial unique index；执行 `pnpm prisma migrate dev --name relationship-type-kb-pipeline-integration` 与 `pnpm prisma:generate`。
2. **AI Schema 调整** — `src/types/analysis.ts` + 单测（含 INVERSE 缺 role 容错）。
3. **`loadFullRuntimeKnowledge` 扩展** — 改为目标对象签名；内部读取 Book 的 `bookTypeId` / `bookType.key`；拉关系类型 + 按体裁过滤 + 生成 dictionaryText/byCode + 单测。
4. **Prompt 字典 + 模板文案** — `prompts.ts:formatRelationshipTypeDictionary` 接受新字段；`prompt-template-baselines.ts` systemPrompt 增加 proposal 条款；JSON 示例同步加 `unknownTypeProposal`。
5. **`ChapterAnalysisService` 改造** — 删除现场查表，消费 runtimeKnowledge；proposal 落库改走 draft + occurrence；未命中字典 code 只 warn 丢弃；`directionMode` 三态处理；返回值加 `unknownRelationshipDrafts`。
6. **TwoPass 透传** — `TwoPassPipeline.Pass3` 把 `runtimeKnowledge` 透传到 `runSequentialChapterLoop`，与 sequential 路径合一。
7. **关系类型 server service** — `assertNoActiveNameOrAliasConflict` 保持全局非停用唯一；`bookTypeId` 不参与冲突放宽，恢复非停用状态也必须校验；`createRelationshipType` / `updateRelationshipType` 接受 `bookTypeId`；任意关系类型 KB 写入后调用 `clearKnowledgeCache()` 全量失效。
8. **空 KB 拦截** — `startBookAnalysis` 通过 runtime gateway 检查 + 单测。
9. **未知类型审核 API + 页面 + service + 子导航** — draft 主行 + occurrence 展开，支持 approve / reject / merge。
10. **集成测试** — `pnpm test`，重点跑 `ChapterAnalysisService.*.test.ts`、`runAnalysisJob.test.ts`、`load-book-knowledge.test.ts`、`relationship-types.test.ts`、`unknown-relationship-types.test.ts`。

---

## Decision (ADR-lite)

- **Context**：关系类型已 KB 化但 prompt/落库/审核链路未对齐；现有 code 由系统哈希生成且 prompt 禁止自创。
- **Decision**：保留哈希 code 体系；LLM 走"选字典 code 或返回 proposal"二选一；运行时知识统一从 `loadFullRuntimeKnowledge({ bookId, prisma })` 流入；体裁过滤在网关做；未知关系 proposal 聚合进 draft 主表并保存 occurrence 样本，审核同意时复用 `createRelationshipType`。
- **Consequences**：
  - 不破坏现有 KB code 契约；后续若做语义化迁移可单独立项。
  - LLM 提示 token 略增（aliases + 例子），通过体裁过滤回收。
  - `loadFullRuntimeKnowledge` 缓存粒度变重；关系类型 KB 写操作必须全量清缓存，书籍私有知识变化可按 book 清缓存。
  - 新增 2 张表、1 列、1 个 admin 页面 + 子导航；遵守知识库 checklist。

---

## Technical Notes

- 关键文件：
  - 数据库：[prisma/schema.prisma](prisma/schema.prisma)（Relationship、RelationshipTypeDefinition、Chapter、Book、BookType、AnalysisPhaseLog）
  - 解析共享层：[src/server/modules/analysis/services/ChapterAnalysisService.ts](src/server/modules/analysis/services/ChapterAnalysisService.ts)、[src/server/modules/analysis/services/prompts.ts](src/server/modules/analysis/services/prompts.ts)、[src/server/modules/analysis/services/stages/stage-calls.ts](src/server/modules/analysis/services/stages/stage-calls.ts)
  - 运行时网关：[src/server/modules/knowledge/load-book-knowledge.ts](src/server/modules/knowledge/load-book-knowledge.ts)
  - Pipeline：[src/server/modules/analysis/pipelines/sequential/SequentialPipeline.ts](src/server/modules/analysis/pipelines/sequential/SequentialPipeline.ts)、[src/server/modules/analysis/pipelines/twopass/TwoPassPipeline.ts](src/server/modules/analysis/pipelines/twopass/TwoPassPipeline.ts)
  - AI Schema：[src/types/analysis.ts](src/types/analysis.ts)
  - Prompt 模板：[src/server/modules/knowledge/prompt-template-baselines.ts](src/server/modules/knowledge/prompt-template-baselines.ts)
  - KB 服务：[src/server/modules/knowledge/relationship-types.ts](src/server/modules/knowledge/relationship-types.ts)、[src/lib/services/relationship-types.ts](src/lib/services/relationship-types.ts)
  - Job：[src/server/modules/analysis/jobs/runAnalysisJob.ts](src/server/modules/analysis/jobs/runAnalysisJob.ts)、[src/server/modules/books/startBookAnalysis.ts](src/server/modules/books/startBookAnalysis.ts)
  - Admin：[src/app/admin/knowledge-base/](src/app/admin/knowledge-base)、[src/components/layout/admin-header.tsx](src/components/layout/admin-header.tsx)
- 两条 pipeline 共用 `ChapterAnalysisService`：`SequentialPipeline` 与 `TwoPassPipeline.Pass3` 都走 `runSequentialChapterLoop`，本 PRD 改动一次性覆盖；本 PRD 顺手修复 TwoPass.Pass3 未透传完整 runtimeKnowledge 的差异。
- `Relationship` 去重：保留 raw partial unique index（"未软删行"语义），见 `relationship-structure.md`。
