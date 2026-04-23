# T16: Audit History And Evidence Panel

## Goal

Build a reusable side panel for original evidence, normalized text, AI basis, raw output summary, audit history, conflicts, and before/after diffs.

## Main Context

- Spec sections: §5.1, §5.3, §6, §8, §10, §15
- Upstream dependencies: T02, T04, T12

## Files

- Create: `src/components/review/evidence-panel/**`
- Create: `src/components/review/audit-history/**`
- Modify/Create: `src/app/admin/review/**`
- Create: `src/components/review/evidence-panel/*.test.tsx`

## Do Not Do

- Do not create separate evidence display logic per page.
- Do not expose full raw model output when a concise basis summary is sufficient.
- Do not turn the panel into a heavy graph administration backend.

## Execution Checkpoints

- [x] Define shared panel props and DTOs aligned with T12 detail APIs.
- [x] Display evidence quoted text, normalized text, chapter, segment, offsets, speaker hint, and narrative region type.
- [x] Support original text highlighting and multi-span evidence display.
- [x] Display claim source stage, source type, confidence, model output summary, schema validation errors, and discard reasons.
- [x] Display audit timeline for accept, reject, edit, manual-create, merge, split, and relink.
- [x] Display version diff for edited/manual claims.
- [x] Add integration hooks for persona-chapter matrix, relation editor, and persona-time matrix.
- [x] Add tests for evidence display, multi-span display, audit timeline, conflict display, and version diff.
- [x] Add an execution record and mark T16 complete in the runbook only after validation passes.

## Validation

```bash
pnpm test src/components/review/evidence-panel
pnpm type-check
pnpm lint
```

## Acceptance Criteria

- [x] Any claim detail can show evidence, AI basis, and audit history.
- [x] Matrix, relation editor, and time matrix reuse the same panel contract.
- [x] Audit records match mutation results.
- [x] Evidence metadata supports source jump and highlighting.

## Stop Conditions

- Stop if T12 detail APIs do not expose required basis or audit fields.
- Stop if raw output retention from T04 is incomplete.
- Stop if evidence display requires copyright-sensitive long quotes in UI fixtures.

## Execution Record

- Added a reusable reviewer-first claim detail surface under `src/components/review/evidence-panel/**` with typed evidence spans, AI basis summary, audit timeline, and version diff rendering.
- Hardened the T12 detail contract in `review-query-service` and browser service DTOs so `evidence`, `auditHistory`, `aiSummary`, and `versionDiff` are explicit typed payloads instead of `unknown[]`.
- Replaced the temporary T13/T14 evidence adapter in the persona-chapter matrix and relation editor with the shared panel, then removed `TemporaryEvidenceAuditPanel` from source.
- Validation:
  - `pnpm vitest run src/server/modules/review/evidence-review/review-query-service.test.ts src/lib/services/review-matrix.test.ts src/lib/services/relation-editor.test.ts 'src/app/api/admin/review/claims/[claimKind]/[claimId]/route.test.ts' src/components/review/evidence-panel/review-evidence-list.test.tsx src/components/review/evidence-panel/review-ai-basis-card.test.tsx src/components/review/evidence-panel/review-audit-timeline.test.tsx src/components/review/evidence-panel/review-claim-diff-card.test.tsx src/components/review/evidence-panel/review-claim-detail-panel.test.tsx src/components/review/persona-chapter-matrix/cell-drilldown-sheet.test.tsx src/components/review/persona-chapter-matrix/claim-action-panel.test.tsx src/components/review/relation-editor/relation-claim-sheet.test.tsx src/components/review/relation-editor/relation-editor-page.test.tsx --coverage=false --reporter=verbose`
  - `pnpm type-check`
  - `pnpm lint`
  - `rg -n "TemporaryEvidenceAuditPanel" src/components/review`
  - `git diff --name-only -- prisma src/server/db`
