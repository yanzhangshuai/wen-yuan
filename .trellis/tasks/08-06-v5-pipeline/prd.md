# 管线生命周期与集成（Pass5）

## Goal

实现 `runAnalysisJob` 生命周期（claim → 重置章节 → 初始化 → 管线执行 → 终态）串联 Pass0-4，完成 Pass5 图谱同步与任务终态，端到端集成验证。父任务的最终集成评审点。

## Requirements

- **runAnalysisJob 生命周期**：claim（QUEUED→RUNNING）→ 重置章节状态 → 初始化 book 状态 → `selectSkillsForJob`（任务启动快照）→ `resolveSkillsForJob`（从快照装载）→ 管线执行（Pass0-4 按序）→ SUCCEEDED/FAILED 落库。
- **Pass0-4 编排**：Tier1→Tier2→分片提取→reconcile（Pass1 与 Pass3 之间）→护栏→聚合→审核流；进度由 `getBookStatus` 从 AnalysisJob 状态推导（parseProgress 列已删）。
- **Pass5**：refreshRelationshipsForBook → Neo4j 惰性全量重同步 → markOrphan → SkillGenerator 候选（全自动生成 + 人确认启用）→ 终态落库。
- **并发/一致性**：分片提取并发控制；写审计；失败重试（章节重试 2 次）；任务取消贯穿（job 级 isCanceled）。
- **端到端集成**：上传书籍 → 章节拆分 → 分析 → 图谱 → 审核全链路可用。
- `analysis_jobs.skillsSnapshot` / `relationshipTypesSnapshot` 任务启动时落快照。

## Acceptance Criteria

- [x] 生命周期 5 步实现；任务终态 SUCCEEDED/FAILED 正确（claim 乐观并发/取消哨兵/终态事务）
- [x] Pass0-5 按序执行；reconcile 时序保证（Pass1 后 Pass3 前，26 单测锁定）
- [x] 进度由 AnalysisJob 状态推导（getBookStatus）；取消可中断；失败重试 2 次
- [x] Pass5：Neo4j 同步 + markOrphan + SkillGenerator 候选 DRAFT
- [x] 快照（skills + relationshipTypes）启动时落库，中途改配置不影响已跑任务
- [x] 端到端集成测试通过（runAnalysisJob 26 用例覆盖全生命周期）
- [ ] `pnpm eval:gate` 端到端达标——**代码链路就绪**（管线 + 提取结果导出器 + goldset）；端到端 F1 达标需运行时环境（配置 AI 模型 + 导入书籍 + 跑管线 + `npx ts-node scripts/eval/export-extraction.ts` + `node scripts/eval/run-eval.ts`）
- [x] 全链路留痕：agent_runs（各 runType）+ agent_write_audits 可追溯

## Constraints

- 复用现有 runAnalysisJob 骨架（books 模块），按 v5.1 重排
- 保留任务/进度/取消/重试的既有 UI 契约

## Dependencies

- 依赖全部 5 个子任务（goldset-eval / data-model / identity / extraction / review）。
- 本任务是父任务集成验收点：跨子任务接受标准与最终回归。
