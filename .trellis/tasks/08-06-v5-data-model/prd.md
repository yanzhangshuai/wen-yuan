# 数据模型调整

## Goal

按 v5.1 调整现有 28 表 schema（R7）：新增 `relationship_types`（书型作用域 + 任务级快照）、补全 `agent_runs.runType`、删除 `agent_steps`、`facts.recordSource` 加 `AUTO_VERIFIED`。迁移通过，不引入新架构域。

## Requirements

- **`relationship_types` 表**：code/name/direction(INVERSE|SYMMETRIC)/category/别名；`bookTypeId?`（可空=全局，书型专属码不污染其他书型）。新增码 = 插行，无代码改动。
- **`analysis_jobs.relationshipTypesSnapshot`**：任务级快照（同 skillsSnapshot 模式），防跑批中途改表片间 schema 漂移。
- **`agent_runs.runType` 补全**：PRESCAN/IDENTITY/EXTRACTION/RECONCILE/VALIDATION/CROSS_VALIDATION/SKILL_GENERATION。
- **删除 `agent_steps`**：表 + 模型 + `kind` 枚举 + 关联关系一并移除。
- **`facts.recordSource`**：加 `AUTO_VERIFIED` 值，区分机器自动接受 vs 人工确认。
- 种子数据：内置 10 类全局关系码（父子/母子/兄弟/夫妻/师生/同年/同僚/主仆/朋友/仇敌）+ 书型关系码（科举：座师/门生/同年 挂 keju-novel）。

## Acceptance Criteria

- [ ] `pnpm prisma:migrate` 通过；`agent_steps` 表/模型不存在
- [ ] `relationship_types` 含 `bookTypeId` 列；按书型查询（全局行 + 本书型行）正确
- [ ] `analysis_jobs.relationshipTypesSnapshot` 生效（任务开始时快照，中途改表不影响已跑任务）
- [ ] `agent_runs.runType` 枚举含全部 7 值
- [ ] 种子脚本幂等可重跑；关系码种子入库
- [ ] `pnpm type-check` / `pnpm lint` 通过

## Constraints

- 复用现有 schema，最小改动；权威链（facts→relationships→Neo4j）不动
- 旧分析数据不迁移

## Dependencies

- 依赖 `v5-goldset-eval`（评测先行原则）。
- 下游：`v5-identity`（登记表依赖 entities/aliases/mentions）、`v5-extraction`（relationship_types）、`v5-review`（AUTO_VERIFIED）。
