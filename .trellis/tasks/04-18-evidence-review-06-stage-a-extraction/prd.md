# feat: Stage A 逐章证据抽取

## Goal

实现逐章抽取的 Stage A，把人物 mention、事件、关系、时间线索从单章文本中保守抽出并写成 claim，同时保留模型原始输入输出和 evidence span。

## Spec

- `docs/superpowers/specs/2026-04-18-evidence-review-architecture-rewrite-design.md` §5.2, §7.2, §10

## Files

- Create: `src/server/modules/analysis/pipelines/evidence-review/stageA/StageAExtractionPipeline.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageA/prompt-contracts.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageA/claim-normalizer.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageA/*.test.ts`

## Requirements

### 1. Stage output

- Stage A 必须产出：
  - `entity_mentions`
  - `event_claims`
  - `relation_claims`
  - `time_claims`
- 每一条输出都必须带 evidence span
- Stage A 不创建 `personas`

### 2. Extraction posture

- 允许保守输出，禁止为提高召回而强判同一人物或关系方向
- 无法定位回 offset 的结果视为无效输出
- 原始模型响应和 schema 校验错误必须进入 `llm_raw_outputs`

### 3. Operational behavior

- 支持按章节幂等重跑
- 使用 T03 claim contract 落库，而不是直接写表
- 受 T05 segment 结果约束，必要时根据 segment 类型做保守降级

## Acceptance Criteria

- [ ] 单章可同时产出 mention / event / relation / time claim
- [ ] 无 evidence span 的输出不会入库
- [ ] 章节重跑不会产生重复 claim
- [ ] 模型 raw output 与 discard reason 可追踪

## Definition of Done

- [ ] Stage A 单测覆盖正常抽取、非法输出、空输出、重跑幂等
- [ ] 与 T02、T03、T04、T05 合同打通
- [ ] 不直接创建正式 persona 或正式关系边
