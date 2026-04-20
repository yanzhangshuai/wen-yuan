# T08: Stage B Full-Book Identity Resolution

## Goal

Cluster chapter-level mentions and alias candidates into full-book `persona_candidates`, while explicitly modeling same-person aliases, same-name different people, impersonation, misidentification, and merge denial.

## Main Context

- Spec sections: §5.2, §7.4, §8.1, §9
- Upstream dependencies: T03, T06, T07

## Files

- Create: `src/server/modules/analysis/pipelines/evidence-review/stageB/IdentityResolver.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageB/candidate-clustering.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageB/alias-conflicts.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageB/*.test.ts`

## Do Not Do

- Do not create final `personas`.
- Do not flatten impersonation or misidentification into ordinary aliases.
- Do not silently merge low-confidence candidates.

## Execution Checkpoints

- [x] Read Stage A mentions, alias claims, and Stage A+ suggestions.
- [x] Implement candidate clustering with confidence and evidence scoring.
- [x] Generate `persona_candidates`.
- [x] Generate `identity_resolution_claims`.
- [x] Generate merge, split, and keep-separate suggestions.
- [x] Model impersonation and misidentification as explicit identity claims or conflicts.
- [x] Preserve low-confidence clusters as pending or conflicted review objects.
- [x] Add tests for same person with multiple names, same name across different people, official-title ambiguity, kinship ambiguity, impersonation, and merge denial.
- [x] Add an execution record and mark T08 complete in the runbook only after validation passes.

## Validation

```bash
pnpm test src/server/modules/analysis/pipelines/evidence-review/stageB
pnpm type-check
```

## Acceptance Criteria

- [x] Full-book candidate clustering persists with mention traceability.
- [x] Impersonation, misidentification, and merge denial are explicit.
- [x] Merge and split suggestions do not create final personas.
- [x] Stage C and review APIs can consume resolution outputs.

## Stop Conditions

- Stop if mention records do not contain enough evidence to cluster safely.
- Stop if user input is needed for a canonical labeling policy.
- Stop if KB v2 negative knowledge is absent but required for merge denial behavior.

## Execution Record

Completed on 2026-04-20.

- Implemented `stageB/types.ts`, `alias-conflicts.ts`, `repository.ts`, `candidate-clustering.ts`, `resolution-drafts.ts`, `persister.ts`, `IdentityResolver.ts`, and `stageB/index.ts` with matching unit tests.
- Stage B now reads whole-book Stage A mentions plus Stage A+ alias hints, clusters them conservatively into `persona_candidates`, and writes chapter-traceable `IDENTITY_RESOLUTION` claims without creating final `personas`.
- Explicit negative alias rules, impersonation, misidentification, conflicting canonical hints, and title-only ambiguity remain surfaced as split/unsure review outputs instead of being flattened into merge signals.
- Validation completed with:
  - `pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stageB --coverage=false`
  - `pnpm exec tsc --noEmit --pretty false --incremental false`
  - `pnpm exec eslint src/server/modules/analysis/pipelines/evidence-review/stageB/IdentityResolver.ts src/server/modules/analysis/pipelines/evidence-review/stageB/IdentityResolver.test.ts src/server/modules/analysis/pipelines/evidence-review/stageB/index.ts`
