# T17 KB v2 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build KB v2 as a review-native knowledge foundation with one unified knowledge object, shared scope/review/source/version contracts, runtime loader support, and a safe reviewed-claim promotion path.

**Architecture:** Introduce a new additive `knowledge_items` model instead of mutating the old split knowledge tables. Keep storage, payload validation, runtime loading, and claim promotion in separate files so T07/T12/T18 can reuse KB v2 without forcing an immediate cutover of legacy `src/server/modules/knowledge/**`.

**Tech Stack:** TypeScript strict, Vitest, Zod, Prisma 7 generated client, PostgreSQL additive migration, existing claim/review state contracts from T01/T03

---

## Source Of Truth

- Architecture spec: `docs/superpowers/specs/2026-04-18-evidence-review-architecture-rewrite-design.md`
- Task doc: `docs/superpowers/tasks/2026-04-18-evidence-review/17-kb-v2-foundation.md`
- Runbook: `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`
- TDD guide: `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-tdd-guide.md`
- Upstream completed tasks: T01 schema/state, T02 evidence layer, T03 claim storage contracts, T04 run observability

## Preconditions

- T17 is allowed to add new schema and new modules, but it must not destructively migrate or delete old knowledge tables.
- T17 must not rewrite existing `src/server/modules/knowledge/**` callers. Cutover belongs to T20.
- T17 must not build the full relation catalog CRUD or review UI. That belongs to T18/T12/T14.
- `relationTypeKey` stays a string end to end. Do not introduce a Prisma enum for it.
- `knowledgeType` is stored as a string in the database, but validated against a code-side registry before writes and after reads.
- `effectiveFrom` and `effectiveTo` are stored as JSON window selectors so KB v2 can represent chapter-order, relative phase, or freeform normalized time without forcing a date-only model.
- Claim promotion in T17 is foundation only: it validates claim review state, writes KB rows, and links lineage. It does not implement UI-triggered promotion workflows.

## File Structure

- Modify `prisma/schema.prisma`
  - Responsibility: add KB v2 enums and the unified `KnowledgeItem` model only.
- Create `prisma/migrations/20260419183000_knowledge_v2_foundation/migration.sql`
  - Responsibility: additive SQL for `knowledge_items`, enum types, indexes, and the scope-id consistency check.
- Create `src/server/modules/knowledge-v2/base-types.ts`
  - Responsibility: shared scope/source/review/window schemas and runtime visibility helpers.
- Create `src/server/modules/knowledge-v2/base-types.test.ts`
  - Responsibility: prove scope normalization and runtime review-state visibility rules.
- Create `src/server/modules/knowledge-v2/payload-schemas.ts`
  - Responsibility: code-side registry for supported knowledge types and payload validation.
- Create `src/server/modules/knowledge-v2/payload-schemas.test.ts`
  - Responsibility: prove open relation keys, negative knowledge, and unknown-type rejection.
- Create `src/server/modules/knowledge-v2/repository.ts`
  - Responsibility: validated create/list/review/supersede access around `knowledge_items`.
- Create `src/server/modules/knowledge-v2/repository.test.ts`
  - Responsibility: prove parsed writes, list filters, review updates, and version increment behavior.
- Create `src/server/modules/knowledge-v2/runtime-loader.ts`
  - Responsibility: resolve scope chain, keep verified runtime strict, surface pending candidates separately, and suppress only visible superseded versions.
- Create `src/server/modules/knowledge-v2/runtime-loader.test.ts`
  - Responsibility: prove scope precedence, pending-vs-verified supersede behavior, and negative knowledge retention.
- Create `src/server/modules/knowledge-v2/promotion.ts`
  - Responsibility: reviewed-claim promotion into KB items with lineage and optional supersede.
- Create `src/server/modules/knowledge-v2/promotion.test.ts`
  - Responsibility: prove accepted-claim promotion, reject non-accepted claims, and versioned supersede promotion.
- Create `src/server/modules/knowledge-v2/index.ts`
  - Responsibility: stable barrel export for later T07/T12/T18 imports.

## Modeling Decisions

- `KnowledgeItem.scopeId` is nullable only for `GLOBAL`; other scopes require it. Enforce in code and with a database check constraint.
- `KnowledgeItem.promotedFromClaimId` is not enough to resolve the source table, so T17 also adds `promotedFromClaimFamily` as a string field.
- KB v2 versioning is append-only. Superseding a knowledge row creates a new row with `version = previous.version + 1` and `supersedesKnowledgeId = previous.id`; runtime filtering decides which version is active.
- A `PENDING` superseding draft must not hide an existing `VERIFIED` rule from strict runtime usage. Runtime suppression is visibility-aware.
- Negative knowledge is not encoded as flags on positive rules. It gets dedicated `knowledgeType` payloads such as `alias negative rule`, `relation negative rule`, and `time normalization rule` with deny semantics.
- Claim promotion accepts only `ACCEPTED` reviewable claims in T17. `EDITED` is the old superseded claim state from T03, not a promotable final truth row.

