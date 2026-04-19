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

- [ ] Define dirty-set dimensions: chapter, segment, claim family, persona candidate, projection slice, and run.
- [ ] Map change types to minimum required stages.
- [ ] Implement projection-only rebuild planning for review mutations.
- [ ] Implement local chapter extraction plus full-book resolution planning for chapter text changes.
- [ ] Implement cache/invalidated-stage metadata.
- [ ] Implement explainable rerun plan output with reason, expected stage list, and affected range.
- [ ] Implement cost summary APIs for token usage, monetary cost, stage duration, skipped counts, and rerun reason.
- [ ] Implement comparison between full run and incremental rerun costs.
- [ ] Add tests for review mutation, chapter text change, KB change, relation catalog change, projection rebuild, and cost comparison.
- [ ] Add an execution record and mark T19 complete in the runbook only after validation passes.

## Validation

```bash
pnpm test src/server/modules/analysis/pipelines/evidence-review/rerun-planner
pnpm test src/server/modules/review/evidence-review/costs
pnpm type-check
```

## Acceptance Criteria

- [ ] Small review edits trigger local projection rebuild only.
- [ ] Chapter text edits can plan the smallest safe rerun path.
- [ ] Cost summaries are explainable.
- [ ] Full-book full-stage rerun is no longer the only recovery option.

## Stop Conditions

- Stop if run metadata from T04 lacks enough data for dirty planning.
- Stop if projection builders cannot rebuild local slices.
- Stop if cache invalidation policy requires a broader architecture decision.

## Execution Record

No execution recorded yet.

