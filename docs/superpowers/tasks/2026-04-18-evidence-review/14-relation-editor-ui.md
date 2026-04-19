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

- [ ] Inspect existing relationship UI components and admin review layout.
- [ ] Load relation projection and claim detail from T12 APIs.
- [ ] Implement fields for `relationTypeKey`, `relationLabel`, `relationTypeSource`, `direction`, `effectiveChapterStart`, `effectiveChapterEnd`, and evidence binding.
- [ ] Display original extracted relation text beside the current normalized relation.
- [ ] Load preset options from T18 relation catalog when available.
- [ ] Allow direct custom relation input and save it as a claim without forced catalog promotion.
- [ ] Allow reviewers to preserve custom relation or map it to a preset relation.
- [ ] Support multiple relations between the same pair of personas.
- [ ] Show direction and interval conflict warnings without blocking normal review.
- [ ] Integrate evidence/audit side panel from T16 if available.
- [ ] Add tests for preset selection, custom input, direction switch, interval edit, multi-relation display, and save.
- [ ] Add an execution record and mark T14 complete in the runbook only after validation passes.

## Validation

```bash
pnpm test src/components/review/relation-editor
pnpm type-check
pnpm lint
```

## Acceptance Criteria

- [ ] Reviewer can edit relation direction, type, interval, and evidence.
- [ ] Preset and custom relations are both supported.
- [ ] Original text, normalized relation, and relation source are visible together.
- [ ] Dynamic relation changes are readable and editable.

## Stop Conditions

- Stop if relation catalog DTOs from T18 are not available and no temporary preset source exists.
- Stop if UI complexity requires a design decision about graph visualization versus form editing.
- Stop if effective interval semantics conflict with T15 time-axis semantics.

## Execution Record

No execution recorded yet.

