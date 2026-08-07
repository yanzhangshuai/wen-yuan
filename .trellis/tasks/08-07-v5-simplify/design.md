# 技术设计：v5 简化与清理（当前结构为唯一真理）

> 文档基线：`docs/architecture/13-agent-architecture-v5.md`（v5.2）
> 关联任务：`08-07-v5-skill-loading`（已完成，本任务做其收尾简化）

## 0. 设计原则

- **当前结构 = 唯一真理**：代码与注释只描述"现在是什么"，不记录"改了什么"（阶段/版本迁移叙事全部移除）。
- **单一来源**：AI 输出的 JSON 类型以 zod schema 为唯一权威，prompt 从 schema 推导，不写死。
- **统一模型**：移除一切模型选择逻辑（featureKey/stageLabel/feature_models/fallback），所有 AI 调用走默认模型（`loadSystemDefaultModel`）。
- **最小必要**：只删不改功能；skill 动态选择、关系码契约、快照机制全部保留。

## 1. R3 · 移除模型选择逻辑 + 全链冗余字段清理（核心，先行）

### 1.0 全链冗余审计（用户：featureKey/stageLabel 只是举例，分析所有非必要字段）

**整条 AI 调用链**（skillSelector → callIdentityLlm → AiCallExecutor → phase_logs）逐一过一遍字段：

| # | 字段/项 | 现状 | 结论 |
|---|---|---|---|
| 1 | `featureKey: FeatureKey` | 双字段之一，模型解析主键 | **删除**（无模型选择） |
| 2 | `stageLabel?: string` | 双字段之二，日志展示名 | **合并为单一 `stage: string`** |
| 3 | `SkillSelectorCallLlmInput.bookId` | 构造传入但 `callSkillSelectorLlm` 从未传给 execute（executor 不收 bookId） | **死字段，删除** |
| 4 | `IdentityLlmCallInput.bookId?` | tier1/primitive/extractor 都传，但 `callIdentityLlm` 从未透传 | **死字段，删除**（含三处调用方的 bookId 实参） |
| 5 | `IdentityLlmResult.modelId` / `isFallback` | llm.ts 返回但调用方全部只解构 `{ data }`（tier1/primitive/extractor/reconcile/tier2） | **死字段，删除**，返回值只留 `{ data }` |
| 6 | `ExecuteAiCallResult.modelId` / `isFallback` | 只被 llm.ts 用来组 IdentityLlmResult（已删） | **一并删除**（phase log 仍写 modelId，来源于 `input.model.modelId`） |
| 7 | `AiCallExhaustedError.featureKey` | 抛出但 src 无任何 catch 点 | **死字段，删除**；保留 modelId（错误信息定位用） |
| 8 | `AiCallExhaustedError.isFallback` | fallback 移除后恒 false | **删除** |
| 9 | fallback 模型链：`resolveFallbackModel`/`allowFallback`/`isFallback` | 换模型兜底 | **整体删除**（统一默认模型） |
| 10 | `ResolvedFeatureModel.source` + `FeatureModelSource` 类型 | FEATURE/SYSTEM_DEFAULT/FALLBACK | **删除字段**；phase log `modelSource` 写常量 `"SYSTEM_DEFAULT"` |
| 11 | `AiCallParams`/`DEFAULT_AI_CALL_PARAMS` | 重试档位（maxRetries/retryBaseMs） | **保留**（重试逻辑仍存在），迁入 models 域 |
| 12 | `modelSource` 写日志 | 写 `model.source`（会变 FEATURE/FALLBACK） | **改常量** `"SYSTEM_DEFAULT"` |

> 结论：除了 featureKey/stageLabel 合并为 stage，还删掉 **3 个死字段（bookId×2、modelId/isFallback）** 与 **1 个死错误字段（featureKey）**。净效果：`callIdentityLlm` 返回值从 `{data, modelId, isFallback}` 简化为 `{data}`；skill 选择器、identity、extraction 全部不感知模型。

### 1.1 删除面

