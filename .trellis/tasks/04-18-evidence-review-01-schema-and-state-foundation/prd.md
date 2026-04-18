# feat: Evidence-first schema 与审核状态基础

## Goal

建立新架构最底层的数据库契约和统一审核状态机，让 evidence、claim、review、projection 能共享一套明确语义，而不是继续沿用旧 `Profile / BiographyRecord / Relationship` 混合语义。

## Spec

- `docs/superpowers/specs/2026-04-18-evidence-review-architecture-rewrite-design.md` §4, §5, §6, §10, §11, §12

## Files

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_evidence_review_schema_foundation/migration.sql`
- Create: `src/server/modules/review/evidence-review/review-state.ts`
- Create: `src/server/modules/review/evidence-review/review-state.test.ts`
- Create: `src/server/modules/analysis/claims/base-types.ts`

## Requirements

### 1. Core schema

- 新增 Evidence-first 主表：
  - `analysis_runs`
  - `analysis_stage_runs`
  - `llm_raw_outputs`
  - `chapter_segments`
  - `evidence_spans`
  - `entity_mentions`
  - `persona_candidates`
  - `alias_claims`
  - `event_claims`
  - `relation_claims`
  - `time_claims`
  - `identity_resolution_claims`
  - `conflict_flags`
  - `personas`
  - `persona_aliases`
  - `persona_chapter_facts`
  - `persona_time_facts`
  - `relationship_edges`
  - `timeline_events`
  - `review_audit_logs`

### 2. Unified state machine

- 审核状态统一为：`PENDING / ACCEPTED / REJECTED / EDITED / DEFERRED / CONFLICTED`
- 来源统一为：`AI / RULE / MANUAL / IMPORTED`
- 关系方向、关系来源、冲突类型等采用 enum；`relationTypeKey` 不使用数据库 enum
- 所有 claim 表都要支持审计关联、原 claim 保留、人工 override 或 supersede 关系

### 3. Boundary rules

- 本任务不删除旧表，但必须明确旧表不再是新审核真相
- projection 表必须允许删除重建
- schema 必须为后续 KB v2、relation types catalog、partial rebuild 预留关联字段

## Acceptance Criteria

- [ ] Prisma schema 能生成完整类型并通过迁移
- [ ] 所有 claim 表共享统一审核状态字段与来源字段
- [ ] `relationTypeKey` 为字符串列，不是 enum
- [ ] 旧真相表未被新 schema 继续扩展成主路径

## Definition of Done

- [ ] `pnpm prisma:generate` 通过
- [ ] migration 可在本地干净数据库重放
- [ ] review state 辅助函数和测试落地
- [ ] 后续 T02-T12 依赖的表和字段已齐备
