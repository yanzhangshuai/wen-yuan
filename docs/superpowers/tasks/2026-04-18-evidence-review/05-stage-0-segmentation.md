# T05: Stage 0 Text Normalization And Chapter Segmentation

## Goal

Implement Stage 0: normalize chapter text, split narrative segments, build offsets, and label narrative regions for later claim extraction.

## Main Context

- Spec sections: §5.1, §7.1, §8, §15
- Upstream dependencies: T01, T02, T04

## Files

- Create: `src/server/modules/analysis/pipelines/evidence-review/stage0/Stage0Segmenter.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stage0/segment-rules.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stage0/types.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stage0/*.test.ts`

## Do Not Do

- Do not create personas.
- Do not write final graph or projection objects.
- Do not silently accept segments that cannot map back to raw offsets.

## Execution Checkpoints

- [x] Inspect current chapter import and storage format.
- [x] Define Stage 0 input and output types.
- [x] Implement deterministic segment rules for `TITLE`, `NARRATIVE`, `DIALOGUE_LEAD`, `DIALOGUE_CONTENT`, `POEM`, `COMMENTARY`, and `UNKNOWN`.
- [x] Persist `chapter_segments` with segment index, raw offsets, raw text, normalized text, and confidence.
- [x] Use the T02 evidence/offset contract for quote and offset validation.
- [x] Add low-confidence marking for unstable segmentation.
- [x] Add support for whole-book run and chapter-level rerun.
- [x] Record Stage 0 execution through T04 run observability.
- [x] Add tests for narrative, dialogue, poem, commentary, unknown, low-confidence, and rerun cases.
- [x] Add an execution record and mark T05 complete in the runbook only after validation passes.

## Validation

```bash
pnpm test src/server/modules/analysis/pipelines/evidence-review/stage0
pnpm type-check
```

## Acceptance Criteria

- [x] Chapters can be segmented and written to `chapter_segments`.
- [x] Segments compose with evidence spans for source jumps.
- [x] Low-confidence chapters are explicit.
- [x] Stage A can consume Stage 0 output directly.

## Stop Conditions

- Stop if chapter text does not preserve enough raw structure for offset anchoring.
- Stop if the segmentation requires model calls; Stage 0 should start deterministic unless the spec is revised.
- Stop if existing import code must be replaced before segmentation can run.

## Execution Record

### T05 Completion - 2026-04-19

- Changed files: `prisma/schema.prisma`, `prisma/migrations/20260419210000_stage0_chapter_segment_confidence/migration.sql`, `src/generated/prisma/**`, `src/server/modules/analysis/pipelines/evidence-review/stage0/types.ts`, `src/server/modules/analysis/pipelines/evidence-review/stage0/types.test.ts`, `src/server/modules/analysis/pipelines/evidence-review/stage0/segment-rules.ts`, `src/server/modules/analysis/pipelines/evidence-review/stage0/segment-rules.test.ts`, `src/server/modules/analysis/pipelines/evidence-review/stage0/repository.ts`, `src/server/modules/analysis/pipelines/evidence-review/stage0/repository.test.ts`, `src/server/modules/analysis/pipelines/evidence-review/stage0/Stage0Segmenter.ts`, `src/server/modules/analysis/pipelines/evidence-review/stage0/Stage0Segmenter.test.ts`, `src/server/modules/analysis/pipelines/evidence-review/stage0/index.ts`
- Validation commands: `pnpm prisma format --schema prisma/schema.prisma`, `pnpm prisma validate --schema prisma/schema.prisma`, `pnpm prisma:generate`, `pnpm test src/server/modules/analysis/pipelines/evidence-review/stage0` (19 Stage 0 assertions passed, command failed on global coverage thresholds), `pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stage0 --coverage=false`, `pnpm type-check`
- Result: Stage 0 writes deterministic, offset-safe chapter segments with numeric confidence and T04 stage-run observability.
- Follow-up risks: rules are deliberately conservative; T06 must treat `UNKNOWN` and low chapter confidence as extraction risk signals rather than trying to repair segmentation silently.
- Next task: T06 `docs/superpowers/tasks/2026-04-18-evidence-review/06-stage-a-extraction.md`
