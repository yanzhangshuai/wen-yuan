# Research: roleWorkbench 例外审核流 + roleWorkbench 适配 — 深度代码勘探报告

- **Query**: v5-review 任务（08-06-v5-review）：实现例外审核流 service + roleWorkbench 适配（清 94 个 type-check 错误）
- **Scope**: internal（代码勘探）
- **Date**: 2026-08-07
- **方法**: `npx tsc --noEmit` 全量错误抓取 + 逐文件精读 + prisma schema 核对 + 依赖图梳理

---

## 0. 一句话结论

v5 已把 v4 的 `persona/profile/biographyRecord` 模型物理删除，但 **roleWorkbench 服务层与 API 层仍是 v4 写死的**，前端角色资料工作台仍消费 persona 概念且其依赖的 `/api/personas|biography|relationships` 三组路由整组消失。94 个 type-check 错误全部源于「v4 引用已删模块/字段」。例外审核流所需的基础件（`facts.status/reviewedAt/reviewedBy`、`RecordSource.AUTO_VERIFIED`、identity 登记表 HIGH、`runPrimitive`、`refreshRelationshipsForBook`）已在 v5 就绪，但**尚无任何自动接受/人审/棘轮代码**（纯空地从零实现）。

---

## 1. roleWorkbench 服务层改造矩阵

### 1.1 `src/server/modules/roleWorkbench/chapterEvents.ts`（470 行）

**(a) 职责**：章节事迹工作台。章节摘要（事件数/待确认数/已校验）、列事件、章节标记已校验、人工增/改/删事件（BIBAIOCategory 事件）。

**(b) 输入/输出**：
- `listChapterSummaries(bookId)` → `{ summary, chapters[] }`（chapterEvents.ts:205-256）
- `listEvents(bookId, chapterId, filters)` → `ChapterEventItem[]`（:258-290）
- `markChapterVerified(bookId, chapterId, verifiedBy?)` → `{ chapterId, isVerified, verifiedAt }`（:292-317）
- `createManualEvent(bookId, input)` → `ChapterEventItem`（:319-370）
- `updateEvent(bookId, eventId, input)` → `ChapterEventItem`（:372-427）
- `deleteEvent(bookId, eventId)` → `{ id }`（:429-450）
- 对外类型：`ChapterEventItem`、`ChapterEventInput`、`ChapterEventFilters`、`ChapterEventsWorkbenchTransaction`（:59-123）

**(c) 引用的已删模块/字段**：
- `BioCategory` 枚举（:2）→ v5 改名为 `EventCategory`（schema.prisma:106）
- `@/server/modules/biography/errors` 的 `BiographyInputError` / `BiographyRecordNotFoundError`（:7）→ 模块已删
- `biographyRecord` 模型（:214,219,262,296,331,375,403,432,439）→ v5 改为 `Fact`
- `profile` 模型 + `personaId` 联表（:177-186 `assertPersonaInBook`）→ v5 改为 `entityProfile` + `entityId`
- `recordSource: RecordSource.MANUAL`（:343）语义保留（enum 仍在）
- `chapterBiographyVerification` 表（:224,304）→ **v5 仍存在**（schema.prisma:292-307），可保留

**(d) 前端依赖**：`chapter-events-workbench.tsx` 经 `src/lib/services/role-workbench.ts` 调用（fetchChapterEventChapters/fetchChapterEvents/createChapterEvent/updateChapterEvent/deleteChapterEvent/markChapterEventsVerified，role-workbench.ts:275-325）。

**(e) 目标改造点**：
- `EventRow`/事务接口由 `biographyRecord` 改 `fact`：字段映射 `category→eventCategory`、`personaId→sourceEntityId`、`title/location/event/tags/ironyNote→payload`（payload JSON 注释见 schema.prisma:460-465）
- `assertPersonaInBook` 改查 `entityProfile`（entityId+bookId）
- `markChapterVerified` 保留 `chapterBiographyVerification`，但其 DRAFT 计数改查 `fact.status=DRAFT`（BIOGRAPHY 类）
- 错误类需迁移到新域（biography/errors 已删，需新建或复用 extraction/identity 错误）

