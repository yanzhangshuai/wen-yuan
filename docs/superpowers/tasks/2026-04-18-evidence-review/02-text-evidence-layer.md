# T02: Text And Evidence Layer

## Goal

Build the shared text, offset, segment, and evidence span infrastructure so every claim, review action, and projection can return to original chapter text.

## Main Context

- Spec sections: §4, §5.1, §7.1, §8, §15
- Upstream dependencies: T01 schema and review state foundation

## Files

- Create: `src/server/modules/analysis/evidence/offset-map.ts`
- Create: `src/server/modules/analysis/evidence/evidence-spans.ts`
- Create: `src/server/modules/analysis/evidence/quote-reconstruction.ts`
- Create: `src/server/modules/analysis/evidence/index.ts`
- Create: `src/server/modules/analysis/evidence/*.test.ts`

## Do Not Do

- Do not create claim extraction logic in this task.
- Do not let normalized text replace original offset anchoring.
- Do not implement UI-specific quote logic outside the evidence module.

## Execution Checkpoints

- [ ] Inspect current chapter/text storage models and helpers.
- [ ] Define the offset contract: original text offsets are authoritative, normalized text is auxiliary.
- [ ] Implement helpers for creating offset maps between raw text and normalized text.
- [ ] Implement evidence span validation for invalid, reversed, out-of-range, and cross-segment spans.
- [ ] Implement quote reconstruction from `chapterId`, `startOffset`, and `endOffset`.
- [ ] Implement evidence span persistence helpers for single write, batch write, idempotent write, and lookup by chapter/segment/run.
- [ ] Implement review-facing helpers for highlighted quote context and evidence jump metadata.
- [ ] Export a stable evidence module API through `index.ts`.
- [ ] Add tests for Chinese text, punctuation, line breaks, normalized lookup, invalid spans, and idempotent writes.
- [ ] Add an execution record and mark T02 complete in the runbook only after validation passes.

## Validation

```bash
pnpm test src/server/modules/analysis/evidence
pnpm type-check
```

## Acceptance Criteria

- [ ] Any evidence span can return the quoted original text.
- [ ] Original highlighting and normalized search do not contaminate each other.
- [ ] Stage A/C and review APIs can reuse a single evidence contract.
- [ ] Chinese punctuation and line-break offset tests pass.

## Stop Conditions

- Stop if the current chapter storage does not expose stable raw text.
- Stop if offset semantics cannot be implemented without changing T01 schema.
- Stop if test fixtures require copyrighted full-text material not already present in the repository.

## Execution Record

No execution recorded yet.

