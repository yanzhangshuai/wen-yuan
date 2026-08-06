# 父任务执行计划：v5.1 架构落地

> 按依赖分阶段推进，每阶段独立验证 + `git commit` + 可回退。阶段内子任务按各自 implement.md 执行。

## Phase 0 · 评测先行（v5-goldset-eval）

- goldset 跨段取样（儒林外史 4-6 章 + 冷门书 2-3 章）标注完成
- `pnpm eval:gate` 可跑，输出 entityF1/relationF1 基线
- Pass0 A/B 校准表生成

**验证**：`pnpm eval:gate` 冒烟通过（即使分数低，脚本可跑）
**门禁**：goldset 入库、eval gate 脚本可执行
**回滚**：git commit 后标记阶段完成

## Phase 1 · 数据模型（v5-data-model）

- prisma schema 变更：relationship_types / relationshipTypesSnapshot / runType / 删 agent_steps / AUTO_VERIFIED
- `pnpm prisma:generate` + `pnpm prisma:migrate`
- 关系码种子脚本（10 全局 + 科举书型）

**验证**：`pnpm type-check` / `pnpm lint` / `pnpm test`
**门禁**：migrate 通过；`grep agent_steps src/ prisma/` 零引用；种子幂等可重跑
**回滚**：git 回退到 Phase 0 commit

## Phase 2 · 身份解析（v5-identity）

- identityService（登记表派生视图 + 单一写路径 + 审计）
- 身份判定原语（HIGH 组合规则）+ 分布式冲突扫描（候选级）
- Tier1（全书一遍，A/B 表选路径）+ Tier2（原语兜底）+ reconcile

**验证**：`pnpm test`（原语/扫描/登记表/identityService 单测）
**门禁**：登记表分级正确；同场共现不误报；reconcile 时序可测
**回滚**：git 回退；identityService 未接入管线不影响下游

## Phase 3 · 提取 + 护栏 + 聚合（v5-extraction）

- Pass1 分片单轮提取（schema 动态生成 + 快照）
- Pass2 确定性护栏（证据锚定/关系码校验/泛称过滤）
- Pass3 确定性聚合（alias resolver + name authority + 全量扫描 + refreshRelationshipsForBook + Neo4j）

**验证**：`pnpm test`；`pnpm eval:gate` 跑分
**门禁**：entityF1/relationF1 有读数；护栏拦截非法码；refreshRelationshipsForBook 幂等
**回滚**：git 回退；提取未接入管线不影响审核

## Phase 4 · 例外审核（v5-review）

- 自动接受栈（C5）+ 人审队列 + 棘轮校准
- 关系级幻觉定向抽样 + 跨模型复核接口
- roleWorkbench 三 Tab 适配（personaId→entityId）

**验证**：`pnpm test`；审核流集成测试
**门禁**：AUTO_VERIFIED 落库区分；MERGE/SPLIT 无自动路径；bulkVerify 事务内重建正确
**回滚**：git 回退；审核流独立于提取

## Phase 5 · 管线集成（v5-pipeline）

- runAnalysisJob 生命周期串联 Pass0-4 + reconcile 时序（C6 强制）
- Pass5：refreshRelationshipsForBook → Neo4j → markOrphan → SkillGenerator 候选 → 终态
- 快照（skills + relationshipTypes）启动落库；并发/重试/取消

**验证**：`pnpm test` 集成测试；`pnpm eval:gate` 最终门禁
**门禁**：端到端全绿；eval gate 达标；全链路留痕可追溯
**回滚**：git 回退到 Phase 4 commit

## 评审点

- 每阶段完成 → `task.py start` 对应子任务前，父任务过 gate
- Phase 5 完成后 → 父任务最终集成评审（跨子任务验收清单 §3）