### 1.2 `src/server/modules/roleWorkbench/listDrafts.ts`（414 行）

**(a) 职责**：待确认草稿看板（人物/关系/传记事件三 Tab），只读查询，产出 `AdminDraftsResult`（summary + 三列表）。

**(b) 输入/输出**：
- `listAdminDrafts(filter: { bookId?, tab?, source? })` → `AdminDraftsResult`（:238-406）
- `AdminDraftsResult = { summary: { persona, relationship, biography, total }, personas[], relationships[], biographyRecords[] }`（:151-169）

**(c) 引用的已删模块/字段**：
- `prisma.profile`（:248,260）+ `profile→persona` 联表（:271-283）→ v5 为 `entityProfile`+`entity`（EntityProfile: `localName/localSummary/officialTitle/localTags/ironyIndex` 都在 EntityProfile，schema.prisma:354-382；Entity 持 `name/aliases/nameType/recordSource/confidence/hometown/globalTags`，schema.prisma:314-351）
- `prisma.biographyRecord`（:250,319）
- `relationship.recordSource`（:294）→ **v5 Relationship 表已无 recordSource 字段**（schema.prisma:504-536，只有 status；recordSource 在底层 Fact 上）
- 硬编码 `weight: 1`（:386）→ v5 Relationship 有 `weight` 字段但 select 未取
- `Relationship` select 仍用 `source.id/name` 联表（:303-315），v5 结构一致（关系名 `source`/`target` 仍在）

**(d) 前端依赖**：`RoleWorkbenchPanel` 经 `fetchDrafts`（role-workbench.ts:264-273）；服务端页面 `app/admin/role-workbench/[bookId]/page.tsx:73` 首屏直调。

**(e) 目标改造点**：三 Tab 数据源迁移到 `entityProfile+entity` / `relationship` / `fact`；persona 草稿的 `status` 在 EntityProfile 上（schema:368），relation 草稿 status 在 Relationship（schema:519），传记草稿 status 在 Fact（schema:469）。关系草稿 `recordSource` 需经底层 RELATION fact 聚合，或按 PRD 简化（recordSource 来源信号前移/删除）。

### 1.3 `src/server/modules/roleWorkbench/mergeSuggestions.ts`（426 行）

**(a) 职责**：合并建议生命周期。列建议、接受（执行实体合并）、拒绝、暂缓。

**(b) 输入/输出**：
- `listMergeSuggestions(filter)` → `MergeSuggestionItem[]`（:180-222）
- `acceptMergeSuggestion(suggestionId)` → `MergeSuggestionItem`（:242-309）
- `rejectMergeSuggestion` / `deferMergeSuggestion`（:391-404）
- 错误类：`MergeSuggestionNotFoundError`/`MergeSuggestionStateError`/`PersonaMergeConflictError`（:94-127）

**(c) 引用的已删模块/字段**：
- `@/server/modules/personas/mergePersonas` 的 `mergePersonasInTransaction`（:5,280）→ 模块已删
- `mergeSuggestion.sourcePersonaId/targetPersonaId`（:195,249,293,354）→ v5 为 `sourceEntityId/targetEntityId`（schema.prisma:704-705）
- `mergeSuggestion.sourcePersona/targetPersona` 关系（:188,208,258,275）→ v5 关系名为 `source/target`（schema.prisma:714-715）
- 人物名从 `sourcePersona.name` 取 → v5 从 `source.name`（Entity）
- `personas/mergePersonas` 迁移逻辑（传记/提及/关系/别名/软删）→ 在 v5 需重写为「facts 迁移 sourceEntityId→targetEntityId + aliases 并集 + Entity 软删 + refreshRelationshipsForBook」

**(d) 前端依赖**：`RoleWorkbenchPanel` merge Tab + `EntityMergeTool` 经 `fetchMergeSuggestions/acceptMergeSuggestion/rejectMergeSuggestion/deferMergeSuggestion`（role-workbench.ts:337-371）；服务端页面首屏直调（[bookId]/page.tsx:74）。

