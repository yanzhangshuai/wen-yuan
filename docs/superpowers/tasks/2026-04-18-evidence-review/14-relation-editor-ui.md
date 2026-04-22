# T14: Simple Relation Editor UI

## Goal

Build a lightweight relation editor that supports direction, multiple concurrent relations, dynamic effective intervals, evidence binding, presets, and free-form custom relation input.

## Main Context

- Spec sections: §5.2, §5.3, §8.3, §9.4, §9.6, §15
- Upstream dependencies: T11, T12, T18, T16 can be integrated after its completion

## Files

- Create: `src/components/review/relation-editor/**`
- Modify/Create: `src/app/admin/review/**`
- Create: `src/components/review/relation-editor/*.test.tsx`

## Do Not Do

- Do not turn the UI into a generic graph database backend.
- Do not require catalog insertion before saving a custom relation claim.
- Do not hide original extracted relation text after normalization.

## Execution Checkpoints

- [x] Inspect existing relationship UI components and admin review layout.
- [x] Load relation projection and claim detail from T12 APIs.
- [x] Implement fields for `relationTypeKey`, `relationLabel`, `relationTypeSource`, `direction`, `effectiveChapterStart`, `effectiveChapterEnd`, and evidence binding.
- [x] Display original extracted relation text beside the current normalized relation.
- [x] Load preset options from T18 relation catalog when available.
- [x] Allow direct custom relation input and save it as a claim without forced catalog promotion.
- [x] Allow reviewers to preserve custom relation or map it to a preset relation.
- [x] Support multiple relations between the same pair of personas.
- [x] Show direction and interval conflict warnings without blocking normal review.
- [x] Integrate evidence/audit side panel from T16 if available.
- [x] Add tests for preset selection, custom input, direction switch, interval edit, multi-relation display, and save.
- [x] Add an execution record and mark T14 complete in the runbook only after validation passes.

## Validation

```bash
pnpm test src/components/review/relation-editor
pnpm type-check
pnpm lint
```

## Acceptance Criteria

- [x] Reviewer can edit relation direction, type, interval, and evidence.
- [x] Preset and custom relations are both supported.
- [x] Original text, normalized relation, and relation source are visible together.
- [x] Dynamic relation changes are readable and editable.

## Stop Conditions

- Stop if relation catalog DTOs from T18 are not available and no temporary preset source exists.
- Stop if UI complexity requires a design decision about graph visualization versus form editing.
- Stop if effective interval semantics conflict with T15 time-axis semantics.

## Execution Record

### 2026-04-22

- Implemented files: `docs/superpowers/plans/2026-04-22-t14-relation-editor-ui-implementation-plan.md`, `src/server/modules/review/evidence-review/review-api-schemas.ts`, `src/server/modules/review/evidence-review/review-api-schemas.test.ts`, `src/server/modules/review/evidence-review/review-query-service.ts`, `src/server/modules/review/evidence-review/review-query-service.test.ts`, `src/app/api/admin/review/relations/route.ts`, `src/app/api/admin/review/relations/route.test.ts`, `src/lib/services/relation-editor.ts`, `src/lib/services/relation-editor.test.ts`, `src/app/admin/review/[bookId]/page.tsx`, `src/app/admin/review/[bookId]/page.test.tsx`, `src/app/admin/review/[bookId]/relations/page.tsx`, `src/app/admin/review/[bookId]/relations/page.test.tsx`, `src/components/review/relation-editor/**`, `src/components/review/shared/review-mode-nav.tsx`, `src/components/review/shared/review-mode-nav.test.tsx`, `src/components/review/persona-chapter-matrix/manual-claim-form.tsx`, `src/components/review/persona-chapter-matrix/manual-claim-form.test.tsx`, `src/components/review/persona-chapter-matrix/claim-action-panel.tsx`, `src/components/review/persona-chapter-matrix/claim-action-panel.test.tsx`, and `src/components/review/index.ts`
- Validation commands:
  - `pnpm exec vitest run src/server/modules/review/evidence-review/review-api-schemas.test.ts src/server/modules/review/evidence-review/review-query-service.test.ts src/app/api/admin/review/relations/route.test.ts src/lib/services/relation-editor.test.ts src/components/review/relation-editor/relation-draft.test.ts src/components/review/relation-editor/relation-pair-list.test.tsx src/components/review/relation-editor/relation-claim-list.test.tsx src/components/review/relation-editor/relation-warning-banner.test.tsx src/components/review/relation-editor/relation-claim-sheet.test.tsx src/components/review/relation-editor/relation-editor-page.test.tsx src/components/review/shared/review-mode-nav.test.tsx src/app/admin/review/\[bookId\]/page.test.tsx src/app/admin/review/\[bookId\]/relations/page.test.tsx src/components/review/persona-chapter-matrix/manual-claim-form.test.tsx src/components/review/persona-chapter-matrix/claim-action-panel.test.tsx --coverage=false`
  - `pnpm exec eslint src/server/modules/review/evidence-review/review-api-schemas.ts src/server/modules/review/evidence-review/review-query-service.ts src/app/api/admin/review/relations/route.ts src/lib/services/relation-editor.ts src/components/review/relation-editor src/components/review/shared/review-mode-nav.tsx src/app/admin/review/\[bookId\]/page.tsx src/app/admin/review/\[bookId\]/relations/page.tsx src/components/review/persona-chapter-matrix/manual-claim-form.tsx src/components/review/persona-chapter-matrix/claim-action-panel.tsx`
  - `pnpm type-check`
  - `git diff -- prisma/schema.prisma prisma/migrations`
  - `rg -n "enum .*relation|relationTypeKey.*enum" src prisma docs/superpowers`
  - `rg -n "relationship_edges|Relationship\\b|drafts" src/components/review/relation-editor src/components/review/shared/review-mode-nav.tsx src/app/admin/review/\[bookId\]/page.tsx src/app/admin/review/\[bookId\]/relations/page.tsx src/app/api/admin/review/relations src/server/modules/review/evidence-review/review-query-service.ts src/server/modules/review/evidence-review/review-api-schemas.ts src/lib/services/relation-editor.ts`
- Result: `/admin/review/[bookId]/relations` 现在提供轻量 claim-first 关系审核页，支持按人物对查看关系 claim、方向/区间冲突提示、预设与自定义关系类型切换、原始抽取关系文本对照、以及通过现有 T12 detail/action/manual-create 接口进行懒加载编辑与新增。
- Follow-up risks: 关系详情仍复用 `TemporaryEvidenceAuditPanel`，完整共享证据/审计面板收敛仍属于 T16；人物 x 时间审核面和更细的时间语义仍属于 T15；git commit 在当前流程中保留给用户手动触发。
- Next task: T16 `docs/superpowers/tasks/2026-04-18-evidence-review/16-audit-history-evidence-panel.md`
