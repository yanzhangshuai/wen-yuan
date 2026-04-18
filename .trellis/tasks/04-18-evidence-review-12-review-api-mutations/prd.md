# feat: 审核 API 与 Claim Mutation

## Goal

建立 claim-first 的审核 API，把接受、拒绝、修订、延后、人工创建、merge、split、relink evidence 等动作统一收口到新审核控制层，并保证所有 mutation 都保留审计轨迹且只重建受影响 projection。

## Spec

- `docs/superpowers/specs/2026-04-18-evidence-review-architecture-rewrite-design.md` §5.3, §6, §8, §10, §15

## Files

- Create: `src/server/modules/review/evidence-review/review-query-service.ts`
- Create: `src/server/modules/review/evidence-review/review-mutation-service.ts`
- Create: `src/server/modules/review/evidence-review/review-audit-service.ts`
- Modify/Create: `src/app/api/admin/review/**/*.ts`
- Create: `src/server/modules/review/evidence-review/*.test.ts`

## Requirements

### 1. Claim-centric API surface

- 至少支持：
  - 列表查询
  - 详情查询
  - `accept`
  - `reject`
  - `defer`
  - `edit`
  - `createManualClaim`
  - `mergePersona`
  - `splitPersona`
  - `relinkEvidence`
- API 返回的主对象必须是 claim、persona candidate、projection summary 和 audit log，而不是旧 `Profile / BiographyRecord / Relationship` 草稿对象

### 2. Mutation discipline

- 所有 mutation 必须写 `review_audit_logs`
- 人工修订必须新增 `MANUAL` claim，并通过 `derivedFrom`、`supersedes` 或等价字段关联原 claim
- `merge/split/relink` 不得静默覆盖历史记录
- mutation 完成后只允许触发受影响 persona、chapter、time slice、relation edge 的局部 projection 重建

### 3. Review-ready query model

- 支持按 `personaId`、`chapterId`、`timeSliceId`、`claimType`、`reviewState`、`conflictState` 查询
- 详情接口必须同时返回：
  - 原文 evidence
  - AI basis
  - claim 来源
  - 当前审核状态
  - 历史修改记录
- API 必须为人物矩阵、关系编辑器、时间矩阵提供稳定 DTO，不让前端自行拼旧表

## Acceptance Criteria

- [ ] 审核端可对任一 claim 完成 accept/reject/edit/defer/manual-create
- [ ] merge/split/relink 有显式审计记录并保留前态
- [ ] mutation 后仅重建受影响 projection，而不是全书重算
- [ ] 列表与详情接口可直接支撑 T13/T14/T15/T16

## Definition of Done

- [ ] API 合同测试覆盖主要审核动作与失败分支
- [ ] 不再通过旧 draft review route 直接改正式图谱
- [ ] 审核动作与 projection 重建边界清晰可追踪
