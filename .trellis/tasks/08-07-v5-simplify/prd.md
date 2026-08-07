# PRD: v5 简化与清理（当前结构为唯一真理）

> 目标基线：`docs/architecture/13-agent-architecture-v5.md`（v5.2）
> 关联任务：`08-07-v5-skill-loading`（已完成，本任务做其收尾简化）

## 背景

v5 架构在 skill-loading 任务后已落地主体，但残留了一批**迁移期痕迹**：

- **阶段/版本标记注释**：代码注释里散布 `v5 阶段 X（08-07-...）`、`v4 双架构`、`阶段 4/5` 等迁移叙事（约 121 处 v4/v5 引用，其中 23 处非测试阶段标记）。这些注释记录的是"改了什么"，不是"现在是什么"，随迭代会持续腐化，应当清理——**当前结构就是唯一真理**，代码只描述现状。
- **死代码**：`lastArchitecture` 字段链（后端恒 null + 前端消费）、`getRelationshipCodes(bookId)`（生产 0 调用，仅测试引用）等。
- **模型选择逻辑**：`featureKey`/`stageLabel` 双字段冗余 + `feature_models` 全局映射表 + fallback 模型链。用户要求**彻底移除模型选择逻辑**，所有 AI 调用统一使用默认模型，架构与代码回归简单可维护。
- **SKILL_SELECTION_SYSTEM_PROMPT 写死类型**：输出 JSON 类型在 prompt 中硬编码，与 zod schema（`skillSelectionOutputSchema`）双份维护，应当单一来源。

## 需求

| # | 需求 | 说明 |
|---|------|------|
| R1 | 当前结构为唯一真理 | 移除 v4/v5 阶段标记注释、死代码（`lastArchitecture` 链、`getRelationshipCodes(bookId)`）；注释只描述现状 |
| R2 | prompt 类型去写死 | `SKILL_SELECTION_SYSTEM_PROMPT` 输出 JSON 类型改从 zod schema 推导（单一来源） |
| R3 | 移除模型选择逻辑 + 全链冗余字段 | 删 `feature_models` 表/`FeatureKey`/`featureKey`/`stageLabel` 双字段/fallback 模型链；所有 AI 调用统一默认模型（`loadSystemDefaultModel`）；**同时清理全链死字段**：`bookId`（skillSelector/llm 接口定义但从未透传）、`IdentityLlmResult.modelId/isFallback`（调用方不消费）、`AiCallExhaustedError.featureKey/isFallback`（无捕获点）；`AiCallExecutor.execute` 只收单一 `stage: string`，返回值只留 `{data}` |
| R4 | 简单可维护原则 | 上述改动遵循最小必要、不引入新抽象；删除后不留死代码/死注释 |
| R5 | 分析域业务代码瘦身 | 删 `analysis/config/pipeline.ts`（`ANALYSIS_PIPELINE_CONFIG` 全仓库零引用，v4 配置死代码）；删 `loader.ts` 的 `loadSkill`（无外部调用）；删 `mergeRelationshipCodes` 转发别名（直接用 `getRelationshipCodesFromSkills`）；抽共享 `callJsonLlm` helper 统一 llm.ts/skillSelector.ts 两处重复的 `createAiProviderClient + generateJson + JSON.parse + 非JSON抛错` |

## 验收标准

- **AC1**：`grep -rn "lastArchitecture\|getRelationshipCodes(bookId)"` src 零引用（含测试）。
- **AC2**：`grep -rn "v5 阶段\|v5（阶段\|阶段 [1-5][（)）]"` src 零命中（覆盖 `v5 阶段 2（`/`v5 阶段 4（`/`v5（阶段 5）`/`阶段 4）` 四种格式；非测试注释也不留迁移叙事；架构文档 `docs/` 除外）。
- **AC3**：`grep -rn "FeatureKey\|featureKey\|stageLabel\|feature_models\|featureModelConfig\|AiCallExhaustedError.*featureKey"` src 零引用（含测试）；`IdentityLlmCallInput.bookId` / `SkillSelectorCallLlmInput.bookId` / `PrimitiveInput.bookId` / `IdentityLlmResult` 均无 bookId/modelId/isFallback 残留。
- **AC4**：`AiCallExecutor.execute` 签名只收 `stage: string`（+ prompt/jobId/callFn），返回值 = `AiCallFnResult`（无 modelId/isFallback）；内部统一 `loadSystemDefaultModel`，无 fallback 模型链；`feature_models` 表已删。
- **AC5**：`grep -rn "ANALYSIS_PIPELINE_CONFIG\|loadSkill\|mergeRelationshipCodes"` src 零引用（含测试）；`callJsonLlm` 统一 llm.ts/skillSelector 两处调用；无 `createAiProviderClient` 直接重复散落。
- **AC6**：`pnpm type-check` / `pnpm lint` / `pnpm test` 通过；goldset eval gate（`node scripts/eval/run-eval.ts`）不回退。

## 非目标

- 不新增功能：skill 动态选择、关系码契约、快照机制全部保留，只做简化。
- 不动 `Skill.isEnabled`/`SkillStatus`/`SkillCategory` 等既有 skill 域。
- 不改 `analysis_phase_logs` 表结构（`stage` 列复用为单一 stage 标识；`modelSource` 列写 `SYSTEM_DEFAULT` 或保留空值，不新增列）。
- 不做 v5-review / v5-pipeline 的实现（它们仍在 planning，本任务只更新其 PRD 里的过期引用）。
