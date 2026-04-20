# T09: Stage B.5 Consistency And Conflict Detection

## Goal

Make uncertainty explicit by writing `conflict_flags` for impossible or contradictory claims instead of letting the model silently choose one answer.

## Main Context

- Spec sections: §5.2, §7.5, §9.4, §10
- Upstream dependencies: T03, T08

## Files

- Create: `src/server/modules/analysis/pipelines/evidence-review/stageB5/ConflictDetector.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageB5/conflict-rules.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageB5/*.test.ts`

## Do Not Do

- Do not directly mutate existing claim statuses.
- Do not write final projection rows.
- Do not hide conflicts in logs only.

## Execution Checkpoints

- [x] Implement conflict families: `POST_MORTEM_ACTION`, `IMPOSSIBLE_LOCATION`, `TIME_ORDER_CONFLICT`, `RELATION_DIRECTION_CONFLICT`, `ALIAS_CONFLICT`, and `LOW_EVIDENCE_CLAIM`.
- [x] Bind conflicts to related claims, candidates, chapters, and evidence spans.
- [x] Store severity, reason, recommended action, and source stage.
- [x] Ensure conflicts are reviewable without changing the underlying claim.
- [x] Expose conflict summaries for Stage C and later review projections.
- [x] Add tests for at least five classical-literature high-risk cases.
- [x] Add an execution record and mark T09 complete in the runbook only after validation passes.

## Validation

```bash
pnpm test src/server/modules/analysis/pipelines/evidence-review/stageB5
pnpm type-check
```

## Acceptance Criteria

- [x] Key conflict types persist and trace back to source claims or evidence.
- [x] Conflict detection does not directly change projection truth.
- [x] Review pages can show conflict summaries by persona, chapter, or relation.
- [x] Stage C can use conflict flags as ranking inputs.

## Stop Conditions

- Stop if conflict tables cannot link to all required claim families.
- Stop if the severity taxonomy needs a product decision.
- Stop if Stage B output does not provide enough identity information.

## Execution Record

### T09 Completion - 2026-04-20

- Changed files: `prisma/schema.prisma`, `src/server/modules/analysis/claims/**`, `src/server/modules/analysis/pipelines/evidence-review/stageB5/**`, `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/**`, `src/server/modules/knowledge-v2/relation-types/**`, `docs/superpowers/tasks/2026-04-18-evidence-review/09-stage-b5-conflict-detection.md`, `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`
- Validation commands: `pnpm exec vitest run src/server/modules/analysis/claims/claim-schemas.test.ts src/server/modules/analysis/claims/claim-repository.test.ts src/server/modules/analysis/claims/manual-override.test.ts src/server/modules/analysis/pipelines/evidence-review/stageB5/types.test.ts src/server/modules/analysis/pipelines/evidence-review/stageB5/repository.test.ts src/server/modules/analysis/pipelines/evidence-review/stageB5/conflict-rules.test.ts src/server/modules/analysis/pipelines/evidence-review/stageB5/draft-builder.test.ts src/server/modules/analysis/pipelines/evidence-review/stageB5/persister.test.ts src/server/modules/analysis/pipelines/evidence-review/stageB5/ConflictDetector.test.ts --coverage=false`, `pnpm type-check`, `pnpm lint`, `pnpm exec vitest run --coverage=false`
- Result: Stage B.5 now deterministically reads whole-book Stage A/B review-native claims, detects six conflict families, persists reviewable `CONFLICT_FLAG` rows with structured severity/action/source metadata, and records zero-cost stage-run/raw-output observability.
- Follow-up risks: T10 must consume conflict flags as attribution/ranking inputs; T12/T13/T14 still need review APIs and UI filters for conflict flags by persona, chapter, relation, and evidence.
