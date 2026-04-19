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

- [x] Inspect existing knowledge-base modules and identify old runtime/config split.
- [x] Add or verify schema for unified knowledge objects with `scopeType`, `scopeId`, `knowledgeType`, `payload`, `source`, `reviewState`, `confidence`, `effectiveFrom`, `effectiveTo`, `promotedFromClaimId`, `supersedesKnowledgeId`, and `version`.
- [x] Implement review states `PENDING`, `VERIFIED`, `REJECTED`, and `DISABLED` for knowledge.
- [x] Implement scopes `GLOBAL`, `BOOK_TYPE`, `BOOK`, and `RUN`.
- [x] Implement negative knowledge support for merge denial, relation denial, and time-normalization denial.
- [x] Implement repository and loader APIs for runtime use.
- [x] Implement claim promotion from reviewed claims into KB entries.
- [x] Add tests for scope precedence, versioning, negative knowledge, review state filtering, and promotion.
- [x] Run Prisma generation if schema changes.
- [x] Add an execution record and mark T17 complete in the runbook only after validation passes.

## Validation

```bash
pnpm prisma:generate
pnpm test src/server/modules/knowledge-v2
pnpm type-check
```

## Acceptance Criteria

- [x] KB v2 has one unified knowledge object and status model.
- [x] Scope, version, invalidation, and source tracking are expressible.
- [x] Negative knowledge is first-class.
- [x] Stage A+ and relation type catalog can reuse KB v2.

## Stop Conditions

- Stop before destructive migration of old knowledge tables.
- Stop if knowledge object payload typing requires a cross-task schema decision.
- Stop if claim promotion requires T12 behavior that is not yet available; implement repository support and record deferred UI/API integration.

## Execution Record

### 2026-04-19

- Changed files: `prisma/schema.prisma`, `prisma/migrations/20260419183000_knowledge_v2_foundation/migration.sql`, `src/generated/prisma/**`, `src/server/modules/knowledge-v2/base-types.ts`, `src/server/modules/knowledge-v2/base-types.test.ts`, `src/server/modules/knowledge-v2/payload-schemas.ts`, `src/server/modules/knowledge-v2/payload-schemas.test.ts`, `src/server/modules/knowledge-v2/repository.ts`, `src/server/modules/knowledge-v2/repository.test.ts`, `src/server/modules/knowledge-v2/runtime-loader.ts`, `src/server/modules/knowledge-v2/runtime-loader.test.ts`, `src/server/modules/knowledge-v2/promotion.ts`, `src/server/modules/knowledge-v2/promotion.test.ts`, `src/server/modules/knowledge-v2/index.ts`, `docs/superpowers/tasks/2026-04-18-evidence-review/17-kb-v2-foundation.md`, `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`.
- Validation commands: `pnpm exec vitest run src/server/modules/knowledge-v2/runtime-loader.test.ts --coverage=false`, `pnpm exec vitest run src/server/modules/knowledge-v2/promotion.test.ts --coverage=false`, `pnpm test src/server/modules/knowledge-v2`, `pnpm exec eslint src/server/modules/knowledge-v2`, `pnpm prisma validate --schema prisma/schema.prisma`, `pnpm prisma:generate`, `pnpm type-check`.
- Result: KB v2 now has one unified knowledge object, shared scope/review/source/version contracts, first-class negative knowledge payloads, runtime loading semantics, and a reviewed-claim promotion foundation without cutting over legacy knowledge callers.
- Follow-up risks: runtime integration into Stage A+ is still pending T07; relation catalog governance/UI is still pending T18/T12/T14; old split knowledge tables still exist until T20 cutover.
