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

- [ ] Define shared panel props and DTOs aligned with T12 detail APIs.
- [ ] Display evidence quoted text, normalized text, chapter, segment, offsets, speaker hint, and narrative region type.
- [ ] Support original text highlighting and multi-span evidence display.
- [ ] Display claim source stage, source type, confidence, model output summary, schema validation errors, and discard reasons.
- [ ] Display audit timeline for accept, reject, edit, manual-create, merge, split, and relink.
- [ ] Display version diff for edited/manual claims.
- [ ] Add integration hooks for persona-chapter matrix, relation editor, and persona-time matrix.
- [ ] Add tests for evidence display, multi-span display, audit timeline, conflict display, and version diff.
- [ ] Add an execution record and mark T16 complete in the runbook only after validation passes.

## Validation

```bash
pnpm test src/components/review/evidence-panel
pnpm type-check
pnpm lint
```

## Acceptance Criteria

- [ ] Any claim detail can show evidence, AI basis, and audit history.
- [ ] Matrix, relation editor, and time matrix reuse the same panel contract.
- [ ] Audit records match mutation results.
- [ ] Evidence metadata supports source jump and highlighting.

## Stop Conditions

- Stop if T12 detail APIs do not expose required basis or audit fields.
- Stop if raw output retention from T04 is incomplete.
- Stop if evidence display requires copyright-sensitive long quotes in UI fixtures.

## Execution Record

No execution recorded yet.

