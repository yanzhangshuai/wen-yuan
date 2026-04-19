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

- [x] Inspect existing analysis job orchestration and AI provider usage.
- [x] Implement run lifecycle creation, start, success, failure, cancellation, and summary updates.
- [x] Implement stage run lifecycle with input count, output count, skipped count, failure count, error class, token usage, cost, and chapter range.
- [x] Implement raw output retention for prompts, responses, parse errors, schema validation errors, and discard reasons.
- [x] Implement retry planning by run, stage, and chapter.
- [x] Define failure isolation rules: Stage A chapter failure is local; Stage B/C preserve prior outputs; projection rebuild is independently invokable.
- [x] Integrate the run service with the existing `runAnalysisJob.ts` at safe boundaries.
- [x] Add tests for lifecycle transitions, raw output persistence, retry planning, and cost aggregation.
- [x] Add an execution record and mark T04 complete in the runbook only after validation passes.

## Validation

```bash
pnpm test src/server/modules/analysis/runs
pnpm type-check
```

## Acceptance Criteria

- [x] Run, stage run, and raw output records are complete.
- [x] A failed stage can be traced to chapter, error type, and raw output.
- [x] Partial retry can be planned by chapter or stage.
- [x] Cost summary can be aggregated by run.

## Stop Conditions

- Stop if current job orchestration is too different to integrate without a separate refactor.
- Stop if raw prompt/response retention creates a security or storage policy decision.
- Stop if cost metadata is unavailable from the configured AI provider abstraction.

## Execution Record

### T04 Completion - 2026-04-19

- Changed files: `prisma/schema.prisma`, `prisma/migrations/20260419090000_analysis_run_observability_metrics/migration.sql`, `prisma/migrations/20260419143000_analysis_runs_active_job_identity_unique/migration.sql`, `src/generated/prisma/**`, `src/server/modules/analysis/runs/run-service.ts`, `src/server/modules/analysis/runs/run-service.test.ts`, `src/server/modules/analysis/runs/stage-run-service.ts`, `src/server/modules/analysis/runs/stage-run-service.test.ts`, `src/server/modules/analysis/runs/retry-planner.ts`, `src/server/modules/analysis/runs/retry-planner.test.ts`, `src/server/modules/analysis/jobs/runAnalysisJob.ts`, `src/server/modules/analysis/jobs/runAnalysisJob.test.ts`
- Validation commands: `pnpm test src/server/modules/analysis/runs` (pass), `pnpm test src/server/modules/analysis/jobs/runAnalysisJob.test.ts` (34 tests passed, command failed on global coverage threshold), `pnpm exec vitest run src/server/modules/analysis/jobs/runAnalysisJob.test.ts --coverage.enabled=false` (pass), `pnpm prisma validate --schema prisma/schema.prisma` (pass), `pnpm prisma:generate` (pass), `pnpm type-check` (pass)
- Result: analysis runs, stage runs, raw output retention, retry planning, and job-level observability boundaries are in place for later extraction stages; cancellation now remains terminal even when all remaining chapters fail after a user-triggered cancel.
- Follow-up risks: provider-specific cost calculation remains nullable until T19; Stage 0/A/A+/B/B.5/C/D still need to call `stage-run-service` directly for fine-grained raw output retention; repository-level `pnpm test` coverage gates currently make single-file job test commands fail even when assertions pass.
- Next task: T17 `docs/superpowers/tasks/2026-04-18-evidence-review/17-kb-v2-foundation.md`
