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

## Execution Checkpoints

- [ ] Define acceptance report template with commands, inputs, outputs, risks, and release decision.
- [ ] Validate evidence loop: accepted event, relation, and time facts can jump to source spans.
- [ ] Validate review loop: accept, reject, edit, defer, manual-create, merge, split, and relink write audit logs.
- [ ] Validate projection loop: deleting projections and rebuilding from claims plus review state yields equivalent accepted truth.
- [ ] Validate knowledge loop: reviewed knowledge influences candidate generation and normalization without bypassing review.
- [ ] Validate rebuild loop: projection-only rebuild and dirty-set rerun behave as expected.
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

## Acceptance Criteria

- [ ] Five loops have reproducible acceptance records.
- [ ] Cutover release conditions and blockers are clear.
- [ ] Acceptance report can be used as launch decision material.
- [ ] Residual risks are explicit.

## Stop Conditions

- Stop if T20 or T21 is incomplete.
- Stop if any loop cannot be reproduced locally or in the documented environment.
- Stop if a blocking risk lacks an owner or mitigation.

## Execution Record

No execution recorded yet.

