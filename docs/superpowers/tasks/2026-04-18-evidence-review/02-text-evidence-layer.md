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

- [x] Inspect current chapter/text storage models and helpers.
- [x] Define the offset contract: original text offsets are authoritative, normalized text is auxiliary.
- [x] Implement helpers for creating offset maps between raw text and normalized text.
- [x] Implement evidence span validation for invalid, reversed, out-of-range, and cross-segment spans.
- [x] Implement quote reconstruction from `chapterId`, `startOffset`, and `endOffset`.
- [x] Implement evidence span persistence helpers for single write, batch write, idempotent write, and lookup by chapter/segment/run.
- [x] Implement review-facing helpers for highlighted quote context and evidence jump metadata.
- [x] Export a stable evidence module API through `index.ts`.
- [x] Add tests for Chinese text, punctuation, line breaks, normalized lookup, invalid spans, and idempotent writes.
- [x] Add an execution record and mark T02 complete in the runbook only after validation passes.

## Validation

```bash
pnpm test src/server/modules/analysis/evidence
pnpm type-check
```

## Acceptance Criteria

- [x] Any evidence span can return the quoted original text.
- [x] Original highlighting and normalized search do not contaminate each other.
- [x] Stage A/C and review APIs can reuse a single evidence contract.
- [x] Chinese punctuation and line-break offset tests pass.

## Stop Conditions

- Stop if the current chapter storage does not expose stable raw text.
- Stop if offset semantics cannot be implemented without changing T01 schema.
- Stop if test fixtures require copyrighted full-text material not already present in the repository.

## Execution Record

- Status: Completed
- Branch: `dev_2`
- Completed after T01 schema and state foundation.
- Implemented original-text-first offset maps, evidence span validation, quote reconstruction, evidence jump metadata, and evidence span persistence helpers.
- Validation:
  - `pnpm test src/server/modules/analysis/evidence`
  - `pnpm type-check`
- Commits:
  - `2c37e02` `feat: add evidence offset map helpers`
  - `8a466a1` `feat: validate evidence spans`
  - `4e0e917` `feat: reconstruct evidence quotes`
  - `87b1c07` `feat: add evidence span persistence helpers`
  - `dd8157d` `feat: expose evidence module api`
  - `79f3fed` `fix: narrow evidence persistence helper client types`
- Follow-up risks: idempotent single-span writes use a natural-key read-before-create because T01 did not add a unique constraint for evidence spans. Keep later claim writes tolerant of duplicate historical spans until a schema-level unique key is explicitly approved.
