# 技术设计：roleWorkbench 后端适配

> 调研依据：`08-06-v5-review/research/role-workbench-audit.md`（§1 改造矩阵 / §2 API 清单 / §4 94 错误分布）

## 0. 迁移原则

v5 已物理删除 `persona/profile/biographyRecord`。94 错误 100% 源于引用已删模块/字段。迁移 = **字段/模型名映射 + 模块重挂**，不引入新行为。

| v4 概念 | v5 概念 |
|---|---|
| `profile` / `persona` | `entity_profile` / `entity` |
| `personaId` | `entityId` |
| `biographyRecord` | `fact`（factType=BIOGRAPHY） |
| `BioCategory` | `EventCategory`（值不变） |
| `relationship.sourceId/targetId` | `relationship.source/target`（关系字段） |
| `mention.personaId` | `mention.entityId` |
| `mergeSuggestion.sourcePersonaId` | `sourceEntityId` |
| `MergeSuggestion.sourcePersona/targetPersona` | `source/target` |
| `biography/errors` `personas/errors` 等 | `review/errors`（新错误族） |

## 1. 服务层重写

### 1.1 chapterEvents.ts（470 行）

- 事件模型：`biographyRecord` → `fact`（`factType=BIOGRAPHY`）
  - 字段映射：`category→eventCategory`、`personaId→sourceEntityId`、`title/location/event/tags/ironyNote→payload`
- `assertPersonaInBook` → 查 `entityProfile`（entityId + bookId）
- `markChapterVerified` 保留 `chapterBiographyVerification`，DRAFT 计数改查 `fact.status=DRAFT`
- 错误类：`BiographyInputError/BiographyRecordNotFoundError` → `review/errors`（ReviewError 族）
- 事务接口 `ChapterEventsWorkbenchTransaction`：补 `fact` / `entityProfile` 替代 biographyRecord/profile

### 1.2 listDrafts.ts（414 行）

三 Tab 数据源迁移：
- **人物 Tab**：`profile→persona` → `entityProfile + entity`（`localName/localSummary/officialTitle/localTags/ironyIndex` 在 EntityProfile；`name/aliases/nameType/recordSource/confidence` 在 Entity）；status 在 EntityProfile
- **关系 Tab**：`relationship` 保留（source/target 联表在 v5 仍在）；`recordSource`（已删）改经底层 RELATION fact 聚合或按简化删
- **传记 Tab**：`biographyRecord` → `fact`（status/recordSource/confidence 在 Fact）

### 1.3 mergeSuggestions.ts（426 行）

- 字段映射：`sourcePersonaId→sourceEntityId`、`sourcePersona/targetPersona→source/target`
- `mergePersonasInTransaction` → `mergeEntitiesInTransaction`（新写，见 §2）
- `PersonaMergeConflictError` → 保留语义，名称可保留或改 EntityMergeConflictError

### 1.4 bulkReview.ts（170 行）

- `tx.biographyRecord.updateMany` → `tx.fact.updateMany`（status→VERIFIED/REJECTED）
- **事务内 `refreshRelationshipsForBook(bookId)`**（fact 变更后重建关系物化表）
- `BulkDraftStatusResult.biographyRecordCount` → `factCount`（前端契约联动，前端子任务处理）

## 2. 新增 `mergeEntitiesInTransaction`

```ts
export async function mergeEntitiesInTransaction(
  bookId: string,
  targetId: string,   // 保留实体
  sourceId: string,   // 被合并实体
  client: PrismaClient = prisma
): Promise<void>
```

事务步骤：
1. **facts 迁移**：`fact.updateMany({ sourceEntityId: sourceId → targetId })`（source 端）+ target 端同理
2. **aliases 并集**：target 实体 aliases 数组并入 source 的 aliases（去重）
3. **Entity 软删**：source 实体 `deletedAt = now()`（保留 target）
4. **refreshRelationshipsForBook(bookId)**：幂等重建关系（事务内或事务后——需评估 refresh 是否接受 tx）

> 边界：SPLIT（拆分实体）属"一律人审"，本任务交付合并事务；拆分可后续补充或标注非目标。

## 3. graph 域字段映射

| 文件 | 错误 | 映射 |
|---|---|---|
| `getBookGraph.ts` | 16 | `profile→entityProfile`、`personaId→entityId`、`relationship.sourceId→source.id`、`mention.personaId→entityId` |
| `findPersonaPath.ts` | 9 | 同上（关系路径的 source/target + entityProfile） |
| `updateGraphLayout.ts` | 7 | `visualConfig` 类型 + profile/persona 引用 |

## 4. API 路由

- **role-workbench chapter-events 系**（5 错 + 2 错）：修 `BioCategory→EventCategory` + `biography/errors→review/errors`
- **books 下路由**：
  - `personas/relationships/alias-mappings/validation-reports/analyze`：接 v5 service 或标注待 pipeline。其中：
    - `analyze`（runAnalysisJob 已删）→ 标注待 v5-pipeline 接入，路由保留骨架
    - `personas/relationships` 的 create/list → 改 v5 service（entity/relationship），或随前端子任务重挂
  - 决策：**本任务优先清编译错**（type-check 到 0），业务接线（前端调用）留前端子任务

## 5. 关键边界

| 场景 | 处理 |
|---|---|
| `relationship.recordSource` 已删 | listDrafts 经底层 RELATION fact 聚合，或按简化省略该列（前端不依赖则删） |
| `mergeEntitiesInTransaction` 事务内 refresh | refresh 支持传入 txClient（aggregator 现有签名是 prisma 全局，需评估扩展） |
| 前端死代码 | 前端子任务处理（role-management-tab/edit-form/barrel） |
| type-check 到 0 | 94 错误全清；graph/books 域一并纳入本任务 |

## 6. 风险与对策

- **refreshRelationshipsForBook 的 tx 支持**：若现有签名不接受 txClient，本任务需扩展（或合并事务后单独调 refresh——非原子但可接受，需权衡）
- **错误族迁移**：`biography/errors` 等已删，统一到 `review/errors`（review-service 子任务也用它，需协调归属）
- **前端契约联动**：`BulkDraftStatusResult` 字段改名会影响前端，前端子任务同步处理
