# brainstorm: backend class vs function for aiClient

## Goal

明确后端代码在当前项目中应优先采用 `class` 还是 `function` 模式，重点给出 `src/server/modules/analysis/services/aiClient.ts` 的推荐形态，降低后续扩展成本并保持风格一致。

## What I already know

* 用户问题聚焦：后端代码该用 `class` 还是 `function`，并点名 `aiClient.ts`。
* 当前 `aiClient.ts` 使用 `class ChapterAnalysisAiClient` + `provideAnalysisAi` 工厂函数。
* `analysis` 业务层已有状态型服务（`ChapterAnalysisService`、`PersonaResolver`）均采用 class + 构造注入。
* `http/auth` 层以纯函数为主（`route-utils.ts`、`api-response.ts`、`rbac.ts` 的主要能力）。
* `providers/ai` 已抽象为通用 provider 接口（`generateJson(prompt)`），与业务层解耦。

## Assumptions (temporary)

* 该决策主要针对 analysis/service 层，不是要求全仓库统一只允许一种范式。
* 团队更看重可测试性、依赖注入、后续扩展（多 provider、多策略）而不是极致简洁。

## Open Questions

* `aiClient.ts` 是否要保持 class 作为主实现，function 仅保留轻量工厂入口？

## Requirements (evolving)

* 给出 class / function 在当前仓库中的适用边界，不做抽象化空谈。
* 结论能直接指导 `aiClient.ts` 与后续 analysis 子模块写法。
* 保持与现有 `ChapterAnalysisService`、`PersonaResolver` 风格一致，避免无谓重构。

## Acceptance Criteria (evolving)

* [ ] 明确给出推荐模式（class 或 function，或混合策略）。
* [ ] 明确给出使用边界（哪些场景用 class，哪些场景用 function）。
* [ ] 给出 `aiClient.ts` 的最终建议形态。

## Definition of Done (team quality bar)

* 本次仅做架构决策，不改运行逻辑。
* 决策说明包含：上下文、方案、取舍、后果。
* 若进入代码改造，后续需满足 lint / typecheck / tests。

## Out of Scope (explicit)

* 不在本轮直接改造所有现有后端模块。
* 不引入外部 DI 框架或全新架构层。

## Technical Notes

* 关键代码：
  * `src/server/modules/analysis/services/aiClient.ts`
  * `src/server/modules/analysis/services/ChapterAnalysisService.ts`
  * `src/server/modules/analysis/services/PersonaResolver.ts`
  * `src/server/modules/auth/rbac.ts`
  * `src/server/http/route-utils.ts`
  * `src/server/providers/ai/index.ts`
* 现状统计（`src/server/**/*.ts`）：`export class` 6 处，`export function` 14 处。
* 结构化观察：
  * “有依赖注入 / 生命周期 / 组合状态”的服务更偏 class。
  * “无状态工具与边界转换”更偏 function。

## Research Notes

### What similar tools do

* 纯 Node/Next.js 代码库通常在“工具层”使用函数式导出，减少样板代码。
* 需要依赖注入、可替换实现、便于 mock 的服务层常使用 class 或工厂返回对象。
* 许多团队采用混合策略：`class` 负责 orchestration，`function` 负责纯计算与格式转换。

### Constraints from our repo/project

* 已有 `ChapterAnalysisService` / `PersonaResolver` 均为 class，且存在构造注入。
* `aiClient.ts` 需要注入 `AiProviderClient`，并可能扩展缓存、重试、fallback 策略。
* 当前 `provideAnalysisAi()` 已作为创建入口，具备工厂能力。

### Feasible approaches here

**Approach A: Keep class as primary in analysis service layer (Recommended)**

* How it works: `aiClient.ts` 保持 class；对外暴露工厂函数用于简化调用。
* Pros: 与现有 service 风格一致；更易扩展状态/策略；测试可直接构造注入 mock。
* Cons: 相比纯函数多一点样板代码。

**Approach B: Convert aiClient.ts to pure function factory/object-literal**

* How it works: `provideAnalysisAi()` 返回 `{ analyzeChapterChunk }` 闭包对象，不使用 class。
* Pros: 代码更短；学习成本低。
* Cons: 当职责增长时易膨胀为“大闭包”；与现有 analysis service 风格不一致。

**Approach C: Hybrid (class for orchestration + pure helper functions)**

* How it works: 保留 class 外壳，内部 prompt 构建/解析等逻辑尽量函数化。
* Pros: 扩展性与可读性平衡最好；便于单测拆分。
* Cons: 需要团队明确边界，防止重复封装。

## Decision (ADR-lite)

**Context**: `aiClient.ts` 位于 analysis service 层，承担 provider 注入、prompt 编排、结果解析，后续可能扩展容错策略。

**Decision**: 倾向采用 Approach A/C：analysis service 保持 class 主体，配套纯函数 helper；`provideAnalysisAi()` 继续作为统一入口。

**Consequences**:

* 正向：与现有代码风格一致，扩展和测试路径清晰。
* 代价：保留少量 class 样板。
* 风险控制：若长期仅单方法且无状态，可再降级为函数工厂。
