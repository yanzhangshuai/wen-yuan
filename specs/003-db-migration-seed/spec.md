# Feature Specification: 数据库迁移与种子数据录入

**Feature Branch**: `003-db-migration-seed`  
**Created**: 2026-03-03  
**Status**: Draft  
**Input**: User description: "给我迁移数据库，并且执行录入种子数据"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 执行数据库迁移 (Priority: P1)

作为开发者，我需要将当前 Prisma schema 正式迁移到 PostgreSQL，以便后续服务可以基于稳定结构运行。

**Why this priority**: 没有成功迁移就无法稳定写入业务数据。

**Independent Test**: 执行 `pnpm prisma:migrate` 后，数据库中存在 schema 对应表和枚举。

**Acceptance Scenarios**:

1. **Given** 本地 `.env` 中存在可用 `DATABASE_URL`，**When** 执行迁移命令，**Then** 迁移成功并生成可追溯迁移记录。
2. **Given** 已迁移数据库，**When** 查询核心表结构，**Then** 表与枚举与 `prisma/schema.prisma` 一致。

---

### User Story 2 - 录入种子数据 (Priority: P1)

作为开发者，我需要把基础书籍/人物/章节数据写入数据库，保证开发和联调有可用基线数据。

**Why this priority**: 没有种子数据无法验证后端查询链路与页面展示。

**Independent Test**: 执行 `pnpm prisma:seed` 后，`books/personas/chapters/profiles` 存在预期数据。

**Acceptance Scenarios**:

1. **Given** 迁移完成的数据库，**When** 执行种子脚本，**Then** 脚本成功结束并输出成功日志。
2. **Given** 已录入种子数据，**When** 查询 `Book(title=儒林外史)`，**Then** 能查到对应书籍和至少两章内容。

---

### Edge Cases

- `DATABASE_URL` 缺失时，种子脚本应立即失败并返回清晰错误。
- 重复执行 seed 时不应留下脏的中间状态（失败回滚或明确清理策略）。
- 某条长文本章节插入失败时，脚本应可定位错误来源。

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 系统 MUST 提供可执行 Prisma 迁移流程，并生成迁移文件。
- **FR-002**: 系统 MUST 在迁移成功后可执行种子录入脚本。
- **FR-003**: 系统 MUST 录入至少 1 本书、3 个核心人物、2 个章节、1 条 profile 基础数据。
- **FR-004**: 系统 MUST 在失败时输出稳定可读错误信息，便于排查。
- **FR-005**: 系统 MUST 提供执行与验证步骤文档，便于团队复现。

### Key Entities *(include if feature involves data)*

- **Book**: 书籍实体，包含标题、作者、时代、简介等。
- **Chapter**: 章节实体，包含章节序号、标题、正文内容。
- **Persona**: 人物本体实体，包含姓名、类型、标签。
- **Profile**: 人物在特定书籍中的局部画像。

## Cross-Layer Contract Constraints

- 数据库层变更必须通过 Prisma migration 落地，不允许手工改生产表结构。
- Seed 写入属于多实体写入，需事务化处理或确保失败时无脏数据残留。
- 异常必须具备可定位信息（阶段、实体、关键字段）。
- 定义 Good/Base/Bad 用例：
  - Good: 迁移+seed 全量成功。
  - Base: 仅迁移成功且可查询空表。
  - Bad: 缺少 `DATABASE_URL` 或外键依赖不满足时失败并报错。

## Required Team Constraints (Spec-Kit)

- 前端复用/可读性/性能：本需求以后端数据为主，不新增前端组件；若后续联动前端，需保持组件复用、可读性与列表渲染性能。
- Props typing：本需求不新增 React 组件；若新增，必须提前定义 `<ComponentName>Props`。
- 命名一致性：迁移名、脚本名、实体字段名在 Prisma/服务层保持一致。
- 注释要求：非平凡逻辑补充详细注释，说明业务意图、输入输出约束、边界与副作用。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 在目标环境中 `pnpm prisma:migrate` 一次执行成功。
- **SC-002**: 在同一环境中 `pnpm prisma:seed` 一次执行成功。
- **SC-003**: 成功路径、失败路径、边界路径各至少有一条显式验证记录。
- **SC-004**: 团队成员可按文档步骤在 10 分钟内完成迁移与种子录入。
