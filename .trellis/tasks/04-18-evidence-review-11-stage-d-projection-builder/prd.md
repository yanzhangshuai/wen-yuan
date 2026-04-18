# feat: Stage D Projection Builder

## Goal

基于 claim 与 review state 构建可删除重建的读模型，为人物 x 章节、人物 x 时间、关系编辑器和详情视图提供稳定、快速、可审核的 projection。

## Spec

- `docs/superpowers/specs/2026-04-18-evidence-review-architecture-rewrite-design.md` §5.3, §7.7, §8, §11, §15

## Files

- Create: `src/server/modules/review/evidence-review/projections/projection-builder.ts`
- Create: `src/server/modules/review/evidence-review/projections/persona-chapter.ts`
- Create: `src/server/modules/review/evidence-review/projections/persona-time.ts`
- Create: `src/server/modules/review/evidence-review/projections/relationships.ts`
- Create: `src/server/modules/review/evidence-review/projections/*.test.ts`

## Requirements

### 1. Projection families

- 构建：
  - `persona_chapter_facts`
  - `persona_time_facts`
  - `relationship_edges`
  - `timeline_events`

### 2. Build rules

- 只读 claim + review state + confirmed persona
- 不直接读取旧 `Profile / BiographyRecord / Relationship`
- 支持整书重建、章节重建、projection-only 重建

### 3. Review-facing summaries

- persona x chapter cell 至少聚合：
  - event count
  - relation count
  - conflict count
  - review status summary
  - latest updated at
- 时间和关系 projection 要保留 claim 回跳能力

## Acceptance Criteria

- [ ] projection 可从 claim + review state 完整重建
- [ ] projection 不依赖旧草稿真相表
- [ ] 局部 mutation 后可只重建受影响 projection
- [ ] 审核 UI 所需聚合字段齐备

## Definition of Done

- [ ] persona chapter/time/relationship/timeline projection builder 与测试落地
- [ ] 与 T12-T16 读模型需求打通
- [ ] 删除 projection 后可成功重建
