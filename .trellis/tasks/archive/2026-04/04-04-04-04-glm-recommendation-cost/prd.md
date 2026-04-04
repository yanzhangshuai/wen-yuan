# brainstorm: 调整推荐模型移除GLM默认

## Goal

在不影响现有 GLM 可用性的前提下，降低默认推荐策略中的 GLM 暴露与使用概率，避免因 GLM 包月成本导致整体投入不值得。

## What I already know

* 用户反馈：GLM 是包月，当前投入不值得。
* 用户反馈：推荐模型里出现了两个 GLM，策略感知上偏重 GLM。
* 当前阶段推荐配置在 `config/model-recommendations.v1.json`：
  * `ROSTER_DISCOVERY` 使用 `glm-latest-stable`。
  * `CHUNK_EXTRACTION` 实际使用 `deepseek-v3-stable`（不是 GLM）。
  * `glm-latest-stable` 目前映射到 `glm-4.6`。
* 评测证据现状：`docs/eval/*` 最近一次是 dry-run，`jsonSuccessRate/cost/throughput` 为 `null`，不能用于判定“GLM 一定优于其他模型”。
* 运行策略与“推荐展示”是两套来源：
  * 推荐展示来自 `config/model-recommendations.v1.json`。
  * 当前数据库 `GLOBAL` 策略实际指向同一个 DeepSeek 模型（`deepseek-v3.2`）。
* 当前数据库 `ai_models` 中 GLM 有两条：`glm-4.6`、`glm-5`。
* 当前候选池 `config/model-candidates.v1.json` 仍包含 GLM 候选（phase1-glm46）。
* 已存在评测框架与报告（`docs/eval/*`），最近一次门禁 `FAIL`，当前结果仅可用于流程校验，不可用于模型优劣结论。

## Assumptions (temporary)

* 目标是“取消 GLM 默认推荐”，而不是“删除 GLM 支持”。
* GLM 仍需保留在模型列表里，供高级用户或手工策略选择。
* 本次优先改推荐策略，不改 Provider 代码与 API 调用实现。

## Open Questions

* 推荐策略是否调整为“成本优先默认（非 GLM）+ GLM 仅高级可选”？

## Requirements (evolving)

* 推荐策略默认不再优先使用 GLM。
* 现有策略页面可继续手工选择 GLM。
* 变更后推荐配置要可回滚（保留 alias 映射思想）。

## Acceptance Criteria (evolving)

* [ ] 阶段推荐中不再出现 GLM 作为默认推荐项。
* [ ] UI 中仍可手动选 GLM（不破坏高级策略能力）。
* [ ] 相关测试（推荐映射）同步更新并通过。

## Definition of Done (team quality bar)

* Tests added/updated (unit/integration where appropriate)
* Lint / typecheck / CI green
* Docs/notes updated if behavior changes
* Rollout/rollback considered if risky

## Out of Scope (explicit)

* 不移除 GLM provider 代码。
* 不删除数据库中已有 GLM 配置。
* 不在本任务内改造计费系统或引入自动成本优化器。

## Technical Notes

* 主要影响文件：
  * `config/model-recommendations.v1.json`
  * `src/lib/model-recommendations.test.ts`
  * （可选）`config/model-candidates.v1.json`
* 现状根因：推荐逻辑是配置驱动，`STAGE_RECOMMENDED_MODELS` 从 JSON 读取并在 `model-strategy-form.tsx` 展示。
* 只要调整 alias -> modelId 的映射即可切换默认推荐，不需要动业务主流程代码。

## Research Notes

### What similar tools do

* 常见做法是“默认策略由离线评测结果驱动”，而不是静态经验推荐。
* 对成本敏感场景，默认会把高价/包月模型降为可选项，仅在特定阶段或人工强制时启用。

### Constraints from our repo/project

* 当前推荐配置是静态 JSON，可快速切换但容易滞后。
* 现有评测体系具备，但尚未完成真实线上数据 A/B，因此当前“GLM 更好”的结论证据不足。

### Feasible approaches here

**Approach A: 经验推荐降级 GLM（Recommended）**

* How it works: 直接把 `ROSTER_DISCOVERY` 默认从 GLM 切到 Qwen/DeepSeek，GLM 保留手工可选。
* Pros: 立即降低成本风险，改动最小。
* Cons: 仍是经验驱动，非数据驱动最优。

**Approach B: 维持现状，先补真实 A/B 再改默认**

* How it works: 先完成真实实验，再按指标定默认。
* Pros: 决策最客观。
* Cons: 在实验完成前继续承担 GLM 默认成本风险。

**Approach C: 双层策略**

* How it works: 默认使用低成本模型，同时给“高质量模板”提供一键切到 GLM。
* Pros: 兼顾成本与上限。
* Cons: 配置与说明复杂度略升高。