**(e) 关键缺口（重要）**：**`mergeEntitiesInTransaction` 当前不存在**。全库 grep 仅命中：`mergeSuggestions.ts` 内注释（aggregator.ts:13「接受后执行 mergeEntitiesInTransaction」是文档承诺）+ generated prisma 假名。`splitEntity/splitPersona` 服务端也不存在。→ merge/split 是 PRD 明确的「一律人审」项，接受路径需要从零实现实体合并事务（或复用 identity `writeRegistry` 的写入口）。

### 1.4 `src/server/modules/roleWorkbench/bulkReview.ts`（170 行）

**(a) 职责**：批量确认/拒绝草稿（DRAFT→VERIFIED/REJECTED），事务内同时更新 relationship + biographyRecord 两张表。

**(b) 输入/输出**：
- `bulkVerifyDrafts(ids)` / `bulkRejectDrafts(ids)` → `BulkDraftStatusResult { ids, status, relationshipCount, biographyRecordCount, totalCount }`（:90-161）
- 错误：`BulkDraftStatusInputError`（:46）

**(c) 引用的已删模块/字段**：
- `tx.biographyRecord.updateMany`（:114）→ v5 为 `tx.fact`
- 不处理人物草稿（:21 注释「人物资料当前走其它确认路径」）→ v5 需决定是否纳入 EntityProfile 批量确认

**(d) 前端依赖**：`bulkVerifyDrafts/bulkRejectDrafts`（role-workbench.ts:379-400），由 roleReview 相关组件触发。

**(e) 目标改造点**（PRD AC 明确）：
- 批量确认对象改为 `fact`（status→VERIFIED），**事务内调用 `refreshRelationshipsForBook(bookId)`** 重建关系物化表（aggregator.ts:35）——PRD 第 16 行「bulkVerify 事务内 refreshRelationshipsForBook」
- 若含 EntityProfile 确认路径，需一并处理 `entity_profile.status`
- `BulkDraftStatusResult` 的 `biographyRecordCount` 字段名需随数据源改名（前端契约联动）

---

## 2. API 路由清单表

### 2.1 role-workbench 域（`/api/admin/role-workbench`）

| 路径 | 方法 | 调用 service | 返回契约 | 状态 |
|---|---|---|---|---|
| `books/:bookId/chapter-events` | GET | `listChapterSummaries` / `listEvents`（chapterEvents.ts） | `ChapterEventChapterData` 或 `ChapterEventItem[]`，code `CHAPTER_EVENTS_FETCHED`/`CHAPTER_EVENT_CHAPTERS_FETCHED` | 编译错 |
| `books/:bookId/chapter-events` | POST | `createManualEvent` | `ChapterEventItem`，201 | 编译错 |
| `books/:bookId/chapter-events/:eventId` | PATCH | `updateEvent` | `ChapterEventItem` | 编译错 |
| `books/:bookId/chapter-events/:eventId` | DELETE | `deleteEvent` | `{ id }` | 编译错 |
| `books/:bookId/chapter-events/verify` | POST | `markChapterVerified` | `{ chapterId, isVerified, verifiedAt }` | 编译错 |

### 2.2 草稿/合并建议（`/api/admin/*`）

| 路径 | 方法 | 调用 service | 返回契约 | 状态 |
|---|---|---|---|---|
| `/api/admin/drafts` | GET | `listAdminDrafts` | `AdminDraftsResult`，code `ADMIN_DRAFTS_LISTED` | **编译通过**（service 层错，路由本体无错） |
| `/api/admin/bulk-verify` | POST | `bulkVerifyDrafts` | `BulkDraftStatusResult`，code `ADMIN_DRAFTS_BULK_VERIFIED` | **编译通过**（service 层错） |
| `/api/admin/bulk-reject` | POST | `bulkRejectDrafts` | `BulkDraftStatusResult`，code `ADMIN_DRAFTS_BULK_REJECTED` | **编译通过**（service 层错） |
| `/api/admin/merge-suggestions` | GET | `listMergeSuggestions` | `MergeSuggestionItem[]`，code `ADMIN_MERGE_SUGGESTIONS_LISTED` | **编译通过** |
| `/api/admin/merge-suggestions/:id/accept` | POST | `acceptMergeSuggestion` | `MergeSuggestionItem`，404/409 映射 | **编译通过** |
| `/api/admin/merge-suggestions/:id/reject` | POST | `rejectMergeSuggestion` | `MergeSuggestionItem` | **编译通过** |
| `/api/admin/merge-suggestions/:id/defer` | POST | `deferMergeSuggestion` | `MergeSuggestionItem` | **编译通过** |

