# roleWorkbench 前端适配

## Goal

把 roleWorkbench 前端（13 个活动组件 + 页面）从 v4 persona 契约迁移到 v5 entity 契约，重挂到修复后的 API 路由，清理死代码。使角色资料工作台在新模型下正常出数、增删改链路可用。

> 依据：父任务 `research/role-workbench-audit.md` §3（前端组件清单 + 数据契约）+ §2.3（前端依赖的已损坏路由）。

## Requirements

- **R1 前端组件 persona→entity 契约**：roleReview 系组件（RoleReviewWorkbench/RoleReviewSidebar/RoleReviewSections/RoleReviewSheetFields/RoleReviewUtils/EntityMergeTool/ManualEntityTool/AliasReviewTab/ChapterEventsWorkbench 等）的 `personaId/personaName/PersonaSummary/PersonaDetail/BookPersonaListItem` → `entityId/entityName/EntitySummary/EntityDetail` 等新契约。
- **R2 重挂 API 路由**：`/api/personas|biography|relationships`（顶层，已删）→ 改挂 books 下或 admin 下新路由；`books/[id]/personas|relationships|alias-mappings|validation-reports` 接 v5 service。
- **R3 bulkVerify 联动**：`BulkDraftStatusResult` 字段改名（biographyRecordCount→factCount）前端同步。
- **R4 清死代码**：`review/index.ts` barrel（零引用）、`role-management-tab.tsx`（576 行）、`persona-edit-form/relationship-edit-form/biography-edit-form` 三件 → 删除或按需并入活动组件。
- **R5 前端 lib 服务更新**：`src/lib/services/{role-workbench,books,relationships,alias-mappings,validation-reports}.ts` 接口对齐后端。

## Acceptance Criteria

- [ ] 前端组件 type-check 零错误（persona→entity 契约迁移完成）
- [ ] roleWorkbench 三 Tab（角色资料/章节事迹/合并建议）正常出数（联调或组件级测试）
- [ ] roleReview Tab 增删改链路可用（重挂新 API）
- [ ] `bulkVerify` 前端契约同步（factCount）
- [ ] 死代码删除（barrel/role-management-tab/edit-form 三件）
- [ ] `pnpm lint` / `pnpm test`（前端组件测试）通过

## Constraints

- 依赖 backend 子任务完成（API 路由稳定后前端才能重挂）。
- 前端不做业务逻辑，只做数据契约适配 + 路由重挂。
- 死代码确认零引用后删除（调研 §3.2 已确认）。

## Dependencies

- 依赖 `role-workbench-backend`（API + service 修复完成）。
- 下游：`v5-review`（父任务归并验收）。
