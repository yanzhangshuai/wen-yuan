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

- [ ] Define relation type catalog storage using KB v2 or a dedicated relation type table aligned with KB v2 scope/version rules.
- [ ] Implement fields for key, default label, synonyms, scope, recommended direction, system preset flag, enabled flag, and review state.
- [ ] Seed common relation presets as code/data seeds.
- [ ] Implement custom relation preservation: custom relations can be saved as claims before catalog promotion.
- [ ] Implement promotion flow from frequent/stable custom relation to `BOOK` or `BOOK_TYPE` catalog entry.
- [ ] Implement synonym lookup and normalization suggestions without rewriting original labels.
- [ ] Provide runtime APIs for Stage A+, review API, and relation editor.
- [ ] Add tests for string key validation, preset lookup, custom relation, promotion, synonym mapping, disabled types, and no enum migration requirement.
- [ ] Run Prisma generation if schema changes.
- [ ] Add an execution record and mark T18 complete in the runbook only after validation passes.

## Validation

```bash
pnpm prisma:generate
pnpm test src/server/modules/knowledge-v2/relation-types
pnpm type-check
```

## Acceptance Criteria

- [ ] String `relationTypeKey` and catalog governance coexist.
- [ ] Preset, custom, and promoted relation flows are clear.
- [ ] Synonyms and direction suggestions are reusable.
- [ ] New relation types do not require database enum migrations.

## Stop Conditions

- Stop if T17 KB v2 scope model cannot support relation catalog needs.
- Stop if preset list requires product approval before seeding.
- Stop if relation direction semantics conflict with relation claim schema.

## Execution Record

No execution recorded yet.

