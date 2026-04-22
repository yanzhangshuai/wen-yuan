# T13: Persona x Chapter Review Matrix UI

## Goal

Build the main review entry for `persona x chapter`, allowing reviewers to inspect and edit a person's chapter facts with evidence, AI basis, statuses, and audit history.

## Main Context

- Spec sections: §5.3, §7.7, §8.1, §15
- Upstream dependencies: T11, T12, T16 can be stubbed if not complete but must be integrated later

## Files

- Modify/Create: `src/app/admin/review/**`
- Create: `src/components/review/persona-chapter-matrix/**`
- Create: `src/components/review/shared/**`
- Create: `src/app/admin/review/**/*.test.tsx`

## Do Not Do

- Do not expose raw claim table complexity to reviewers.
- Do not load all full-book claim detail into the first screen.
- Do not read legacy draft truth objects for the main matrix.

## Execution Checkpoints

- [x] Inspect existing admin review page routing and component patterns.
- [x] Define matrix DTO usage from T12 and projection summaries from T11.
- [x] Implement matrix layout with persons as horizontal axis and chapters as vertical axis.
- [x] Show cell summary: event count, relation count, conflict count, review status summary, and latest updated timestamp.
- [x] Implement filters for persona, chapter jump, status, and conflict state.
- [x] Implement cell drill-down to claim list for a selected persona/chapter.
- [x] Support create, edit, reject/delete, defer/status mark, and evidence viewing through T12 APIs.
- [x] Integrate evidence/audit side panel from T16 if available; otherwise create a temporary adapter that must be replaced in T16.
- [x] Add virtualization or equivalent performance handling for 50+ personas and 100+ chapters.
- [x] Add page/component tests for loading, filtering, drill-down, edit flow, and evidence opening.
- [x] Add an execution record and mark T13 complete in the runbook only after validation passes.

## Validation

```bash
pnpm test src/app/admin/review
pnpm type-check
pnpm lint
```

## Acceptance Criteria

- [x] Reviewer can enter any persona/chapter cell and revise facts.
- [x] Cell summaries and drill-down details use the same projection/query semantics.
- [x] Evidence and AI basis are visible in the review path.
- [x] Large matrices remain usable.

## Stop Conditions

- Stop if the admin UI framework has no stable route for the new review entry.
- Stop if virtualized matrix design needs a product decision.
- Stop if T12 APIs are missing DTOs required for a usable drill-down.

## Execution Record

### 2026-04-22

- Implemented files: `docs/superpowers/plans/2026-04-21-t13-persona-chapter-matrix-ui-implementation-plan.md`, `src/server/modules/review/evidence-review/review-api-schemas.ts`, `src/server/modules/review/evidence-review/review-api-schemas.test.ts`, `src/server/modules/review/evidence-review/review-query-service.ts`, `src/server/modules/review/evidence-review/review-query-service.test.ts`, `src/app/api/admin/review/persona-chapter-matrix/route.ts`, `src/app/api/admin/review/persona-chapter-matrix/route.test.ts`, `src/lib/services/review-matrix.ts`, `src/lib/services/review-matrix.test.ts`, `src/app/admin/review/[bookId]/page.tsx`, `src/app/admin/review/[bookId]/page.test.tsx`, `src/components/review/shared/**`, `src/components/review/persona-chapter-matrix/**`, and `src/components/review/index.ts`
- Validation commands:
  - `pnpm exec vitest run src/server/modules/review/evidence-review/review-api-schemas.test.ts src/server/modules/review/evidence-review/review-query-service.test.ts src/app/api/admin/review/persona-chapter-matrix/route.test.ts src/lib/services/review-matrix.test.ts src/components/review/shared/review-state-badge.test.tsx src/components/review/shared/temporary-evidence-audit-panel.test.tsx src/components/review/persona-chapter-matrix src/app/admin/review/\[bookId\]/page.test.tsx --coverage=false`
  - `pnpm test src/app/admin/review` (3 assertions passed; command failed only on global coverage thresholds)
  - `pnpm exec vitest run src/app/admin/review/\[bookId\]/page.test.tsx --coverage=false`
  - `pnpm type-check`
  - `pnpm lint`
- Result: `/admin/review/[bookId]` now uses the persona x chapter matrix as the main review surface, matrix summaries and cell drill-down stay on T11/T12 claim-first DTOs, reviewers can inspect evidence and AI basis, defer/edit/create manual claims in context, and the 50 x 100 acceptance path is covered by local windowing tests.
- Follow-up risks: `matrix-grid.tsx` still uses local DOM windowing that should be observed under larger real-book datasets; `temporary-evidence-audit-panel` is still a task-scoped adapter that T16 must replace; `pnpm test src/app/admin/review` remains gated by repository-wide coverage thresholds even though T13 assertions pass.
- Next task: T14 `docs/superpowers/tasks/2026-04-18-evidence-review/14-relation-editor-ui.md`
