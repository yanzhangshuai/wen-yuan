# 数据模型调整

## Goal

按 v5 调整 schema：运行域简化（删 `agent_steps`、补全 `agent_runs.runType`、`facts.recordSource` 加 `AUTO_VERIFIED`）+ `analysis_jobs` 任务级快照字段。迁移通过，不引入新架构域。

> 演进记录：本任务原始设计含 `relationship_types` 表（书型作用域关系码权威表）。该表在 `08-07-v5-skill-loading` 被删除，关系码改为 skill frontmatter 契约（`relationshipCodes` 闭集）；`relationshipTypesSnapshot` 字段保留，由 `selectSkillsForJob` 任务启动时写入。

## Requirements

- **`analysis_jobs.relationshipTypesSnapshot`**：任务级快照（同 skillsSnapshot 模式），防跑批中途改表片间 schema 漂移；写入方 = `selectSkillsForJob`。
- **`agent_runs.runType` 补全**：PRESCAN/IDENTITY/EXTRACTION/RECONCILE/VALIDATION/CROSS_VALIDATION/SKILL_GENERATION。
- **删除 `agent_steps`**：表 + 模型 + `kind` 枚举 + 关联关系一并移除。
- **`facts.recordSource`**：加 `AUTO_VERIFIED` 值，区分机器自动接受 vs 人工确认。

## Acceptance Criteria

- [ ] `pnpm prisma:migrate` 通过；`agent_steps` 表/模型不存在
- [ ] `analysis_jobs.relationshipTypesSnapshot` 生效（任务启动时由 `selectSkillsForJob` 写入；中途改 skill 不影响已跑任务）
- [ ] `agent_runs.runType` 枚举含全部 7 值
- [ ] `pnpm type-check` / `pnpm lint` 通过

## Constraints

- 复用现有 schema，最小改动；权威链（facts→relationships→Neo4j）不动
- 旧分析数据不迁移

## Dependencies

- 依赖 `v5-goldset-eval`（评测先行原则）。
- 下游：`v5-identity`（登记表依赖 entities/aliases/mentions）、`v5-extraction`（关系码契约取码）、`v5-review`（AUTO_VERIFIED）。
