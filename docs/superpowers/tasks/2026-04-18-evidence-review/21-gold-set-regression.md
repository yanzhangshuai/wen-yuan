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

- [ ] Define fixture format for expected personas, chapter facts, relations, time facts, evidence traceability, and review actions.
- [ ] Add `儒林外史` MVP fixture coverage for character recognition, chapter facts, impersonation/misidentification, and evidence jumps.
- [ ] Add `三国演义` standard fixture coverage for time phases, dynamic relations, and imprecise time expressions.
- [ ] Implement regression runner by book and chapter range.
- [ ] Implement metrics for persona accuracy, relation direction/type stability, time normalization usability, evidence traceability, and review action success rate.
- [ ] Implement report generation under `docs/superpowers/reports/`.
- [ ] Implement comparison of full run versus incremental rerun output.
- [ ] Add tests for fixture parsing, metric calculation, and report generation.
- [ ] Add an execution record and mark T21 complete in the runbook only after validation passes.

## Validation

```bash
pnpm test scripts/review-regression
pnpm type-check
```

If script execution requires seeded data, record the required seed command and run the smallest available sample.

## Acceptance Criteria

- [ ] `儒林外史` MVP baseline can run reproducibly.
- [ ] `三国演义` time and relation samples are included.
- [ ] Metrics and report outputs can be cited by cutover and final acceptance.
- [ ] Regression covers evidence, review, and projection loops.

## Stop Conditions

- Stop if sample text or expected outputs are not available.
- Stop if metric thresholds require user approval.
- Stop if regression cannot run without external services not available locally.

## Execution Record

No execution recorded yet.

