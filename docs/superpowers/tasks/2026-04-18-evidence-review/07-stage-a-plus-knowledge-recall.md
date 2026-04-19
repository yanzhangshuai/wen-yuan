# T07: Stage A+ Rule And Knowledge Recall

## Goal

Improve recall and stability with rules and verified knowledge while preserving review boundaries. Stage A+ produces claims or suggestions; it never writes final projections directly.

## Main Context

- Spec sections: §7.3, §9, §9.4, §9.5
- Upstream dependencies: T03, T04, T06, T17

## Files

- Create: `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/KnowledgeRecallStage.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/rule-recall.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/relation-normalization.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/*.test.ts`

## Do Not Do

- Do not let unverified knowledge become a hard constraint.
- Do not silently rewrite original relation labels.
- Do not write final projection rows.

## Execution Checkpoints

- [ ] Load eligible KB v2 entries by scope and review state.
- [ ] Implement recall rules for surnames, official titles, kinship references, verified aliases, negative aliases, merge-deny knowledge, and relation label normalization suggestions.
- [ ] Emit additional claims, suggestions, or conflict hints through the claim contract.
- [ ] Preserve original relation text while adding `relationTypeKey` suggestions and confidence.
- [ ] Treat `VERIFIED` knowledge as high-weight and `PENDING` knowledge as low-weight hints.
- [ ] Record Stage A+ run observability and cost-free/rule execution metrics.
- [ ] Add tests for verified alias recall, pending knowledge hinting, negative merge rule, relation normalization suggestion, and no-projection-write behavior.
- [ ] Add an execution record and mark T07 complete in the runbook only after validation passes.

## Validation

```bash
pnpm test src/server/modules/analysis/pipelines/evidence-review/stageAPlus
pnpm type-check
```

## Acceptance Criteria

- [ ] Stage A+ can write extra claims or suggestions without changing final projections.
- [ ] Negative knowledge is explicit.
- [ ] Relation normalization suggestions preserve raw labels.
- [ ] Stage B can consume the recall output.

## Stop Conditions

- Stop if T17 KB v2 is not complete.
- Stop if relation catalog assumptions require T18 before this task can be useful.
- Stop if existing rule packs conflict with the new review-native knowledge model.

## Execution Record

No execution recorded yet.