| 项 | 处置 |
|---|---|
| `FeatureModelConfig`（`feature_models` 表）+ `AiModel.featureModel` 关系 | prisma schema 删除 + 迁移 drop |
| `FeatureKey` 枚举 + `FEATURE_KEYS`（`src/types/pipeline.ts`） | 删除（文件保留 `PromptMessageInput`/`AiUsage`/`AiCallFnResult`） |
| `featureModels.ts` 服务（getFeatureModel/upsertFeatureModel/listFeatureModels） | 删除；`loadSystemDefaultModel`/`ResolvedFeatureModel`/`AiCallParams` 迁入 `models/index.ts` |
| feature-models 管理端 API（`api/admin/feature-models/` 三文件） | 删除 |
| feature-models 前端 panel（`feature-models-panel.tsx` + model-manager Tab） | 删除 |
| `lib/services/feature-models.ts` | 删除 |
| `models/index.ts` 的 `findFeatureModelReferences` + deleteModel 的 feature 引用检查 | 删除（保留 isDefault 检查） |
| `AiCallExhaustedError.featureKey`/`isFallback` | 删除字段（保留 modelId） |

### 1.2 `AiCallExecutor` 改造

**目标签名**（`ExecuteAiCallInput` + 返回值简化）：

```ts
export interface ExecuteAiCallInput<TData> {
  /** 单一阶段标识：写入 analysis_phase_logs.stage（如 "SKILL_SELECT"、"INDEPENDENT_EXTRACTION"）。 */
  stage      : string;
  prompt     : PromptMessageInput;
  jobId      : string;
  chapterId? : string | null;
  chunkIndex?: number | null;
  callFn     : (input: {
    model : ResolvedFeatureModel;   // 恒为默认模型
    prompt: PromptMessageInput;
  }) => Promise<AiCallFnResult<TData>>;
}

/** 返回值不再携带 modelId/isFallback（调用方不消费）；phase log 已落 modelId。 */
export type ExecuteAiCallResult<TData> = AiCallFnResult<TData>;
```

- **模型解析**：内部恒调 `loadSystemDefaultModel()`（迁入 models 域）；删除 `deps.resolvePrimaryModel`/`resolveFallbackModel`（`AiCallExecutorDeps` 整体删除，`createAiCallExecutor` 不再接收 deps）。
- **阶段日志**：`stage` 直接写 `analysis_phase_logs.stage`；`modelSource` 写常量 `"SYSTEM_DEFAULT"`；`isFallback` 恒 `false`（保留列，不新增）。
- **测试更新**：`AiCallExecutor.test.ts` 重构——删 resolveFallbackModel mock、fallback 用例、AiCallExhaustedError.featureKey 断言；断言 stage/modelSource 新值。

### 1.3 调用方迁移

| 调用方 | 现值 | 改为 |
|---|---|---|
| `identity/llm.ts` `callIdentityLlm` | 接口 `{featureKey, stageLabel, bookId?, ...}`；返回 `{data, modelId, isFallback}` | 接口 `{stage, system, user, jobId, temperature?, maxOutputTokens?}`；返回只留 `{data}`；删 bookId 透传 |
| `identity/tier1.ts` | `featureKey: PIPELINE_MAIN, stageLabel: "ROSTER_DISCOVERY", bookId` | `stage: "ROSTER_DISCOVERY"`（删 bookId 实参） |
| `identity/primitive.ts` | `featureKey: PIPELINE_MAIN, stageLabel: "TITLE_RESOLUTION", bookId` | `stage: "TITLE_RESOLUTION"`（删 bookId 实参；`PrimitiveInput.bookId?` 删） |
| `identity/tier2.ts` / `reconcile.ts` | 调 runPrimitive 传 bookId | 删 bookId 实参（runPrimitive 不再需要，identityService.writeRegistry 的 bookId 保留） |
| `extraction/extractor.ts` | `featureKey: PIPELINE_MAIN, stageLabel: "INDEPENDENT_EXTRACTION", bookId` | `stage: "INDEPENDENT_EXTRACTION"`（删 bookId 实参） |
| `skills/skillSelector.ts` | `featureKey: SKILL_SELECTOR, stageLabel: "SKILL_SELECT", bookId` | `stage: "SKILL_SELECT"`；`SkillSelectorCallLlmInput.bookId` 删 |

