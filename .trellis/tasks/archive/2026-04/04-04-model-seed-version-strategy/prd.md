# brainstorm: 模型种子与版本推荐策略

## Goal

统一“模型默认推荐/初始化来源”与“模型版本演进策略”，降低后续升级（如 GLM 4.6 -> 5.x）时的改动范围与误配风险。

## What I already know

* `prisma/seed.ts` 已初始化模型清单（`defaultAiModels`），但当前仅是基础模型项，不承载阶段推荐策略。
* 前端阶段推荐目前在 `src/app/admin/_components/model-strategy-form.tsx` 的 `RECOMMENDED_MODELS` 常量中硬编码。
* 推荐命中逻辑是精确匹配 `provider + modelId`，不是模糊匹配。
* Provider 调用层（`src/server/providers/ai/*Client.ts`）最终都要求明确 `modelName`，不支持“版本前缀模糊路由”。
* `config/model-candidates.v1.json` 已引入了 `qwen-max-latest` 这类“语义 key + 具体 modelId”映射思路（用于评测侧）。

## Assumptions (temporary)

* 本次先明确策略，不立即改所有调用链实现。
* 用户希望“初始化配置可复现（seed）”与“版本升级成本可控”同时成立。

## Open Questions

* 阶段推荐配置是否应只保留 `aliasKey`，完全移除 `provider + providerModelId` 信息。

## Requirements (evolving)

* 模型基础数据初始化（provider/name/modelId/baseUrl/default flags）统一由 `seed.ts` 负责。
* 模型版本采用“显式版本多条”管理（如 `glm-4.6`、`glm-5` 并存），禁止模糊匹配调用。
* 增加“语义别名 -> provider+modelId”映射层，供阶段推荐与后续升级切换使用。
* “阶段推荐模型”从集中配置源读取，避免散落在多个前端常量。
* 模型版本升级策略必须支持：
* 1) 平滑升级（新版本上线）
* 2) 快速回滚（切回旧版本）
* 3) 与现有 `provider + modelId` 精确匹配逻辑兼容
* 语义别名映射先以配置文件为单一来源（非数据库），保证低风险快速落地。

## Acceptance Criteria (evolving)

* [x] 明确 seed 与推荐配置的边界（哪些放 DB seed，哪些放配置文件/策略层）。
* [ ] GLM 类模型按显式版本并存（4.6/5.x），能通过别名切换推荐且可快速回滚。
* [x] 前端推荐逻辑不再硬编码在组件内，改为读取集中配置。
* [x] 方案不引入“模糊 modelId 匹配”造成的不可控调用风险。

## Definition of Done (team quality bar)

* 方案可映射到现有代码结构（seed、model-strategy-form、provider client、resolver）
* 升级/回滚路径清晰，避免隐式行为
* 后续实现任务可按小步 PR 拆分

## Out of Scope (explicit)

* 本文档不直接执行数据库迁移或重构所有模型管理 API。
* 不在本轮完成供应商价格/能力动态拉取系统。

## Research Notes

### Constraints from current repo

* 实际调用必须给出确定 `modelId`（如 `glm-4.6`）。
* 推荐匹配使用精确 `provider + modelId`，所以“纯模糊版本”当前不兼容。
* `aliasKey` 只在部分模型上存在；如果配置层只存 alias，运行时必须保证模型表中的 alias 完整且唯一。

### Feasible approaches here

**Approach A: 双层配置（推荐）**

* How it works:
* seed 只初始化“可调用模型实例”（显式版本，如 `glm-4.6`、`glm-5`）。
* 阶段推荐使用“语义 key -> provider+modelId”映射（可放配置文件或策略表），前端/后端都读同一来源。
* Pros:
* 显式版本可回滚；推荐可热更新；避免前端硬编码散落。
* Cons:
* 需要补一个统一读取层。

**Approach B: 全放 seed（DB 真单一来源）**

* How it works:
* 把阶段推荐也写进数据库（通过 seed 初始化策略行），前端全部走 API 读取。
* Pros:
* 配置集中在 DB，运营可后台修改。
* Cons:
* 初次实现改动面更大（策略 API/管理页要联动）。

**Approach C: 保持现状 + 局部修补**

* How it works:
* seed 只补模型；前端常量继续维护推荐。
* Pros:
* 实现最快。
* Cons:
* 继续分散，版本升级时容易漏改。

**Approach D: 配置层仅保留 alias（不保留 providerModelId）**

* How it works:
* `stage -> alias`，以及 `alias -> label`；不在配置中保存 provider/modelId。
* 推荐命中完全依赖数据库模型的 `aliasKey`。
* Pros:
* 业务配置最简洁，完全供应商无感。
* Cons:
* 对 seed/数据质量要求更高；一旦 alias 缺失或重复，推荐会失效且缺少兜底匹配。
* 无法在配置层表达兼容 modelId 迁移窗口（如旧 ID 到新 ID 的过渡）。

## Decision (ADR-lite)

**Context**: 需要兼顾模型版本升级效率与线上稳定回滚，且当前推荐配置分散在前端常量中。  
**Decision**: 采用“显式版本（多条）+ 语义别名映射”的双层方案。  
**Consequences**:
* 正向：调用路径保持精确可控（provider+modelId），升级时只改别名映射即可，回滚路径清晰。
* 代价：需要新增一层推荐映射读取与维护机制（配置或数据库）。
* 执行选择：语义别名映射先落在配置文件（单一来源），后续如需运营可配再升级到数据库。

## Technical Approach

* `prisma/seed.ts`：继续维护可调用模型实例（显式版本并存，如 `glm-4.6` / `glm-5`）。
* 新增共享推荐配置文件（如 `config/model-recommendations.v1.json`）：
* 维护 `alias -> { provider, modelId, label }` 映射。
* 维护 `stage -> alias` 映射。
* 前端 `ModelStrategyForm`：
* 移除组件内硬编码 `RECOMMENDED_MODELS`，改为读取共享推荐配置（经安全的本地 adapter）。
* 继续使用 `provider+modelId` 精确匹配可用模型。
* 回滚策略：
* 仅修改 alias 映射指向旧版显式 modelId（不改代码逻辑，不做模糊匹配）。

## Technical Notes

* `prisma/seed.ts`
* `src/app/admin/_components/model-strategy-form.tsx`
* `src/server/providers/ai/openaiCompatibleClient.ts`
* `src/server/providers/ai/glmClient.ts`
* `config/model-candidates.v1.json`
