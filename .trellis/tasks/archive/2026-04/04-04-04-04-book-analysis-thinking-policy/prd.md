# brainstorm: 书籍解析深度思考策略

## Goal

为“书籍解析”流程确定一套稳定、可控、可演进的深度思考（`enableThinking` / `reasoningEffort`）策略：在保证解析质量的前提下，控制时延与成本，并明确前端是否开放配置及开放层级。

## What I already know

* 当前前端策略表单已经支持按阶段配置 `enableThinking` 与 `reasoningEffort`。
* 参数已进入共享类型与 DTO 校验，后端可接收并持久化策略。
* 执行链路会把阶段参数传递到模型调用层。
* OpenAI 兼容客户端会发送 `enable_thinking` 与 `reasoning_effort`。
* DeepSeek 当前仅映射 `thinking.type`（enabled/disabled），`reasoningEffort` 暂未映射。
* 任务级（JOB）策略已支持，可在发起解析时临时覆盖。

## Assumptions (temporary)

* “深度思考”不是所有阶段都需要；更适合高不确定性、需要推理裁决的阶段。
* 默认策略应优先稳定和成本可控，而不是追求全链路最高推理强度。
* 前端开放该能力时，应该放在高级设置并提供提示，避免普通用户误用。

## Open Questions

* 无（已收敛）。

## Requirements (evolving)

* 书籍解析流程需有明确的深度思考默认策略。
* 默认策略采用分阶段开启：高推理阶段默认开启，结构化抽取阶段默认关闭。
* 需支持按阶段覆盖，不强制“一刀切”。
* 前端可见性采用“仅高级参数可见”，普通用户默认不展示。
* `reasoningEffort` 默认跟随模型默认值（系统不主动下发）。
* Provider 行为差异需可解释，避免“同参数不同效果”造成误解。

## Acceptance Criteria (evolving)

* [x] 给出并确认一套默认深度思考策略（含阶段范围）。
* [x] 明确前端是否开放、开放到什么层级（全员/高级模式/仅管理员）。
* [x] 明确 Provider 差异处理策略（至少在文案或配置说明中体现）。
* [x] 形成可落地的实现方向（默认值、UI 入口、后端参数策略）。

## Definition of Done (team quality bar)

* 测试 added/updated（单测或集成测试，覆盖关键分支）
* lint / typecheck / CI 通过
* 行为变更有文档或配置说明
* 风险与回滚方案可描述

## Out of Scope (explicit)

* 本轮不扩展新的模型供应商协议适配。
* 本轮不引入复杂的自动调参算法（如基于章节长度动态调节 thinking）。
* 本轮不重构整套模型策略存储结构。

## Technical Approach

采用“按阶段策略 + 分层覆盖（JOB > BOOK > GLOBAL > SYSTEM_DEFAULT）”作为主路径：

* 在默认配置上定义哪些阶段启用深度思考。
* 保留 BOOK/JOB 层覆盖能力用于特例。
* 前端以“高级参数”方式呈现，默认不打扰常规操作。

## Research Notes

### What similar tools do

* 常见做法是把“深度思考/高推理模式”作为可选增强，而非常开默认。
* 对时延敏感的结构化抽取阶段倾向关闭；对冲突裁决、全局一致性检查阶段倾向开启。

### Constraints from our repo/project

* 当前链路已具备参数透传，不是“能否实现”问题，而是“默认策略与产品边界”问题。
* Provider 对 thinking 参数支持不完全一致（DeepSeek 与 OpenAI 兼容链路存在差异）。

### Feasible approaches here

**Approach A: 默认分阶段开启（推荐）**

* How it works: 仅在 `TITLE_RESOLUTION`、`GRAY_ZONE_ARBITRATION`、`BOOK_VALIDATION` 等高推理阶段默认开启；`ROSTER_DISCOVERY`、`CHUNK_EXTRACTION` 默认关闭。
* Pros: 质量/成本/时延平衡最好，且符合阶段职责。
* Cons: 策略稍复杂，需要清晰文档。

**Approach B: 全阶段默认开启**

* How it works: 所有阶段启用 `enableThinking=true`，并可统一 `reasoningEffort`。
* Pros: 规则最简单，质量上限潜在更高。
* Cons: 时延和费用显著增加，且部分阶段收益有限。

**Approach C: 全阶段默认关闭，仅任务临时开启**

* How it works: 系统默认全部关闭，仅在导入/重跑时由高级用户手动打开。
* Pros: 成本最可控，行为最稳。
* Cons: 默认质量可能不理想，依赖人工经验。

## Decision (ADR-lite)

**Context**: 书籍解析包含“结构化抽取”和“语义裁决”两类阶段，推理强度诉求不同。

**Decision**: 采用 Approach A（分阶段默认开启）。

**Consequences**:
* 质量：关键推理阶段精度和一致性更高。
* 成本与时延：相比全开显著更可控；相比全关略有增加。
* 复杂度：需要维护阶段级默认值和说明文案，但在现有策略体系内可落地。

## Frontend Visibility Decision

* 采用“仅高级参数可见（普通用户默认不展示）”。
* 高级用户可以在策略表单中显式开启/关闭 `enableThinking` 并设置 `reasoningEffort`。

## Reasoning Effort Decision

* 默认不主动下发 `reasoningEffort`，跟随各模型平台默认行为。
* 仅当高级用户显式配置时，才透传 `reasoningEffort`。
* 这样可降低跨 Provider 行为不一致带来的误解风险（例如部分 Provider 对该参数忽略或语义不同）。

## Default Stage Policy (draft)

* `ROSTER_DISCOVERY`: `enableThinking=false`
* `CHUNK_EXTRACTION`: `enableThinking=false`
* `CHAPTER_VALIDATION`: `enableThinking=false`（先保守，必要时再灰度开启）
* `TITLE_RESOLUTION`: `enableThinking=true`
* `GRAY_ZONE_ARBITRATION`: `enableThinking=true`
* `BOOK_VALIDATION`: `enableThinking=true`

## Technical Notes

* Frontend strategy form: `src/app/admin/_components/model-strategy-form.tsx`
* Shared stage params: `src/types/pipeline.ts`
* DTO schema: `src/server/modules/analysis/dto/modelStrategy.ts`
* Resolver merge/priority: `src/server/modules/analysis/services/ModelStrategyResolver.ts`
* Stage execution pass-through: `src/server/modules/analysis/services/ChapterAnalysisService.ts`
* OpenAI-compatible mapping: `src/server/providers/ai/openaiCompatibleClient.ts`
* DeepSeek mapping: `src/server/providers/ai/deepseekClient.ts`
* Parse entry strategy pass-through:
  * `src/lib/services/books.ts`
  * `src/app/api/books/[id]/analyze/route.ts`
  * `src/server/modules/books/startBookAnalysis.ts`
