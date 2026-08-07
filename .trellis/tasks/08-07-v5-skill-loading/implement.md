# 执行计划：v5 Skill 装载重构

> 前置：`08-06-v5-extraction` 已提交（schema.ts/guardrails 现状基线）。
> 全程校验命令：`pnpm type-check` / `pnpm lint` / `pnpm test` / `pnpm prisma:generate`。
> 每步完成后跑一次 type-check 收敛错误；本任务结束后应无新增类型错误（graph/roleWorkbench 的 94 个 v4 残留归 v5-review）。

## 阶段 1：schema 与契约层

- [ ] 1.1 schema.prisma：**删 6 表** `BookType`/`BookTypeSkill`/`RelationshipType`/`ModelStrategyConfig`/`TextChunk`/`FactEvidence` + **删 14 死字段**（Book.parseProgress/parseStage/bookTypeId、SkillVersion.bookTypeId、Chapter.isAbstract、Entity.birthYear/deathYear、EntityProfile.moralTier、Alias.contextHash、Fact.paraIndex、Mention.summary、AiModel.supportsTools、AnalysisJob.experimentTag/architecture）+ 连带删 TextChunk 的 GIN/HNSW 索引；**保留 review 域字段**（Chapter.parseStatus、Entity.gender/hometown、EntityProfile.officialTitle/ironyIndex、Fact.virtualYear/location/title/attitudeTags/reviewedAt/reviewedBy、ChapterBiographyVerification 表）；增 `Skill.isEnabled`/`FeatureModelConfig`
- [ ] 1.2 `pnpm prisma:generate`；`pnpm prisma:migrate` 建迁移（dev 库重建 `migrate reset`）
- [ ] 1.3 `content-schema.ts`：frontmatter schema 增 `relationshipCodes`/`deicticJunk`；删 `triggers.bookTypeKeys`
- [ ] 1.4 seed skills/*.md：`classical-relationship-types.md` 补 frontmatter 契约；新增 `chinese-deictic-junk.md`
- [ ] 1.5 `seed-skill-baselines.ts`：解析新契约 + 幂等
- [ ] ✅ **审查门**：type-check 通过；migration 干净

## 阶段 2：skill 选择器 + 装载改造

- [ ] 2.1 `skills/skillSelector.ts`：目录(frontmatter-only) + 书上下文 → SKILL_SELECTOR 廉价模型 → zod 校验 skillSlugs → 返回 `{skills, relationshipCodes}`
- [ ] 2.2 快照：`selectSkillsForJob({bookId, jobId})` 写入 `AnalysisJob.skillsSnapshot`/`relationshipTypesSnapshot`（供 runAnalysisJob 编排调用）
- [ ] 2.3 `loader.ts` `resolveSkillsForJob` 改从 job 快照读（删 bookTypeId）；`loadSkill` 删书型激活版
- [ ] 2.4 装载上下文带 `deicticJunk` 契约名单
- [ ] ✅ **审查门**：单元测试覆盖选择器校验/快照（≥90% 行覆盖）

## 阶段 3：关系码契约取码

- [ ] 3.1 `getRelationshipCodesFromSkills` + `schema.ts` `getRelationshipCodes` 改契约源
- [ ] 3.2 `guardrails.ts` validCodes 从契约快照；`lookupTypeNames` 改契约取 name
- [ ] 3.3 `startBookAnalysis.ts`：删 `EmptyRelationshipKnowledgeError` 检查（改契约空提示）、删 modelStrategy 入参、删 architecture 解析逻辑（v5 单管线）
- [ ] 3.4 `getBookStatus.ts`：progress/stage 改从 AnalysisJob 状态 + phase_logs 推导（替代 parseProgress/parseStage 列；前端读 API 字段名不变）；`Chapter.parseStatus` 保留
- [ ] ✅ **审查门**：extraction/identity 测试全绿；grep 无 `relationship_type`/`parseProgress`/`architecture` 运行时引用

## 阶段 4：模型策略 → 功能点

- [ ] 4.1 删 v4 遗产：`PipelineStage`/`StageParams`/`modelStrategy.ts` dto/`modelStrategyAdminService`/`ModelStrategyResolver` 阶段化解析/`model-recommendations`/前端 `model-strategy-form`/`ANALYSIS_ARCHITECTURE_VALUES`+`AnalysisArchitecture`（types/analysis-pipeline）
- [ ] 4.2 增 `FeatureKey` 枚举 + `feature_models` 服务（get/upsert/list + AiModel 校验）
- [ ] 4.3 `AiCallExecutor.execute` 改 `featureKey` 解析（保留重试/回退/日志）；identity/llm.ts、extraction 调用改 featureKey
- [ ] ✅ **审查门**：type-check 清零（本任务范围）；AiCallExecutor 相关测试更新通过

## 阶段 5：管理端与清理

- [ ] 5.1 新建 `admin/skills/` 页（列表 + isEnabled toggle + 契约只读展示）
- [ ] 5.2 删 `book-types` 页；book 导入/详情去 bookTypeId（无书级 skill 持久化，book 页不展示推断结果）
- [ ] 5.3 删 knowledge-base 死页面（relationship-types/title-filters/alias-packs/extraction-rules/prompt-templates）+ 死 API + 死前端 clients
- [ ] 5.4 `knowledge/index.ts` 收敛
- [ ] ✅ **审查门**：`pnpm build` 前端可过；管理端手测要点列清单

## 阶段 6：收尾与回归

- [ ] 6.1 全量 `pnpm type-check` / `pnpm lint` / `pnpm test`（含覆盖率）
- [ ] 6.2 goldset eval gate：`node scripts/eval/run-eval.ts`，entity/relation F1 不回退
- [ ] 6.3 `docs/architecture/13-agent-architecture-v5.md` §3/§5 更新
- [ ] 6.4 commit；`task.py validate` + `task.py finish`（完成 08-07-v5-skill-loading）

## 回滚点

- 阶段 1 迁移可 `migrate reset` 全量重建（dev 无生产数据）。
- 阶段 4 删除 v4 模型策略前先确认 AiCallExecutor 替换完成，避免解析断链。
- 每阶段独立 commit，阶段 3 前可整体回退到 extraction 基线。
