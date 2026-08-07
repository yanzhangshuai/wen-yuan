# 执行计划：v5 简化与清理（当前结构为唯一真理）

> 前置：`08-07-v5-skill-loading` 已完成（当前基线）。
> 全程校验命令：`pnpm type-check` / `pnpm lint` / `pnpm test` / `pnpm prisma:generate`。
> 每步完成后跑一次 type-check 收敛错误；graph/roleWorkbench 的 94 个 v4 残留错误归 v5-review，本任务不动。

## 阶段 1：R3 模型选择移除（schema + 服务层）

- [ ] 1.1 `prisma/schema.prisma`：删 `FeatureModelConfig` 模型 + `AiModel.featureModel` 关系
- [ ] 1.2 `pnpm prisma:generate`；`pnpm prisma:migrate` 建迁移（dev 库重建 `migrate reset`）
- [ ] 1.3 `types/pipeline.ts`：删 `FeatureKey` 枚举 + `FEATURE_KEYS`（保留 PromptMessageInput/AiUsage/AiCallFnResult）
- [ ] 1.4 删 `models/featureModels.ts`；`loadSystemDefaultModel`/`ResolvedFeatureModel`/`AiCallParams` 迁入 `models/index.ts`（`source` 简化为 SYSTEM_DEFAULT）
- [ ] 1.5 删 `findFeatureModelReferences` + deleteModel feature 引用检查（保留 isDefault）
- [ ] ✅ **审查门**：type-check 通过；grep `FeatureKey`/`feature_models` 服务层零引用

## 阶段 2：R3 AiCallExecutor + 全链字段清理

- [ ] 2.1 `AiCallExecutor.ts`：`ExecuteAiCallInput` 改 `stage: string`；返回值改 `ExecuteAiCallResult = AiCallFnResult`（删 modelId/isFallback）；删 `AiCallExecutorDeps`/`resolveFallbackModel`/fallback 分支/`allowFallback`；模型恒默认（内部调 loadSystemDefaultModel）；`AiCallExhaustedError` 删 featureKey/isFallback（保留 modelId）；modelSource 写 SYSTEM_DEFAULT
- [ ] 2.2 `identity/llm.ts`：`IdentityLlmCallInput` 改 `{stage, system, user, jobId, temperature?, maxOutputTokens?}`（删 bookId/featureKey/stageLabel）；`IdentityLlmResult` 只留 `{data}`
- [ ] 2.3 调用方：tier1（ROSTER_DISCOVERY）/primitive（TITLE_RESOLUTION）/extractor（INDEPENDENT_EXTRACTION）/skillSelector（SKILL_SELECT）改 `stage` 并删 bookId 实参；`PrimitiveInput.bookId?`、`SkillSelectorCallLlmInput.bookId` 删；tier2/reconcile 删 runPrimitive 的 bookId 实参
- [ ] 2.4 `AiCallExecutor.test.ts` 重构：去 fallback mock/用例/featureKey 断言；断言新 stage/modelSource；`identity`/`skillSelector` 相关测试同步
- [ ] 2.5 `jobCostSummary.ts` `STAGE_ORDER` 改真实 stage 标签（SKILL_SELECT/ROSTER_DISCOVERY/TITLE_RESOLUTION/INDEPENDENT_EXTRACTION）
- [ ] ✅ **审查门**：type-check 零新增；AiCallExecutor/identity/extraction 相关测试绿

## 阶段 3：R3 管理端删除

- [ ] 3.1 删 `api/admin/feature-models/`（route/_shared/route.test）
- [ ] 3.2 删 `feature-models-panel.tsx` + model-manager Tab 引用；删 `lib/services/feature-models.ts`
- [ ] 3.3 删 `models/featureModels.test.ts`；`api/admin/feature-models/route.test.ts`
- [ ] ✅ **审查门**：`pnpm build` 前端可过；grep feature-models 零引用

