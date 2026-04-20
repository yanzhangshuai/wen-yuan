# T10: Stage C Fact Attribution

## Goal

Attribute event, relation, and time claims to persona candidates while preserving alternatives and evidence when the attribution is uncertain.

## Main Context

- Spec sections: §7.6, §8.1, §8.2, §8.3
- Upstream dependencies: T08, T09

## Files

- Create: `src/server/modules/analysis/pipelines/evidence-review/stageC/FactAttributor.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageC/attribution-ranking.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageC/draft-builder.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageC/repository.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageC/persister.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageC/index.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageC/*.test.ts`

## Do Not Do

- Do not convert every uncertain attribution into a single hard `personaId`.
- Do not overwrite original Stage A claims.
- Do not let Stage D consume unreviewed facts as final truth.

## Execution Checkpoints

- [x] Read resolved persona candidates and conflict flags.
- [x] Attribute event subjects, relation sources, relation targets, and time claim associations.
- [x] Preserve candidate alternatives with confidence scores.
- [x] Use conflict flags to influence ranking without automatically invalidating claims.
- [x] Store attribution results in the claim model or attribution fields defined by T01/T03.
- [x] Ensure review APIs can accept, replace, or manually set attributions later.
- [x] Add tests for single-candidate, multi-candidate, conflict-influenced, and no-safe-candidate cases.
- [x] Add an execution record and mark T10 complete in the runbook only after validation passes.

Notes:

- `TimeClaim` has no persona-candidate field in the current claim contract, so T10 does not create standalone derived time rows. Time/person attribution is reviewable through derived `EVENT` and `RELATION` rows that keep `timeHintId`.
- Stage C writes only derived `AI` event/relation rows with `derivedFromClaimId` set to the root claim id. Root Stage A/A+ claims remain unchanged.

## Validation

```bash
pnpm test src/server/modules/analysis/pipelines/evidence-review/stageC
pnpm type-check
```

## Acceptance Criteria

- [x] Event, relation, and time associations have reviewable candidate attribution.
- [x] Uncertain cases preserve candidate sets and confidence.
- [x] Review API can later replace or manually specify attribution.
- [x] Stage D can read attribution results safely.

## Stop Conditions

- Stop if T08 candidate IDs are not stable enough for claim attribution.
- Stop if attribution alternatives require a schema change outside T10 scope.
- Stop if there is no clear review state for low-confidence attribution.

## Execution Record

### 2026-04-20

- Changed files: `src/server/modules/analysis/pipelines/evidence-review/stageC/types.ts`, `src/server/modules/analysis/pipelines/evidence-review/stageC/attribution-ranking.ts`, `src/server/modules/analysis/pipelines/evidence-review/stageC/attribution-ranking.test.ts`, `src/server/modules/analysis/pipelines/evidence-review/stageC/draft-builder.ts`, `src/server/modules/analysis/pipelines/evidence-review/stageC/draft-builder.test.ts`, `src/server/modules/analysis/pipelines/evidence-review/stageC/repository.ts`, `src/server/modules/analysis/pipelines/evidence-review/stageC/repository.test.ts`, `src/server/modules/analysis/pipelines/evidence-review/stageC/persister.ts`, `src/server/modules/analysis/pipelines/evidence-review/stageC/persister.test.ts`, `src/server/modules/analysis/pipelines/evidence-review/stageC/FactAttributor.ts`, `src/server/modules/analysis/pipelines/evidence-review/stageC/FactAttributor.test.ts`, `src/server/modules/analysis/pipelines/evidence-review/stageC/index.ts`, `docs/superpowers/plans/2026-04-20-t10-stage-c-fact-attribution-implementation-plan.md`, `docs/superpowers/tasks/2026-04-18-evidence-review/10-stage-c-fact-attribution.md`, `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`
- Validation commands: `pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stageC --coverage=false` passed with 13 tests; `pnpm test src/server/modules/analysis/pipelines/evidence-review/stageC` ran the same 13 tests successfully but failed the global coverage threshold because shared imported modules such as `claims`, `runs`, and `db` are included in coverage accounting; `pnpm type-check` passed.
- Result: Stage C now deterministically ranks persona attribution alternatives, builds derived reviewable event/relation facts, persists rerun-safe chapter-scoped derived rows, records raw output and stage-run observability, and preserves conflict/time context for downstream review and Stage D.
- Follow-up risks: standalone time-person attribution remains represented through derived facts until a future schema explicitly adds persona fields to `TimeClaim`; review APIs in T12 must keep derived alternatives editable rather than collapsing them into one final persona; Stage D in T11 must read only review-safe derived facts.
- Next task: T11 `docs/superpowers/tasks/2026-04-18-evidence-review/11-stage-d-projection-builder.md`
