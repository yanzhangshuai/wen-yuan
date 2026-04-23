# T15: Persona x Time Review Matrix UI

## Goal

Build the `persona x time` review view for works such as `三国演义`, where time may be a historical stage, battle phase, relative phase, chapter order, uncertain label, or year.

## Main Context

- Spec sections: §5.2, §5.3, §7.7, §8.2, §13.2, §15
- Upstream dependencies: T11, T12, T13, T14, T16, T21 sample data
- T15 also absorbs two carry-over closure items from T16:
  - persona-time drill-down must adopt the shared `ReviewClaimDetailPanel` contract directly
  - add one real `RelationClaimSheet -> ReviewClaimDetailPanel` wiring integration test while keeping the lighter mock-based suite

## Files

- Create: `src/components/review/persona-time-matrix/**`
- Modify/Create: `src/app/admin/review/**`
- Create: `src/components/review/persona-time-matrix/*.test.tsx`

## Do Not Do

- Do not force imprecise time expressions into exact years.
- Do not duplicate all persona-chapter matrix interactions.
- Do not detach time facts from chapter evidence.

## Execution Checkpoints

- [x] Define supported time axis types: `CHAPTER_ORDER`, `RELATIVE_PHASE`, `NAMED_EVENT`, `HISTORICAL_YEAR`, `BATTLE_PHASE`, and `UNCERTAIN`.
- [x] Load persona-time projection summaries from T11/T12.
- [x] Implement hierarchical time-axis display with collapsed defaults.
- [x] Display events, relations, conflict flags, and time claims within selected time cells.
- [x] Support editing time normalization, event attribution, and time-slice association through T12.
- [x] Implement stable navigation between time cells and linked chapter facts.
- [x] Add filtering and jump controls suitable for long works such as `三国演义`.
- [x] Integrate the shared `ReviewClaimDetailPanel` from T16 directly inside time-cell drill-down.
- [x] Add one real relation-sheet-to-shared-panel wiring integration test while keeping the lighter mock-based relation sheet tests.
- [x] Add tests for time filtering, cell drill-down, chapter back-link, imprecise time preservation, and edit flow.
- [x] Add an execution record and mark T15 complete in the runbook only after validation passes.

## Validation

```bash
pnpm test src/components/review/persona-time-matrix
pnpm type-check
pnpm lint
```

## Acceptance Criteria

- [x] Reviewer can review events, relations, and time normalization by persona/time slice.
- [x] Time slices and chapter facts have stable two-way navigation.
- [x] Imprecise time expressions retain raw and normalized labels.
- [x] `三国演义` samples can validate relation dynamics and historical phases.

## Stop Conditions

- Stop if time-slice schema cannot represent the six required time axis types.
- Stop if `三国演义` sample data is unavailable for validation.
- Stop if time UI navigation needs a product decision.

## Execution Record

- 2026-04-23: T15 completed. Implemented the persona-time read route/browser service, `/admin/review/[bookId]/time` server page, grouped time-axis helpers and toolbar, matrix grid, shared detail-panel drill-down, T12-backed time normalization edit flow, URL-backed chapter/time deep links, and one real `RelationClaimSheet -> ReviewClaimDetailPanel` integration test without mocking `../evidence-panel`. Final validation passed with `pnpm exec vitest run src/server/modules/review/evidence-review/review-api-schemas.test.ts src/server/modules/review/evidence-review/review-query-service.test.ts src/app/api/admin/review/persona-time-matrix/route.test.ts src/lib/services/review-time-matrix.test.ts src/components/review/shared/review-mode-nav.test.tsx 'src/app/admin/review/[bookId]/time/page.test.tsx' src/components/review/persona-time-matrix/time-axis.test.ts src/components/review/persona-time-matrix/time-toolbar.test.tsx src/components/review/persona-time-matrix/persona-time-review-page.test.tsx src/components/review/persona-time-matrix/time-cell-claim-list.test.tsx src/components/review/persona-time-matrix/time-cell-drilldown-sheet.test.tsx src/components/review/persona-time-matrix/time-claim-action-panel.test.tsx src/components/review/relation-editor/relation-claim-sheet.integration.test.tsx 'src/app/admin/review/[bookId]/page.test.tsx' src/components/review/persona-chapter-matrix/persona-chapter-review-page.test.tsx src/components/review/persona-chapter-matrix/cell-drilldown-sheet.test.tsx --coverage=false` (`16` test files / `82` tests), `pnpm type-check`, `pnpm lint`, `git diff --name-only -- prisma src/server/db` (no output), and `rg -n "TemporaryEvidenceAuditPanel" src/components/review` (no output).