> 注意：drafts/bulk-verify/bulk-reject/merge-suggestions 的路由 `.ts` 文件本身无编译错误（错误在 service 层），但运行时因 service 引已删模块会崩。chapter-events 系路由则自身带错（`BioCategory`/`biography/errors` 导入）。

### 2.3 前端仍在调用、后端已损坏的路由（roleReview Tab 运行依赖）

| 路由文件 | 前端服务 | 引用的已删模块 |
|---|---|---|
| `api/books/[id]/personas/route.ts` | `src/lib/services/books.ts`（fetchBookPersonas/createBookPersona） | `personas/createBookPersona`、`personas/listBookPersonas`、`personas/errors` |
| `api/books/[id]/relationships/route.ts` | `src/lib/services/relationships.ts` | `relationships/createBookRelationship`、`relationships/listBookRelationships`、`relationships/errors`、`personas/errors` |
| `api/books/[id]/alias-mappings/route.ts`（+`[mappingId]`） | `src/lib/services/alias-mappings.ts` | `analysis/services/AliasRegistryService` |
| `api/books/[id]/validation-reports/route.ts`（+`[reportId]`） | `src/lib/services/validation-reports.ts` | `analysis/services/ValidationAgentService` |
| `api/books/[id]/analyze/route.ts` | `src/lib/services/books.ts`（analyzeBook） | `analysis/jobs/runAnalysisJob` |
| **`api/personas/*`、`api/biography/*`、`api/relationships/*`（顶层）** | `src/lib/services/personas.ts` / `biography.ts` / `relationships.ts` | **目录整组不存在**（fetchPersonaDetail/patchPersona/mergePersonas/splitPersona 全部 404） |

> **关键发现**：`src/components/review/role-review-workbench.tsx:30-51` 直接 import 了 `personas/relationships/biography/alias-mappings` 服务，这些调用的路由要么指向已删模块、要么目录整体消失。roleReview Tab 的增删改链路**当前完全不可用**，是适配工作的最大前端面。

---

## 3. 前端组件清单 + 数据契约

### 3.1 活动组件（被 [bookId]/page.tsx → RoleWorkbenchPanel 实际引用）

