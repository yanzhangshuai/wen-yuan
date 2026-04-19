# T03: Claim Storage Contracts

## Goal

Define claim DTOs, schema validation, idempotent writes, manual override rules, and relation key contracts shared by Stage A/A+/B/B.5/C and review APIs.

## Main Context

- Spec sections: §5.2, §6, §7, §8.3, §9.6
- Upstream dependencies: T01, T02

## Files

- Create: `src/server/modules/analysis/claims/claim-schemas.ts`
- Create: `src/server/modules/analysis/claims/claim-repository.ts`
- Create: `src/server/modules/analysis/claims/claim-write-service.ts`
- Create: `src/server/modules/analysis/claims/manual-override.ts`
- Create: `src/server/modules/analysis/claims/*.test.ts`

## Do Not Do

- Do not let services write claim tables directly without this contract.
- Do not allow claims without evidence spans.
- Do not overwrite AI claims during manual edits.

## Execution Checkpoints

- [ ] Define shared claim base fields: book, chapter, run, source, confidence, review state, evidence span references, and derivation/supersede references.
- [ ] Define schemas for `entity_mentions`, `alias_claims`, `event_claims`, `relation_claims`, `time_claims`, `identity_resolution_claims`, and `conflict_flags`.
- [ ] Enforce the rule that one claim expresses one atomic fact.
- [ ] Enforce evidence requirements for AI, RULE, and IMPORTED claims.
- [ ] Define the manual claim path for user-created or user-edited facts.
- [ ] Implement idempotent writes scoped by run, stage, chapter, and claim family.
- [ ] Implement relation key validation: string `relationTypeKey`, display `relationLabel`, explicit `relationTypeSource`.
- [ ] Implement tests for valid writes, missing evidence rejection, idempotent rerun replacement, manual override, and custom relation keys.
- [ ] Add an execution record and mark T03 complete in the runbook only after validation passes.

## Validation

```bash
pnpm test src/server/modules/analysis/claims
pnpm type-check
```

## Acceptance Criteria

- [ ] All claim families can be validated and written through one contract layer.
- [ ] Idempotent reruns do not create duplicate claims.
- [ ] Manual claims and AI claims can coexist with preserved lineage.
- [ ] Relation type key, label, and source semantics are explicit.

## Stop Conditions

- Stop if T01 schema does not support a required claim lineage field.
- Stop if evidence binding cannot use the T02 contract.
- Stop if existing modules already define incompatible claim DTOs that need a broader migration decision.

## Execution Record

No execution recorded yet.

