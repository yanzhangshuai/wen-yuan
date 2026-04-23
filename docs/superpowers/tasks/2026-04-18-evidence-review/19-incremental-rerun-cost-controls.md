# T19: Incremental Rerun And Cost Controls

## Goal

Implement dirty-set planning, stage skip rules, projection-only rebuild, and cost observability so small edits do not require full-book full-stage reruns.

## Main Context

- Spec sections: §10, §11, §13.2, §15
- Upstream dependencies: T04, T11, T12
- Regression dependency: T21 for validating rerun behavior

## Files

- Create: `src/server/modules/analysis/pipelines/evidence-review/rerun-planner/**`
- Create: `src/server/modules/review/evidence-review/costs/**`
- Create: `scripts/review-regression/**`
- Create: `src/server/modules/analysis/pipelines/evidence-review/rerun-planner/*.test.ts`

## Do Not Do

- Do not default every change to full-book rerun.
- Do not rerun LLM stages for ordinary review mutations.
- Do not produce black-box rerun plans without reasons.

## Execution Checkpoints

- [x] Define dirty-set dimensions: chapter, segment, claim family, persona candidate, projection slice, and run.
- [x] Map change types to minimum required stages.
- [x] Implement projection-only rebuild planning for review mutations.
- [x] Implement local chapter extraction plus full-book resolution planning for chapter text changes.
- [x] Implement cache/invalidated-stage metadata.
- [x] Implement explainable rerun plan output with reason, expected stage list, and affected range.
- [x] Implement cost summary APIs for token usage, monetary cost, stage duration, skipped counts, and rerun reason.
- [x] Implement comparison between full run and incremental rerun costs.
- [x] Add tests for review mutation, chapter text change, KB change, relation catalog change, projection rebuild, and cost comparison.
- [x] Add an execution record and mark T19 complete in the runbook only after validation passes.

## Validation

```bash
pnpm test src/server/modules/analysis/pipelines/evidence-review/rerun-planner
pnpm test src/server/modules/review/evidence-review/costs
pnpm type-check
```

## Acceptance Criteria

- [x] Small review edits trigger local projection rebuild only.
- [x] Chapter text edits can plan the smallest safe rerun path.
- [x] Cost summaries are explainable.
- [x] Full-book full-stage rerun is no longer the only recovery option.

## Stop Conditions

- Stop if run metadata from T04 lacks enough data for dirty planning.
- Stop if projection builders cannot rebuild local slices.
- Stop if cache invalidation policy requires a broader architecture decision.

## Execution Record

- Changed files: `docs/superpowers/plans/2026-04-23-t19-incremental-rerun-cost-controls-implementation-plan.md`, `src/server/modules/analysis/pipelines/evidence-review/rerun-planner/**`, `src/server/modules/review/evidence-review/costs/**`, `src/app/api/admin/review/_cost-controls.ts`, `src/app/api/admin/review/rerun-plan/route.ts`, `src/app/api/admin/review/rerun-plan/route.test.ts`, `src/app/api/admin/review/cost-summary/route.ts`, `src/app/api/admin/review/cost-summary/route.test.ts`, `src/app/api/admin/review/cost-comparison/route.ts`, `src/app/api/admin/review/cost-comparison/route.test.ts`, `scripts/review-regression/compare-rerun-costs.ts`, `docs/superpowers/tasks/2026-04-18-evidence-review/19-incremental-rerun-cost-controls.md`, and `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`
- Validation commands: `pnpm exec eslint src/server/modules/analysis/pipelines/evidence-review/rerun-planner src/server/modules/review/evidence-review/costs src/app/api/admin/review/_cost-controls.ts src/app/api/admin/review/rerun-plan/route.ts src/app/api/admin/review/rerun-plan/route.test.ts src/app/api/admin/review/cost-summary/route.ts src/app/api/admin/review/cost-summary/route.test.ts src/app/api/admin/review/cost-comparison/route.ts src/app/api/admin/review/cost-comparison/route.test.ts scripts/review-regression/compare-rerun-costs.ts`, `pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/rerun-planner src/server/modules/review/evidence-review/costs src/app/api/admin/review/rerun-plan/route.test.ts src/app/api/admin/review/cost-summary/route.test.ts src/app/api/admin/review/cost-comparison/route.test.ts --coverage=false`, `pnpm type-check`, `pnpm lint`, `pnpm exec ts-node --esm scripts/review-regression/compare-rerun-costs.ts --help`, `git diff --name-only -- prisma src/server/db src/app/api/admin/analysis-jobs`
- Result: T19 adds an evidence-review-specific rerun planner with stable dirty-set dimensions, hard-coded minimum-stage policies, explainable incremental rerun previews, projection-only handling for review mutations, review-native run cost summaries/comparisons, and a thin regression CLI without mutating the legacy retry planner or `/api/admin/analysis-jobs/**` cost route.
- Follow-up risks: none at the T19 task boundary; remaining roadmap work continues in T21/T20/T22.
