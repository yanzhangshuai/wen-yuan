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

- [ ] Define Stage A prompt and JSON response contract for mentions, events, relations, and time hints.
- [ ] Ensure the prompt explicitly requires evidence text and conservative uncertainty handling.
- [ ] Implement response parsing and schema validation.
- [ ] Convert valid model outputs into T03 claim DTOs.
- [ ] Reject or discard outputs that lack valid evidence spans and record discard reasons.
- [ ] Persist raw prompts, raw responses, parse errors, and schema errors through T04 raw output retention.
- [ ] Implement chapter-level idempotent rerun.
- [ ] Add tests for normal extraction, empty extraction, invalid JSON, missing evidence, custom relation label, and rerun idempotency.
- [ ] Add an execution record and mark T06 complete in the runbook only after validation passes.

## Validation

```bash
pnpm test src/server/modules/analysis/pipelines/evidence-review/stageA
pnpm type-check
```

## Acceptance Criteria

- [ ] A single chapter can produce mention, event, relation, and time claims.
- [ ] Outputs without evidence spans are not persisted as claims.
- [ ] Chapter reruns do not duplicate claims.
- [ ] Raw output and discard reasons are traceable.

## Stop Conditions

- Stop if the AI provider abstraction cannot support structured output or equivalent validation.
- Stop if Stage 0 segments are unavailable for the target chapter.
- Stop if prompt design requires a product decision about extraction recall versus precision.

## Execution Record

No execution recorded yet.

