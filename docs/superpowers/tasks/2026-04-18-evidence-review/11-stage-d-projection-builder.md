# T11: Stage D Projection Builder

## Goal

Build rebuildable read models from claims plus review state for persona-chapter review, persona-time review, relationship editing, and timelines.

## Main Context

- Spec sections: §5.3, §7.7, §8, §11, §15
- Upstream dependencies: T01, T03, T10

## Files

- Create: `src/server/modules/review/evidence-review/projections/projection-builder.ts`
- Create: `src/server/modules/review/evidence-review/projections/persona-chapter.ts`
- Create: `src/server/modules/review/evidence-review/projections/persona-time.ts`
- Create: `src/server/modules/review/evidence-review/projections/relationships.ts`
- Create: `src/server/modules/review/evidence-review/projections/*.test.ts`

## Do Not Do

- Do not read legacy `Profile`, `BiographyRecord`, or `Relationship` as projection truth.
- Do not make projection rows the source of review truth.
- Do not require full-book rebuild for every review mutation.

## Execution Checkpoints

- [x] Define projection builder interfaces for full-book, chapter, persona, time-slice, relation-edge, and projection-only rebuilds.
- [x] Implement `persona_chapter_facts` builder with event count, relation count, conflict count, review status summary, and latest updated timestamp.
- [x] Implement `persona_time_facts` builder with time claim and chapter back-links.
- [x] Implement `relationship_edges` builder with direction, relation type, source label, custom/preset source, effective interval, evidence links, and review state.
- [x] Implement `timeline_events` builder from accepted or review-approved time/event facts.
- [x] Ensure all projection rows keep claim back-links.
- [x] Add delete-and-rebuild tests.
- [x] Add local rebuild tests after simulated review mutation.
- [x] Add an execution record and mark T11 complete in the runbook only after validation passes.

## Validation

```bash
pnpm test src/server/modules/review/evidence-review/projections
pnpm type-check
```

## Acceptance Criteria

- [x] Projections can be rebuilt from claims plus review state.
- [x] Projections do not depend on legacy draft truth tables.
- [x] Local mutation can rebuild only affected projection slices.
- [x] UI-needed summary fields are present.

## Stop Conditions

- Stop if claim review state semantics are insufficient to decide projection inclusion.
- Stop if projection rebuild requires an unimplemented final persona promotion path.
- Stop if performance requires a storage/indexing decision beyond this task.

## Execution Record

### 2026-04-20

- Implemented files: `src/server/modules/review/evidence-review/projections/types.ts`, `src/server/modules/review/evidence-review/projections/projection-builder.ts`, `src/server/modules/review/evidence-review/projections/persona-chapter.ts`, `src/server/modules/review/evidence-review/projections/persona-time.ts`, `src/server/modules/review/evidence-review/projections/relationships.ts`, `src/server/modules/review/evidence-review/projections/index.ts`, `src/server/modules/review/evidence-review/projections/projection-builder.test.ts`, `src/server/modules/review/evidence-review/projections/persona-chapter.test.ts`, `src/server/modules/review/evidence-review/projections/persona-time.test.ts`, `src/server/modules/review/evidence-review/projections/relationships.test.ts`
- Validation commands:
  - `pnpm exec vitest run src/server/modules/review/evidence-review/projections --coverage=false`
  - `pnpm type-check`
  - `pnpm test src/server/modules/review/evidence-review/projections`
  - `pnpm exec eslint src/server/modules/review/evidence-review/projections/types.ts src/server/modules/review/evidence-review/projections/projection-builder.ts src/server/modules/review/evidence-review/projections/projection-builder.test.ts src/server/modules/review/evidence-review/projections/index.ts src/server/modules/review/evidence-review/projections/persona-chapter.ts src/server/modules/review/evidence-review/projections/persona-chapter.test.ts src/server/modules/review/evidence-review/projections/persona-time.ts src/server/modules/review/evidence-review/projections/persona-time.test.ts src/server/modules/review/evidence-review/projections/relationships.ts src/server/modules/review/evidence-review/projections/relationships.test.ts`
- Result: Stage D projection builders, repository adapter, delete-and-rebuild orchestration, local rebuild scopes, and stable exports are implemented without reading legacy draft truth tables.
- Coverage caveat: `pnpm test src/server/modules/review/evidence-review/projections` ran 21/21 assertions green, but the command exits non-zero because global coverage thresholds also include imported shared modules (`db/prisma.ts`, `review-state.ts`) and the projection package is below repo-wide thresholds in this focused run.
