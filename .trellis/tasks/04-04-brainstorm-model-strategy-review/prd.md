# brainstorm: 评审多模型策略文档

## Goal

评审 `docs/多模型策略.md` 中列举的模型、能力判断与推荐方案是否与当前项目实际约束匹配，并给出一份与现有方案对照的改进建议，帮助确定下一步可执行的模型策略。

## What I already know

* 用户提供了目标文档：`docs/多模型策略.md`。
* 文档当前主推荐是混合策略：通义千问 Max（Phase 1/5/全书验证）+ DeepSeek V3（Phase 2）+ 通义千问 Plus（验证/fallback）。
* 文档识别到项目当前是“单模型覆盖全阶段”，并提出按阶段分配模型、增加 fallback、放大分片等建议。
* 项目已支持 Provider：gemini / deepseek / qwen / doubao（来自文档中的代码审计结论）。

## Assumptions (temporary)

* 本次目标是“方案评审”，不是立刻改代码。
* 用户希望得到“是否合理 + 我方差异建议”的结论，以及可落地优先级。
* 文档中关于价格与模型能力的部分可能随时间变化，需要和最新公开信息交叉校验。

## Open Questions

* 用户后续更关心哪类目标：质量优先、成本优先，还是稳定性优先。

## Requirements (evolving)

* 逐项评审文档中候选模型是否适合本项目场景（古典中文文本结构化抽取）。
* 评审文档给出的 Top 推荐与阶段分配是否合理。
* 给出与文档不同的建议（若有），并明确差异原因。
* 输出应包含“可立即执行”和“需实测验证”的分层结论。

## Acceptance Criteria (evolving)

* [ ] 明确指出文档中“合理”的部分与“风险/过时/待验证”的部分。
* [ ] 给出我方推荐策略，并与文档方案形成清晰对照。
* [ ] 给出至少 3 条可执行的下一步验证动作（A/B 测试或指标采集）。

## Definition of Done (team quality bar)

* 分析基于当前仓库上下文与文档内容
* 关键判断有明确依据（项目约束或模型能力特征）
* 结论区分“高置信”和“需实测”
* 输出可直接用于后续技术决策

## Out of Scope (explicit)

* 不在本次直接实现数据库 schema 改造与 Provider 代码改造。
* 不在本次进行线上压测或全量回归。

## Technical Notes

* 目标文档：`docs/多模型策略.md`
* 任务目录：`.trellis/tasks/04-04-brainstorm-model-strategy-review/`
* 后续需要核对模型最新能力与定价公开信息，避免使用过时数据。
