# 执行计划：roleWorkbench 后端适配

> 前置：v5-review 父任务已拆 3 子任务（本任务是清 94 错误主体）。
> 全程校验命令：`pnpm type-check` / `pnpm lint` / `pnpm test`。

## 阶段 1：错误族 + 基础底座

- [ ] 1.1 建 `review/errors.ts`（ReviewError 族：ReviewInputError/ReviewNotFoundError/EntityMergeConflictError）——review-service 子任务也用它，先建共用
- [ ] 1.2 `refreshRelationshipsForBook` 支持传入 txClient（若现有签名只吃全局 prisma）
- [ ] ✅ **审查门**：type-check 通过；errors/tx 扩展可编译

## 阶段 2：roleWorkbench 4 服务重写

- [ ] 2.1 `chapterEvents.ts`：biographyRecord→fact（eventCategory/sourceEntityId/payload 映射）、assertPersonaInBook→entityProfile、errors 迁移
- [ ] 2.2 `listDrafts.ts`：三 Tab 数据源迁移到 entityProfile+entity / relationship / fact
- [ ] 2.3 `mergeSuggestions.ts`：sourceEntityId/source/target + mergeEntitiesInTransaction
- [ ] 2.4 `bulkReview.ts`：fact + 事务内 refreshRelationshipsForBook
- [ ] 2.5 四个服务单测更新（改数据源后断言）
- [ ] ✅ **审查门**：type-check 零错误（roleWorkbench 域）；4 服务单测全绿

## 阶段 3：mergeEntitiesInTransaction

- [ ] 3.1 新写实体合并事务（facts 迁移 + aliases 并集 + Entity 软删 + refresh）
- [ ] 3.2 单测（迁移正确/别名去重/软删/refresh 幂等）
- [ ] ✅ **审查门**：合并事务单测全绿

## 阶段 4：graph 域字段映射

- [ ] 4.1 `getBookGraph.ts`（16 错）：profile→entityProfile、personaId→entityId、sourceId→source.id
- [ ] 4.2 `findPersonaPath.ts`（9 错）+ `updateGraphLayout.ts`（7 错）
- [ ] ✅ **审查门**：graph 域 type-check 零错误

## 阶段 5：API 路由修复

- [ ] 5.1 role-workbench chapter-events 系（BioCategory→EventCategory + review/errors）
- [ ] 5.2 books 下 personas/relationships/alias-mappings/validation-reports/analyze 路由：接 v5 service 或标注待 pipeline
- [ ] 5.3 相关路由测试更新
- [ ] ✅ **审查门**：type-check **从 94 → 0**（全清）

## 阶段 6：收尾

- [ ] 6.1 全量 `pnpm type-check`（0 错误）/ `pnpm lint` / `pnpm test`（含覆盖率 ≥90%）
- [ ] 6.2 commit；`task.py validate` + `task.py finish`

## 回滚点

- 每阶段独立 commit；阶段 2 前可回退到基线。
- type-check 到 0 是硬门禁，中途阶段保持零新增。

## 关联子任务

- review-service：`review/errors.ts` 共用（先建，review-service 复用）。
- role-workbench-frontend：`BulkDraftStatusResult` 字段改名联动 + 重挂 API（前端子任务处理）。
