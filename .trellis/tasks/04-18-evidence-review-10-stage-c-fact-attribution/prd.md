# feat: Stage C 事实归属

## Goal

把 Stage A 的事件、关系、时间 claim 归属到 Stage B 产出的 persona candidate，并在不确定时保留多候选和证据，而不是强行一锤定音。

## Spec

- `docs/superpowers/specs/2026-04-18-evidence-review-architecture-rewrite-design.md` §7.6, §8.1, §8.2, §8.3

## Files

- Create: `src/server/modules/analysis/pipelines/evidence-review/stageC/FactAttributor.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageC/attribution-ranking.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageC/*.test.ts`

## Requirements

### 1. Attribution targets

- 为以下对象建立 persona candidate 归属：
  - `event_claims`
  - `relation_claims`
  - `time_claims`
- 关系两端都要完成 candidate 归属
- 时间线索要能回连事件与章节

### 2. Confidence model

- 支持多候选归属
- 低置信归属必须保留候选列表和 evidence
- conflict flag 会影响排序，但不直接覆盖 claim

### 3. Review integration

- 审核者必须能看到“AI 当前归属候选”与证据
- 人工修订后生成 manual claim 或 override，不覆盖原 claim
- Stage D 只能消费审核后结果，不直接信任所有 Stage C 归属

## Acceptance Criteria

- [ ] event / relation / time claim 都有可审查的 candidate attribution
- [ ] 不确定场景保留候选集和置信度
- [ ] 审核 API 可以对 attribution 进行接受、替换或人工指定
- [ ] Stage D 可读取归属结果构建 projection

## Definition of Done

- [ ] 事实归属测试覆盖单候选、多候选、冲突候选场景
- [ ] 与 T08、T09、T11、T12 合同打通
- [ ] 不再把“无证据的唯一 personaId”当默认输出
