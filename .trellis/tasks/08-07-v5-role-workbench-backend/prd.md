# roleWorkbench 后端适配（清 94 错误）

## Goal

把 roleWorkbench 服务层 + graph 域 + 相关 API 路由从 v4 模型（persona/profile/biographyRecord）迁移到 v5 新模型（entity/entity_profile/fact），**清掉全部 94 个 type-check 错误**，并交付 `mergeEntitiesInTransaction` 实体合并事务。

> 依据：父任务 `research/role-workbench-audit.md`（94 错误分布 §4 + 改造矩阵 §1 + API 清单 §2）。

## Requirements

- **R1 roleWorkbench 4 服务重写**：
  - `chapterEvents.ts`：`biographyRecord→fact`、`BioCategory→EventCategory`、`profile/personaId→entityProfile/entityId`、`biography/errors→review/errors`；`chapterBiographyVerification` 保留
  - `listDrafts.ts`：三 Tab 数据源迁移到 `entityProfile+entity` / `relationship` / `fact`；`relationship.recordSource`（已删）改经底层 RELATION fact 聚合或简化
  - `mergeSuggestions.ts`：`sourcePersonaId→sourceEntityId`、`sourcePersona/targetPersona→source/target`、`personas/mergePersonas→mergeEntitiesInTransaction`
  - `bulkReview.ts`：`biographyRecord→fact`，**事务内 refreshRelationshipsForBook**
- **R2 新增 `mergeEntitiesInTransaction`**：实体合并事务（facts 迁移 sourceEntityId→targetEntityId + aliases 并集 + Entity 软删 + refreshRelationshipsForBook）——当前不存在，需从零实现
- **R3 graph 域 3 文件字段映射**：`getBookGraph.ts`（16 错）、`findPersonaPath.ts`（9 错）、`updateGraphLayout.ts`（7 错）——profile/persona/sourceId/personaId → entityProfile/entity/source/entityId
- **R4 API 路由修复**：role-workbench chapter-events 系（BioCategory + biography/errors）+ books 下 personas/relationships/alias-mappings/validation-reports/analyze 路由（接 v5 service 或标注待 pipeline）

## Acceptance Criteria

- [ ] **type-check 错误数从 94 → 0**（无新引入）
- [ ] roleWorkbench 4 服务单测全绿（改数据源后）
- [ ] `mergeEntitiesInTransaction` 存在 + 单测（facts 迁移/别名并集/Entity 软删/refresh 幂等）
- [ ] `bulkVerify` 事务内 refreshRelationshipsForBook
- [ ] graph 3 文件 type-check 零错误（字段映射正确）
- [ ] 相关 API 路由 type-check 零错误
- [ ] `pnpm lint` / `pnpm test` 通过；行覆盖 ≥90%

## Constraints

- **94 错误全部源于 v4 引用已删模块**（5 类根因：已删模块 import 20 / 枚举改名 4 / 模型字段改名 34 / 类型塌陷 30 / 契约漂移 2），迁移到新模型不引入新行为
- `mergeEntitiesInTransaction` 是 merge 人审的接受路径，需事务原子
- 前端适配（组件契约）归 role-workbench-frontend 子任务，本任务只做后端 + API
- 审核流 service（自动接受栈等）归 review-service 子任务

## Dependencies

- 依赖 `v5-data-model` / `v5-extraction`（entity/fact 模型）+ 父任务调研报告。
- 下游：`role-workbench-frontend`（前端契约依赖后端 API 稳定）、`v5-review`（父任务归并验收）。