| 组件 | 文件 | 职责 | 消费 API / 数据源 | 数据概念 |
|---|---|---|---|---|
| RoleWorkbenchPanel | `review/role-workbench-panel.tsx` | 五 Tab 容器（角色资料/章节事迹/合并/别名/自检） | drafts/merge-suggestions/alias-mappings/validation-reports + `fetchPersonaSummary`（personas.ts:71,467） | persona（`PersonaSummary`） |
| RoleReviewWorkbench | `review/role-review-workbench.tsx`（888 行） | 角色资料主 Tab：列表/侧栏/编辑 sheet | `books`（fetchBookPersonas）、`personas`（fetchPersonaDetail/patchPersona/deletePersona）、`relationships`、`biography`、`alias-mappings`、`role-workbench` | **全 persona**（`BookPersonaListItem`、`PersonaDetail`、`PersonaRelation`、`TimelineEvent`） |
| RoleReviewSidebar | `review/role-review-sidebar.tsx` | 角色列表侧栏 + 待确认计数 | personas/books | persona |
| RoleReviewSections | `review/role-review-sections.tsx` | 基本信息/关系/传记/别名分块展示 | 入参 `BookPersonaListItem` | persona 字段（name/localName/globalTags/localTags/hometown/officialTitle/ironyIndex 等） |
| RoleReviewSheetFields | `review/role-review-sheet-fields.tsx` | 编辑表单字段 | — | persona/relationship/biography/alias |
| RoleReviewUtils | `review/role-review-utils.ts` | 表单转换/过滤工具 | — | persona |
| ChapterEventsWorkbench | `review/chapter-events-workbench.tsx`（927 行） | 章节事迹 Tab | role-workbench（chapter-events 系）+ books（fetchBookPersonas/fetchChapterContent） | persona（事件选人下拉） |
| EntityMergeTool | `review/entity-merge-tool.tsx` | 合并预览 + 确认 | `acceptMergeSuggestion` + `fetchPersonaSummary` | persona（`PersonaSummary`） |
| ManualEntityTool | `review/manual-entity-tool.tsx` | 手动合并/拆分 | `mergePersonas`/`splitPersona`（personas.ts:288,300，**后端路由已删**） | persona |
| AliasReviewTab | `review/alias-review-tab.tsx` | 别名映射确认 | alias-mappings（route 引已删 AliasRegistryService） | `AliasMappingItem`（**含 personaId，:38** → 需改 entityId） |
| ValidationReportTab | `review/validation-report-tab.tsx` | 自检报告 | validation-reports（route 引已删 ValidationAgentService） | `ValidationReportItem` |
| BookRoleWorkbenchSidebar | `review/book-role-workbench-sidebar.tsx` | 左侧切书 | `BookLibraryListItem` | personaCount（books） |

### 3.2 死代码（未在任何地方被引用，可确认删除或适配时忽略）

- `review/index.ts` barrel：**无任何 import 方**（全仓 grep `from "@/components/review"` 零命中）
- `review/role-management-tab.tsx`（576 行）：零引用
- `review/persona-edit-form.tsx` / `relationship-edit-form.tsx` / `biography-edit-form.tsx`：仅被死 barrel 再导出，无真实消费

### 3.3 页面

| 页面 | 文件 | 数据源 | 状态 |
|---|---|---|---|
| `/admin/role-workbench` | `page.tsx` | `listBooks()` | 编译通过；personaCount 由 books 服务提供 |
| `/admin/role-workbench/:bookId` | `[bookId]/page.tsx` | `getBookById` + `listAdminDrafts` + `listMergeSuggestions` 服务端直调 | 编译通过（依赖的 service 有错，运行时会崩） |

---

## 4. 94 个 type-check 错误完整分布

### 4.1 按文件 × 错误数

| 文件 | 错误数 | 主导根因 |
|---|---|---|
| `src/server/modules/books/getBookGraph.ts` | 16 | v4 profile/persona/mention.personaId/relationship.sourceId 字段 |
| `src/server/modules/roleWorkbench/mergeSuggestions.ts` | 13 | sourcePersonaId/sourcePersona/targetPersona + 已删 mergePersonas |
| `src/server/modules/graph/findPersonaPath.ts` | 9 | relationship.sourceId/profile/persona |
| `src/server/modules/roleWorkbench/listDrafts.ts` | 8 | profile/biographyRecord/relationship.recordSource |
| `src/server/modules/graph/updateGraphLayout.ts` | 7 | profile/persona/visualConfig 类型塌陷 |
| `api/admin/role-workbench/.../chapter-events/[eventId]/route.ts` | 7 | BioCategory 枚举 + biography/errors + 类型塌陷 |
| `api/books/[id]/relationships/route.ts` | 6 | 已删 relationships/personas 模块 |
| `api/admin/role-workbench/.../chapter-events/route.ts` | 5 | BioCategory + biography/errors |
| `api/books/[id]/personas/route.ts` | 4 | 已删 personas 模块 |
| `src/server/modules/roleWorkbench/chapterEvents.ts` | 3 | BioCategory + biography/errors + 事务接口缺 biographyRecord/profile |
| `api/books/[id]/alias-mappings/route.ts` | 3 | 已删 AliasRegistryService |
| `chapterEvents.test.ts` | 2 | BioCategory + biography/errors |
| `src/server/modules/books/getBookById.ts` | 2 | BookSelect.profiles 已删 / BookDetailRow 契约 |
| `api/books/[id]/relationships/route.test.ts` | 2 | 已删 personas/relationships errors |
| `.../chapter-events/verify/route.ts` | 2 | biography/errors |
| `src/server/modules/roleWorkbench/bulkReview.ts` | 1 | biographyRecord |
| `api/books/[id]/validation-reports/(route,route/[reportId])` | 各 1 | 已删 ValidationAgentService |
| `api/books/[id]/analyze/route.ts` | 1 | 已删 runAnalysisJob |
| `api/books/[id]/alias-mappings/[mappingId]/route.ts` | 1 | 已删 AliasRegistryService |
| **合计** | **94** | |

