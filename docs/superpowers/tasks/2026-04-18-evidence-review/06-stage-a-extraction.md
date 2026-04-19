# T06: Stage A Per-Chapter Evidence Extraction

## Goal

Extract entity mentions, event claims, relation claims, and time claims from individual chapters conservatively, with evidence spans and raw model output retained.

## Main Context

- Spec sections: §5.2, §7.2, §10
- Upstream dependencies: T02, T03, T04, T05

## Files

- Create: `src/server/modules/analysis/pipelines/evidence-review/stageA/StageAExtractionPipeline.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageA/prompt-contracts.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageA/claim-normalizer.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageA/*.test.ts`

## Do Not Do

- Do not create final `personas`.
- Do not force identity resolution inside Stage A.
- Do not persist model outputs that cannot be mapped to evidence spans.

## Execution Checkpoints

- [x] Define Stage A prompt and JSON response contract for mentions, events, relations, and time hints.
- [x] Ensure the prompt explicitly requires evidence text and conservative uncertainty handling.
- [x] Implement response parsing and schema validation.
- [x] Convert valid model outputs into T03 claim DTOs.
- [x] Reject or discard outputs that lack valid evidence spans and record discard reasons.
- [x] Persist raw prompts, raw responses, parse errors, and schema errors through T04 raw output retention.
- [x] Implement chapter-level idempotent rerun.
- [x] Add tests for normal extraction, empty extraction, invalid JSON, missing evidence, custom relation label, and rerun idempotency.
- [x] Add an execution record and mark T06 complete in the runbook only after validation passes.

## Validation

```bash
pnpm test src/server/modules/analysis/pipelines/evidence-review/stageA
pnpm type-check
```

## Acceptance Criteria

- [x] A single chapter can produce mention, event, relation, and time claims.
- [x] Outputs without evidence spans are not persisted as claims.
- [x] Chapter reruns do not duplicate claims.
- [x] Raw output and discard reasons are traceable.

## Stop Conditions

- Stop if the AI provider abstraction cannot support structured output or equivalent validation.
- Stop if Stage 0 segments are unavailable for the target chapter.
- Stop if prompt design requires a product decision about extraction recall versus precision.

## Execution Record

### T06 Completion - 2026-04-19

- Changed files: `src/server/modules/analysis/pipelines/evidence-review/stage0/repository.ts`, `src/server/modules/analysis/pipelines/evidence-review/stage0/persisted-reader.test.ts`, `src/server/modules/analysis/pipelines/evidence-review/stageA/types.ts`, `src/server/modules/analysis/pipelines/evidence-review/stageA/types.test.ts`, `src/server/modules/analysis/pipelines/evidence-review/stageA/prompt-contracts.ts`, `src/server/modules/analysis/pipelines/evidence-review/stageA/prompt-contracts.test.ts`, `src/server/modules/analysis/pipelines/evidence-review/stageA/claim-normalizer.ts`, `src/server/modules/analysis/pipelines/evidence-review/stageA/claim-normalizer.test.ts`, `src/server/modules/analysis/pipelines/evidence-review/stageA/claim-persister.ts`, `src/server/modules/analysis/pipelines/evidence-review/stageA/claim-persister.test.ts`, `src/server/modules/analysis/pipelines/evidence-review/stageA/StageAExtractionPipeline.ts`, `src/server/modules/analysis/pipelines/evidence-review/stageA/StageAExtractionPipeline.test.ts`, `src/server/modules/analysis/pipelines/evidence-review/stageA/index.ts`
- Validation commands: `pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stage0/persisted-reader.test.ts src/server/modules/analysis/pipelines/evidence-review/stageA/types.test.ts src/server/modules/analysis/pipelines/evidence-review/stageA/prompt-contracts.test.ts src/server/modules/analysis/pipelines/evidence-review/stageA/claim-normalizer.test.ts src/server/modules/analysis/pipelines/evidence-review/stageA/claim-persister.test.ts src/server/modules/analysis/pipelines/evidence-review/stageA/StageAExtractionPipeline.test.ts --coverage=false`, `pnpm exec eslint src/server/modules/analysis/pipelines/evidence-review/stageA/StageAExtractionPipeline.ts src/server/modules/analysis/pipelines/evidence-review/stageA/StageAExtractionPipeline.test.ts src/server/modules/analysis/pipelines/evidence-review/stageA/index.ts`, `pnpm type-check`
- Result: Stage A chapter extraction now consumes persisted `chapter_segments`, maps evidence locally from `segmentIndex + quotedText`, persists rerun-safe claim families, and keeps parse/schema/discard traces in raw output records for review.
- Follow-up risks: Stage A+ recall and relation catalog governance are still pending T07/T18; long-chapter token pressure is still handled by one-chapter prompts until T19 cost-control work lands.
- Next task: T07 `docs/superpowers/tasks/2026-04-18-evidence-review/07-stage-a-plus-knowledge-recall.md`
