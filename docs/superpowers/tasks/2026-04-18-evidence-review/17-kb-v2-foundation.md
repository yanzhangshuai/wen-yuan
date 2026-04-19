# T17: KB v2 Foundation

## Goal

Rebuild the knowledge base as a review-native KB v2 with unified knowledge objects, scope, review state, negative knowledge, versioning, and claim promotion.

## Main Context

- Spec sections: §9, §9.1, §9.2, §9.3, §9.4, §9.5, §13.1
- Upstream dependencies: T01
- Downstream dependency pressure: T07 and T18

## Files

- Create: `src/server/modules/knowledge-v2/**`
- Modify: `prisma/schema.prisma`
- Create: `src/server/modules/knowledge-v2/*.test.ts`

## Do Not Do

- Do not keep aliases, time rules, relation rules, and merge-deny rules as unrelated truth models.
- Do not let KB v2 write final projections directly.
- Do not treat knowledge as prompt-only configuration.

## Execution Checkpoints

- [ ] Inspect existing knowledge-base modules and identify old runtime/config split.
- [ ] Add or verify schema for unified knowledge objects with `scopeType`, `scopeId`, `knowledgeType`, `payload`, `source`, `reviewState`, `confidence`, `effectiveFrom`, `effectiveTo`, `promotedFromClaimId`, `supersedesKnowledgeId`, and `version`.
- [ ] Implement review states `PENDING`, `VERIFIED`, `REJECTED`, and `DISABLED` for knowledge.
- [ ] Implement scopes `GLOBAL`, `BOOK_TYPE`, `BOOK`, and `RUN`.
- [ ] Implement negative knowledge support for merge denial, relation denial, and time-normalization denial.
- [ ] Implement repository and loader APIs for runtime use.
- [ ] Implement claim promotion from reviewed claims into KB entries.
- [ ] Add tests for scope precedence, versioning, negative knowledge, review state filtering, and promotion.
- [ ] Run Prisma generation if schema changes.
- [ ] Add an execution record and mark T17 complete in the runbook only after validation passes.

## Validation

```bash
pnpm prisma:generate
pnpm test src/server/modules/knowledge-v2
pnpm type-check
```

## Acceptance Criteria

- [ ] KB v2 has one unified knowledge object and status model.
- [ ] Scope, version, invalidation, and source tracking are expressible.
- [ ] Negative knowledge is first-class.
- [ ] Stage A+ and relation type catalog can reuse KB v2.

## Stop Conditions

- Stop before destructive migration of old knowledge tables.
- Stop if knowledge object payload typing requires a cross-task schema decision.
- Stop if claim promotion requires T12 behavior that is not yet available; implement repository support and record deferred UI/API integration.

## Execution Record

No execution recorded yet.

