# Tasks: 数据库迁移与种子数据录入

**Input**: `specs/003-db-migration-seed/spec.md`, `specs/003-db-migration-seed/plan.md`
**Prerequisites**: spec.md, clarify.md, plan.md

## Phase 1: Setup

- [x] T001 确认 `DATABASE_URL`、Prisma 版本与 schema 当前状态（`prisma/schema.prisma`）
- [x] T002 盘点现有 migration 目录与数据库迁移历史，确定是否需要初始化迁移

## Phase 2: Foundational (Blocking)

- [x] T003 生成并提交数据库迁移文件（`prisma/migrations/**`）
- [x] T004 执行迁移命令并确认核心表/枚举结构落库成功

## Phase 3: User Story 1 - 执行数据库迁移 (P1)

- [x] T005 完善迁移执行说明（命令、前置条件、失败回滚建议）
- [x] T006 验证迁移成功路径并记录结果（success case）
- [x] T007 验证迁移失败路径（如配置缺失）并记录稳定错误（failure case）

## Phase 4: User Story 2 - 执行种子录入 (P1)

- [x] T008 审查并优化 `prisma/seed.ts` 的多实体写入一致性与错误上下文
- [x] T009 执行 `pnpm prisma:seed` 并验证书籍/人物/章节/profile 数据写入
- [x] T010 验证重复执行 seed 的边界行为（boundary case）并记录结果

## Phase 5: Polish

- [x] T011 更新特性文档与执行记录，沉淀迁移+seed 复现步骤
- [x] T012 运行 lint/typecheck（如受本次变更影响）并完成最终检查

## Required Team Constraints (Spec-Kit)

- 前端复用/可读性/性能：本任务不新增前端代码；若后续联动需遵循该约束。
- Props typing：若新增组件，必须先定义 `<ComponentName>Props`。
- 命名一致性：Prisma model/field、migration 名称、脚本命名保持一致。
- 详细注释：对事务、清理策略、异常路径、DB 副作用给出明确注释。

## Verify

- [ ] Verify success case\n- [ ] Verify failure case\n- [ ] Verify boundary case