### 4.2 按错误码分布

| 错误码 | 数量 | 含义 |
|---|---|---|
| TS2339 | 27 | 属性不存在（profile/persona/biographyRecord/sourceId/targetId/personaId/sourcePersona…） |
| TS2307 | 20 | 找不到模块（biography/errors、personas/*、relationships/*、AliasRegistryService、runAnalysisJob、ValidationAgentService） |
| TS7006 | 12 | 参数隐式 any（上游查询失败后 `.map(item=>…)` 类型塌陷） |
| TS18046 | 11 | `error is of type unknown`（上游类型塌陷连锁） |
| TS2353 | 9 | 对象字面量多余属性（RelationshipSelect.sourceId/recordSource、MergeSuggestionSelect.sourcePersonaId、MentionWhereInput.persona…） |
| TS2345 | 7 | 参数不匹配（类型塌陷传入 service） |
| TS2305 | 4 | 枚举不存在（`BioCategory` → 应为 `EventCategory`） |
| TS2561 | 2 | 已知属性拼错（sourceId → source） |
| TS2739 | 1 | 事务接口缺 biographyRecord/profile 属性 |
| TS2322 | 1 | `"personaId"` 非 MentionScalarFieldEnum（应为 entityId） |

### 4.3 根因五类（忠于代码）

1. **已删模块 import（20）**：`biography/errors`（5）、`personas/errors`（3）、`relationships/errors`（2）、`AliasRegistryService`（2+1）、`ValidationAgentService`（2）、`runAnalysisJob`（1）、`personas/mergePersonas`（1）、`relationships/create|listBookRelationship`（2）、`personas/create|listBookPersona`（2）。对应模块目录已全部删除（见 §4.4）。
2. **枚举改名（4）**：`BioCategory` → `EventCategory`（schema.prisma:106），值不变。
3. **模型/字段改名（约 34）**：`profile→entityProfile`、`persona→entity`、`biographyRecord→fact`、`relationship.sourceId/targetId→source/target`、`mention.personaId→entityId`、`mergeSuggestion.sourcePersonaId→sourceEntityId`、`MergeSuggestion.sourcePersona/targetPersona→source/target`、`RelationshipSelect.recordSource` 字段已删。
4. **类型塌陷连锁（约 30）**：TS7006/TS18046/TS2345/TS2739 均为上面三种的次级效应（如 `.map(item=>…)` 拿到 any、`error instanceof …` 时 error 变 unknown、事务类型不满足）。
5. **契约漂移（2）**：`BookDetailRow` 缺 chapters/profiles/analysisJobs（getBookById.ts:206）。

### 4.4 已删除的 v4 模块目录确认

- `src/server/modules/biography/` **不存在**
- `src/server/modules/personas/` **不存在**
- `src/server/modules/relationships/` **不存在**
- `src/server/modules/knowledge/` 不存在（原 CLAUDE.md 记录）
- `src/app/api/personas/`、`src/app/api/biography/`、`src/app/api/relationships/` **不存在**
- `analysis/services/` 仅剩 `AiCallExecutor.ts` + `jobCostSummary.ts` + `listBookAnalysisJobs.ts`；`config/pipeline.ts` 已删（CLAUDE.md 描述的路径已不存在）

---

## 5. 审核流 service 的可复用依赖盘点（Pass4 例外审核流）

### 5.1 已就绪（v5 直接可复用）

| 件 | 位置 | 与审核流的关系 |
|---|---|---|
| `Fact` 审核字段 | schema.prisma:467-473 | `confidence`/`recordSource`/`status`/**`reviewedAt`**/**`reviewedBy`** + `facts_review_query_idx`（status, recordSource, chapterId）索引专为审核查询设计 |
| `RecordSource.AUTO_VERIFIED` | schema.prisma:34 | 自动接受栈落库来源，已预置枚举值 |
| `ProcessingStatus` | schema.prisma:46-52 | DRAFT/VERIFIED/REJECTED |
| identity 登记表 `getRegistry`/`BookRegistry`/`ConfidenceTier` | `identity/registry.ts` | 自动接受条件②「实体在登记表 HIGH」直接读 `RegistryEntry.confidenceTier`（registry.ts:23,90-97）；书级缓存 + write 后失效 |
| `runPrimitive`（身份判定原语） | `identity/primitive.ts:71` | 跨模型复核复用「换模型跑原语」；`PrimitiveVerdict = resolved/new_entity/ambiguous`；`sampleWindows` 分层采样 |
| `identityService.writeRegistry` | `identity/identityService.ts:37` | 写实体/提及的权威入口；`WriteSource` 已含 **`"cross_validation"`** 枚举值（:14）→ 跨模型复核落库来源已预留 |
| `runReconcile` | `identity/reconcile.ts:73` | 漏网高频补判，与审核队列边界相关（ambiguous → 人审+跨模型） |
| `conflictScan` | `identity/conflictScan.ts` | 自动接受条件④「分布式冲突扫描干净」 |
| `refreshRelationshipsForBook` | `extraction/aggregator.ts:35` | 关系物化重建；事实审核后必须调用（架构 doc:113「facts 是唯一写入口」）；PRD 要求 bulkVerify 事务内调用 |
| `runGuardrails`（证据锚定/关系码闭集/泛称过滤） | `extraction/guardrails.ts:60` | 自动接受条件①⑤可复用 `isNameInText`/`normalizeForMatch`/码集校验逻辑 |
| `lookupRelationshipTypeNames` | `skills/lookupTypeNames.ts:12` | 关系码→展示名映射（图谱 DTO 用，审核列表展示关系名可复用） |
| `chapterBiographyVerification` | schema.prisma:292-307 | 章节级「已核」标记可复用 |
| goldset eval gate | `scripts/eval`（08-06-v5-goldset-eval 产出） | 棘轮校准的离线准确率基准 |

