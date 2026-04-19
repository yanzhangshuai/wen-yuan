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

- [ ] Read Stage A mentions, alias claims, and Stage A+ suggestions.
- [ ] Implement candidate clustering with confidence and evidence scoring.
- [ ] Generate `persona_candidates`.
- [ ] Generate `identity_resolution_claims`.
- [ ] Generate merge, split, and keep-separate suggestions.
- [ ] Model impersonation and misidentification as explicit identity claims or conflicts.
- [ ] Preserve low-confidence clusters as pending or conflicted review objects.
- [ ] Add tests for same person with multiple names, same name across different people, official-title ambiguity, kinship ambiguity, impersonation, and merge denial.
- [ ] Add an execution record and mark T08 complete in the runbook only after validation passes.

## Validation

```bash
pnpm test src/server/modules/analysis/pipelines/evidence-review/stageB
pnpm type-check
```

## Acceptance Criteria

- [ ] Full-book candidate clustering persists with mention traceability.
- [ ] Impersonation, misidentification, and merge denial are explicit.
- [ ] Merge and split suggestions do not create final personas.
- [ ] Stage C and review APIs can consume resolution outputs.

## Stop Conditions

- Stop if mention records do not contain enough evidence to cluster safely.
- Stop if user input is needed for a canonical labeling policy.
- Stop if KB v2 negative knowledge is absent but required for merge denial behavior.

## Execution Record

No execution recorded yet.