### 1.4 `jobCostSummary` 阶段排序适配

`STAGE_ORDER` 现值是 featureKey（SKILL_SELECTOR/PIPELINE_MAIN/REVIEW），与日志实际 stage 值（SKILL_SELECT/ROSTER_DISCOVERY/TITLE_RESOLUTION/INDEPENDENT_EXTRACTION）不一致。R3 后 stage 值稳定为调用方传入的标签，**STAGE_ORDER 改为按真实 stage 标签排序**（未知 stage 排最后，逻辑不变）。

### 1.5 分析域业务代码瘦身（R5，范围 A）

| # | 项 | 证据 | 处置 |
|---|---|---|---|
| B1 | `analysis/config/pipeline.ts` 整个文件 | `ANALYSIS_PIPELINE_CONFIG` 定义于 [pipeline.ts:25](src/server/modules/analysis/config/pipeline.ts#L25)，**全仓库零生产引用**；内容全为 v4 概念（roster/chunk/arbitration/validation），v5 无对应消费 | **整个文件删除**（`config/` 目录空则一并移除） |
| B2 | `mergeRelationshipCodes` 转发别名 | [skillSelector.ts:184](src/server/modules/skills/skillSelector.ts#L184) `export const mergeRelationshipCodes = getRelationshipCodesFromSkills`，仅 skillSelector.ts:420 内部使用 + skills/index.ts:32 导出 | **删别名**；skillSelector 直接用 `getRelationshipCodesFromSkills`；skills/index.ts 同步删导出 |
| B3 | `loader.ts` 的 `loadSkill` | 定义于 [loader.ts:150-168](src/server/modules/skills/loader.ts#L150)，**无任何外部调用**（注释称"供 load_skill 工具"，v5 无此工具） | **删除** loadSkill + `SkillLoader` 接口类型收窄为 `{ resolveSkillsForJob }` |
| B4 | 重复 LLM 调用模式 | [llm.ts:47-60](src/server/modules/identity/llm.ts#L47) 与 [skillSelector.ts:227-237](src/server/modules/skills/skillSelector.ts#L227) 重复 `createAiProviderClient({...model 字段}).generateJson(p) + JSON.parse + 非JSON抛错` | **抽共享 helper `callJsonLlm(model, prompt, options?)`** 放 `providers/ai`（或 identity/llm 内导出）；两处改调用；`model` 直接透传（helper 内部 createAiProviderClient） |

> 边界：`graph/`、`roleWorkbench/`、`knowledge/` 的 v4 残留归 v5-review，本任务不越界。`connectivity.ts` 不消费 generateJson（走别的路径），不受 B4 影响。

## 2. R2 · prompt 类型去写死

**现状**：`SKILL_SELECTION_SYSTEM_PROMPT` 硬编码 `'{ "skillSlugs": string[], "inferredType": string | null, "reasons": string }'`，与 `skillSelectionOutputSchema`（zod）双份维护。

**方案**：新增小工具 `renderOutputShape(schema)`，从 zod schema 的 `shape` 字段推导 JSON 类型描述字符串（支持 `z.string()`→`string`、`z.string().nullable()`→`string | null`、`z.array(...)`→`...[]`、`z.string().min(1)` 等）。`SKILL_SELECTION_SYSTEM_PROMPT` 改为调用它：

```ts
const OUTPUT_JSON_DESC = renderOutputShape(skillSelectionOutputSchema);
//  → '{ "skillSlugs": string[], "inferredType": string | null, "reasons": string }'
```

`renderOutputShape` 放 `skillSelector.ts`（就近），单元测试覆盖推导正确性。

## 3. R1 · 当前结构为唯一真理（死代码 + 阶段注释）

### 3.1 死代码删除

| 死代码 | 处置 |
|---|---|
| `lastArchitecture` 字段链 | `getBookById.ts` / `listBooks.ts` 删字段+注释；`types/book.ts` 删接口字段；前端 `admin/books/[id]/page.tsx`、`(viewer)/page.tsx`、`library-home.test.tsx` 删消费/映射 |
| `getRelationshipCodes(bookId)`（schema.ts） | 删除函数 + 测试（生产 0 调用，仅 schema.test 引用）；`relationshipCodesFromSnapshot` 保留（供快照解析，抽离为纯函数） |

> 注意：`getRelationshipCodes` 删除后，`relationshipTypesSnapshot` 读取链只剩 `skillSelector` 写入 + `relationshipCodesFromSnapshot` 工具。v5-pipeline 任务启动时由 `selectSkillsForJob` 写快照，提取阶段从 job 快照装载（已由 `resolveSkillsForJob` 提供 `relationshipCodes`），无需 book 级取码。

### 3.2 阶段注释清理

- 全量 grep `v4`/`v5`（约 121 处，含测试），逐条处理：
  - **迁移叙事**（`v5 阶段 X（08-07-...）`、`v4 双架构`、`阶段 4/5（...）`）→ 删除或改写为当前态描述（保留有价值的设计意图）。
  - **文档基线引用**（`docs/architecture/13-agent-architecture-v5.md`）→ 保留，架构文档本身不含迁移叙事。
  - **命名溯源**（如 `feature-models`、`model-strategy` 已删除的命名）→ 改写为现状。
- **白名单**：`src/generated/` 不处理；`prisma/schema.prisma` 的 `@db.remark` 注释改写为当前态。
- **验收 grep**：`lastArchitecture`、`getRelationshipCodes(bookId)`、`FeatureKey`、`featureKey`、`stageLabel`、`feature_models`、`featureModelConfig` 在 src 零引用；`v5 阶段`、`v4：`、`阶段 [1-5]（` 零命中（docs/ 除外）。

## 4. R4 · 简单可维护

- 无新抽象：`loadSystemDefaultModel` 迁入 models 域（不新建目录）。
- 注释清理只改表述不动语义；`renderOutputShape` 单一用途。
- 不做 review/pipeline 功能实现（仅更新其 PRD 过期引用，见 §5）。

## 5. 关联任务 PRD 同步

- **v5-pipeline**：PRD 中 `resolveSkillsForBook` → `selectSkillsForJob`（任务启动快照）+ `resolveSkillsForJob`（从快照装载）；`parseProgress` 写回 → 进度由 `getBookStatus` 从 AnalysisJob 推导。同步到 pipeline prd.md。
- **v5-review**：PRD 中 featureKey=REVIEW 槽位不存在 → 跨模型复核由调用方显式传 `modelId`（复用默认模型解析，不建映射表）。在 review prd.md 补一句非目标说明。
- **架构文档** `docs/architecture/13-agent-architecture-v5.md`：版本 v5.2 → v5.3；删 `feature_models` 描述（§6 表）、`SKILL_SELECTOR 廉价模型` 表述（§5 装载）；模型统一默认模型。

## 6. 关键边界

| 场景 | 处理 |
|---|---|
| 阶段日志 stage 历史数据（旧 featureKey 值） | 保留不动（只影响排序，未知 stage 排最后）；新数据写真实标签 |
| `analysis_phase_logs.modelSource` | 写 `SYSTEM_DEFAULT`（列已存在，不新增） |
| skill 选择器默认模型 | 选择器调用改 `stage: "SKILL_SELECT"`，模型 = 默认（与主流程同模型，接受成本变化） |
| 默认模型缺失 | `loadSystemDefaultModel` 逻辑不变，无模型时抛错（既有行为） |
| `getRelationshipCodes` 删除后提取无码来源 | 提取从 job 快照装载（`resolveSkillsForJob` 已提供 relationshipCodes），不依赖 book 级取码 |
| bookId 死字段删除后影响 | 无影响：phase log 不落 bookId，成本/审计不依赖；identityService.writeRegistry 的 bookId 入参保留（tier2/reconcile 内部仍用） |

## 7. 风险与对策

- **AiCallExecutor 测试重构面大**（487 行）：逐用例改 mock；删 fallback 用例，保留重试/日志用例。
- **注释清理误伤**：白名单 grep 校验；只改注释不改逻辑；架构文档引用保留。
- **goldset 回归**：eval gate 重跑确认 F1 不回退（改动均为重构，不涉及提取逻辑）。
- **迁移**：dev 库 `migrate reset` 全量重建（无生产数据）。
