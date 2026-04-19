# T01: Evidence-first Schema And Review State Foundation

## Goal

Create the database and TypeScript contract foundation for evidence, claims, review state, audit logs, and rebuildable projections. This is the first code task and must keep old tables intact while establishing the new truth model.

## Main Context

- Spec sections: §4, §5, §6, §10, §11, §12
- Runbook: `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`
- Upstream dependency: T00 complete

## Files

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_evidence_review_schema_foundation/migration.sql`
- Create: `src/server/modules/review/evidence-review/review-state.ts`
- Create: `src/server/modules/review/evidence-review/review-state.test.ts`
- Create: `src/server/modules/analysis/claims/base-types.ts`

## Do Not Do

- Do not delete old `Profile`, `BiographyRecord`, or `Relationship` tables.
- Do not make `relationTypeKey` a database enum.
- Do not implement extraction pipelines in this task.
- Do not implement review UI in this task.

## Execution Checkpoints

- [x] Inspect existing Prisma models and enum naming conventions before editing.
- [x] Add schema models for `analysis_runs`, `analysis_stage_runs`, `llm_raw_outputs`, `chapter_segments`, `evidence_spans`, `entity_mentions`, `persona_candidates`, `alias_claims`, `event_claims`, `relation_claims`, `time_claims`, `identity_resolution_claims`, `conflict_flags`, `personas`, `persona_aliases`, `persona_chapter_facts`, `persona_time_facts`, `relationship_edges`, `timeline_events`, and `review_audit_logs`.
- [x] Add review status support for `PENDING`, `ACCEPTED`, `REJECTED`, `EDITED`, `DEFERRED`, and `CONFLICTED`.
- [x] Add source support for `AI`, `RULE`, `MANUAL`, and `IMPORTED`.
- [x] Model relation direction, relation source, conflict type, run status, and stage status as constrained enums where appropriate.
- [x] Keep `relationTypeKey` as a string field and preserve `relationLabel` plus `relationTypeSource`.
- [x] Ensure claim tables can record evidence references, source, run, review state, and supersede/derived-from relationships.
- [x] Ensure projection tables can be deleted and rebuilt from claims plus review state.
- [x] Implement `review-state.ts` with transition helpers and shared constants.
- [x] Implement `base-types.ts` with shared claim source/status/type definitions used by later tasks.
- [x] Write tests for allowed and rejected review state transitions.
- [x] Create and verify the migration.
- [x] Add an execution record and mark T01 complete in the runbook only after validation passes.

## Validation

```bash
pnpm prisma:generate
pnpm test src/server/modules/review/evidence-review/review-state.test.ts
pnpm type-check
```

Run `pnpm prisma:migrate` only if the local database is configured for migration execution. If it is not configured, validate the generated SQL and record the blocker.

## Acceptance Criteria

- [x] Prisma schema can generate a client.
- [x] Claim tables share review state and source semantics.
- [x] `relationTypeKey` is a string field.
- [x] Old truth tables are not extended into the new review truth path.
- [x] Review state helper tests pass.

## Stop Conditions

- Stop before any destructive migration.
- Stop if existing schema conventions conflict with the proposed model names in a way that requires a naming decision.
- Stop if Prisma generation fails due to unrelated existing schema errors.

## Execution Record

- Added additive evidence-first enums, schema tables, review-state helpers, claim base schemas, generated Prisma client updates, and non-destructive migration SQL.
- Validation:
  - `pnpm prisma format --schema prisma/schema.prisma`
  - `pnpm prisma validate --schema prisma/schema.prisma`
  - `pnpm prisma migrate diff --from-schema /tmp/evidence_review_schema_foundation_baseline.prisma --to-schema prisma/schema.prisma --script --output prisma/migrations/20260418120000_evidence_review_schema_foundation/migration.sql`
  - `rg -n "DROP TABLE|DROP COLUMN|DROP TYPE|ALTER TABLE .* RENAME|TRUNCATE" prisma/migrations/20260418120000_evidence_review_schema_foundation/migration.sql`
  - `pnpm prisma:generate`
  - `pnpm test src/server/modules/review/evidence-review/review-state.test.ts`
  - `pnpm test src/server/modules/analysis/claims/base-types.test.ts`
  - `pnpm type-check`
- Result: pass.
- Blockers: none.
- Notes: Prisma 7.4.2 removed `--to-schema-datamodel`, so migration SQL was generated with `--to-schema`; `from-migrations` also requires a shadow database URL, so this task used the HEAD schema as the baseline for the additive diff.
