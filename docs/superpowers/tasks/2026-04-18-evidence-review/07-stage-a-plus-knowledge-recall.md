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

- [x] Load eligible KB v2 entries by scope and review state.
- [x] Implement recall rules for surnames, official titles, kinship references, verified aliases, negative aliases, merge-deny knowledge, and relation label normalization suggestions.
- [x] Emit additional claims, suggestions, or conflict hints through the claim contract.
- [x] Preserve original relation text while adding `relationTypeKey` suggestions and confidence.
- [x] Treat `VERIFIED` knowledge as high-weight and `PENDING` knowledge as low-weight hints.
- [x] Record Stage A+ run observability and cost-free/rule execution metrics.
- [x] Add tests for verified alias recall, pending knowledge hinting, negative merge rule, relation normalization suggestion, and no-projection-write behavior.
- [x] Add an execution record and mark T07 complete in the runbook only after validation passes.

## Validation

```bash
pnpm test src/server/modules/analysis/pipelines/evidence-review/stageAPlus
pnpm type-check
```

## Acceptance Criteria

- [x] Stage A+ can write extra claims or suggestions without changing final projections.
- [x] Negative knowledge is explicit.
- [x] Relation normalization suggestions preserve raw labels.
- [x] Stage B can consume the recall output.

## Stop Conditions

- Stop if T17 KB v2 is not complete.
- Stop if relation catalog assumptions require T18 before this task can be useful.
- Stop if existing rule packs conflict with the new review-native knowledge model.

## Execution Record

### T07 Completion - 2026-04-20

- Changed files: `src/server/modules/analysis/claims/claim-repository.ts`, `src/server/modules/analysis/claims/claim-repository.test.ts`, `src/server/modules/analysis/claims/claim-write-service.test.ts`, `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/**`
- Validation commands: `pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stageAPlus --coverage=false`, `pnpm exec vitest run src/server/modules/analysis/claims/claim-repository.test.ts src/server/modules/analysis/claims/claim-write-service.test.ts --coverage=false`, `pnpm type-check`, `pnpm exec eslint src/server/modules/analysis/pipelines/evidence-review/stageAPlus src/server/modules/analysis/claims/claim-repository.ts`
- Result: Stage A+ now loads scoped KB v2 with `INCLUDE_PENDING`, compiles verified and pending rule knowledge, writes review-native `RULE` mention/alias/derived-relation claims through T03 contracts, records cost-free rule execution in T04 observability tables, and does not write final projections.
- Follow-up risks: T18 still owns relation catalog governance and relation type management; T19 still owns skip/rerun policy; T08 still needs to consume Stage A+ mention and alias hints during identity resolution.
- Next task: T18 `docs/superpowers/tasks/2026-04-18-evidence-review/18-relation-types-catalog.md`
