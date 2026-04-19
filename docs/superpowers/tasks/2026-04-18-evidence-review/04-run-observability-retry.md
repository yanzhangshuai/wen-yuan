# T04: Run Observability And Retry Boundaries

## Goal

Make analysis runs, stage runs, raw LLM outputs, retry boundaries, error categories, and cost summaries first-class system objects.

## Main Context

- Spec sections: §10, §11, §15
- Upstream dependencies: T01, T03

## Files

- Create: `src/server/modules/analysis/runs/run-service.ts`
- Create: `src/server/modules/analysis/runs/stage-run-service.ts`
- Create: `src/server/modules/analysis/runs/retry-planner.ts`
- Modify: `src/server/modules/analysis/jobs/runAnalysisJob.ts`
- Create: `src/server/modules/analysis/runs/*.test.ts`

## Do Not Do

- Do not rewrite all pipeline stages in this task.
- Do not hide raw LLM parse failures in logs only.
- Do not make Stage A chapter failure erase previous successful outputs.

## Execution Checkpoints

- [ ] Inspect existing analysis job orchestration and AI provider usage.
- [ ] Implement run lifecycle creation, start, success, failure, cancellation, and summary updates.
- [ ] Implement stage run lifecycle with input count, output count, skipped count, failure count, error class, token usage, cost, and chapter range.
- [ ] Implement raw output retention for prompts, responses, parse errors, schema validation errors, and discard reasons.
- [ ] Implement retry planning by run, stage, and chapter.
- [ ] Define failure isolation rules: Stage A chapter failure is local; Stage B/C preserve prior outputs; projection rebuild is independently invokable.
- [ ] Integrate the run service with the existing `runAnalysisJob.ts` at safe boundaries.
- [ ] Add tests for lifecycle transitions, raw output persistence, retry planning, and cost aggregation.
- [ ] Add an execution record and mark T04 complete in the runbook only after validation passes.

## Validation

```bash
pnpm test src/server/modules/analysis/runs
pnpm type-check
```

## Acceptance Criteria

- [ ] Run, stage run, and raw output records are complete.
- [ ] A failed stage can be traced to chapter, error type, and raw output.
- [ ] Partial retry can be planned by chapter or stage.
- [ ] Cost summary can be aggregated by run.

## Stop Conditions

- Stop if current job orchestration is too different to integrate without a separate refactor.
- Stop if raw prompt/response retention creates a security or storage policy decision.
- Stop if cost metadata is unavailable from the configured AI provider abstraction.

## Execution Record

No execution recorded yet.

