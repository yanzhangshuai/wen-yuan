# T12: Review APIs And Claim Mutations

## Goal

Create claim-first review APIs for accepting, rejecting, editing, deferring, manual claim creation, persona merge/split, and evidence relinking. All mutations must write audit logs and rebuild only affected projections.

## Main Context

- Spec sections: §5.3, §6, §8, §10, §15
- Upstream dependencies: T03, T04, T11

## Files

- Create: `src/server/modules/review/evidence-review/review-query-service.ts`
- Create: `src/server/modules/review/evidence-review/review-mutation-service.ts`
- Create: `src/server/modules/review/evidence-review/review-audit-service.ts`
- Modify/Create: `src/app/api/admin/review/**/*.ts`
- Create: `src/server/modules/review/evidence-review/*.test.ts`

## Do Not Do

- Do not mutate final graph tables directly from old draft review routes.
- Do not overwrite AI claims during edits.
- Do not trigger whole-book LLM reruns for ordinary review mutations.

## Execution Checkpoints

- [ ] Inspect existing admin review API routes and determine which can be replaced or wrapped.
- [ ] Implement query service filters for persona, chapter, time slice, claim type, review state, and conflict state.
- [ ] Implement detail query returning claim, projection summary, evidence, AI basis, current state, and audit history.
- [ ] Implement mutation service actions: `accept`, `reject`, `defer`, `edit`, `createManualClaim`, `mergePersona`, `splitPersona`, and `relinkEvidence`.
- [ ] Ensure every mutation writes `review_audit_logs`.
- [ ] Ensure edit/manual actions create `MANUAL` claims linked by `derivedFrom` or `supersedes`.
- [ ] Trigger only affected projection rebuild slices after mutation.
- [ ] Implement route handlers using stable DTOs for T13-T16.
- [ ] Add tests for all major mutations and failure branches.
- [ ] Add an execution record and mark T12 complete in the runbook only after validation passes.

## Validation

```bash
pnpm test src/server/modules/review/evidence-review
pnpm type-check
pnpm lint
```

## Acceptance Criteria

- [ ] Review users can accept, reject, edit, defer, and manually create claims.
- [ ] Merge, split, and relink actions preserve audit history.
- [ ] Mutations only rebuild affected projections.
- [ ] List/detail APIs can directly support matrix, relation editor, time matrix, and evidence panel UI.

## Stop Conditions

- Stop if existing route architecture forces a broader admin API migration.
- Stop if projection rebuild cannot be called locally.
- Stop if audit identity/user attribution is unavailable and requires auth design.

## Execution Record

No execution recorded yet.

