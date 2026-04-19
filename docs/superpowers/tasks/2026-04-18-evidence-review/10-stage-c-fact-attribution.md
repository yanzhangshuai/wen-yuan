# T10: Stage C Fact Attribution

## Goal

Attribute event, relation, and time claims to persona candidates while preserving alternatives and evidence when the attribution is uncertain.

## Main Context

- Spec sections: §7.6, §8.1, §8.2, §8.3
- Upstream dependencies: T08, T09

## Files

- Create: `src/server/modules/analysis/pipelines/evidence-review/stageC/FactAttributor.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageC/attribution-ranking.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageC/*.test.ts`

## Do Not Do

- Do not convert every uncertain attribution into a single hard `personaId`.
- Do not overwrite original Stage A claims.
- Do not let Stage D consume unreviewed facts as final truth.

## Execution Checkpoints

- [ ] Read resolved persona candidates and conflict flags.
- [ ] Attribute event subjects, relation sources, relation targets, and time claim associations.
- [ ] Preserve candidate alternatives with confidence scores.
- [ ] Use conflict flags to influence ranking without automatically invalidating claims.
- [ ] Store attribution results in the claim model or attribution fields defined by T01/T03.
- [ ] Ensure review APIs can accept, replace, or manually set attributions later.
- [ ] Add tests for single-candidate, multi-candidate, conflict-influenced, and no-safe-candidate cases.
- [ ] Add an execution record and mark T10 complete in the runbook only after validation passes.

## Validation

```bash
pnpm test src/server/modules/analysis/pipelines/evidence-review/stageC
pnpm type-check
```

## Acceptance Criteria

- [ ] Event, relation, and time claims have reviewable candidate attribution.
- [ ] Uncertain cases preserve candidate sets and confidence.
- [ ] Review API can later replace or manually specify attribution.
- [ ] Stage D can read attribution results safely.

## Stop Conditions

- Stop if T08 candidate IDs are not stable enough for claim attribution.
- Stop if attribution alternatives require a schema change outside T10 scope.
- Stop if there is no clear review state for low-confidence attribution.

## Execution Record

No execution recorded yet.