## 阶段 4：R2 prompt 类型去写死

- [ ] 4.1 `skillSelector.ts`：新增 `renderOutputShape(schema)` 工具 + 单测
- [ ] 4.2 `SKILL_SELECTION_SYSTEM_PROMPT` 改用 `renderOutputShape(skillSelectionOutputSchema)` 推导类型描述
- [ ] ✅ **审查门**：单测覆盖 string/nullable/array 推导；skillSelector.test 绿

## 阶段 5：R1 死代码 + 阶段注释清理

- [ ] 5.1 删 `lastArchitecture` 链：getBookById/listBooks/types/book.ts + 前端 admin/[id]/page、(viewer)/page、library-home.test
- [ ] 5.2 删 `getRelationshipCodes(bookId)`（schema.ts + schema.test）；`relationshipCodesFromSnapshot` 保留为纯函数
- [ ] 5.3 全量 grep v4/v5 注释清理（约 121 处含测试）：迁移叙事改写为当前态；保留文档基线引用
- [ ] 5.4 `getBookStatus.ts`/`startBookAnalysis.ts`/`analyze route`/`lib/services/*` 注释同步
- [ ] ✅ **审查门**：AC1/AC2 grep 零命中；type-check/lint 通过

## 阶段 6：R5 分析域业务代码瘦身

- [ ] 6.1 删 `analysis/config/pipeline.ts`（`ANALYSIS_PIPELINE_CONFIG` 零引用；config/ 空目录一并移除）
- [ ] 6.2 删 `loader.ts` `loadSkill` + 收窄 `SkillLoader` 接口为 `{ resolveSkillsForJob }`
- [ ] 6.3 删 `mergeRelationshipCodes` 别名（skillSelector 直接用 `getRelationshipCodesFromSkills`；skills/index.ts 同步）
- [ ] 6.4 抽共享 `callJsonLlm(model, prompt, options?)`（放 `providers/ai` 或 `identity/llm` 导出）；llm.ts + skillSelector.ts 两处改调用；删两处重复的 createAiProviderClient+parse 模式
- [ ] ✅ **审查门**：grep `ANALYSIS_PIPELINE_CONFIG`/`loadSkill`/`mergeRelationshipCodes` 零引用；`pnpm test` 相关用例绿（loader/skillSelector/llm 测试同步）

## 阶段 7：文档 + 关联任务 PRD 同步

- [ ] 7.1 `docs/architecture/13-agent-architecture-v5.md`：v5.2 → v5.3；删 feature_models 表描述、SKILL_SELECTOR 廉价模型表述；模型统一默认
- [ ] 7.2 v5-pipeline prd.md：`resolveSkillsForBook`→`selectSkillsForJob`/`resolveSkillsForJob`；`parseProgress`→进度推导
- [ ] 7.3 v5-review prd.md：补 featureKey=REVIEW 不存在说明（跨模型复核显式传 modelId）
- [ ] 7.4 父任务 `08-06-agent-arch-v5-redesign` prd.md/design.md：清理 `relationship_types`/`bookTypeId` 过期引用（表已删，关系码契约入 skill frontmatter）；implement.md 已登记 Phase 3.5（v5-simplify）
- [ ] ✅ **审查门**：grep 架构文档无 feature_models 残留描述

## 阶段 8：收尾与回归

- [ ] 8.1 全量 `pnpm type-check` / `pnpm lint` / `pnpm test`（含覆盖率）
- [ ] 8.2 goldset eval gate：`node scripts/eval/run-eval.ts`，F1 不回退
- [ ] 8.3 commit；`task.py validate` + `task.py finish`（完成 08-07-v5-simplify）

## 回滚点

- 阶段 1 迁移可 `migrate reset` 全量重建（dev 无生产数据）。
- 阶段 2 前若 AiCallExecutor 改造出错，可回退到阶段 1 commit。
- 每阶段独立 commit。