### 5.2 缺口（需要新建）

| 项 | 说明 |
|---|---|
| **审核 service（自动接受栈/人审队列/棘轮/幻觉定向抽样）** | 全仓 grep `auto.?accept|ratchet|human.?review|hallucinat|cross.?model|人审|棘轮|幻觉` 仅命中架构文档注释，**无任何代码残留** → 从零实现 |
| **`mergeEntitiesInTransaction`** | 全库不存在（仅架构 doc 承诺 + 已删 mergePersonas 的 import）→ merge/split 接受路径需新写实体合并事务 |
| **跨模型换模型能力** | `aiCallExecutor.execute` 硬编码 `loadSystemDefaultModel`（AiCallExecutor.ts:382-394），**不接受 modelId 参数**；`callIdentityLlm`（identity/llm.ts:33）同样走默认模型。PRD 约束「换模型 = 调用方显式传 modelId」，需要：新增「按 id 解析模型」（defaultModel.ts 现无此函数，只有 loadSystemDefaultModel）+ 暴露 executeWithModel 或给 execute 加 modelId 可选参 |
| **模型解析按 id** | `defaultModel.ts:126-145` 仅 `loadSystemDefaultModel`；`toResolvedFeatureModel`（:90）可复用来包任意 AiModel 记录 → 需要一个 `loadModelById` |

### 5.3 AiCallExecutor 现状（跨模型复核的技术前提）

