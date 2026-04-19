# T00: Evidence-first Review Architecture Umbrella

## Goal

Establish the rewrite governance boundary: the system will use an evidence-first parsing path, claim-first review control layer, projection-driven read model, and KB v2 feedback loop. This task does not implement product code; it verifies execution readiness before T01 starts.

## Main Context

- Architecture spec: `docs/superpowers/specs/2026-04-18-evidence-review-architecture-rewrite-design.md`
- Superpowers runbook: `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`
- Historical Trellis source: `.trellis/tasks/04-18-evidence-review-00-umbrella/prd.md`

## Files

- Modify: `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`
- Modify: `docs/superpowers/tasks/2026-04-18-evidence-review/00-umbrella.md`

## Do Not Do

- Do not write application code in this task.
- Do not modify Prisma schema in this task.
- Do not use `.trellis/tasks/**` as the active execution source after this task is complete.

## Execution Checkpoints

- [x] Confirm the runbook contains the `Next Step Protocol`, stopping conditions, execution waves, task status list, and global rules.
- [x] Confirm all task documents `00-umbrella.md` through `22-e2e-acceptance.md` exist.
- [x] Confirm the runbook task order is `T00, T01, T02, T03, T04, T17, T05, T06, T07, T18, T08, T09, T10, T11, T12, T13, T14, T16, T15, T19, T21, T20, T22`.
- [x] Confirm no task document tells the agent to use Trellis as the execution controller.
- [x] Confirm the primary architecture truth is the Superpowers spec, not legacy code or Trellis task files.
- [x] Add a completion entry to this task's `Execution Record`.
- [x] Mark T00 complete in the runbook.

## Validation

```bash
test -f docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md
test -f docs/superpowers/tasks/2026-04-18-evidence-review/22-e2e-acceptance.md
rg -n "Trellis as the execution controller|active execution source" docs/superpowers/plans docs/superpowers/tasks/2026-04-18-evidence-review
```

Expected result: required files exist and the search output only confirms Trellis is not the execution controller.

## Acceptance Criteria

- [x] Superpowers has one clear runbook for `下一步` execution.
- [x] All 23 task documents exist and are reachable from the runbook.
- [x] The old Trellis task files are historical reference only.
- [x] The rewrite is ready to start T01 without another planning pass.

## Stop Conditions

- Stop if any required task document is missing.
- Stop if the runbook and task documents disagree on task order.
- Stop if the user asks to restore Trellis as an execution source.

## Execution Record

### T00 Completion - 2026-04-18

- Changed files:
  - `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`
  - `docs/superpowers/tasks/2026-04-18-evidence-review/00-umbrella.md`
- Validation commands:
  - `test -f docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md && test -f docs/superpowers/tasks/2026-04-18-evidence-review/22-e2e-acceptance.md`
  - task-order verification script against runbook `Task Status`
  - `rg -n "Trellis as the execution controller|active execution source|use Trellis as" docs/superpowers/plans docs/superpowers/tasks/2026-04-18-evidence-review`
  - `git branch --show-current`
  - runbook section grep for `Next Step Protocol`, `Stopping Conditions`, `Global Rules`, `Execution Waves`, and `Task Status`
  - task file count check under `docs/superpowers/tasks/2026-04-18-evidence-review`
- Result:
  - all 23 task documents exist
  - runbook task order matches the agreed execution sequence
  - Superpowers is the active execution controller
  - Trellis task files are historical reference only
- Follow-up risks:
  - T01 is the first schema-changing task and may reveal integration gaps with the current Prisma schema
  - no business code has been executed yet
- Next task:
  - `docs/superpowers/tasks/2026-04-18-evidence-review/01-schema-and-state-foundation.md`
