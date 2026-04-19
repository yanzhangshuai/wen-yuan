# T09: Stage B.5 Consistency And Conflict Detection

## Goal

Make uncertainty explicit by writing `conflict_flags` for impossible or contradictory claims instead of letting the model silently choose one answer.

## Main Context

- Spec sections: §5.2, §7.5, §9.4, §10
- Upstream dependencies: T03, T08

## Files

- Create: `src/server/modules/analysis/pipelines/evidence-review/stageB5/ConflictDetector.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageB5/conflict-rules.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageB5/*.test.ts`

## Do Not Do

- Do not directly mutate existing claim statuses.
- Do not write final projection rows.
- Do not hide conflicts in logs only.

## Execution Checkpoints

- [ ] Implement conflict families: `POST_MORTEM_ACTION`, `IMPOSSIBLE_LOCATION`, `TIME_ORDER_CONFLICT`, `RELATION_DIRECTION_CONFLICT`, `ALIAS_CONFLICT`, and `LOW_EVIDENCE_CLAIM`.
- [ ] Bind conflicts to related claims, candidates, chapters, and evidence spans.
- [ ] Store severity, reason, recommended action, and source stage.
- [ ] Ensure conflicts are reviewable without changing the underlying claim.
- [ ] Expose conflict summaries for Stage C and later review projections.
- [ ] Add tests for at least five classical-literature high-risk cases.
- [ ] Add an execution record and mark T09 complete in the runbook only after validation passes.

## Validation

```bash
pnpm test src/server/modules/analysis/pipelines/evidence-review/stageB5
pnpm type-check
```

## Acceptance Criteria

- [ ] Key conflict types persist and trace back to source claims or evidence.
- [ ] Conflict detection does not directly change projection truth.
- [ ] Review pages can show conflict summaries by persona, chapter, or relation.
- [ ] Stage C can use conflict flags as ranking inputs.

## Stop Conditions

- Stop if conflict tables cannot link to all required claim families.
- Stop if the severity taxonomy needs a product decision.
- Stop if Stage B output does not provide enough identity information.

## Execution Record

No execution recorded yet.

