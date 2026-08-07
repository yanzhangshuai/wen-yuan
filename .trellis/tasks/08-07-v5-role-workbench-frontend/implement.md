# 执行计划：roleWorkbench 前端适配

> 前置：`role-workbench-backend` 完成（API/service 稳定）。
> 全程校验命令：`pnpm type-check` / `pnpm lint` / `pnpm test`。

## 阶段 1：死代码清理

- [ ] 1.1 删 `review/index.ts` barrel、`role-management-tab.tsx`、`persona/relationship/biography-edit-form` 三件
- [ ] 1.2 grep 确认零引用
- [ ] ✅ **审查门**：type-check 通过；删除无副作用

## 阶段 2：前端 lib 服务对齐

- [ ] 2.1 `lib/services/role-workbench.ts`：drafts/merge/chapter-events 接口对齐后端
- [ ] 2.2 `lib/services/books.ts` + `relationships/alias-mappings/validation-reports.ts`：persona→entity 契约
- [ ] 2.3 `BulkDraftStatusResult.biographyRecordCount→factCount`
- [ ] ✅ **审查门**：lib 服务 type-check 零错误

## 阶段 3：活动组件契约迁移

- [ ] 3.1 `RoleReviewWorkbench`（888 行）persona→entity 全契约 + 重挂新 API
- [ ] 3.2 `RoleReviewSidebar/Sections/SheetFields/Utils` 字段迁移
- [ ] 3.3 `EntityMergeTool/ManualEntityTool/AliasReviewTab/ChapterEventsWorkbench` 适配
- [ ] ✅ **审查门**：组件 type-check 零错误；grep personaId 零残留（活动组件）

## 阶段 4：联调验证

- [ ] 4.1 前端组件测试更新（mock 新契约）
- [ ] 4.2 手工/组件级验证三 Tab 出数
- [ ] ✅ **审查门**：`pnpm lint` / `pnpm test` 通过

## 阶段 5：收尾

- [ ] 5.1 全量 `pnpm type-check` / `pnpm lint` / `pnpm test`
- [ ] 5.2 commit；`task.py validate` + `task.py finish`

## 回滚点

- 阶段 1 死代码删除独立 commit；阶段 3 组件迁移逐组件 commit。

## 关联

- 依赖 role-workbench-backend（API 稳定）。
- 父任务 v5-review 归并验收。
