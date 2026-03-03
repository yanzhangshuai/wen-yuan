# Implementation Plan: 数据库迁移与种子数据录入

**Branch**: `003-db-migration-seed` | **Date**: 2026-03-03 | **Spec**: `specs/003-db-migration-seed/spec.md`
**Input**: Feature specification from `/specs/003-db-migration-seed/spec.md`

## Summary

基于现有 Prisma schema 完成数据库迁移资产落地，随后执行并验证种子数据录入。重点保证流程可复现、失败可定位、重复执行可控。

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js runtime  
**Primary Dependencies**: Prisma 7, @prisma/client, pg, ts-node  
**Storage**: PostgreSQL  
**Testing**: 命令行验证 + 数据库查询验证  
**Target Platform**: 本地开发环境（Linux）  
**Project Type**: Next.js web application (backend data workflow)  
**Performance Goals**: migration/seed 在开发环境可在分钟级完成  
**Constraints**: 迁移必须可追踪；seed 失败必须有清晰错误与可重复执行策略  
**Scale/Scope**: 当前核心书籍/人物/章节基线数据

## Constitution Check

- 统一契约：本次不新增 API response contract。
- 类型边界：继续保持 Prisma/TS 严格类型，不引入 `any`。
- DB 规则：多实体写入通过事务或可证明一致性的顺序操作。
- 测试基线：明确 success/failure/boundary 三类验证。

## Project Structure

### Documentation (this feature)

```text
specs/003-db-migration-seed/
├── spec.md
├── clarify.md
├── plan.md
└── tasks.md
```

### Source Code (repository root)

```text
prisma/
├── schema.prisma
├── seed.ts
└── migrations/

src/generated/prisma/
```

**Structure Decision**: 使用现有 `prisma/` 目录，不引入新层级。

## Implementation Strategy

1. 检查 `prisma/schema.prisma` 与现有 migration 状态，生成/补齐 migration。
2. 优化 seed 脚本（必要时），保证失败时可定位、重复执行行为可预测。
3. 执行 `pnpm prisma:migrate` 与 `pnpm prisma:seed`，记录结果。
4. 做三类验证：
   - success：迁移+seed 成功，核心表有数据
   - failure：缺少 `DATABASE_URL` 时失败可读
   - boundary：重复 seed 后数据状态符合预期

## Required Team Constraints (Spec-Kit)

- 前端复用/可读性/性能：本次不改前端；如后续联动，遵循组件复用与渲染性能规则。
- Props typing：本次不新增组件；如新增，必须先定义 `<ComponentName>Props`。
- 命名一致性：migration 名称、脚本命令、实体字段命名在跨层保持一致。
- 详细注释：关键步骤（清理、事务、错误处理、副作用）必须有注释。
