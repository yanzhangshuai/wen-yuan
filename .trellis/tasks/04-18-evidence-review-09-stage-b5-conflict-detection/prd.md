# feat: Stage B.5 一致性与冲突检测

## Goal

把系统不确定性显式化：对死后行动、同章跨地点、时间顺序、关系方向和 alias 互斥等问题输出 `conflict_flags`，交由人工审核，而不是让模型静默强判。

## Spec

- `docs/superpowers/specs/2026-04-18-evidence-review-architecture-rewrite-design.md` §5.2, §7.5, §9.4, §10

## Files

- Create: `src/server/modules/analysis/pipelines/evidence-review/stageB5/ConflictDetector.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageB5/conflict-rules.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageB5/*.test.ts`

## Requirements

### 1. Conflict families

- 至少检测：
  - `POST_MORTEM_ACTION`
  - `IMPOSSIBLE_LOCATION`
  - `TIME_ORDER_CONFLICT`
  - `RELATION_DIRECTION_CONFLICT`
  - `ALIAS_CONFLICT`
  - `LOW_EVIDENCE_CLAIM`

### 2. Output discipline

- 只写 `conflict_flags`
- 不能直接修改已有 claim 状态
- 冲突必须绑定到相关 claim、candidate、chapter 或 evidence

### 3. Review integration

- 冲突需要带理由、严重级别和推荐处理动作
- 人工审核可接受、驳回或延后冲突，但冲突原记录要保留
- Stage D 和审核 UI 需要可读取冲突摘要

## Acceptance Criteria

- [ ] 关键冲突类型均可落库并追溯
- [ ] 冲突检测不会直接污染正式 projection
- [ ] 审核页可以按 persona / chapter / relation 看到冲突摘要
- [ ] Stage C 可读取 conflict 作为归属辅助信息

## Definition of Done

- [ ] 冲突检测测试覆盖至少 5 类古典文学高风险问题
- [ ] 与 T08、T10、T11、T12 读写合同打通
- [ ] 冲突被显式建模，不再依赖日志或人工猜测
