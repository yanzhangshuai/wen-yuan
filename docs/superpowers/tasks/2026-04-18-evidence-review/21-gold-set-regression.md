# T21: Gold-Set Regression And Sample Acceptance Baseline

## Goal

Build reproducible gold-set regression fixtures, scripts, metrics, and reports for `儒林外史` and `三国演义`.

## Main Context

- Spec sections: §13.1, §13.2, §14.1, §15
- Upstream dependencies: T11, T18, T19
- Downstream dependency: T20 and T22

## Files

- Create: `scripts/review-regression/**`
- Create: `tests/fixtures/review-regression/**`
- Create: `docs/superpowers/reports/**`
- Create: `scripts/review-regression/*.test.ts`

## Do Not Do

- Do not rely on manual screenshots as regression evidence.
- Do not include full copyrighted book text in fixtures unless the repository already has legal source data.
- Do not make cutover decisions without reproducible metrics.

## Execution Checkpoints

- [x] Define fixture format for expected personas, chapter facts, relations, time facts, evidence traceability, and review actions.
- [x] Add `儒林外史` MVP fixture coverage for character recognition, chapter facts, impersonation/misidentification, and evidence jumps.
- [x] Add `三国演义` standard fixture coverage for time phases, dynamic relations, and imprecise time expressions.
- [x] Implement regression runner by book and chapter range.
- [x] Implement metrics for persona accuracy, relation direction/type stability, time normalization usability, evidence traceability, and review action success rate.
- [x] Implement report generation under `docs/superpowers/reports/`.
- [x] Implement comparison of full run versus incremental rerun output.
- [x] Add tests for fixture parsing, metric calculation, and report generation.
- [x] Add an execution record and mark T21 complete in the runbook only after validation passes.

## Validation

```bash
pnpm test scripts/review-regression
pnpm type-check
```

If script execution requires seeded data, record the required seed command and run the smallest available sample.

## Acceptance Criteria

- [x] `儒林外史` MVP baseline can run reproducibly.
- [x] `三国演义` time and relation samples are included.
- [x] Metrics and report outputs can be cited by cutover and final acceptance.
- [x] Regression covers evidence, review, and projection loops.

## Stop Conditions

- Stop if sample text or expected outputs are not available.
- Stop if metric thresholds require user approval.
- Stop if regression cannot run without external services not available locally.

## Execution Record

- 2026-04-23: Implemented the T21 regression package under `src/server/modules/review/evidence-review/regression/**`, the thin CLI at `scripts/review-regression/run-gold-set-regression.ts`, fixture JSONs for `儒林外史` and `三国演义`, report rendering under `docs/superpowers/reports/review-regression/**`, and the associated Vitest coverage.
- Strict-TDD fixes completed during validation:
  - Added a RED test in `src/server/modules/review/evidence-review/regression/contracts.test.ts` to catch persona merge/split scenarios missing `target.pair`, then tightened `reviewRegressionActionScenarioSchema` in `src/server/modules/review/evidence-review/regression/contracts.ts` and updated `tests/fixtures/review-regression/rulin-waishi.fixture.json` so `MERGE_PERSONA` / `SPLIT_PERSONA` scenarios match the runtime harness contract.
  - Added a RED test in `src/server/modules/review/evidence-review/regression/snapshot-repository.test.ts` to reject ambiguous fixture book resolution, then changed `src/server/modules/review/evidence-review/regression/snapshot-repository.ts` to fail when `bookTitle` matches multiple non-deleted books instead of silently selecting one row.
- 2026-04-24: Closed the remaining fixture and sample-report blockers without adding schema or migration changes.
  - Added a RED coverage assertion in `src/server/modules/review/evidence-review/regression/fixture-loader.test.ts`, then repaired `tests/fixtures/review-regression/rulin-waishi.fixture.json` by adding `张乡绅` and replacing the illegal `ACCEPT_CLAIM` scenario with the valid `DEFER_CLAIM` flow for `defer-fan-jin-status-fact`.
  - Added the missing `诸葛亮` chapter-fact expectation to `tests/fixtures/review-regression/sanguo-yanyi.fixture.json` so the `三顾茅庐后出山辅佐` sample is explicitly covered.
  - Re-ran seeded local regression and regenerated citation-ready sample reports under `docs/superpowers/reports/review-regression/rulin-waishi-sample/**` and `docs/superpowers/reports/review-regression/sanguo-yanyi-sample/**`.
- Validation passed:
  - `pnpm exec vitest run src/server/modules/review/evidence-review/regression/contracts.test.ts --coverage=false`
  - `pnpm exec vitest run src/server/modules/review/evidence-review/regression/contracts.test.ts src/server/modules/review/evidence-review/regression/fixture-loader.test.ts src/server/modules/review/evidence-review/regression/review-action-harness.test.ts --coverage=false`
  - `pnpm exec vitest run src/server/modules/review/evidence-review/regression/snapshot-repository.test.ts --coverage=false`
  - `pnpm exec vitest run src/server/modules/review/evidence-review/regression/fixture-loader.test.ts --coverage=false`
  - `pnpm exec vitest run src/server/modules/review/evidence-review/regression scripts/review-regression/run-gold-set-regression.test.ts --coverage=false`
  - `pnpm type-check`
  - `pnpm exec eslint src/server/modules/review/evidence-review/regression scripts/review-regression/run-gold-set-regression.ts prisma/seed.ts`
  - `pnpm prisma:seed`
  - `pnpm exec tsx scripts/review-regression/run-gold-set-regression.ts --fixture tests/fixtures/review-regression/rulin-waishi.fixture.json --report-dir docs/superpowers/reports/review-regression/rulin-waishi-sample`
  - `pnpm exec tsx scripts/review-regression/run-gold-set-regression.ts --fixture tests/fixtures/review-regression/sanguo-yanyi.fixture.json --report-dir docs/superpowers/reports/review-regression/sanguo-yanyi-sample`
- Generated report baselines:
  - `docs/superpowers/reports/review-regression/rulin-waishi-sample/summary.md`
  - `docs/superpowers/reports/review-regression/rulin-waishi-sample/summary.json`
  - `docs/superpowers/reports/review-regression/sanguo-yanyi-sample/summary.md`
  - `docs/superpowers/reports/review-regression/sanguo-yanyi-sample/summary.json`
- Result: T21 is complete. Both fixtures now produce 100% persona, relation, time, evidence, and review-action metrics with no missing, unexpected, or changed natural keys, so the generated reports are ready for T20 and T22 citation.
- Follow-up risks: none at the T21 task boundary.
- Next task: T20 `docs/superpowers/tasks/2026-04-18-evidence-review/20-cutover-read-paths.md`
