# 执行计划：v5 管线生命周期与集成

> 前置：v5-review（审核流 + roleWorkbench 适配）已完成。
> 全程校验命令：`pnpm type-check` / `pnpm lint` / `pnpm test`。

## 阶段 1：runAnalysisJob 骨架 + 生命周期

- [ ] 1.1 新建 `analysis/jobs/runAnalysisJob.ts`：`createAnalysisJobRunner` + `runAnalysisJobById` + `runNextAnalysisJob`
- [ ] 1.2 生命周期辅助：claimQueuedJob（乐观并发）/ isJobCanceled（轮询 CANCELED）/ loadChaptersForJob（按 scope 选章）/ writeTerminalState（SUCCEEDED/FAILED + book COMPLETED/ERROR）
- [ ] 1.3 接线：analyze route 的 `runAnalysisJobById` import 修复（route.test 锁定签名）
- [ ] 1.4 数据准备：buildBookSummary / buildEntityIdByName / relationshipTypeCodes（从快照）
- [ ] ✅ **审查门**：type-check 残留清零（analyze 错误消失）；生命周期单测绿

## 阶段 2：Pass0 + Pass1 + 落库

- [ ] 2.1 runPass0：runTier1 → runTier2（+候选级冲突扫描）
- [ ] 2.2 runPass1：buildSlices → 每片 extractSlice（并发 ≤3）→ **facts/mentions/aliases/agent_write_audits 落库**（entityId 解析）
- [ ] 2.3 章节重试 2 次（attempt 递增）；agent_runs 留痕（runType=IDENTITY/EXTRACTION）
- [ ] ✅ **审查门**：Pass0/1 单测绿（mock LLM，断言 facts 落库 + 审计）；提取结果可生成

## 阶段 3：reconcile + Pass3 + Pass4

- [ ] 3.1 runReconcile（Pass1 后 Pass3 前，硬时序）+ 全量 scanMisattribution
- [ ] 3.2 runPass3：mergeAliasGroups + refreshRelationshipsForBook + Neo4j 同步（抽取 findPersonaPath 的 syncNeo4jBookGraph）
- [ ] 3.3 runPass4：acceptFactsForJob + 自动接受条件④接入真实 conflictScan
- [ ] ✅ **审查门**：时序测试（reconcile 在 Pass1 后 Pass3 前）；Pass3/4 单测绿

## 阶段 4：Pass5 + 端到端

- [ ] 4.1 runPass5：markOrphan（FULL_BOOK 门控）+ skillGenerator.generateSkillFromSignals（候选 DRAFT）
- [ ] 4.2 终态：job SUCCEEDED/FAILED + book COMPLETED/ERROR；取消贯穿（每 Pass 前 isJobCanceled）
- [ ] 4.3 端到端：上传书籍→拆分→分析→图谱→审核 全链路验证（手工/集成测试）
- [ ] ✅ **审查门**：端到端集成测试通过；agent_runs 全 runType 留痕

## 阶段 5：eval gate + 回归

- [ ] 5.1 生成提取结果到 scripts/eval/results/ → `node scripts/eval/run-eval.ts`，entityF1≥0.74 / relationF1≥0.68
- [ ] 5.2 若 F1 不达标：goldset 校准 / 阈值调整（棘轮法）
- [ ] 5.3 全量 `pnpm type-check`（0 错误）/ `pnpm lint` / `pnpm test`（行覆盖 ≥90%，runAnalysisJob 主战场）
- [ ] 5.4 commit；`task.py validate` + `task.py finish`；父任务 `08-06-agent-arch-v5-redesign` 最终集成评审

## 回滚点

- 阶段 1 骨架独立 commit；runAnalysisJob 未接管线前不影响现有功能。
- 每阶段独立 commit。

## 关联

- 父任务 `08-06-agent-arch-v5-redesign` 最终集成评审点。
- goldset eval gate（D15）阻塞在下游，本次跑通。
