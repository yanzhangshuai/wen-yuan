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

- [ ] Define acceptance report template with commands, inputs, outputs, risks, and release decision.
- [ ] Validate evidence loop: accepted event, relation, and time facts can jump to source spans.
- [ ] Validate review loop: accept, reject, edit, defer, manual-create, merge, split, and relink write audit logs.
- [ ] Validate projection loop: deleting projections and rebuilding from claims plus review state yields equivalent accepted truth.
- [ ] Validate knowledge loop: reviewed knowledge influences candidate generation and normalization without bypassing review.
- [ ] Validate rebuild loop: projection-only rebuild and dirty-set rerun behave as expected.
- [ ] Validate manual UI checks from stable observation files under `docs/superpowers/reports/evidence-review-acceptance/manual-checks/*.json`.
- [ ] Run acceptance samples for `儒林外史` and `三国演义`.
- [ ] Link T20 cutover evidence and T21 regression reports.
- [ ] Classify remaining risks as blocking or non-blocking.
- [ ] Write final go/no-go report under `docs/superpowers/reports/`.
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

- [ ] Five loops have reproducible acceptance records.
- [ ] Cutover release conditions and blockers are clear.
- [ ] Acceptance report can be used as launch decision material.
- [ ] Residual risks are explicit.
- [ ] Manual UI checklist observations are human-authored, reproducible, and linked to stable files.

## Stop Conditions

- Stop if T20 or T21 is incomplete.
- Stop if any loop cannot be reproduced locally or in the documented environment.
- Stop if a blocking risk lacks an owner or mitigation.
- Stop if manual UI evidence is missing and someone tries to mark T22 complete anyway.

## Execution Record

No execution recorded yet.