- `createAiCallExecutor`（AiCallExecutor.ts:240）返回 `{ execute }`；`execute` 内部 `loadSystemDefaultModel` → `executeWithModel`（私有）。
- `executeWithModel`（:287）接受 `model: ResolvedFeatureModel`，**已是通用实现**，只是未对外暴露；`modelSource` 硬编码 `"SYSTEM_DEFAULT"`（:311,333,353）→ 跨模型复核时该字段语义需扩展（或新增 source 值）。
- `callIdentityLlm`（identity/llm.ts）包装了 execute，新增跨模型入口时可平级复制并替换 model。

### 5.4 棘轮校准的落点参考

- 校准量纲（自动接受准确率）可用 `Fact` 上 `recordSource=AUTO_VERIFIED` 且 `status=VERIFIED` 的样本做回查（人审改判 → 计数）。`reviewedAt/reviewedBy` 已存在。
- 阈值初始保守（PRD Constraints），由 `config/pipeline.ts` 位置已删 → 阈值常量需新建（建议放在审核 service 模块内）。

---

## 6. 建议的改造顺序

> 以下为信息组织建议，仅基于依赖关系，非实现指导。

1. **修 service 层编译错（清 94 错误的主体）**：
   - a. 先建 v5 错误/类型底座：`biography/errors` 对应错误迁到新域（或新建 review/errors）；`mergeEntitiesInTransaction` 空缺待定
   - b. `listDrafts.ts` → entityProfile/entity/fact 数据源（影响 drafts 路由 + 页面首屏）
   - c. `mergeSuggestions.ts` → sourceEntityId/source/target + 新 merge 事务
   - d. `chapterEvents.ts` → fact/eventCategory/entityProfile
   - e. `bulkReview.ts` → fact + 事务内 refreshRelationshipsForBook
2. **修 graph/books 域 v4 残留**：`getBookGraph.ts`（16）、`findPersonaPath.ts`（9）、`updateGraphLayout.ts`（7）、`getBookById.ts`（2）→ 字段改名映射（profile→entityProfile 等）
3. **修 API 路由层**：chapter-events 系（BioCategory/biography-errors）+ personas/relationships/alias-mappings/validation-reports/analyze 路由（接 v5 service）
4. **前端适配**：roleReview 系组件 persona→entity 契约、重挂 `/api/*` 新路由、清理死代码（role-management-tab、edit-form 三件、barrel）
5. **新建 Pass4 审核 service**：自动接受栈（依赖 §5.1 全部件）→ 人审队列 → 棘轮 → 关系级幻觉定向抽样 → 跨模型复核接口（先补 §5.2 换模型能力）
6. **收尾**：type-check/lint/行覆盖≥90% 达标

---

## 关键文件索引

- 服务层：`src/server/modules/roleWorkbench/{chapterEvents,listDrafts,mergeSuggestions,bulkReview}.ts`
- 路由：`src/app/api/admin/{drafts,bulk-verify,bulk-reject,merge-suggestions}/*`、`src/app/api/admin/role-workbench/books/[bookId]/chapter-events/**`
- 前端：`src/components/review/`（活动 13 件 + 死代码 4 件）、`src/app/admin/role-workbench/**`
- 前端服务层：`src/lib/services/role-workbench.ts`（及 books/personas/relationships/biography/alias-mappings/validation-reports.ts）
- v5 数据底座：`prisma/schema.prisma`（Entity:314 / EntityProfile:354 / Alias:385 / Mention:412 / Fact:440 / Relationship:504 / MergeSuggestion:701 / ChapterBiographyVerification:292）
- 可复用件：`identity/{registry,primitive,identityService,reconcile,conflictScan}.ts`、`extraction/{guardrails,aggregator}.ts`、`skills/lookupTypeNames.ts`、`analysis/services/AiCallExecutor.ts`、`models/defaultModel.ts`
- 架构依据：`docs/architecture/13-agent-architecture-v5.md` §2.4/§6/§7（自动接受栈 §7.1、人审队列 §7.2、棘轮 §7.3、幻觉抽样 §7.4）
