# T20: Cut Over Read Paths And Retire Legacy Truth Usage

## Goal

Move admin review pages, persona details, relationship views, and related read paths to the new projection truth. Retire or clearly mark old draft review paths.

## Main Context

- Spec sections: §3.2, §4, §7.7, §8, §12, §13.3, §15
- Upstream dependencies: T11, T12, T13, T14, T15, T16, T21
- Final validation dependency: T22

## Files

- Modify/Create: `src/app/admin/review/**`
- Modify/Create: `src/app/**`
- Modify/Create: `src/server/modules/review/**`
- Create: `src/app/**/*.test.ts`

## Do Not Do

- Do not maintain long-term dual read truth.
- Do not silently fall back to old draft truth in the new review UI.
- Do not remove old routes without a verification or rollback note.

## Execution Checkpoints

- [ ] Inventory existing read paths that use `Profile`, `BiographyRecord`, `Relationship`, old draft review routes, or old review tabs.
- [ ] Classify each path as cut over now, hide/retire now, or temporary read-only compatibility.
- [ ] Switch admin review read paths to projection/query DTOs.
- [ ] Switch persona detail and relationship views where they are part of the review surface.
- [ ] Hide or retire old `listDrafts`, old review tabs, and old direct final-graph write paths.
- [ ] Add feature flag, guard, or clear route-level note for any temporary compatibility path.
- [ ] Implement reconciliation checks for persona count, chapter fact count, relation edge count, and sampled evidence traceability.
- [ ] Add rollback or read-only degradation behavior for projection rebuild failure.
- [ ] Add tests for key read paths and old route retirement behavior.
- [ ] Add an execution record and mark T20 complete in the runbook only after validation passes.

## Validation

```bash
pnpm test src/app/admin/review
pnpm type-check
pnpm lint
```

Run T21 regression before finalizing T20. Record the T21 report path in this task's execution record.

## Acceptance Criteria

- [ ] Main review pages read only new projections.
- [ ] Old review entry points are retired, hidden, or explicitly marked transitional.
- [ ] Cutover has reconciliation and failure protection.
- [ ] New and old path boundaries are clear.

## Stop Conditions

- Stop if T21 regression is not available.
- Stop if a critical read path still depends on legacy truth and cannot be migrated within this task.
- Stop if cutover risk requires user approval for hiding/removing routes.

## Execution Record

No execution recorded yet.

