# data-model 执行计划

## 1. schema 变更

- [ ] `prisma/schema.prisma` 新增 `RelationDirection` 枚举 + `RelationshipType` model（design §2）
- [ ] `analysis_jobs` 加 `relationshipTypesSnapshot Json?`
- [ ] `AgentRunType` 枚举改为 7 值（PRESCAN/IDENTITY/EXTRACTION/RECONCILE/VALIDATION/CROSS_VALIDATION/SKILL_GENERATION）
- [ ] 删除 `AgentStep` model + `AgentStepKind` enum + `AgentRun.steps` 关系
- [ ] `RecordSource` 加 `AUTO_VERIFIED`

## 2. 迁移

- [ ] `pnpm prisma:generate`
- [ ] `pnpm prisma:migrate --name v5_data_model`

**验证**：migrate 通过；`npx prisma studio` 或 SQL 查询确认 `relationship_types` 表存在、`agent_steps` 不存在

## 3. 种子脚本

- [ ] 写 `scripts/seed-relationship-types.ts`：10 全局 + keju-novel 书型关系码，幂等 upsert
- [ ] 接入 seed 或独立 npm script（`pnpm seed:relation-types`）
- [ ] 跑两遍验证幂等

## 4. 代码清理

- [ ] `grep -r "AgentStep\|agent_steps" src/ prisma/` 清理全部引用
- [ ] 清理 runType 旧值使用点（CHAPTER_ANALYSIS/GLOBAL_RESOLUTION 等）→ 映射到新枚举
- [ ] roleWorkbench 或服务层若读 agent_steps 的地方移除/改读 agent_runs.usage

**验证**：`grep -r "AgentStep\|agent_steps" src/ prisma/` 零引用；`pnpm type-check`

## 5. 校验与收尾

- [ ] `pnpm type-check` / `pnpm lint` 通过
- [ ] `pnpm test`（受影响的测试更新：agent_steps 相关测试删除或改写）
- [ ] 快照字段生效验证：任务启动写入 relationshipTypesSnapshot，中途改表不影响（写一个测试覆盖）
- [ ] `git add prisma/schema.prisma prisma/migrations scripts/seed-relationship-types.ts` + commit

**门禁**：migrate 通过、grep 零引用、种子幂等、快照测试绿
**回滚**：git 回退到上一 commit；新表未接入业务前无破坏