## Task 1: Add KB v2 Prisma Schema

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260419183000_knowledge_v2_foundation/migration.sql`
- Regenerate: `src/generated/prisma/**`

- [x] **Step 1: Confirm the KB v2 schema does not already exist**

Run:

```bash
rg -n "KnowledgeItem|KnowledgeScopeType|KnowledgeReviewState|KnowledgeSource" prisma/schema.prisma
```

Expected: no matches.

- [x] **Step 2: Snapshot the pre-edit Prisma schema for migration diffing**

Run:

```bash
cp prisma/schema.prisma /tmp/t17-kb-v2-foundation.before.prisma
test -f /tmp/t17-kb-v2-foundation.before.prisma
```

Expected: the temp schema snapshot exists.

- [x] **Step 3: Patch `prisma/schema.prisma` additively**

Add the enums near the other enum declarations:

```prisma
enum KnowledgeScopeType {
  GLOBAL
  BOOK_TYPE
  BOOK
  RUN

  @@map("knowledge_scope_type")
}

enum KnowledgeReviewState {
  PENDING
  VERIFIED
  REJECTED
  DISABLED

  @@map("knowledge_review_state")
}

enum KnowledgeSource {
  SYSTEM_PRESET
  MANUAL_ENTRY
  CLAIM_PROMOTION
  IMPORTED
  LEGACY_SEED

  @@map("knowledge_source")
}
```

Add the model near the other review/analysis truth models:

```prisma
model KnowledgeItem {
  id                      String               @id @default(uuid()) @db.Uuid
  scopeType               KnowledgeScopeType   @map("scope_type")
  scopeId                 String?              @map("scope_id")
  knowledgeType           String               @map("knowledge_type")
  payload                 Json
  source                  KnowledgeSource
  reviewState             KnowledgeReviewState @default(PENDING) @map("review_state")
  confidence              Float?
  effectiveFrom           Json?                @map("effective_from")
  effectiveTo             Json?                @map("effective_to")
  promotedFromClaimId     String?              @map("promoted_from_claim_id") @db.Uuid
  promotedFromClaimFamily String?              @map("promoted_from_claim_family")
  supersedesKnowledgeId   String?              @map("supersedes_knowledge_id") @db.Uuid
  version                 Int                  @default(1)
  createdByUserId         String?              @map("created_by_user_id") @db.Uuid
  reviewedByUserId        String?              @map("reviewed_by_user_id") @db.Uuid
  reviewedAt              DateTime?            @map("reviewed_at") @db.Timestamptz(6)
  createdAt               DateTime             @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt               DateTime             @updatedAt @map("updated_at") @db.Timestamptz(6)

  supersedesKnowledge KnowledgeItem?  @relation("KnowledgeItemVersionChain", fields: [supersedesKnowledgeId], references: [id])
  supersededBy        KnowledgeItem[] @relation("KnowledgeItemVersionChain")

  @@index([knowledgeType, scopeType, scopeId], map: "knowledge_items_type_scope_idx")
  @@index([reviewState, scopeType, scopeId], map: "knowledge_items_review_scope_idx")
  @@index([promotedFromClaimId], map: "knowledge_items_promoted_claim_idx")
  @@index([supersedesKnowledgeId], map: "knowledge_items_supersedes_idx")
  @@map("knowledge_items")
}
```

- [x] **Step 4: Format and validate the updated Prisma schema**

Run:

```bash
pnpm prisma format --schema prisma/schema.prisma
pnpm prisma validate --schema prisma/schema.prisma
```

Expected: both commands pass.

- [x] **Step 5: Generate the additive migration**

Run:

```bash
pnpm prisma migrate diff --from-schema /tmp/t17-kb-v2-foundation.before.prisma --to-schema prisma/schema.prisma --script --output prisma/migrations/20260419183000_knowledge_v2_foundation/migration.sql
```

Expected: the SQL creates the three KB enums, the `knowledge_items` table, indexes, and no destructive statements.

- [x] **Step 6: Add the scope consistency check and verify the SQL stays additive**

Open `prisma/migrations/20260419183000_knowledge_v2_foundation/migration.sql` and ensure it contains:

```sql
ALTER TABLE "knowledge_items"
  ADD CONSTRAINT "knowledge_items_scope_id_check"
  CHECK (
    ("scope_type" = 'GLOBAL' AND "scope_id" IS NULL)
    OR ("scope_type" <> 'GLOBAL' AND "scope_id" IS NOT NULL)
  );
```

Run:

```bash
rg -n "DROP TABLE|DROP COLUMN|ALTER COLUMN .* TYPE|TRUNCATE|DELETE FROM" prisma/migrations/20260419183000_knowledge_v2_foundation/migration.sql
rg -n "knowledge_items_scope_id_check" prisma/migrations/20260419183000_knowledge_v2_foundation/migration.sql
```

Expected: destructive grep returns no matches; constraint grep returns one match.

- [x] **Step 7: Regenerate Prisma client**

Run:

```bash
pnpm prisma:generate
```

Expected: generated Prisma client exposes `KnowledgeItem` and the new KB enums.

- [x] **Step 8: Commit the schema foundation**

```bash
git add prisma/schema.prisma prisma/migrations/20260419183000_knowledge_v2_foundation/migration.sql src/generated/prisma
git commit -m "feat: add kb v2 schema foundation"
```

## Task 2: Implement KB v2 Base Contracts

**Files:**
- Create: `src/server/modules/knowledge-v2/base-types.ts`
- Create: `src/server/modules/knowledge-v2/base-types.test.ts`

- [x] **Step 1: Write the failing base-type tests**

Create `src/server/modules/knowledge-v2/base-types.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  getRuntimeReviewStates,
  knowledgeScopeSelectorSchema,
  runtimeVisibilityModeSchema
} from "@/server/modules/knowledge-v2/base-types";

describe("knowledge-v2 base types", () => {
  it("requires null scopeId for GLOBAL scope", () => {
    const parsed = knowledgeScopeSelectorSchema.safeParse({
      scopeType: "GLOBAL",
      scopeId  : "should-not-exist"
    });

    expect(parsed.success).toBe(false);
  });

  it("requires scopeId for BOOK scope", () => {
    const parsed = knowledgeScopeSelectorSchema.safeParse({
      scopeType: "BOOK",
      scopeId  : null
    });

    expect(parsed.success).toBe(false);
  });

  it("keeps runtime visibility modes explicit", () => {
    expect(runtimeVisibilityModeSchema.parse("VERIFIED_ONLY")).toBe("VERIFIED_ONLY");
    expect(getRuntimeReviewStates("VERIFIED_ONLY")).toEqual(["VERIFIED"]);
    expect(getRuntimeReviewStates("INCLUDE_PENDING")).toEqual(["VERIFIED", "PENDING"]);
  });
});
```

- [x] **Step 2: Run the base-type tests and verify they fail**

Run:

```bash
pnpm test src/server/modules/knowledge-v2/base-types.test.ts
```

Expected: FAIL because `src/server/modules/knowledge-v2/base-types.ts` does not exist yet.

- [x] **Step 3: Write the minimal base contract implementation**

Create `src/server/modules/knowledge-v2/base-types.ts`:

```ts
import { z } from "zod";

export const knowledgeScopeTypeSchema = z.enum(["GLOBAL", "BOOK_TYPE", "BOOK", "RUN"]);
export type KnowledgeScopeType = z.infer<typeof knowledgeScopeTypeSchema>;

export const knowledgeReviewStateSchema = z.enum(["PENDING", "VERIFIED", "REJECTED", "DISABLED"]);
export type KnowledgeReviewState = z.infer<typeof knowledgeReviewStateSchema>;

export const knowledgeSourceSchema = z.enum([
  "SYSTEM_PRESET",
  "MANUAL_ENTRY",
  "CLAIM_PROMOTION",
  "IMPORTED",
  "LEGACY_SEED"
]);
export type KnowledgeSource = z.infer<typeof knowledgeSourceSchema>;

const trimmedNonEmptyString = z.string().trim().min(1);

export const knowledgeWindowBoundSchema = z.object({
  kind : z.enum(["CHAPTER_NO", "RELATIVE_PHASE", "TIME_HINT_ID", "FREEFORM"]),
  value: z.union([z.number().int().positive(), trimmedNonEmptyString]),
  label: trimmedNonEmptyString.nullable().default(null)
});
export type KnowledgeWindowBound = z.infer<typeof knowledgeWindowBoundSchema>;

export const knowledgeScopeSelectorSchema = z.object({
  scopeType: knowledgeScopeTypeSchema,
  scopeId  : trimmedNonEmptyString.nullable().default(null)
}).superRefine((value, ctx) => {
  if (value.scopeType === "GLOBAL" && value.scopeId !== null) {
    ctx.addIssue({
      code   : "custom",
      path   : ["scopeId"],
      message: "GLOBAL scope must not define scopeId"
    });
  }

  if (value.scopeType !== "GLOBAL" && value.scopeId === null) {
    ctx.addIssue({
      code   : "custom",
      path   : ["scopeId"],
      message: `${value.scopeType} scope requires scopeId`
    });
  }
});
export type KnowledgeScopeSelector = z.infer<typeof knowledgeScopeSelectorSchema>;

export const runtimeVisibilityModeSchema = z.enum(["VERIFIED_ONLY", "INCLUDE_PENDING"]);
export type RuntimeVisibilityMode = z.infer<typeof runtimeVisibilityModeSchema>;

export function getRuntimeReviewStates(mode: RuntimeVisibilityMode): KnowledgeReviewState[] {
  return mode === "INCLUDE_PENDING"
    ? ["VERIFIED", "PENDING"]
    : ["VERIFIED"];
}
```

- [x] **Step 4: Run the base-type tests and verify they pass**

Run:

```bash
pnpm test src/server/modules/knowledge-v2/base-types.test.ts
```

Expected: PASS.

- [x] **Step 5: Commit the base contracts**

```bash
git add src/server/modules/knowledge-v2/base-types.ts src/server/modules/knowledge-v2/base-types.test.ts
git commit -m "feat: add kb v2 base contracts"
```

## Task 3: Implement The Knowledge Type Registry And Payload Validation

**Files:**
- Create: `src/server/modules/knowledge-v2/payload-schemas.ts`
- Create: `src/server/modules/knowledge-v2/payload-schemas.test.ts`

- [x] **Step 1: Write the failing payload-schema tests**

Create `src/server/modules/knowledge-v2/payload-schemas.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  getKnowledgePayloadSchema,
  parseKnowledgePayload
} from "@/server/modules/knowledge-v2/payload-schemas";

describe("knowledge-v2 payload schemas", () => {
  it("parses alias equivalence rules", () => {
    const parsed = parseKnowledgePayload("alias equivalence rule", {
      canonicalName : "范进",
      aliasTexts    : ["范老爷", "范贤婿"],
      aliasTypeHints: ["TITLE", "NICKNAME"],
      note          : "同一人物的高频称呼"
    });

    expect(parsed.aliasTexts).toEqual(["范老爷", "范贤婿"]);
  });

  it("keeps relationTypeKey open for taxonomy rules", () => {
    const parsed = parseKnowledgePayload("relation taxonomy rule", {
      relationTypeKey   : "political_patron_of",
      displayLabel      : "政治庇护",
      direction         : "FORWARD",
      relationTypeSource: "CUSTOM",
      aliasLabels       : ["依附", "门生"]
    });

    expect(parsed.relationTypeKey).toBe("political_patron_of");
  });

  it("treats negative knowledge as first class", () => {
    const parsed = parseKnowledgePayload("relation negative rule", {
      relationTypeKey : "sworn_brother",
      blockedLabels   : ["结义兄弟"],
      denyDirection   : "BIDIRECTIONAL",
      reason          : "本书将此称谓用于夸饰，不应直接落正式关系"
    });

    expect(parsed.blockedLabels).toContain("结义兄弟");
  });

  it("rejects unknown knowledge types", () => {
    expect(() => getKnowledgePayloadSchema("imaginary rule")).toThrowError(
      "Unsupported knowledge type: imaginary rule"
    );
  });
});
```

- [x] **Step 2: Run the payload tests and verify they fail**

Run:

```bash
pnpm test src/server/modules/knowledge-v2/payload-schemas.test.ts
```

Expected: FAIL because `src/server/modules/knowledge-v2/payload-schemas.ts` does not exist yet.

- [x] **Step 3: Implement the knowledge registry and payload validators**

Create `src/server/modules/knowledge-v2/payload-schemas.ts`:

```ts
import { z } from "zod";

const trimmedNonEmptyString = z.string().trim().min(1);
const relationDirectionSchema = z.enum(["FORWARD", "REVERSE", "BIDIRECTIONAL", "UNDIRECTED"]);
const relationTypeSourceSchema = z.enum(["PRESET", "CUSTOM", "NORMALIZED_FROM_CUSTOM"]);
const timeTypeSchema = z.enum([
  "CHAPTER_ORDER",
  "RELATIVE_PHASE",
  "NAMED_EVENT",
  "HISTORICAL_YEAR",
  "BATTLE_PHASE",
  "UNCERTAIN"
]);
const conflictTypeSchema = z.enum([
  "POSSIBLE_DUPLICATE",
  "POSSIBLE_SPLIT",
  "POST_MORTEM_ACTION",
  "IMPOSSIBLE_LOCATION",
  "RELATION_DIRECTION_CONFLICT",
  "ALIAS_CONFLICT",
  "TIME_ORDER_CONFLICT",
  "LOW_EVIDENCE_CLAIM"
]);

export const KNOWN_KNOWLEDGE_TYPES = [
  "name lexicon rule",
  "alias equivalence rule",
  "alias negative rule",
  "surname rule",
  "title rule",
  "kinship term rule",
  "official position rule",
  "historical figure reference",
  "name pattern rule",
  "relation taxonomy rule",
  "relation label mapping rule",
  "relation negative rule",
  "time normalization rule",
  "conflict escalation rule",
  "prompt extraction hint",
  "review promotion rule"
] as const;

export type KnownKnowledgeType = (typeof KNOWN_KNOWLEDGE_TYPES)[number];

const aliasTypeHintSchema = z.enum([
  "TITLE",
  "POSITION",
  "KINSHIP",
  "NICKNAME",
  "COURTESY_NAME",
  "NAMED",
  "IMPERSONATED_IDENTITY",
  "MISIDENTIFIED_AS",
  "UNSURE"
]);

const payloadRegistry = {
  "name lexicon rule": z.object({
    terms : z.array(trimmedNonEmptyString).min(1),
    bucket: z.enum(["PERSON_NAME", "TITLE_STEM", "POSITION_STEM", "HARD_BLOCK_SUFFIX", "SOFT_BLOCK_SUFFIX"]),
    note  : trimmedNonEmptyString.nullable().default(null)
  }),
  "alias equivalence rule": z.object({
    canonicalName : trimmedNonEmptyString,
    aliasTexts    : z.array(trimmedNonEmptyString).min(1),
    aliasTypeHints: z.array(aliasTypeHintSchema).default([]),
    note          : trimmedNonEmptyString.nullable().default(null)
  }),
  "alias negative rule": z.object({
    aliasText             : trimmedNonEmptyString,
    blockedCanonicalNames : z.array(trimmedNonEmptyString).min(1),
    reason                : trimmedNonEmptyString
  }),
  "surname rule": z.object({
    surname   : trimmedNonEmptyString,
    isCompound: z.boolean()
  }),
  "title rule": z.object({
    title: trimmedNonEmptyString,
    tier : z.enum(["SAFETY", "DEFAULT"])
  }),
  "kinship term rule": z.object({
    term           : trimmedNonEmptyString,
    normalizedLabel: trimmedNonEmptyString
  }),
  "official position rule": z.object({
    title          : trimmedNonEmptyString,
    normalizedLabel: trimmedNonEmptyString
  }),
  "historical figure reference": z.object({
    canonicalName: trimmedNonEmptyString,
    aliasTexts   : z.array(trimmedNonEmptyString).default([]),
    dynasty      : trimmedNonEmptyString.nullable().default(null),
    category     : trimmedNonEmptyString,
    description  : trimmedNonEmptyString.nullable().default(null)
  }),
  "name pattern rule": z.object({
    pattern    : trimmedNonEmptyString,
    action     : z.enum(["BOOST", "BLOCK"]),
    appliesTo  : z.enum(["NAME", "TITLE_ONLY", "ALIAS"]),
    description: trimmedNonEmptyString.nullable().default(null)
  }),
  "relation taxonomy rule": z.object({
    relationTypeKey   : trimmedNonEmptyString,
    displayLabel      : trimmedNonEmptyString,
    direction         : relationDirectionSchema,
    relationTypeSource: relationTypeSourceSchema,
    aliasLabels       : z.array(trimmedNonEmptyString).default([])
  }),
  "relation label mapping rule": z.object({
    relationTypeKey   : trimmedNonEmptyString,
    observedLabel     : trimmedNonEmptyString,
    normalizedLabel   : trimmedNonEmptyString,
    relationTypeSource: relationTypeSourceSchema
  }),
  "relation negative rule": z.object({
    relationTypeKey: trimmedNonEmptyString.nullable().default(null),
    blockedLabels  : z.array(trimmedNonEmptyString).min(1),
    denyDirection  : relationDirectionSchema.nullable().default(null),
    reason         : trimmedNonEmptyString
  }),
  "time normalization rule": z.object({
    rawText         : trimmedNonEmptyString,
    normalizedType  : timeTypeSchema,
    normalizedLabel : trimmedNonEmptyString,
    relativeOrder   : z.number().int().nullable().default(null),
    denyInBookIds   : z.array(trimmedNonEmptyString).default([])
  }),
  "conflict escalation rule": z.object({
    conflictType     : conflictTypeSchema,
    escalateWhen     : trimmedNonEmptyString,
    recommendedAction: z.enum(["REVIEW_REQUIRED", "BLOCK_MERGE", "HARD_REJECT"])
  }),
  "prompt extraction hint": z.object({
    stageKey : trimmedNonEmptyString,
    hintType : z.enum(["ENTITY", "RELATION", "TIME", "STYLE"]),
    content  : trimmedNonEmptyString,
    priority : z.number().int().default(0)
  }),
  "review promotion rule": z.object({
    claimFamily    : z.enum(["ALIAS", "EVENT", "RELATION", "TIME", "IDENTITY_RESOLUTION", "CONFLICT_FLAG"]),
    knowledgeType  : z.enum(KNOWN_KNOWLEDGE_TYPES),
    defaultScopeType: z.enum(["GLOBAL", "BOOK_TYPE", "BOOK", "RUN"]),
    targetReviewState: z.enum(["PENDING", "VERIFIED"]),
    note           : trimmedNonEmptyString.nullable().default(null)
  })
} as const satisfies Record<KnownKnowledgeType, z.ZodTypeAny>;

export function getKnowledgePayloadSchema<TType extends KnownKnowledgeType>(knowledgeType: TType) {
  const schema = payloadRegistry[knowledgeType];
  if (!schema) {
    throw new Error(`Unsupported knowledge type: ${knowledgeType}`);
  }

  return schema;
}

export function parseKnowledgePayload<TType extends KnownKnowledgeType>(
  knowledgeType: TType,
  payload: unknown
): z.infer<(typeof payloadRegistry)[TType]> {
  return getKnowledgePayloadSchema(knowledgeType).parse(payload);
}
```

- [x] **Step 4: Run the payload tests and verify they pass**

Run:

```bash
pnpm test src/server/modules/knowledge-v2/payload-schemas.test.ts
```

Expected: PASS.

- [x] **Step 5: Commit the payload registry**

```bash
git add src/server/modules/knowledge-v2/payload-schemas.ts src/server/modules/knowledge-v2/payload-schemas.test.ts
git commit -m "feat: add kb v2 payload registry"
```

## Task 4: Build The KB v2 Repository

**Files:**
- Create: `src/server/modules/knowledge-v2/repository.ts`
- Create: `src/server/modules/knowledge-v2/repository.test.ts`

- [x] **Step 1: Write the failing repository tests**

Create `src/server/modules/knowledge-v2/repository.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { createKnowledgeRepository } from "@/server/modules/knowledge-v2/repository";

function createPrismaMock() {
  const knowledgeItemCreate = vi.fn().mockResolvedValue({
    id          : "knowledge-1",
    scopeType   : "BOOK",
    scopeId     : "book-1",
    knowledgeType: "alias equivalence rule",
    payload     : {
      canonicalName : "范进",
      aliasTexts    : ["范老爷"],
      aliasTypeHints: ["TITLE"],
      note          : null
    },
    source                : "MANUAL_ENTRY",
    reviewState           : "VERIFIED",
    confidence            : 0.92,
    effectiveFrom         : null,
    effectiveTo           : null,
    promotedFromClaimId   : null,
    promotedFromClaimFamily: null,
    supersedesKnowledgeId : null,
    version               : 1,
    createdByUserId       : "user-1",
    reviewedByUserId      : "user-1",
    reviewedAt            : new Date("2026-04-19T10:00:00.000Z"),
    createdAt             : new Date("2026-04-19T10:00:00.000Z"),
    updatedAt             : new Date("2026-04-19T10:00:00.000Z")
  });

  const knowledgeItemFindMany = vi.fn().mockResolvedValue([]);
  const knowledgeItemFindUnique = vi.fn();
  const knowledgeItemUpdate = vi.fn().mockResolvedValue({
    id          : "knowledge-1",
    scopeType   : "BOOK",
    scopeId     : "book-1",
    knowledgeType: "alias equivalence rule",
    payload     : {
      canonicalName : "范进",
      aliasTexts    : ["范老爷"],
      aliasTypeHints: ["TITLE"],
      note          : null
    },
    source                : "MANUAL_ENTRY",
    reviewState           : "DISABLED",
    confidence            : 0.92,
    effectiveFrom         : null,
    effectiveTo           : null,
    promotedFromClaimId   : null,
    promotedFromClaimFamily: null,
    supersedesKnowledgeId : null,
    version               : 1,
    createdByUserId       : "user-1",
    reviewedByUserId      : "user-2",
    reviewedAt            : new Date("2026-04-19T12:00:00.000Z"),
    createdAt             : new Date("2026-04-19T10:00:00.000Z"),
    updatedAt             : new Date("2026-04-19T12:00:00.000Z")
  });

  const prisma = {
    knowledgeItem: {
      create    : knowledgeItemCreate,
      findMany  : knowledgeItemFindMany,
      findUnique: knowledgeItemFindUnique,
      update    : knowledgeItemUpdate
    },
    $transaction: vi.fn(async (callback) => callback(prisma))
  };

  return {
    prisma,
    knowledgeItemCreate,
    knowledgeItemFindMany,
    knowledgeItemFindUnique,
    knowledgeItemUpdate
  };
}

describe("knowledge-v2 repository", () => {
  it("creates validated knowledge rows", async () => {
    const { prisma, knowledgeItemCreate } = createPrismaMock();
    const repository = createKnowledgeRepository(prisma as never);

    const created = await repository.createKnowledgeItem({
      scopeType     : "BOOK",
      scopeId       : "book-1",
      knowledgeType : "alias equivalence rule",
      payload       : {
        canonicalName : "范进",
        aliasTexts    : ["范老爷"],
        aliasTypeHints: ["TITLE"],
        note          : null
      },
      source          : "MANUAL_ENTRY",
      reviewState     : "VERIFIED",
      confidence      : 0.92,
      effectiveFrom   : null,
      effectiveTo     : null,
      promotedFromClaimId: null,
      promotedFromClaimFamily: null,
      createdByUserId : "user-1",
      reviewedByUserId: "user-1",
      reviewedAt      : new Date("2026-04-19T10:00:00.000Z")
    });

    expect(knowledgeItemCreate).toHaveBeenCalledOnce();
    expect(created.version).toBe(1);
  });

  it("lists knowledge by scope and review state", async () => {
    const { prisma, knowledgeItemFindMany } = createPrismaMock();
    knowledgeItemFindMany.mockResolvedValueOnce([
      {
        id          : "knowledge-1",
        scopeType   : "GLOBAL",
        scopeId     : null,
        knowledgeType: "relation negative rule",
        payload     : {
          relationTypeKey: "sworn_brother",
          blockedLabels  : ["结义兄弟"],
          denyDirection  : "BIDIRECTIONAL",
          reason         : "测试"
        },
        source                : "SYSTEM_PRESET",
        reviewState           : "VERIFIED",
        confidence            : null,
        effectiveFrom         : null,
        effectiveTo           : null,
        promotedFromClaimId   : null,
        promotedFromClaimFamily: null,
        supersedesKnowledgeId : null,
        version               : 1,
        createdByUserId       : null,
        reviewedByUserId      : "admin-1",
        reviewedAt            : new Date("2026-04-19T10:00:00.000Z"),
        createdAt             : new Date("2026-04-19T10:00:00.000Z"),
        updatedAt             : new Date("2026-04-19T10:00:00.000Z")
      }
    ]);

    const repository = createKnowledgeRepository(prisma as never);
    const items = await repository.listKnowledgeItems({
      scopeSelectors: [{ scopeType: "GLOBAL", scopeId: null }],
      reviewStates  : ["VERIFIED"]
    });

    expect(items).toHaveLength(1);
    expect(items[0].knowledgeType).toBe("relation negative rule");
  });

  it("creates superseding versions by incrementing version", async () => {
    const { prisma, knowledgeItemFindUnique, knowledgeItemCreate } = createPrismaMock();
    knowledgeItemFindUnique.mockResolvedValueOnce({
      id          : "knowledge-1",
      scopeType   : "BOOK",
      scopeId     : "book-1",
      knowledgeType: "alias equivalence rule",
      payload     : {
        canonicalName : "范进",
        aliasTexts    : ["范老爷"],
        aliasTypeHints: ["TITLE"],
        note          : null
      },
      source                : "MANUAL_ENTRY",
      reviewState           : "VERIFIED",
      confidence            : 0.92,
      effectiveFrom         : null,
      effectiveTo           : null,
      promotedFromClaimId   : null,
      promotedFromClaimFamily: null,
      supersedesKnowledgeId : null,
      version               : 1,
      createdByUserId       : "user-1",
      reviewedByUserId      : "user-1",
      reviewedAt            : new Date("2026-04-19T10:00:00.000Z"),
      createdAt             : new Date("2026-04-19T10:00:00.000Z"),
      updatedAt             : new Date("2026-04-19T10:00:00.000Z")
    });
    knowledgeItemCreate.mockResolvedValueOnce({
      id          : "knowledge-2",
      scopeType   : "BOOK",
      scopeId     : "book-1",
      knowledgeType: "alias equivalence rule",
      payload     : {
        canonicalName : "范进",
        aliasTexts    : ["范老爷", "范贤婿"],
        aliasTypeHints: ["TITLE", "NICKNAME"],
        note          : null
      },
      source                : "MANUAL_ENTRY",
      reviewState           : "VERIFIED",
      confidence            : 0.95,
      effectiveFrom         : null,
      effectiveTo           : null,
      promotedFromClaimId   : null,
      promotedFromClaimFamily: null,
      supersedesKnowledgeId : "knowledge-1",
      version               : 2,
      createdByUserId       : "user-1",
      reviewedByUserId      : "user-1",
      reviewedAt            : new Date("2026-04-19T11:00:00.000Z"),
      createdAt             : new Date("2026-04-19T11:00:00.000Z"),
      updatedAt             : new Date("2026-04-19T11:00:00.000Z")
    });

    const repository = createKnowledgeRepository(prisma as never);
    const created = await repository.createSupersedingKnowledgeItem({
      supersedesKnowledgeId : "knowledge-1",
      payload               : {
        canonicalName : "范进",
        aliasTexts    : ["范老爷", "范贤婿"],
        aliasTypeHints: ["TITLE", "NICKNAME"],
        note          : null
      },
      source          : "MANUAL_ENTRY",
      reviewState     : "VERIFIED",
      confidence      : 0.95,
      effectiveFrom   : null,
      effectiveTo     : null,
      promotedFromClaimId: null,
      promotedFromClaimFamily: null,
      createdByUserId : "user-1",
      reviewedByUserId: "user-1",
      reviewedAt      : new Date("2026-04-19T11:00:00.000Z")
    });

    expect(created.version).toBe(2);
    expect(created.supersedesKnowledgeId).toBe("knowledge-1");
  });

  it("updates knowledge review state", async () => {
    const { prisma, knowledgeItemUpdate } = createPrismaMock();
    const repository = createKnowledgeRepository(prisma as never);

    const updated = await repository.reviewKnowledgeItem({
      knowledgeId      : "knowledge-1",
      reviewState      : "DISABLED",
      reviewedByUserId : "user-2",
      reviewedAt       : new Date("2026-04-19T12:00:00.000Z")
    });

    expect(knowledgeItemUpdate).toHaveBeenCalledOnce();
    expect(updated.reviewState).toBe("DISABLED");
  });
});
```

- [x] **Step 2: Run the repository tests and verify they fail**

Run:

```bash
pnpm test src/server/modules/knowledge-v2/repository.test.ts
```

Expected: FAIL because `src/server/modules/knowledge-v2/repository.ts` does not exist yet.

- [x] **Step 3: Implement the repository**

Create `src/server/modules/knowledge-v2/repository.ts`:

```ts
import type { KnowledgeItem } from "@/generated/prisma/client";

import {
  knowledgeReviewStateSchema,
  knowledgeScopeSelectorSchema,
  type KnowledgeReviewState
} from "@/server/modules/knowledge-v2/base-types";
import {
  getKnowledgePayloadSchema,
  type KnownKnowledgeType
} from "@/server/modules/knowledge-v2/payload-schemas";

export interface CreateKnowledgeItemInput<TType extends KnownKnowledgeType = KnownKnowledgeType> {
  scopeType               : "GLOBAL" | "BOOK_TYPE" | "BOOK" | "RUN";
  scopeId                 : string | null;
  knowledgeType           : TType;
  payload                 : unknown;
  source                  : "SYSTEM_PRESET" | "MANUAL_ENTRY" | "CLAIM_PROMOTION" | "IMPORTED" | "LEGACY_SEED";
  reviewState             : KnowledgeReviewState;
  confidence              : number | null;
  effectiveFrom           : Record<string, unknown> | null;
  effectiveTo             : Record<string, unknown> | null;
  promotedFromClaimId     : string | null;
  promotedFromClaimFamily : string | null;
  createdByUserId         : string | null;
  reviewedByUserId        : string | null;
  reviewedAt              : Date | null;
}

export interface ListKnowledgeItemsInput {
  scopeSelectors?: Array<{ scopeType: "GLOBAL" | "BOOK_TYPE" | "BOOK" | "RUN"; scopeId: string | null }>;
  reviewStates?  : KnowledgeReviewState[];
  knowledgeTypes?: KnownKnowledgeType[];
}

export interface KnowledgeRepositoryClient {
  knowledgeItem: {
    create(args: { data: Record<string, unknown> }): Promise<KnowledgeItem>;
    findMany(args: { where?: Record<string, unknown>; orderBy?: Array<Record<string, "asc" | "desc">> }): Promise<KnowledgeItem[]>;
    findUnique(args: { where: { id: string } }): Promise<KnowledgeItem | null>;
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<KnowledgeItem>;
  };
  $transaction<T>(callback: (tx: KnowledgeRepositoryClient) => Promise<T>): Promise<T>;
}

function parseKnowledgeRecord(record: KnowledgeItem) {
  knowledgeScopeSelectorSchema.parse({
    scopeType: record.scopeType,
    scopeId  : record.scopeId
  });

  const payload = getKnowledgePayloadSchema(record.knowledgeType as KnownKnowledgeType).parse(record.payload);
  knowledgeReviewStateSchema.parse(record.reviewState);

  return {
    ...record,
    knowledgeType: record.knowledgeType as KnownKnowledgeType,
    payload
  };
}

function toKnowledgeCreateData(input: CreateKnowledgeItemInput, version = 1, supersedesKnowledgeId: string | null = null) {
  knowledgeScopeSelectorSchema.parse({
    scopeType: input.scopeType,
    scopeId  : input.scopeId
  });

  const payload = getKnowledgePayloadSchema(input.knowledgeType).parse(input.payload);

  return {
    scopeType               : input.scopeType,
    scopeId                 : input.scopeId,
    knowledgeType           : input.knowledgeType,
    payload,
    source                  : input.source,
    reviewState             : input.reviewState,
    confidence              : input.confidence,
    effectiveFrom           : input.effectiveFrom,
    effectiveTo             : input.effectiveTo,
    promotedFromClaimId     : input.promotedFromClaimId,
    promotedFromClaimFamily : input.promotedFromClaimFamily,
    supersedesKnowledgeId,
    version,
    createdByUserId         : input.createdByUserId,
    reviewedByUserId        : input.reviewedByUserId,
    reviewedAt              : input.reviewedAt
  };
}

export function createKnowledgeRepository(client: KnowledgeRepositoryClient) {
  return {
    async createKnowledgeItem<TType extends KnownKnowledgeType>(input: CreateKnowledgeItemInput<TType>) {
      const created = await client.knowledgeItem.create({
        data: toKnowledgeCreateData(input)
      });

      return parseKnowledgeRecord(created);
    },

    async listKnowledgeItems(input: ListKnowledgeItemsInput = {}) {
      const items = await client.knowledgeItem.findMany({
        where: {
          ...(input.reviewStates ? { reviewState: { in: input.reviewStates } } : {}),
          ...(input.knowledgeTypes ? { knowledgeType: { in: input.knowledgeTypes } } : {}),
          ...(input.scopeSelectors
            ? {
              OR: input.scopeSelectors.map((selector) => ({
                scopeType: selector.scopeType,
                scopeId  : selector.scopeId
              }))
            }
            : {})
        },
        orderBy: [
          { createdAt: "asc" },
          { version: "asc" }
        ]
      });

      return items.map(parseKnowledgeRecord);
    },

    async reviewKnowledgeItem(input: {
      knowledgeId      : string;
      reviewState      : KnowledgeReviewState;
      reviewedByUserId : string | null;
      reviewedAt       : Date | null;
    }) {
      const updated = await client.knowledgeItem.update({
        where: { id: input.knowledgeId },
        data : {
          reviewState     : input.reviewState,
          reviewedByUserId: input.reviewedByUserId,
          reviewedAt      : input.reviewedAt
        }
      });

      return parseKnowledgeRecord(updated);
    },

    async createSupersedingKnowledgeItem<TType extends KnownKnowledgeType>(input: CreateKnowledgeItemInput<TType> & {
      supersedesKnowledgeId: string;
    }) {
      return client.$transaction(async (tx) => {
        const previous = await tx.knowledgeItem.findUnique({
          where: { id: input.supersedesKnowledgeId }
        });

        if (!previous) {
          throw new Error(`Knowledge item ${input.supersedesKnowledgeId} was not found`);
        }

        const created = await tx.knowledgeItem.create({
          data: toKnowledgeCreateData(input, previous.version + 1, previous.id)
        });

        return parseKnowledgeRecord(created);
      });
    }
  };
}
```

- [x] **Step 4: Run the repository tests and verify they pass**

Run:

```bash
pnpm test src/server/modules/knowledge-v2/repository.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the repository**

```bash
git add src/server/modules/knowledge-v2/repository.ts src/server/modules/knowledge-v2/repository.test.ts
git commit -m "feat: add kb v2 repository"
```

## Task 5: Build The Runtime Loader

**Files:**
- Create: `src/server/modules/knowledge-v2/runtime-loader.ts`
- Create: `src/server/modules/knowledge-v2/runtime-loader.test.ts`

- [ ] **Step 1: Write the failing runtime-loader tests**

Create `src/server/modules/knowledge-v2/runtime-loader.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { createRuntimeKnowledgeLoader } from "@/server/modules/knowledge-v2/runtime-loader";

function buildKnowledge(overrides: Record<string, unknown>) {
  return {
    id          : "knowledge-1",
    scopeType   : "GLOBAL",
    scopeId     : null,
    knowledgeType: "alias equivalence rule",
    payload     : {
      canonicalName : "范进",
      aliasTexts    : ["范老爷"],
      aliasTypeHints: ["TITLE"],
      note          : null
    },
    source                : "SYSTEM_PRESET",
    reviewState           : "VERIFIED",
    confidence            : null,
    effectiveFrom         : null,
    effectiveTo           : null,
    promotedFromClaimId   : null,
    promotedFromClaimFamily: null,
    supersedesKnowledgeId : null,
    version               : 1,
    createdByUserId       : null,
    reviewedByUserId      : "admin-1",
    reviewedAt            : new Date("2026-04-19T10:00:00.000Z"),
    createdAt             : new Date("2026-04-19T10:00:00.000Z"),
    updatedAt             : new Date("2026-04-19T10:00:00.000Z"),
    ...overrides
  };
}

describe("knowledge-v2 runtime loader", () => {
  it("keeps strict runtime verified while returning pending candidates separately", async () => {
    const repository = {
      listKnowledgeItems: vi.fn().mockResolvedValue([
        buildKnowledge({ id: "verified-1" }),
        buildKnowledge({
          id                  : "pending-2",
          reviewState         : "PENDING",
          supersedesKnowledgeId: "verified-1",
          version             : 2
        })
      ])
    };

    const loader = createRuntimeKnowledgeLoader(repository);
    const bundle = await loader.load({
      bookId      : "book-1",
      bookTypeKey : "CLASSICAL_NOVEL",
      runId       : "run-1",
      visibility  : "INCLUDE_PENDING"
    });

    expect(bundle.verifiedItems.map((item) => item.id)).toEqual(["verified-1"]);
    expect(bundle.pendingItems.map((item) => item.id)).toEqual(["pending-2"]);
  });

  it("applies scope precedence as GLOBAL -> BOOK_TYPE -> BOOK -> RUN", async () => {
    const repository = {
      listKnowledgeItems: vi.fn().mockResolvedValue([
        buildKnowledge({
          id       : "book-1",
          scopeType: "BOOK",
          scopeId  : "book-1"
        }),
        buildKnowledge({
          id       : "global-1",
          scopeType: "GLOBAL",
          scopeId  : null
        }),
        buildKnowledge({
          id       : "book-type-1",
          scopeType: "BOOK_TYPE",
          scopeId  : "HISTORICAL_NOVEL"
        }),
        buildKnowledge({
          id       : "run-1",
          scopeType: "RUN",
          scopeId  : "run-1"
        })
      ])
    };

    const loader = createRuntimeKnowledgeLoader(repository);
    const bundle = await loader.load({
      bookId      : "book-1",
      bookTypeKey : "HISTORICAL_NOVEL",
      runId       : "run-1",
      visibility  : "VERIFIED_ONLY"
    });

    expect(bundle.scopeChain).toEqual([
      { scopeType: "GLOBAL", scopeId: null },
      { scopeType: "BOOK_TYPE", scopeId: "HISTORICAL_NOVEL" },
      { scopeType: "BOOK", scopeId: "book-1" },
      { scopeType: "RUN", scopeId: "run-1" }
    ]);
    expect(bundle.verifiedItems.map((item) => item.id)).toEqual([
      "global-1",
      "book-type-1",
      "book-1",
      "run-1"
    ]);
  });

  it("keeps negative knowledge in dedicated type buckets", async () => {
    const repository = {
      listKnowledgeItems: vi.fn().mockResolvedValue([
        buildKnowledge({
          id          : "neg-1",
          knowledgeType: "relation negative rule",
          payload     : {
            relationTypeKey: "sworn_brother",
            blockedLabels  : ["结义兄弟"],
            denyDirection  : "BIDIRECTIONAL",
            reason         : "测试"
          }
        })
      ])
    };

    const loader = createRuntimeKnowledgeLoader(repository);
    const bundle = await loader.load({
      bookId      : "book-1",
      bookTypeKey : null,
      runId       : null,
      visibility  : "VERIFIED_ONLY"
    });

    expect(bundle.byType["relation negative rule"]).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the runtime-loader tests and verify they fail**

Run:

```bash
pnpm test src/server/modules/knowledge-v2/runtime-loader.test.ts
```

Expected: FAIL because `src/server/modules/knowledge-v2/runtime-loader.ts` does not exist yet.

- [ ] **Step 3: Implement the runtime loader**

Create `src/server/modules/knowledge-v2/runtime-loader.ts`:

```ts
import {
  getRuntimeReviewStates,
  type KnowledgeScopeSelector,
  type RuntimeVisibilityMode
} from "@/server/modules/knowledge-v2/base-types";
import {
  KNOWN_KNOWLEDGE_TYPES,
  type KnownKnowledgeType
} from "@/server/modules/knowledge-v2/payload-schemas";

interface RuntimeKnowledgeItem {
  id                  : string;
  scopeType           : "GLOBAL" | "BOOK_TYPE" | "BOOK" | "RUN";
  scopeId             : string | null;
  knowledgeType       : KnownKnowledgeType;
  payload             : unknown;
  reviewState         : "PENDING" | "VERIFIED" | "REJECTED" | "DISABLED";
  supersedesKnowledgeId: string | null;
  version             : number;
}

export interface RuntimeKnowledgeRepository {
  listKnowledgeItems(input: {
    scopeSelectors: KnowledgeScopeSelector[];
    reviewStates  : Array<"PENDING" | "VERIFIED" | "REJECTED" | "DISABLED">;
  }): Promise<RuntimeKnowledgeItem[]>;
}

export interface RuntimeKnowledgeBundle {
  scopeChain   : KnowledgeScopeSelector[];
  verifiedItems: RuntimeKnowledgeItem[];
  pendingItems : RuntimeKnowledgeItem[];
  byType       : Record<KnownKnowledgeType, RuntimeKnowledgeItem[]>;
}

const SCOPE_ORDER: Record<RuntimeKnowledgeItem["scopeType"], number> = {
  GLOBAL   : 0,
  BOOK_TYPE: 1,
  BOOK     : 2,
  RUN      : 3
};

function buildScopeChain(input: {
  bookId      : string;
  bookTypeKey : string | null;
  runId       : string | null;
}): KnowledgeScopeSelector[] {
  return [
    { scopeType: "GLOBAL", scopeId: null },
    ...(input.bookTypeKey ? [{ scopeType: "BOOK_TYPE" as const, scopeId: input.bookTypeKey }] : []),
    { scopeType: "BOOK", scopeId: input.bookId },
    ...(input.runId ? [{ scopeType: "RUN" as const, scopeId: input.runId }] : [])
  ];
}

function createEmptyBuckets(): Record<KnownKnowledgeType, RuntimeKnowledgeItem[]> {
  return Object.fromEntries(
    KNOWN_KNOWLEDGE_TYPES.map((knowledgeType) => [knowledgeType, []])
  ) as Record<KnownKnowledgeType, RuntimeKnowledgeItem[]>;
}

function suppressSupersededVisibleItems(items: RuntimeKnowledgeItem[]) {
  const visibleIds = new Set(items.map((item) => item.id));
  const supersededIds = new Set(
    items
      .map((item) => item.supersedesKnowledgeId)
      .filter((value): value is string => value !== null && visibleIds.has(value))
  );

  return items.filter((item) => !supersededIds.has(item.id));
}

function sortByScopePrecedence(items: RuntimeKnowledgeItem[]) {
  return [...items].sort((left, right) => {
    const scopeDelta = SCOPE_ORDER[left.scopeType] - SCOPE_ORDER[right.scopeType];
    if (scopeDelta !== 0) {
      return scopeDelta;
    }

    return left.version - right.version;
  });
}

function groupByKnowledgeType(items: RuntimeKnowledgeItem[]) {
  const buckets = createEmptyBuckets();

  items.forEach((item) => {
    buckets[item.knowledgeType].push(item);
  });

  return buckets;
}

export function createRuntimeKnowledgeLoader(repository: RuntimeKnowledgeRepository) {
  return {
    async load(input: {
      bookId      : string;
      bookTypeKey : string | null;
      runId       : string | null;
      visibility  : RuntimeVisibilityMode;
    }): Promise<RuntimeKnowledgeBundle> {
      const scopeChain = buildScopeChain(input);
      const runtimeStates = getRuntimeReviewStates(input.visibility);
      const allVisibleItems = await repository.listKnowledgeItems({
        scopeSelectors: scopeChain,
        reviewStates  : runtimeStates
      });

      const verifiedItems = sortByScopePrecedence(suppressSupersededVisibleItems(
        allVisibleItems.filter((item) => item.reviewState === "VERIFIED")
      ));
      const pendingItems = input.visibility === "INCLUDE_PENDING"
        ? sortByScopePrecedence(suppressSupersededVisibleItems(
          allVisibleItems.filter((item) => item.reviewState === "PENDING")
        ))
        : [];

      const ordered = [...verifiedItems, ...pendingItems];

      return {
        scopeChain,
        verifiedItems,
        pendingItems,
        byType: groupByKnowledgeType(ordered)
      };
    }
  };
}
```

- [ ] **Step 4: Run the runtime-loader tests and verify they pass**

Run:

```bash
pnpm test src/server/modules/knowledge-v2/runtime-loader.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the runtime loader**

```bash
git add src/server/modules/knowledge-v2/runtime-loader.ts src/server/modules/knowledge-v2/runtime-loader.test.ts
git commit -m "feat: add kb v2 runtime loader"
```

## Task 6: Implement Reviewed-Claim Promotion

**Files:**
- Create: `src/server/modules/knowledge-v2/promotion.ts`
- Create: `src/server/modules/knowledge-v2/promotion.test.ts`

- [ ] **Step 1: Write the failing promotion tests**

Create `src/server/modules/knowledge-v2/promotion.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { createKnowledgePromotionService } from "@/server/modules/knowledge-v2/promotion";

describe("knowledge-v2 promotion service", () => {
  it("promotes accepted claims into verified knowledge", async () => {
    const claimLookup = {
      findPromotableClaim: vi.fn().mockResolvedValue({
        id         : "claim-1",
        family     : "RELATION",
        reviewState: "ACCEPTED",
        bookId     : "book-1",
        chapterId  : "chapter-1",
        runId      : "run-1"
      })
    };
    const knowledgeRepository = {
      createKnowledgeItem: vi.fn().mockResolvedValue({
        id         : "knowledge-1",
        version    : 1,
        reviewState: "VERIFIED"
      }),
      createSupersedingKnowledgeItem: vi.fn()
    };

    const service = createKnowledgePromotionService({
      claimLookup,
      knowledgeRepository
    } as never);

    const result = await service.promoteReviewedClaim({
      claimFamily    : "RELATION",
      claimId        : "claim-1",
      knowledgeType  : "relation taxonomy rule",
      scopeType      : "BOOK",
      scopeId        : null,
      payload        : {
        relationTypeKey   : "political_patron_of",
        displayLabel      : "政治庇护",
        direction         : "FORWARD",
        relationTypeSource: "CUSTOM",
        aliasLabels       : ["门生", "依附"]
      },
      actorUserId       : "user-1",
      targetReviewState : "VERIFIED",
      supersedesKnowledgeId: null
    });

    expect(result.version).toBe(1);
    expect(knowledgeRepository.createKnowledgeItem).toHaveBeenCalledWith(expect.objectContaining({
      scopeType            : "BOOK",
      scopeId              : "book-1",
      promotedFromClaimId  : "claim-1",
      promotedFromClaimFamily: "RELATION"
    }));
  });

  it("rejects non-accepted claims", async () => {
    const claimLookup = {
      findPromotableClaim: vi.fn().mockResolvedValue({
        id         : "claim-2",
        family     : "RELATION",
        reviewState: "PENDING",
        bookId     : "book-1",
        chapterId  : "chapter-1",
        runId      : "run-1"
      })
    };
    const service = createKnowledgePromotionService({
      claimLookup,
      knowledgeRepository: {
        createKnowledgeItem         : vi.fn(),
        createSupersedingKnowledgeItem: vi.fn()
      }
    } as never);

    await expect(() => service.promoteReviewedClaim({
      claimFamily    : "RELATION",
      claimId        : "claim-2",
      knowledgeType  : "relation taxonomy rule",
      scopeType      : "BOOK",
      scopeId        : null,
      payload        : {
        relationTypeKey   : "political_patron_of",
        displayLabel      : "政治庇护",
        direction         : "FORWARD",
        relationTypeSource: "CUSTOM",
        aliasLabels       : []
      },
      actorUserId         : "user-1",
      targetReviewState   : "VERIFIED",
      supersedesKnowledgeId: null
    })).rejects.toThrowError("Claim claim-2 is not promotable because reviewState=PENDING");
  });

  it("creates a superseding version when requested", async () => {
    const claimLookup = {
      findPromotableClaim: vi.fn().mockResolvedValue({
        id         : "claim-3",
        family     : "ALIAS",
        reviewState: "ACCEPTED",
        bookId     : "book-1",
        chapterId  : "chapter-1",
        runId      : "run-1"
      })
    };
    const knowledgeRepository = {
      createKnowledgeItem: vi.fn(),
      createSupersedingKnowledgeItem: vi.fn().mockResolvedValue({
        id      : "knowledge-2",
        version : 2
      })
    };

    const service = createKnowledgePromotionService({
      claimLookup,
      knowledgeRepository
    } as never);

    const result = await service.promoteReviewedClaim({
      claimFamily    : "ALIAS",
      claimId        : "claim-3",
      knowledgeType  : "alias equivalence rule",
      scopeType      : "BOOK",
      scopeId        : null,
      payload        : {
        canonicalName : "范进",
        aliasTexts    : ["范老爷", "范贤婿"],
        aliasTypeHints: ["TITLE", "NICKNAME"],
        note          : null
      },
      actorUserId         : "user-1",
      targetReviewState   : "VERIFIED",
      supersedesKnowledgeId: "knowledge-1"
    });

    expect(result.version).toBe(2);
    expect(knowledgeRepository.createSupersedingKnowledgeItem).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run the promotion tests and verify they fail**

Run:

```bash
pnpm test src/server/modules/knowledge-v2/promotion.test.ts
```

Expected: FAIL because `src/server/modules/knowledge-v2/promotion.ts` does not exist yet.

- [ ] **Step 3: Implement the promotion service**

Create `src/server/modules/knowledge-v2/promotion.ts`:

```ts
import type { KnownKnowledgeType } from "@/server/modules/knowledge-v2/payload-schemas";

export interface PromotableClaimSummary {
  id         : string;
  family     : "ALIAS" | "EVENT" | "RELATION" | "TIME" | "IDENTITY_RESOLUTION" | "CONFLICT_FLAG";
  reviewState: "PENDING" | "ACCEPTED" | "REJECTED" | "EDITED" | "DEFERRED" | "CONFLICTED";
  bookId     : string;
  chapterId  : string | null;
  runId      : string;
}

export interface ClaimLookupRepository {
  findPromotableClaim(input: {
    family : PromotableClaimSummary["family"];
    claimId: string;
  }): Promise<PromotableClaimSummary | null>;
}

export interface KnowledgePromotionRepository {
  createKnowledgeItem(input: Record<string, unknown>): Promise<{ id: string; version: number; reviewState?: string }>;
  createSupersedingKnowledgeItem(input: Record<string, unknown> & {
    supersedesKnowledgeId: string;
  }): Promise<{ id: string; version: number; reviewState?: string }>;
}

export class KnowledgePromotionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KnowledgePromotionError";
  }
}

function resolveScopeId(input: {
  scopeType: "GLOBAL" | "BOOK_TYPE" | "BOOK" | "RUN";
  scopeId  : string | null;
  claim    : PromotableClaimSummary;
}) {
  if (input.scopeType === "GLOBAL") {
    return null;
  }

  if (input.scopeType === "BOOK") {
    return input.scopeId ?? input.claim.bookId;
  }

  if (input.scopeType === "RUN") {
    return input.scopeId ?? input.claim.runId;
  }

  if (!input.scopeId) {
    throw new KnowledgePromotionError("BOOK_TYPE promotion requires explicit scopeId");
  }

  return input.scopeId;
}

export function createKnowledgePromotionService(dependencies: {
  claimLookup         : ClaimLookupRepository;
  knowledgeRepository : KnowledgePromotionRepository;
}) {
  return {
    async promoteReviewedClaim(input: {
      claimFamily           : PromotableClaimSummary["family"];
      claimId               : string;
      knowledgeType         : KnownKnowledgeType;
      scopeType             : "GLOBAL" | "BOOK_TYPE" | "BOOK" | "RUN";
      scopeId               : string | null;
      payload               : unknown;
      actorUserId           : string;
      targetReviewState     : "PENDING" | "VERIFIED";
      supersedesKnowledgeId : string | null;
    }) {
      const claim = await dependencies.claimLookup.findPromotableClaim({
        family : input.claimFamily,
        claimId: input.claimId
      });

      if (!claim) {
        throw new KnowledgePromotionError(`Claim ${input.claimId} was not found in family ${input.claimFamily}`);
      }

      if (claim.reviewState !== "ACCEPTED") {
        throw new KnowledgePromotionError(
          `Claim ${input.claimId} is not promotable because reviewState=${claim.reviewState}`
        );
      }

      const createInput = {
        scopeType               : input.scopeType,
        scopeId                 : resolveScopeId({
          scopeType: input.scopeType,
          scopeId  : input.scopeId,
          claim
        }),
        knowledgeType           : input.knowledgeType,
        payload                 : input.payload,
        source                  : "CLAIM_PROMOTION",
        reviewState             : input.targetReviewState,
        confidence              : null,
        effectiveFrom           : null,
        effectiveTo             : null,
        promotedFromClaimId     : claim.id,
        promotedFromClaimFamily : claim.family,
        createdByUserId         : input.actorUserId,
        reviewedByUserId        : input.actorUserId,
        reviewedAt              : new Date()
      };

      return input.supersedesKnowledgeId
        ? dependencies.knowledgeRepository.createSupersedingKnowledgeItem({
          ...createInput,
          supersedesKnowledgeId: input.supersedesKnowledgeId
        })
        : dependencies.knowledgeRepository.createKnowledgeItem(createInput);
    }
  };
}
```

- [ ] **Step 4: Run the promotion tests and verify they pass**

Run:

```bash
pnpm test src/server/modules/knowledge-v2/promotion.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the promotion service**

```bash
git add src/server/modules/knowledge-v2/promotion.ts src/server/modules/knowledge-v2/promotion.test.ts
git commit -m "feat: add kb v2 promotion service"
```

## Task 7: Barrel Export, Full Verification, And Completion Record

**Files:**
- Create: `src/server/modules/knowledge-v2/index.ts`
- Modify: `docs/superpowers/tasks/2026-04-18-evidence-review/17-kb-v2-foundation.md`
- Modify: `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`

- [ ] **Step 1: Add the public barrel export**

Create `src/server/modules/knowledge-v2/index.ts`:

```ts
export * from "./base-types";
export * from "./payload-schemas";
export * from "./repository";
export * from "./runtime-loader";
export * from "./promotion";
```

- [ ] **Step 2: Run the KB v2 test suite**

Run:

```bash
pnpm test src/server/modules/knowledge-v2
```

Expected: PASS.

- [ ] **Step 3: Run schema and type gates**

Run:

```bash
pnpm prisma validate --schema prisma/schema.prisma
pnpm prisma:generate
pnpm type-check
```

Expected: all commands pass.

- [ ] **Step 4: Mark the T17 task doc complete only after validation passes**

Update `docs/superpowers/tasks/2026-04-18-evidence-review/17-kb-v2-foundation.md`:

- Check every `Execution Checkpoints` item that was actually completed.
- Check every `Acceptance Criteria` item that now passes.
- Append an `Execution Record` entry describing the exact changed files and validation commands used in this task.

- [ ] **Step 5: Append the T17 completion record to the runbook**

Append a new section to `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md` after the T04 completion block:

```md
### T17 Completion - 2026-04-19

- Changed files: `prisma/schema.prisma`, `prisma/migrations/20260419183000_knowledge_v2_foundation/migration.sql`, `src/generated/prisma/**`, `src/server/modules/knowledge-v2/base-types.ts`, `src/server/modules/knowledge-v2/base-types.test.ts`, `src/server/modules/knowledge-v2/payload-schemas.ts`, `src/server/modules/knowledge-v2/payload-schemas.test.ts`, `src/server/modules/knowledge-v2/repository.ts`, `src/server/modules/knowledge-v2/repository.test.ts`, `src/server/modules/knowledge-v2/runtime-loader.ts`, `src/server/modules/knowledge-v2/runtime-loader.test.ts`, `src/server/modules/knowledge-v2/promotion.ts`, `src/server/modules/knowledge-v2/promotion.test.ts`, `src/server/modules/knowledge-v2/index.ts`, `docs/superpowers/tasks/2026-04-18-evidence-review/17-kb-v2-foundation.md`, `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`
- Validation commands: `pnpm test src/server/modules/knowledge-v2/base-types.test.ts`, `pnpm test src/server/modules/knowledge-v2/payload-schemas.test.ts`, `pnpm test src/server/modules/knowledge-v2/repository.test.ts`, `pnpm test src/server/modules/knowledge-v2/runtime-loader.test.ts`, `pnpm test src/server/modules/knowledge-v2/promotion.test.ts`, `pnpm test src/server/modules/knowledge-v2`, `pnpm prisma validate --schema prisma/schema.prisma`, `pnpm prisma:generate`, `pnpm type-check`
- Result: KB v2 now has one unified knowledge object, shared scope/review/source/version contracts, negative knowledge payloads, runtime loading semantics, and a reviewed-claim promotion foundation without cutting over legacy knowledge callers.
- Follow-up risks: runtime integration into Stage A+ is still pending T07; relation catalog governance/UI is still pending T18/T12/T14; old split knowledge tables still exist until T20 cutover.
- Next task: T05 `docs/superpowers/tasks/2026-04-18-evidence-review/05-stage-0-segmentation.md`
```

- [ ] **Step 6: Commit the final T17 completion sweep**

```bash
git add src/server/modules/knowledge-v2/index.ts docs/superpowers/tasks/2026-04-18-evidence-review/17-kb-v2-foundation.md docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md
git commit -m "docs: record kb v2 foundation completion"
```

## Self-Review

### 1. Spec Coverage

- §9.2 scope model -> Task 1, Task 2, Task 5
- §9.3 unified knowledge types -> Task 3
- §9.4 negative knowledge / runtime-review separation / promotion -> Task 3, Task 5, Task 6
- §9.5 unified object / review state / version / supersede / lineage -> Task 1, Task 4, Task 6
- §9.6 `relationTypeKey` string decision -> Task 3, Task 6
- T17 acceptance criteria -> Task 5, Task 6, Task 7

No spec gaps remain inside T17 scope. Intentional deferrals are legacy cutover (T20), Stage A+ recall integration (T07), and relation catalog governance/UI (T18/T12/T14).

### 2. Placeholder Scan

- No `TODO`, `TBD`, or “similar to Task N” placeholders were left in the plan.
- All new files have concrete paths.
- All test and validation commands are explicit.

### 3. Type Consistency

- Scope types are consistently `GLOBAL | BOOK_TYPE | BOOK | RUN`.
- Knowledge review states are consistently `PENDING | VERIFIED | REJECTED | DISABLED`.
- Knowledge source values are consistently `SYSTEM_PRESET | MANUAL_ENTRY | CLAIM_PROMOTION | IMPORTED | LEGACY_SEED`.
- `knowledgeType` remains a string in storage but a `KnownKnowledgeType` registry in code.
- Claim promotion consistently uses `promotedFromClaimId` plus `promotedFromClaimFamily`.
