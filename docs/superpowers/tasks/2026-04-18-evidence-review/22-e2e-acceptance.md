# T22: Evidence-first Rewrite End-to-End Acceptance

## Goal

Produce final go/no-go evidence for the Evidence-first rewrite by validating the evidence loop, review loop, projection loop, knowledge loop, and rebuild loop.

## Main Context

- Spec sections: §13.3, §15, §16
- Upstream dependencies: T20, T21

## Files

- Create: `docs/superpowers/reports/**`
- Create: `scripts/review-regression/acceptance/**`

## Do Not Do

- Do not create or modify `.trellis/tasks/**` in this Superpowers-only execution flow.
- Do not treat visual polish as the primary acceptance signal.
- Do not approve launch while blocking issues remain unresolved.
- Do not invent new review states for manual claims. Human-created accepted claims still use `reviewState: "ACCEPTED"` and are distinguished through `source: "MANUAL"` and audit history.
- Do not auto-pass manual UI checks. Missing or incomplete human observations must keep the final decision at `NO_GO`.

## Execution Checkpoints

- [x] Define acceptance report template with commands, inputs, outputs, risks, and release decision.
- [x] Validate evidence loop: accepted event, relation, and time facts can jump to source spans.
- [x] Validate review loop: accept, reject, edit, defer, manual-create, merge, split, and relink write audit logs.
- [x] Validate projection loop: deleting projections and rebuilding from claims plus review state yields equivalent accepted truth.
- [x] Validate knowledge loop: reviewed knowledge influences candidate generation and normalization without bypassing review.
- [x] Validate rebuild loop: projection-only rebuild and dirty-set rerun behave as expected.
- [ ] Validate manual UI checks from stable observation files under `docs/superpowers/reports/evidence-review-acceptance/manual-checks/*.json`.
- [x] Run acceptance samples for `儒林外史` and `三国演义`.
- [x] Link T20 cutover evidence and T21 regression reports.
- [x] Classify remaining risks as blocking or non-blocking.
- [x] Write final go/no-go report under `docs/superpowers/reports/`.
- [ ] Add an execution record and mark T22 complete in the runbook only after validation passes.

## Validation

```bash
pnpm test scripts/review-regression/acceptance
pnpm type-check
pnpm lint
```

Run the full regression command produced by T21 and reference the report path.

Manual UI validation must be rerunnable:

- Record observations in
  - `docs/superpowers/reports/evidence-review-acceptance/manual-checks/rulin-waishi-sample.json`
  - `docs/superpowers/reports/evidence-review-acceptance/manual-checks/sanguo-yanyi-sample.json`
- If either file is missing, malformed, or lacks a required check, acceptance must stay `NO_GO`.

## Acceptance Criteria

- [x] Five loops have reproducible acceptance records.
- [x] Cutover release conditions and blockers are clear.
- [x] Acceptance report can be used as launch decision material.
- [x] Residual risks are explicit.
- [ ] Manual UI checklist observations are human-authored, reproducible, and linked to stable files.

## Stop Conditions

- Stop if T20 or T21 is incomplete.
- Stop if any loop cannot be reproduced locally or in the documented environment.
- Stop if a blocking risk lacks an owner or mitigation.
- Stop if manual UI evidence is missing and someone tries to mark T22 complete anyway.

## Execution Record

- 2026-04-24: Implemented the T22 acceptance package under `src/server/modules/review/evidence-review/acceptance/**` and `scripts/review-regression/acceptance/**`, including report contracts, scenario definitions, repository readers, loop evaluators, and the end-to-end acceptance CLI that produces per-book summaries plus a final go/no-go decision.
- Strict-TDD fixes completed during validation:
  - Added RED coverage around stable scenario-to-book binding, then updated the regression sample seed and acceptance runner so acceptance scenarios resolve by deterministic `bookId` instead of title-only matching.
  - Added RED coverage around review loop action expectations, then changed the acceptance runner to derive expected actions from the T21 action scenarios and only treat passed action results plus live audit rows as observed review mutations.
  - Added RED coverage for incomplete T21 stable reports, then allowed the acceptance rerun path to regenerate deterministic comparison run ids and tolerate optional `runComparison` / cost fields when the persisted baseline report is older.
  - Added RED coverage for readonly scenario fixtures and decision payload extension fields, then widened `manualChecks` and final decision inputs to accept readonly scenario config plus extra metadata without breaking the evaluator contract.
- Validation passed:
  - `pnpm exec vitest run src/server/modules/review/evidence-review/acceptance/loop-evaluators.test.ts src/server/modules/review/evidence-review/acceptance/runner.test.ts scripts/review-regression/acceptance/run-e2e-acceptance.test.ts --coverage=false --reporter=verbose`
  - `pnpm type-check`
  - `pnpm lint`
  - `pnpm exec tsx scripts/review-regression/acceptance/run-e2e-acceptance.ts --book all`
- Generated acceptance artifacts:
  - `docs/superpowers/reports/evidence-review-acceptance/rulin-waishi-sample/summary.md`
  - `docs/superpowers/reports/evidence-review-acceptance/rulin-waishi-sample/summary.json`
  - `docs/superpowers/reports/evidence-review-acceptance/sanguo-yanyi-sample/summary.md`
  - `docs/superpowers/reports/evidence-review-acceptance/sanguo-yanyi-sample/summary.json`
  - `docs/superpowers/reports/evidence-review-acceptance/final-go-no-go.md`
  - `docs/superpowers/reports/evidence-review-acceptance/final-go-no-go.json`
- Current decision state:
  - All five automated loops (`EVIDENCE`, `REVIEW`, `PROJECTION`, `KNOWLEDGE`, `REBUILD`) pass for both `儒林外史` and `三国演义`.
  - `blockingRisks` and per-book `risks` are empty in `final-go-no-go.json`.
  - Final decision remains `NO_GO` only because the required human-authored files under `docs/superpowers/reports/evidence-review-acceptance/manual-checks/*.json` are still missing, so all manual UI checks remain `PENDING_MANUAL_VERIFICATION`.
- Result: T22 implementation and automated validation are complete, but the task must remain open in the runbook until a human records the required manual observation files and reruns acceptance.
