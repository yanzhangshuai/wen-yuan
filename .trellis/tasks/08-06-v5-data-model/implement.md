# data-model 执行计划

> 演进记录：`relationship_types` 表与关系码种子脚本在 `08-07-v5-skill-loading` 被移除（关系码改为 skill frontmatter 契约），本任务只保留运行域 schema 改动。

## 1. schema 变更

- [ ] `analysis_jobs` 加 `relationshipTypesSnapshot Json?`（由 `selectSkillsForJob` 写入）
- [ ] `AgentRunType` 枚举改为 7 值（PRESCAN/IDENTITY/EXTRACTION/RECONCILE/VALIDATION/CROSS_VALIDATION/SKILL_GENERATION）
- [ ] 删除 `AgentStep` model + `AgentStepKind` enum + `AgentRun.steps` 关系
- [ ] `RecordSource` 加 `AUTO_VERIFIED`

## 2. 迁移

- [ ] `pnpm prisma:generate`
- [ ] `pnpm prisma:migrate --name v5_data_model`

**验证**：migrate 通过；SQL 查询确认 `agent_steps` 不存在

## 3. 代码清理

- [ ] `grep -r "AgentStep\|agent_steps" src/ prisma/` 清理全部引用
- [ ] 清理 runType 旧值使用点（CHAPTER_ANALYSIS/GLOBAL_RESOLUTION 等）→ 映射到新枚举
- [ ] roleWorkbench 或服务层若读 agent_steps 的地方移除/改读 agent_runs.usage

**验证**：`grep -r "AgentStep\|agent_steps" src/ prisma/` 零引用；`pnpm type-check`

## 4. 校验与收尾

- [ ] `pnpm type-check` / `pnpm lint` 通过
- [ ] `pnpm test`（受影响的测试更新：agent_steps 相关测试删除或改写）
- [ ] 快照字段生效验证：任务启动由 `selectSkillsForJob` 写入 relationshipTypesSnapshot（测试覆盖，skill-loading 承接）
- [ ] `git add prisma/schema.prisma prisma/migrations` + commit

**门禁**：migrate 通过、grep 零引用、快照测试绿
**回滚**：git 回退到上一 commit；新字段未接入业务前无破坏
