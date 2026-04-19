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

- [ ] Inspect current chapter import and storage format.
- [ ] Define Stage 0 input and output types.
- [ ] Implement deterministic segment rules for `TITLE`, `NARRATIVE`, `DIALOGUE_LEAD`, `DIALOGUE_CONTENT`, `POEM`, `COMMENTARY`, and `UNKNOWN`.
- [ ] Persist `chapter_segments` with segment index, raw offsets, raw text, normalized text, and confidence.
- [ ] Use the T02 evidence/offset contract for quote and offset validation.
- [ ] Add low-confidence marking for unstable segmentation.
- [ ] Add support for whole-book run and chapter-level rerun.
- [ ] Record Stage 0 execution through T04 run observability.
- [ ] Add tests for narrative, dialogue, poem, commentary, unknown, low-confidence, and rerun cases.
- [ ] Add an execution record and mark T05 complete in the runbook only after validation passes.

## Validation

```bash
pnpm test src/server/modules/analysis/pipelines/evidence-review/stage0
pnpm type-check
```

## Acceptance Criteria

- [ ] Chapters can be segmented and written to `chapter_segments`.
- [ ] Segments compose with evidence spans for source jumps.
- [ ] Low-confidence chapters are explicit.
- [ ] Stage A can consume Stage 0 output directly.

## Stop Conditions

- Stop if chapter text does not preserve enough raw structure for offset anchoring.
- Stop if the segmentation requires model calls; Stage 0 should start deterministic unless the spec is revised.
- Stop if existing import code must be replaced before segmentation can run.

## Execution Record

No execution recorded yet.

