# T18: Relation Types Catalog

## Goal

Create a governance layer for relation type string keys, display labels, synonyms, scope, recommended direction, presets, enabled state, and custom relation promotion.

## Main Context

- Spec sections: §5.2, §7.3, §8.3, §9.4, §9.5, §9.6, §13.2
- Upstream dependencies: T17
- Downstream dependencies: T07, T14, T21

## Files

- Create: `src/server/modules/knowledge-v2/relation-types/**`
- Modify: `prisma/schema.prisma`
- Create: `src/server/modules/knowledge-v2/relation-types/*.test.ts`

## Do Not Do

- Do not convert `relationTypeKey` to a database enum.
- Do not require a migration to add a business relation type.
- Do not silently rewrite `relationLabel`.

## Execution Checkpoints

- [x] Define relation type catalog storage using KB v2 or a dedicated relation type table aligned with KB v2 scope/version rules.
- [x] Implement fields for key, default label, synonyms, scope, recommended direction, system preset flag, enabled flag, and review state.
- [x] Seed common relation presets as code/data seeds.
- [x] Implement custom relation preservation: custom relations can be saved as claims before catalog promotion.
- [x] Implement promotion flow from frequent/stable custom relation to `BOOK` or `BOOK_TYPE` catalog entry.
- [x] Implement synonym lookup and normalization suggestions without rewriting original labels.
- [x] Provide runtime APIs for Stage A+, review API, and relation editor.
- [x] Add tests for string key validation, preset lookup, custom relation, promotion, synonym mapping, disabled types, and no enum migration requirement.
- [x] Run Prisma generation if schema changes.
- [x] Add an execution record and mark T18 complete in the runbook only after validation passes.

## Validation

```bash
pnpm prisma:generate
pnpm test src/server/modules/knowledge-v2/relation-types
pnpm type-check
```

## Acceptance Criteria

- [x] String `relationTypeKey` and catalog governance coexist.
- [x] Preset, custom, and promoted relation flows are clear.
- [x] Synonyms and direction suggestions are reusable.
- [x] New relation types do not require database enum migrations.

## Stop Conditions

- Stop if T17 KB v2 scope model cannot support relation catalog needs.
- Stop if preset list requires product approval before seeding.
- Stop if relation direction semantics conflict with relation claim schema.

## Execution Record

### T18 Completion - 2026-04-20

- Changed files: `src/server/modules/knowledge-v2/relation-types/**`, `src/server/modules/knowledge-v2/index.ts`, `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/relation-normalization.ts`, `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/relation-normalization.test.ts`, `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/KnowledgeRecallStage.ts`, `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/KnowledgeRecallStage.test.ts`
- Validation commands: `pnpm exec vitest run src/server/modules/knowledge-v2/relation-types/contracts.test.ts src/server/modules/knowledge-v2/relation-types/preset-registry.test.ts src/server/modules/knowledge-v2/relation-types/catalog.test.ts src/server/modules/knowledge-v2/relation-types/loader.test.ts src/server/modules/knowledge-v2/relation-types/promotion.test.ts src/server/modules/analysis/pipelines/evidence-review/stageAPlus/relation-normalization.test.ts src/server/modules/analysis/pipelines/evidence-review/stageAPlus/KnowledgeRecallStage.test.ts --coverage=false`, `pnpm type-check`, `git diff --exit-code -- prisma/schema.prisma prisma/migrations`
- Result: implemented KB v2 backed relation-type governance with open-string `relationTypeKey`, preset registry, catalog compilation, review-aware loader, reviewed custom relation promotion, and Stage A+ relation normalization wired to the compiled catalog instead of raw relation rule arrays.
- Follow-up risks: review APIs and relation editor CRUD/UI still land in T12/T14; historical relation claims continue to keep raw labels and still need review-side governance before projection.
- Next task: T08 `docs/superpowers/tasks/2026-04-18-evidence-review/08-stage-b-identity-resolution.md`
