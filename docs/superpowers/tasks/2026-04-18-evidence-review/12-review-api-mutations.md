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

- [x] Inspect existing admin review API routes and determine which can be replaced or wrapped.
- [x] Implement query service filters for persona, chapter, time slice, claim type, review state, and conflict state.
- [x] Implement detail query returning claim, projection summary, evidence, AI basis, current state, and audit history.
- [x] Implement mutation service actions: `accept`, `reject`, `defer`, `edit`, `createManualClaim`, `mergePersona`, `splitPersona`, and `relinkEvidence`.
- [x] Ensure every mutation writes `review_audit_logs`.
- [x] Ensure edit/manual actions create `MANUAL` claims linked by `derivedFrom` or `supersedes`.
- [x] Trigger only affected projection rebuild slices after mutation.
- [x] Implement route handlers using stable DTOs for T13-T16.
- [x] Add tests for all major mutations and failure branches.
- [x] Add an execution record and mark T12 complete in the runbook only after validation passes.

## Validation

```bash
pnpm test src/server/modules/review/evidence-review
pnpm type-check
pnpm lint
```

## Acceptance Criteria

- [x] Review users can accept, reject, edit, defer, and manually create claims.
- [x] Merge, split, and relink actions preserve audit history.
- [x] Mutations only rebuild affected projections.
- [x] List/detail APIs can directly support matrix, relation editor, time matrix, and evidence panel UI.

## Stop Conditions

- Stop if existing route architecture forces a broader admin API migration.
- Stop if projection rebuild cannot be called locally.
- Stop if audit identity/user attribution is unavailable and requires auth design.

## Execution Record

### 2026-04-21

- Implemented files: `prisma/schema.prisma`, `prisma/migrations/20260421103000_review_action_defer/migration.sql`, `src/generated/prisma/**`, `src/server/modules/auth/constants.ts`, `src/server/modules/auth/token.ts`, `src/server/modules/auth/index.ts`, `src/server/modules/auth/edge-token.ts`, `middleware.ts`, `src/app/api/auth/login/route.ts`, `src/server/modules/review/evidence-review/review-api-schemas.ts`, `src/server/modules/review/evidence-review/review-audit-service.ts`, `src/server/modules/review/evidence-review/review-query-service.ts`, `src/server/modules/review/evidence-review/review-mutation-service.ts`, `src/app/api/admin/review/**`, and the corresponding Vitest files
- Validation commands:
  - `pnpm prisma validate --schema prisma/schema.prisma`
  - `pnpm prisma:generate`
  - `pnpm exec vitest run src/server/modules/auth/token.test.ts src/server/modules/auth/index.test.ts src/middleware.test.ts src/app/api/auth/login/route.test.ts src/server/modules/review/evidence-review/review-api-schemas.test.ts src/server/modules/review/evidence-review/review-audit-service.test.ts src/server/modules/review/evidence-review/review-query-service.test.ts src/server/modules/review/evidence-review/review-mutation-service.test.ts src/app/api/admin/review/claims/route.test.ts src/app/api/admin/review/claims/[claimKind]/[claimId]/route.test.ts src/app/api/admin/review/claims/[claimKind]/[claimId]/actions/route.test.ts src/app/api/admin/review/personas/merge/route.test.ts src/app/api/admin/review/personas/split/route.test.ts --coverage=false`
  - `pnpm lint`
  - `pnpm type-check`
- Result: claim-first review list/detail APIs, manual override mutations, persona merge/split flows, audit logging, admin actor propagation, and projection-scoped rebuild hooks are all implemented and validated without mutating legacy truth tables or overwriting AI claim rows.
- Follow-up risks: T13-T16 now depend on the normalized DTOs and route contracts introduced here; commit was intentionally deferred because you have not asked for a T12 commit yet.
- Next task: T13 `docs/superpowers/tasks/2026-04-18-evidence-review/13-persona-chapter-matrix-ui.md`
