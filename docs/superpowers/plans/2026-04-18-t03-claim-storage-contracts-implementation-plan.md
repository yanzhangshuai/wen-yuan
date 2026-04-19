# T03 Claim Storage Contracts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the shared claim DTO validation, stage-aware persistence contract, idempotent rerun semantics, and lineage-preserving manual override helpers required before extraction, identity resolution, and review mutations can safely write claim tables.

**Architecture:** Keep DTO parsing, persistence semantics, and manual override rules in separate files so later Stage A/A+/B/B.5/C code can reuse one contract instead of touching Prisma claim tables directly. Reuse the T01 schema and T02 evidence contract as-is: every persisted fact must bind to evidence, stage reruns replace only that stage's machine-owned scope, and manual edits append new `MANUAL` claims instead of overwriting earlier AI output.

**Tech Stack:** TypeScript strict, Zod, Vitest, Prisma 7 generated client contracts, mocked repository delegates, shared review-state helpers

---

## Source Of Truth

- Architecture spec: `docs/superpowers/specs/2026-04-18-evidence-review-architecture-rewrite-design.md`
- Task doc: `docs/superpowers/tasks/2026-04-18-evidence-review/03-claim-storage-contracts.md`
- Runbook: `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`
- TDD guide: `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-tdd-guide.md`
- Upstream completed tasks: T01 schema and state foundation, T02 text evidence layer

## Preconditions

- T01 Prisma schema is already generated and contains the evidence-review claim tables.
- T02 evidence helpers are the only valid evidence binding contract for this rewrite.
- No Prisma schema or migration changes are planned for T03.
- T03 does not implement Stage A/A+/B/B.5/C pipeline logic, review routes, UI, or KB v2.
- `relationTypeKey` remains a string column. This task does not introduce a database enum.

## Important Modeling Notes

- `entity_mentions` are evidence-bound machine outputs but do not carry review-state or lineage fields in T01. Treat them as contract-managed ingestion rows, not manual-override targets.
- `conflict_flags` are reviewable but intentionally leaner than lineage-capable claim families. They can be written and review-state updated through the contract layer, but they are not part of the manual override path in T03.
- Manual override support in this task is limited to lineage-capable families: `ALIAS`, `EVENT`, `RELATION`, `TIME`, and `IDENTITY_RESOLUTION`.
- Stage-aware idempotency is implemented in code, not schema, because claim tables do not persist `stageKey`. Later tasks must reuse this repository/service instead of writing claim tables directly.

## File Structure

- Create `src/server/modules/analysis/claims/claim-schemas.ts`
  - Responsibility: family-specific Zod DTOs, shared validation helpers, `claimFamily` discriminators, and manual-override family guards.
- Create `src/server/modules/analysis/claims/claim-schemas.test.ts`
  - Responsibility: prove evidence requirements, manual creator rules, custom relation keys, conflict-flag shape, and family selection.
- Create `src/server/modules/analysis/claims/claim-repository.ts`
  - Responsibility: stage-aware replace-by-scope repository, reviewable claim summary lookup/update helpers, and transaction wrapper.
- Create `src/server/modules/analysis/claims/claim-repository.test.ts`
  - Responsibility: prove stage ownership filters, chapter-scope enforcement, conflict/attribution replacement semantics, and reviewable claim mutations.
- Create `src/server/modules/analysis/claims/claim-write-service.ts`
  - Responsibility: validate drafts, align them with write scope, strip discriminators, and call repository replacement semantics.
- Create `src/server/modules/analysis/claims/claim-write-service.test.ts`
  - Responsibility: prove valid writes, missing evidence rejection, custom relation keys, and empty-rerun replacement.
- Create `src/server/modules/analysis/claims/manual-override.ts`
  - Responsibility: append accepted `MANUAL` claims with lineage, mark the superseded claim `EDITED`, and keep the whole override atomic.
- Create `src/server/modules/analysis/claims/manual-override.test.ts`
  - Responsibility: prove manual override success, lineage preservation, review-state transitions, and missing-original rejection.

## Task 1: Claim DTO Schemas And Family Guards

**Files:**
- Create: `src/server/modules/analysis/claims/claim-schemas.ts`
- Create: `src/server/modules/analysis/claims/claim-schemas.test.ts`

- [ ] **Step 1: Write the failing schema tests**

Create `src/server/modules/analysis/claims/claim-schemas.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  AliasClaimKind,
  AliasType,
  BioCategory,
  ConflictType,
  IdentityClaim,
  MentionKind,
  NarrativeLens
} from "@/generated/prisma/enums";
import {
  claimDraftSchema,
  claimFamilySchema,
  isManualOverrideFamily,
  validateClaimDraft,
  validateClaimDraftByFamily
} from "@/server/modules/analysis/claims/claim-schemas";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";
const CHAPTER_ID = "22222222-2222-4222-8222-222222222222";
const RUN_ID = "33333333-3333-4333-8333-333333333333";
const EVIDENCE_ID = "44444444-4444-4444-8444-444444444444";
const USER_ID = "55555555-5555-4555-8555-555555555555";

describe("claim schema contracts", () => {
  it("parses an evidence-bound entity mention", () => {
    const parsed = validateClaimDraftByFamily("ENTITY_MENTION", {
      claimFamily               : "ENTITY_MENTION",
      bookId                    : BOOK_ID,
      chapterId                 : CHAPTER_ID,
      surfaceText               : "范进",
      mentionKind               : MentionKind.NAMED,
      identityClaim             : IdentityClaim.SELF,
      aliasTypeHint             : AliasType.NAMED,
      speakerPersonaCandidateId : null,
      suspectedResolvesTo       : null,
      evidenceSpanId            : EVIDENCE_ID,
      confidence                : 0.94,
      source                    : "AI",
      runId                     : RUN_ID
    });

    expect(parsed.claimFamily).toBe("ENTITY_MENTION");
    expect(parsed.evidenceSpanId).toBe(EVIDENCE_ID);
  });

  it("rejects reviewable claims without evidence spans", () => {
    const parsed = claimDraftSchema.safeParse({
      claimFamily        : "ALIAS",
      bookId             : BOOK_ID,
      chapterId          : CHAPTER_ID,
      aliasText          : "范老爷",
      aliasType          : AliasType.TITLE,
      personaCandidateId : null,
      targetPersonaCandidateId: null,
      claimKind          : AliasClaimKind.TITLE_OF,
      evidenceSpanIds    : [],
      confidence         : 0.81,
      reviewState        : "PENDING",
      source             : "AI",
      runId              : RUN_ID,
      supersedesClaimId  : null,
      derivedFromClaimId : null,
      createdByUserId    : null,
      reviewedByUserId   : null,
      reviewNote         : null
    });

    expect(parsed.success).toBe(false);
    if (parsed.success) {
      return;
    }

    expect(parsed.error.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path   : ["evidenceSpanIds"],
        code   : "too_small",
        minimum: 1
      })
    ]));
  });

  it("keeps relationTypeKey open while validating label and source", () => {
    const parsed = validateClaimDraft({
      claimFamily              : "RELATION",
      bookId                   : BOOK_ID,
      chapterId                : CHAPTER_ID,
      sourceMentionId          : null,
      targetMentionId          : null,
      sourcePersonaCandidateId : null,
      targetPersonaCandidateId : null,
      relationTypeKey          : "political_patron_of",
      relationLabel            : "政治庇护",
      relationTypeSource       : "CUSTOM",
      direction                : "FORWARD",
      effectiveChapterStart    : 12,
      effectiveChapterEnd      : 18,
      timeHintId               : null,
      evidenceSpanIds          : [EVIDENCE_ID],
      confidence               : 0.63,
      reviewState              : "PENDING",
      source                   : "RULE",
      runId                    : RUN_ID,
      supersedesClaimId        : null,
      derivedFromClaimId       : null,
      createdByUserId          : null,
      reviewedByUserId         : null,
      reviewNote               : null
    });

    expect(parsed.claimFamily).toBe("RELATION");
    expect(parsed.relationTypeKey).toBe("political_patron_of");
  });

  it("disallows manual entity mentions and requires creators on manual lineage claims", () => {
    expect(() => validateClaimDraftByFamily("ENTITY_MENTION", {
      claimFamily               : "ENTITY_MENTION",
      bookId                    : BOOK_ID,
      chapterId                 : CHAPTER_ID,
      surfaceText               : "范进",
      mentionKind               : MentionKind.NAMED,
      identityClaim             : IdentityClaim.SELF,
      aliasTypeHint             : AliasType.NAMED,
      speakerPersonaCandidateId : null,
      suspectedResolvesTo       : null,
      evidenceSpanId            : EVIDENCE_ID,
      confidence                : 0.94,
      source                    : "MANUAL",
      runId                     : RUN_ID
    })).toThrowError("ENTITY_MENTION does not support manual claim writes");

    const parsed = claimDraftSchema.safeParse({
      claimFamily               : "EVENT",
      bookId                    : BOOK_ID,
      chapterId                 : CHAPTER_ID,
      subjectMentionId          : null,
      subjectPersonaCandidateId : null,
      predicate                 : "中举",
      objectText                : null,
      objectPersonaCandidateId  : null,
      locationText              : null,
      timeHintId                : null,
      eventCategory             : BioCategory.EXAM,
      narrativeLens             : NarrativeLens.SELF,
      evidenceSpanIds           : [EVIDENCE_ID],
      confidence                : 0.9,
      reviewState               : "ACCEPTED",
      source                    : "MANUAL",
      runId                     : RUN_ID,
      supersedesClaimId         : null,
      derivedFromClaimId        : null,
      createdByUserId           : null,
      reviewedByUserId          : USER_ID,
      reviewNote                : "人工新增"
    });

    expect(parsed.success).toBe(false);
    if (parsed.success) {
      return;
    }

    expect(parsed.error.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path   : ["createdByUserId"],
        message: "Manual claims must record createdByUserId"
      })
    ]));
  });

  it("treats conflict flags as reviewable but not manual override families", () => {
    const parsed = validateClaimDraftByFamily("CONFLICT_FLAG", {
      claimFamily      : "CONFLICT_FLAG",
      bookId           : BOOK_ID,
      chapterId        : CHAPTER_ID,
      runId            : RUN_ID,
      conflictType     : ConflictType.RELATION_DIRECTION_CONFLICT,
      relatedClaimKind : "RELATION",
      relatedClaimIds  : ["66666666-6666-4666-8666-666666666666"],
      summary          : "刘备与关羽的关系方向冲突",
      evidenceSpanIds  : [EVIDENCE_ID],
      reviewState      : "CONFLICTED",
      source           : "RULE",
      reviewedByUserId : null,
      reviewNote       : null
    });

    expect(parsed.claimFamily).toBe("CONFLICT_FLAG");
    expect(claimFamilySchema.parse("TIME")).toBe("TIME");
    expect(isManualOverrideFamily("RELATION")).toBe(true);
    expect(isManualOverrideFamily("CONFLICT_FLAG")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the schema tests and verify red**

Run:

```bash
pnpm test src/server/modules/analysis/claims/claim-schemas.test.ts
```

Expected: FAIL with module resolution error for `@/server/modules/analysis/claims/claim-schemas`.

- [ ] **Step 3: Implement the claim schema module**

Create `src/server/modules/analysis/claims/claim-schemas.ts`:

```ts
import { z } from "zod";

import {
  AliasClaimKind,
  AliasType,
  BioCategory,
  ClaimKind,
  ConflictType,
  IdentityClaim,
  IdentityResolutionKind,
  MentionKind,
  NarrativeLens,
  TimeType
} from "@/generated/prisma/enums";
import {
  claimAuditFieldsSchema,
  claimLineageSchema,
  claimReviewStateSchema,
  claimSourceSchema,
  evidenceBindingSchema,
  relationTypeSelectionSchema
} from "@/server/modules/analysis/claims/base-types";

const uuidSchema = z.string().uuid();
const nullableUuidSchema = uuidSchema.nullable();
const nullableTrimmedTextSchema = z.union([z.string().trim().min(1), z.null()]);
const confidenceSchema = z.number().finite().min(0).max(1);

export const CLAIM_FAMILY_VALUES = Object.freeze([
  "ENTITY_MENTION",
  "ALIAS",
  "EVENT",
  "RELATION",
  "TIME",
  "IDENTITY_RESOLUTION",
  "CONFLICT_FLAG"
] as const);

export type ClaimFamily = (typeof CLAIM_FAMILY_VALUES)[number];

export const MANUAL_OVERRIDE_FAMILY_VALUES = Object.freeze([
  "ALIAS",
  "EVENT",
  "RELATION",
  "TIME",
  "IDENTITY_RESOLUTION"
] as const);

export type ManualOverrideFamily = (typeof MANUAL_OVERRIDE_FAMILY_VALUES)[number];

export const REVIEWABLE_CLAIM_FAMILY_VALUES = Object.freeze([
  "ALIAS",
  "EVENT",
  "RELATION",
  "TIME",
  "IDENTITY_RESOLUTION",
  "CONFLICT_FLAG"
] as const);

export type ReviewableClaimFamily = (typeof REVIEWABLE_CLAIM_FAMILY_VALUES)[number];

export const claimFamilySchema = z.enum(CLAIM_FAMILY_VALUES);

const baseEntityScopeSchema = z.object({
  bookId    : uuidSchema,
  chapterId : uuidSchema,
  runId     : uuidSchema,
  source    : claimSourceSchema,
  confidence: confidenceSchema
});

const lineageCapableClaimBaseSchema = z.object({
  bookId    : uuidSchema,
  chapterId : nullableUuidSchema,
  confidence: confidenceSchema
}).merge(claimAuditFieldsSchema).merge(evidenceBindingSchema).merge(claimLineageSchema)
  .superRefine((value, ctx) => {
    if (value.source === "MANUAL" && value.createdByUserId === null) {
      ctx.addIssue({
        code   : z.ZodIssueCode.custom,
        path   : ["createdByUserId"],
        message: "Manual claims must record createdByUserId"
      });
    }
  });

export const entityMentionDraftSchema = baseEntityScopeSchema.extend({
  claimFamily              : z.literal("ENTITY_MENTION"),
  surfaceText              : z.string().trim().min(1),
  mentionKind              : z.nativeEnum(MentionKind),
  identityClaim            : z.nativeEnum(IdentityClaim).nullable(),
  aliasTypeHint            : z.nativeEnum(AliasType).nullable(),
  speakerPersonaCandidateId: nullableUuidSchema,
  suspectedResolvesTo      : nullableUuidSchema,
  evidenceSpanId           : uuidSchema
}).superRefine((value, ctx) => {
  if (value.source === "MANUAL") {
    ctx.addIssue({
      code   : z.ZodIssueCode.custom,
      path   : ["source"],
      message: "ENTITY_MENTION does not support manual claim writes"
    });
  }
});

export const aliasClaimDraftSchema = lineageCapableClaimBaseSchema.extend({
  claimFamily             : z.literal("ALIAS"),
  aliasText               : z.string().trim().min(1),
  aliasType               : z.nativeEnum(AliasType),
  personaCandidateId      : nullableUuidSchema,
  targetPersonaCandidateId: nullableUuidSchema,
  claimKind               : z.nativeEnum(AliasClaimKind)
});

export const eventClaimDraftSchema = lineageCapableClaimBaseSchema.extend({
  claimFamily               : z.literal("EVENT"),
  chapterId                 : uuidSchema,
  subjectMentionId          : nullableUuidSchema,
  subjectPersonaCandidateId : nullableUuidSchema,
  predicate                 : z.string().trim().min(1).max(120),
  objectText                : nullableTrimmedTextSchema,
  objectPersonaCandidateId  : nullableUuidSchema,
  locationText              : nullableTrimmedTextSchema,
  timeHintId                : nullableUuidSchema,
  eventCategory             : z.nativeEnum(BioCategory),
  narrativeLens             : z.nativeEnum(NarrativeLens)
});

export const relationClaimDraftSchema = lineageCapableClaimBaseSchema.extend({
  claimFamily              : z.literal("RELATION"),
  chapterId                : uuidSchema,
  sourceMentionId          : nullableUuidSchema,
  targetMentionId          : nullableUuidSchema,
  sourcePersonaCandidateId : nullableUuidSchema,
  targetPersonaCandidateId : nullableUuidSchema,
  effectiveChapterStart    : z.number().int().positive().nullable(),
  effectiveChapterEnd      : z.number().int().positive().nullable(),
  timeHintId               : nullableUuidSchema
}).merge(relationTypeSelectionSchema)
  .superRefine((value, ctx) => {
    if (
      value.effectiveChapterStart !== null &&
      value.effectiveChapterEnd !== null &&
      value.effectiveChapterStart > value.effectiveChapterEnd
    ) {
      ctx.addIssue({
        code   : z.ZodIssueCode.custom,
        path   : ["effectiveChapterEnd"],
        message: "effectiveChapterEnd must be greater than or equal to effectiveChapterStart"
      });
    }
  });

export const timeClaimDraftSchema = lineageCapableClaimBaseSchema.extend({
  claimFamily        : z.literal("TIME"),
  chapterId          : uuidSchema,
  rawTimeText        : z.string().trim().min(1),
  timeType           : z.nativeEnum(TimeType),
  normalizedLabel    : z.string().trim().min(1),
  relativeOrderWeight: z.number().finite().nullable(),
  chapterRangeStart  : z.number().int().positive().nullable(),
  chapterRangeEnd    : z.number().int().positive().nullable()
}).superRefine((value, ctx) => {
  if (
    value.chapterRangeStart !== null &&
    value.chapterRangeEnd !== null &&
    value.chapterRangeStart > value.chapterRangeEnd
  ) {
    ctx.addIssue({
      code   : z.ZodIssueCode.custom,
      path   : ["chapterRangeEnd"],
      message: "chapterRangeEnd must be greater than or equal to chapterRangeStart"
    });
  }
});

export const identityResolutionClaimDraftSchema = lineageCapableClaimBaseSchema.extend({
  claimFamily      : z.literal("IDENTITY_RESOLUTION"),
  mentionId        : uuidSchema,
  personaCandidateId: nullableUuidSchema,
  resolvedPersonaId: nullableUuidSchema,
  resolutionKind   : z.nativeEnum(IdentityResolutionKind),
  rationale        : nullableTrimmedTextSchema
});

export const conflictFlagDraftSchema = z.object({
  claimFamily     : z.literal("CONFLICT_FLAG"),
  bookId          : uuidSchema,
  chapterId       : nullableUuidSchema,
  runId           : uuidSchema,
  conflictType    : z.nativeEnum(ConflictType),
  relatedClaimKind: z.nativeEnum(ClaimKind).nullable(),
  relatedClaimIds : z.array(uuidSchema),
  summary         : z.string().trim().min(1),
  evidenceSpanIds : z.array(uuidSchema).min(1),
  reviewState     : claimReviewStateSchema,
  source          : claimSourceSchema,
  reviewedByUserId: nullableUuidSchema,
  reviewNote      : nullableTrimmedTextSchema
}).superRefine((value, ctx) => {
  if (value.source === "MANUAL") {
    ctx.addIssue({
      code   : z.ZodIssueCode.custom,
      path   : ["source"],
      message: "CONFLICT_FLAG does not support manual claim writes"
    });
  }
});

export const claimDraftSchemaByFamily = {
  ENTITY_MENTION    : entityMentionDraftSchema,
  ALIAS             : aliasClaimDraftSchema,
  EVENT             : eventClaimDraftSchema,
  RELATION          : relationClaimDraftSchema,
  TIME              : timeClaimDraftSchema,
  IDENTITY_RESOLUTION: identityResolutionClaimDraftSchema,
  CONFLICT_FLAG     : conflictFlagDraftSchema
} as const;

export const claimDraftSchema = z.discriminatedUnion("claimFamily", [
  entityMentionDraftSchema,
  aliasClaimDraftSchema,
  eventClaimDraftSchema,
  relationClaimDraftSchema,
  timeClaimDraftSchema,
  identityResolutionClaimDraftSchema,
  conflictFlagDraftSchema
]);

export interface ClaimDraftByFamily {
  ENTITY_MENTION    : z.infer<typeof entityMentionDraftSchema>;
  ALIAS             : z.infer<typeof aliasClaimDraftSchema>;
  EVENT             : z.infer<typeof eventClaimDraftSchema>;
  RELATION          : z.infer<typeof relationClaimDraftSchema>;
  TIME              : z.infer<typeof timeClaimDraftSchema>;
  IDENTITY_RESOLUTION: z.infer<typeof identityResolutionClaimDraftSchema>;
  CONFLICT_FLAG     : z.infer<typeof conflictFlagDraftSchema>;
}

export type ClaimDraft = ClaimDraftByFamily[ClaimFamily];

export type ClaimCreateDataByFamily = {
  [TFamily in ClaimFamily]: Omit<ClaimDraftByFamily[TFamily], "claimFamily">;
};

export function validateClaimDraft(draft: unknown): ClaimDraft {
  return claimDraftSchema.parse(draft);
}

export function validateClaimDraftByFamily<TFamily extends ClaimFamily>(
  family: TFamily,
  draft: unknown
): ClaimDraftByFamily[TFamily] {
  return claimDraftSchemaByFamily[family].parse(draft) as ClaimDraftByFamily[TFamily];
}

export function toClaimCreateData<TFamily extends ClaimFamily>(
  draft: ClaimDraftByFamily[TFamily]
): ClaimCreateDataByFamily[TFamily] {
  const { claimFamily: _claimFamily, ...data } = draft;
  return data;
}

export function isManualOverrideFamily(family: ClaimFamily): family is ManualOverrideFamily {
  return MANUAL_OVERRIDE_FAMILY_VALUES.includes(family as ManualOverrideFamily);
}
```

- [ ] **Step 4: Run the schema tests and verify green**

Run:

```bash
pnpm test src/server/modules/analysis/claims/claim-schemas.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/server/modules/analysis/claims/claim-schemas.ts src/server/modules/analysis/claims/claim-schemas.test.ts
git commit -m "feat: add claim schema contracts"
```

## Task 2: Stage-Aware Claim Repository Contract

**Files:**
- Create: `src/server/modules/analysis/claims/claim-repository.ts`
- Create: `src/server/modules/analysis/claims/claim-repository.test.ts`

- [ ] **Step 1: Write the failing repository tests**

Create `src/server/modules/analysis/claims/claim-repository.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { createClaimRepository } from "@/server/modules/analysis/claims/claim-repository";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";
const CHAPTER_ID = "22222222-2222-4222-8222-222222222222";
const RUN_ID = "33333333-3333-4333-8333-333333333333";
const USER_ID = "55555555-5555-4555-8555-555555555555";
const REVIEWED_AT = new Date("2026-04-19T00:00:00.000Z");

function createRepositoryClient() {
  const entityMention = {
    createMany: vi.fn().mockResolvedValue({ count: 0 }),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 })
  };
  const aliasClaim = {
    createMany: vi.fn().mockResolvedValue({ count: 2 }),
    deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    findUnique: vi.fn().mockResolvedValue(null),
    update    : vi.fn(),
    create    : vi.fn()
  };
  const eventClaim = {
    createMany: vi.fn().mockResolvedValue({ count: 0 }),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    findUnique: vi.fn().mockResolvedValue(null),
    update    : vi.fn(),
    create    : vi.fn()
  };
  const relationClaim = {
    createMany: vi.fn().mockResolvedValue({ count: 1 }),
    deleteMany: vi.fn().mockResolvedValue({ count: 4 }),
    findUnique: vi.fn().mockResolvedValue(null),
    update    : vi.fn(),
    create    : vi.fn()
  };
  const timeClaim = {
    createMany: vi.fn().mockResolvedValue({ count: 0 }),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    findUnique: vi.fn().mockResolvedValue({ id: "time-1", reviewState: "PENDING", source: "AI" }),
    update    : vi.fn().mockResolvedValue({ id: "time-1", reviewState: "EDITED", source: "AI" }),
    create    : vi.fn()
  };
  const identityResolutionClaim = {
    createMany: vi.fn().mockResolvedValue({ count: 0 }),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    findUnique: vi.fn().mockResolvedValue(null),
    update    : vi.fn(),
    create    : vi.fn()
  };
  const conflictFlag = {
    createMany: vi.fn().mockResolvedValue({ count: 0 }),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    findUnique: vi.fn().mockResolvedValue(null),
    update    : vi.fn(),
    create    : vi.fn()
  };

  const tx = {
    entityMention,
    aliasClaim,
    eventClaim,
    relationClaim,
    timeClaim,
    identityResolutionClaim,
    conflictFlag
  };

  const prisma = {
    ...tx,
    $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx))
  };

  return { prisma, tx };
}

describe("claim repository replace-by-scope", () => {
  it("replaces stage-a alias claims by run and chapter while keeping manual rows out of delete scope", async () => {
    const { prisma, tx } = createRepositoryClient();
    const repository = createClaimRepository(prisma);

    await expect(repository.replaceClaimFamilyScope({
      family: "ALIAS",
      scope : {
        bookId  : BOOK_ID,
        chapterId: CHAPTER_ID,
        runId   : RUN_ID,
        stageKey: "stage_a_extraction"
      },
      rows: [
        {
          bookId                  : BOOK_ID,
          chapterId               : CHAPTER_ID,
          aliasText               : "范老爷",
          aliasType               : "TITLE",
          personaCandidateId      : null,
          targetPersonaCandidateId: null,
          claimKind               : "TITLE_OF",
          evidenceSpanIds         : ["66666666-6666-4666-8666-666666666666"],
          confidence              : 0.8,
          reviewState             : "PENDING",
          source                  : "AI",
          runId                   : RUN_ID,
          supersedesClaimId       : null,
          derivedFromClaimId      : null,
          createdByUserId         : null,
          reviewedByUserId        : null,
          reviewNote              : null
        }
      ]
    })).resolves.toEqual({ deletedCount: 1, createdCount: 2 });

    expect(tx.aliasClaim.deleteMany).toHaveBeenCalledWith({
      where: {
        bookId            : BOOK_ID,
        chapterId         : CHAPTER_ID,
        runId             : RUN_ID,
        source            : "AI",
        derivedFromClaimId: null
      }
    });
  });

  it("replaces stage-c relation claims using derived ai ownership instead of deleting root extraction rows", async () => {
    const { prisma, tx } = createRepositoryClient();
    const repository = createClaimRepository(prisma);

    await repository.replaceClaimFamilyScope({
      family: "RELATION",
      scope : {
        bookId  : BOOK_ID,
        chapterId: CHAPTER_ID,
        runId   : RUN_ID,
        stageKey: "stage_c_fact_attribution"
      },
      rows: []
    });

    expect(tx.relationClaim.deleteMany).toHaveBeenCalledWith({
      where: {
        bookId            : BOOK_ID,
        chapterId         : CHAPTER_ID,
        runId             : RUN_ID,
        source            : "AI",
        derivedFromClaimId: { not: null }
      }
    });
    expect(tx.relationClaim.createMany).not.toHaveBeenCalled();
  });

  it("rejects unsupported stage and claim-family combinations", async () => {
    const { prisma } = createRepositoryClient();
    const repository = createClaimRepository(prisma);

    await expect(repository.replaceClaimFamilyScope({
      family: "IDENTITY_RESOLUTION",
      scope : {
        bookId  : BOOK_ID,
        chapterId: CHAPTER_ID,
        runId   : RUN_ID,
        stageKey: "stage_a_extraction"
      },
      rows: []
    })).rejects.toThrowError(
      "Stage stage_a_extraction cannot replace claim family IDENTITY_RESOLUTION"
    );
  });

  it("finds and updates reviewable claim summaries through the correct family delegate", async () => {
    const { prisma, tx } = createRepositoryClient();
    const repository = createClaimRepository(prisma);

    const summary = await repository.findReviewableClaimSummary("TIME", "time-1");

    expect(summary).toEqual({
      id         : "time-1",
      reviewState: "PENDING",
      source     : "AI"
    });
    expect(tx.timeClaim.findUnique).toHaveBeenCalledWith({
      where : { id: "time-1" },
      select: { id: true, reviewState: true, source: true }
    });

    await repository.updateReviewableClaimReviewState({
      family          : "TIME",
      claimId         : "time-1",
      reviewState     : "EDITED",
      reviewedByUserId: USER_ID,
      reviewedAt      : REVIEWED_AT,
      reviewNote      : "人工修订"
    });

    expect(tx.timeClaim.update).toHaveBeenCalledWith({
      where: { id: "time-1" },
      data : {
        reviewState     : "EDITED",
        reviewedByUserId: USER_ID,
        reviewedAt      : REVIEWED_AT,
        reviewNote      : "人工修订"
      }
    });
  });
});
```

- [ ] **Step 2: Run the repository tests and verify red**

Run:

```bash
pnpm test src/server/modules/analysis/claims/claim-repository.test.ts
```

Expected: FAIL with module resolution error for `@/server/modules/analysis/claims/claim-repository`.

- [ ] **Step 3: Implement the claim repository**

Create `src/server/modules/analysis/claims/claim-repository.ts`:

```ts
import type { ClaimReviewState, ClaimSource } from "@/server/modules/analysis/claims/base-types";
import type {
  ClaimCreateDataByFamily,
  ClaimFamily,
  ReviewableClaimFamily
} from "@/server/modules/analysis/claims/claim-schemas";

export const CLAIM_STAGE_KEYS = Object.freeze([
  "stage_a_extraction",
  "stage_a_plus_knowledge_recall",
  "stage_b_identity_resolution",
  "stage_b5_conflict_detection",
  "stage_c_fact_attribution"
] as const);

export type ClaimStageKey = (typeof CLAIM_STAGE_KEYS)[number];

export interface ClaimWriteScope {
  bookId   : string;
  chapterId?: string | null;
  runId    : string;
  stageKey : ClaimStageKey;
}

export interface ReplaceClaimFamilyScopeInput<TFamily extends ClaimFamily> {
  family: TFamily;
  scope : ClaimWriteScope;
  rows  : ClaimCreateDataByFamily[TFamily][];
}

export interface ReplaceClaimFamilyScopeResult {
  deletedCount: number;
  createdCount: number;
}

export interface ReviewableClaimSummary {
  id         : string;
  reviewState: ClaimReviewState;
  source     : ClaimSource;
}

export interface UpdateReviewableClaimReviewStateInput<TFamily extends ReviewableClaimFamily> {
  family          : TFamily;
  claimId         : string;
  reviewState     : ClaimReviewState;
  reviewedByUserId: string | null;
  reviewedAt      : Date | null;
  reviewNote      : string | null;
}

type DeleteWhere = Record<string, unknown>;

interface CreateManyDelegate<Row> {
  createMany(args: { data: Row[] }): Promise<{ count: number }>;
  deleteMany(args: { where: DeleteWhere }): Promise<{ count: number }>;
}

interface ReviewableClaimDelegate<Row> extends CreateManyDelegate<Row> {
  findUnique(args: {
    where : { id: string };
    select: { id: true; reviewState: true; source: true };
  }): Promise<ReviewableClaimSummary | null>;
  update(args: {
    where: { id: string };
    data : {
      reviewState     : ClaimReviewState;
      reviewedByUserId: string | null;
      reviewedAt      : Date | null;
      reviewNote      : string | null;
    };
  }): Promise<ReviewableClaimSummary>;
  create(args: { data: Row & { reviewedAt?: Date | null } }): Promise<{ id: string } & Row>;
}

export interface ClaimRepositoryTransactionClient {
  entityMention: CreateManyDelegate<ClaimCreateDataByFamily["ENTITY_MENTION"]>;
  aliasClaim: ReviewableClaimDelegate<ClaimCreateDataByFamily["ALIAS"]>;
  eventClaim: ReviewableClaimDelegate<ClaimCreateDataByFamily["EVENT"]>;
  relationClaim: ReviewableClaimDelegate<ClaimCreateDataByFamily["RELATION"]>;
  timeClaim: ReviewableClaimDelegate<ClaimCreateDataByFamily["TIME"]>;
  identityResolutionClaim: ReviewableClaimDelegate<ClaimCreateDataByFamily["IDENTITY_RESOLUTION"]>;
  conflictFlag: ReviewableClaimDelegate<ClaimCreateDataByFamily["CONFLICT_FLAG"]>;
}

export interface ClaimRepositoryClient extends ClaimRepositoryTransactionClient {
  $transaction<T>(callback: (tx: ClaimRepositoryTransactionClient) => Promise<T>): Promise<T>;
}

export interface ClaimRepository {
  transaction<T>(work: (repository: ClaimRepository) => Promise<T>): Promise<T>;
  replaceClaimFamilyScope<TFamily extends ClaimFamily>(
    input: ReplaceClaimFamilyScopeInput<TFamily>
  ): Promise<ReplaceClaimFamilyScopeResult>;
  findReviewableClaimSummary<TFamily extends ReviewableClaimFamily>(
    family: TFamily,
    claimId: string
  ): Promise<ReviewableClaimSummary | null>;
  updateReviewableClaimReviewState<TFamily extends ReviewableClaimFamily>(
    input: UpdateReviewableClaimReviewStateInput<TFamily>
  ): Promise<ReviewableClaimSummary>;
  createReviewableClaim<TFamily extends ReviewableClaimFamily>(
    family: TFamily,
    data: ClaimCreateDataByFamily[TFamily] & { reviewedAt?: Date | null }
  ): Promise<{ id: string } & ClaimCreateDataByFamily[TFamily]>;
}

export class ClaimRepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClaimRepositoryError";
  }
}

function requireChapterScope(scope: ClaimWriteScope): string {
  if (scope.chapterId === null || scope.chapterId === undefined) {
    throw new ClaimRepositoryError(`Stage ${scope.stageKey} requires chapterId for this claim family`);
  }

  return scope.chapterId;
}

function buildBaseScopeWhere(scope: ClaimWriteScope, requireChapterId = false): DeleteWhere {
  const where: DeleteWhere = {
    bookId: scope.bookId,
    runId : scope.runId
  };

  if (requireChapterId) {
    where.chapterId = requireChapterScope(scope);
  } else if (scope.chapterId !== undefined) {
    where.chapterId = scope.chapterId;
  }

  return where;
}

function buildReplacementWhere(family: ClaimFamily, scope: ClaimWriteScope): DeleteWhere {
  switch (family) {
    case "ENTITY_MENTION":
      if (scope.stageKey !== "stage_a_extraction") {
        throw new ClaimRepositoryError(
          `Stage ${scope.stageKey} cannot replace claim family ${family}`
        );
      }

      return {
        ...buildBaseScopeWhere(scope, true),
        source: "AI"
      };

    case "ALIAS":
      if (scope.stageKey === "stage_a_extraction") {
        return {
          ...buildBaseScopeWhere(scope, true),
          source            : "AI",
          derivedFromClaimId: null
        };
      }

      if (scope.stageKey === "stage_a_plus_knowledge_recall") {
        return {
          ...buildBaseScopeWhere(scope, true),
          source: "RULE"
        };
      }

      throw new ClaimRepositoryError(`Stage ${scope.stageKey} cannot replace claim family ${family}`);

    case "EVENT":
      if (scope.stageKey === "stage_a_extraction") {
        return {
          ...buildBaseScopeWhere(scope, true),
          source            : "AI",
          derivedFromClaimId: null
        };
      }

      if (scope.stageKey === "stage_a_plus_knowledge_recall") {
        return {
          ...buildBaseScopeWhere(scope, true),
          source: "RULE"
        };
      }

      if (scope.stageKey === "stage_c_fact_attribution") {
        return {
          ...buildBaseScopeWhere(scope, true),
          source            : "AI",
          derivedFromClaimId: { not: null }
        };
      }

      throw new ClaimRepositoryError(`Stage ${scope.stageKey} cannot replace claim family ${family}`);

    case "RELATION":
      if (scope.stageKey === "stage_a_extraction") {
        return {
          ...buildBaseScopeWhere(scope, true),
          source            : "AI",
          derivedFromClaimId: null
        };
      }

      if (scope.stageKey === "stage_a_plus_knowledge_recall") {
        return {
          ...buildBaseScopeWhere(scope, true),
          source: "RULE"
        };
      }

      if (scope.stageKey === "stage_c_fact_attribution") {
        return {
          ...buildBaseScopeWhere(scope, true),
          source            : "AI",
          derivedFromClaimId: { not: null }
        };
      }

      throw new ClaimRepositoryError(`Stage ${scope.stageKey} cannot replace claim family ${family}`);

    case "TIME":
      if (scope.stageKey === "stage_a_extraction") {
        return {
          ...buildBaseScopeWhere(scope, true),
          source            : "AI",
          derivedFromClaimId: null
        };
      }

      if (scope.stageKey === "stage_a_plus_knowledge_recall") {
        return {
          ...buildBaseScopeWhere(scope, true),
          source: "RULE"
        };
      }

      if (scope.stageKey === "stage_c_fact_attribution") {
        return {
          ...buildBaseScopeWhere(scope, true),
          source            : "AI",
          derivedFromClaimId: { not: null }
        };
      }

      throw new ClaimRepositoryError(`Stage ${scope.stageKey} cannot replace claim family ${family}`);

    case "IDENTITY_RESOLUTION":
      if (scope.stageKey !== "stage_b_identity_resolution") {
        throw new ClaimRepositoryError(
          `Stage ${scope.stageKey} cannot replace claim family ${family}`
        );
      }

      return {
        ...buildBaseScopeWhere(scope),
        source: "AI"
      };

    case "CONFLICT_FLAG":
      if (scope.stageKey !== "stage_b5_conflict_detection") {
        throw new ClaimRepositoryError(
          `Stage ${scope.stageKey} cannot replace claim family ${family}`
        );
      }

      return {
        ...buildBaseScopeWhere(scope),
        source: "RULE"
      };
  }
}

function getCreateManyDelegate<TFamily extends ClaimFamily>(
  tx: ClaimRepositoryTransactionClient,
  family: TFamily
): CreateManyDelegate<ClaimCreateDataByFamily[TFamily]> {
  switch (family) {
    case "ENTITY_MENTION":
      return tx.entityMention as CreateManyDelegate<ClaimCreateDataByFamily[TFamily]>;
    case "ALIAS":
      return tx.aliasClaim as CreateManyDelegate<ClaimCreateDataByFamily[TFamily]>;
    case "EVENT":
      return tx.eventClaim as CreateManyDelegate<ClaimCreateDataByFamily[TFamily]>;
    case "RELATION":
      return tx.relationClaim as CreateManyDelegate<ClaimCreateDataByFamily[TFamily]>;
    case "TIME":
      return tx.timeClaim as CreateManyDelegate<ClaimCreateDataByFamily[TFamily]>;
    case "IDENTITY_RESOLUTION":
      return tx.identityResolutionClaim as CreateManyDelegate<ClaimCreateDataByFamily[TFamily]>;
    case "CONFLICT_FLAG":
      return tx.conflictFlag as CreateManyDelegate<ClaimCreateDataByFamily[TFamily]>;
  }
}

function getReviewableDelegate<TFamily extends ReviewableClaimFamily>(
  tx: ClaimRepositoryTransactionClient,
  family: TFamily
): ReviewableClaimDelegate<ClaimCreateDataByFamily[TFamily]> {
  switch (family) {
    case "ALIAS":
      return tx.aliasClaim as ReviewableClaimDelegate<ClaimCreateDataByFamily[TFamily]>;
    case "EVENT":
      return tx.eventClaim as ReviewableClaimDelegate<ClaimCreateDataByFamily[TFamily]>;
    case "RELATION":
      return tx.relationClaim as ReviewableClaimDelegate<ClaimCreateDataByFamily[TFamily]>;
    case "TIME":
      return tx.timeClaim as ReviewableClaimDelegate<ClaimCreateDataByFamily[TFamily]>;
    case "IDENTITY_RESOLUTION":
      return tx.identityResolutionClaim as ReviewableClaimDelegate<ClaimCreateDataByFamily[TFamily]>;
    case "CONFLICT_FLAG":
      return tx.conflictFlag as ReviewableClaimDelegate<ClaimCreateDataByFamily[TFamily]>;
  }
}

function createMethods(tx: ClaimRepositoryTransactionClient): Omit<ClaimRepository, "transaction"> {
  return {
    async replaceClaimFamilyScope<TFamily extends ClaimFamily>(
      input: ReplaceClaimFamilyScopeInput<TFamily>
    ): Promise<ReplaceClaimFamilyScopeResult> {
      const delegate = getCreateManyDelegate(tx, input.family);
      const where = buildReplacementWhere(input.family, input.scope);
      const deleted = await delegate.deleteMany({ where });

      if (input.rows.length === 0) {
        return {
          deletedCount: deleted.count,
          createdCount: 0
        };
      }

      const created = await delegate.createMany({ data: input.rows });

      return {
        deletedCount: deleted.count,
        createdCount: created.count
      };
    },

    findReviewableClaimSummary<TFamily extends ReviewableClaimFamily>(
      family: TFamily,
      claimId: string
    ): Promise<ReviewableClaimSummary | null> {
      return getReviewableDelegate(tx, family).findUnique({
        where : { id: claimId },
        select: { id: true, reviewState: true, source: true }
      });
    },

    updateReviewableClaimReviewState<TFamily extends ReviewableClaimFamily>(
      input: UpdateReviewableClaimReviewStateInput<TFamily>
    ): Promise<ReviewableClaimSummary> {
      return getReviewableDelegate(tx, input.family).update({
        where: { id: input.claimId },
        data : {
          reviewState     : input.reviewState,
          reviewedByUserId: input.reviewedByUserId,
          reviewedAt      : input.reviewedAt,
          reviewNote      : input.reviewNote
        }
      });
    },

    createReviewableClaim<TFamily extends ReviewableClaimFamily>(
      family: TFamily,
      data: ClaimCreateDataByFamily[TFamily] & { reviewedAt?: Date | null }
    ): Promise<{ id: string } & ClaimCreateDataByFamily[TFamily]> {
      return getReviewableDelegate(tx, family).create({ data });
    }
  };
}

function createClaimRepositoryFromTransaction(tx: ClaimRepositoryTransactionClient): ClaimRepository {
  const methods = createMethods(tx);

  return {
    ...methods,
    transaction: async <T>(work: (repository: ClaimRepository) => Promise<T>): Promise<T> =>
      work(createClaimRepositoryFromTransaction(tx))
  };
}

export function createClaimRepository(prisma: ClaimRepositoryClient): ClaimRepository {
  const methods = createMethods(prisma);

  return {
    ...methods,
    transaction: async <T>(work: (repository: ClaimRepository) => Promise<T>): Promise<T> =>
      prisma.$transaction(async (tx) => work(createClaimRepositoryFromTransaction(tx)))
  };
}
```

- [ ] **Step 4: Run the repository tests and verify green**

Run:

```bash
pnpm test src/server/modules/analysis/claims/claim-repository.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/server/modules/analysis/claims/claim-repository.ts src/server/modules/analysis/claims/claim-repository.test.ts
git commit -m "feat: add claim repository replacement helpers"
```

## Task 3: Claim Write Service Validation And Idempotent Writes

**Files:**
- Create: `src/server/modules/analysis/claims/claim-write-service.ts`
- Create: `src/server/modules/analysis/claims/claim-write-service.test.ts`

- [ ] **Step 1: Write the failing write-service tests**

Create `src/server/modules/analysis/claims/claim-write-service.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { BioCategory, NarrativeLens, TimeType } from "@/generated/prisma/enums";
import { createClaimWriteService } from "@/server/modules/analysis/claims/claim-write-service";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";
const CHAPTER_ID = "22222222-2222-4222-8222-222222222222";
const RUN_ID = "33333333-3333-4333-8333-333333333333";
const EVIDENCE_ID = "44444444-4444-4444-8444-444444444444";

describe("claim write service", () => {
  it("validates and writes a chapter-scoped event batch through the repository contract", async () => {
    const repository = {
      replaceClaimFamilyScope: vi.fn().mockResolvedValue({ deletedCount: 1, createdCount: 1 })
    };
    const service = createClaimWriteService(repository);

    await expect(service.writeClaimBatch({
      family: "EVENT",
      scope : {
        bookId  : BOOK_ID,
        chapterId: CHAPTER_ID,
        runId   : RUN_ID,
        stageKey: "stage_a_extraction"
      },
      drafts: [
        {
          claimFamily               : "EVENT",
          bookId                    : BOOK_ID,
          chapterId                 : CHAPTER_ID,
          subjectMentionId          : null,
          subjectPersonaCandidateId : null,
          predicate                 : "中举",
          objectText                : null,
          objectPersonaCandidateId  : null,
          locationText              : null,
          timeHintId                : null,
          eventCategory             : BioCategory.EXAM,
          narrativeLens             : NarrativeLens.SELF,
          evidenceSpanIds           : [EVIDENCE_ID],
          confidence                : 0.93,
          reviewState               : "PENDING",
          source                    : "AI",
          runId                     : RUN_ID,
          supersedesClaimId         : null,
          derivedFromClaimId        : null,
          createdByUserId           : null,
          reviewedByUserId          : null,
          reviewNote                : null
        }
      ]
    })).resolves.toEqual({ deletedCount: 1, createdCount: 1 });

    expect(repository.replaceClaimFamilyScope).toHaveBeenCalledWith({
      family: "EVENT",
      scope : {
        bookId  : BOOK_ID,
        chapterId: CHAPTER_ID,
        runId   : RUN_ID,
        stageKey: "stage_a_extraction"
      },
      rows: [
        expect.objectContaining({
          predicate: "中举",
          source   : "AI"
        })
      ]
    });
  });

  it("rejects missing evidence before the repository is touched", async () => {
    const repository = {
      replaceClaimFamilyScope: vi.fn()
    };
    const service = createClaimWriteService(repository);

    await expect(service.writeClaimBatch({
      family: "TIME",
      scope : {
        bookId  : BOOK_ID,
        chapterId: CHAPTER_ID,
        runId   : RUN_ID,
        stageKey: "stage_a_extraction"
      },
      drafts: [
        {
          claimFamily        : "TIME",
          bookId             : BOOK_ID,
          chapterId          : CHAPTER_ID,
          rawTimeText        : "次日",
          timeType           : TimeType.RELATIVE_PHASE,
          normalizedLabel    : "次日",
          relativeOrderWeight: 2,
          chapterRangeStart  : 3,
          chapterRangeEnd    : 3,
          evidenceSpanIds    : [],
          confidence         : 0.8,
          reviewState        : "PENDING",
          source             : "AI",
          runId              : RUN_ID,
          supersedesClaimId  : null,
          derivedFromClaimId : null,
          createdByUserId    : null,
          reviewedByUserId   : null,
          reviewNote         : null
        }
      ]
    })).rejects.toThrowError();

    expect(repository.replaceClaimFamilyScope).not.toHaveBeenCalled();
  });

  it("accepts custom relation keys without converting them into enums", async () => {
    const repository = {
      replaceClaimFamilyScope: vi.fn().mockResolvedValue({ deletedCount: 0, createdCount: 1 })
    };
    const service = createClaimWriteService(repository);

    await service.writeClaimBatch({
      family: "RELATION",
      scope : {
        bookId  : BOOK_ID,
        chapterId: CHAPTER_ID,
        runId   : RUN_ID,
        stageKey: "stage_a_plus_knowledge_recall"
      },
      drafts: [
        {
          claimFamily              : "RELATION",
          bookId                   : BOOK_ID,
          chapterId                : CHAPTER_ID,
          sourceMentionId          : null,
          targetMentionId          : null,
          sourcePersonaCandidateId : null,
          targetPersonaCandidateId : null,
          relationTypeKey          : "political_patron_of",
          relationLabel            : "政治庇护",
          relationTypeSource       : "CUSTOM",
          direction                : "FORWARD",
          effectiveChapterStart    : null,
          effectiveChapterEnd      : null,
          timeHintId               : null,
          evidenceSpanIds          : [EVIDENCE_ID],
          confidence               : 0.74,
          reviewState              : "PENDING",
          source                   : "RULE",
          runId                    : RUN_ID,
          supersedesClaimId        : null,
          derivedFromClaimId       : null,
          createdByUserId          : null,
          reviewedByUserId         : null,
          reviewNote               : null
        }
      ]
    });

    expect(repository.replaceClaimFamilyScope).toHaveBeenCalledWith({
      family: "RELATION",
      scope : {
        bookId  : BOOK_ID,
        chapterId: CHAPTER_ID,
        runId   : RUN_ID,
        stageKey: "stage_a_plus_knowledge_recall"
      },
      rows: [
        expect.objectContaining({
          relationTypeKey: "political_patron_of",
          relationLabel  : "政治庇护"
        })
      ]
    });
  });

  it("uses empty batches to clear stale machine rows during reruns", async () => {
    const repository = {
      replaceClaimFamilyScope: vi.fn().mockResolvedValue({ deletedCount: 3, createdCount: 0 })
    };
    const service = createClaimWriteService(repository);

    await expect(service.writeClaimBatch({
      family: "TIME",
      scope : {
        bookId  : BOOK_ID,
        chapterId: CHAPTER_ID,
        runId   : RUN_ID,
        stageKey: "stage_c_fact_attribution"
      },
      drafts: []
    })).resolves.toEqual({ deletedCount: 3, createdCount: 0 });

    expect(repository.replaceClaimFamilyScope).toHaveBeenCalledWith({
      family: "TIME",
      scope : {
        bookId  : BOOK_ID,
        chapterId: CHAPTER_ID,
        runId   : RUN_ID,
        stageKey: "stage_c_fact_attribution"
      },
      rows: []
    });
  });
});
```

- [ ] **Step 2: Run the write-service tests and verify red**

Run:

```bash
pnpm test src/server/modules/analysis/claims/claim-write-service.test.ts
```

Expected: FAIL with module resolution error for `@/server/modules/analysis/claims/claim-write-service`.

- [ ] **Step 3: Implement the claim write service**

Create `src/server/modules/analysis/claims/claim-write-service.ts`:

```ts
import type {
  ClaimCreateDataByFamily,
  ClaimDraftByFamily,
  ClaimFamily
} from "@/server/modules/analysis/claims/claim-schemas";
import {
  toClaimCreateData,
  validateClaimDraftByFamily
} from "@/server/modules/analysis/claims/claim-schemas";
import type {
  ClaimWriteScope,
  ReplaceClaimFamilyScopeResult
} from "@/server/modules/analysis/claims/claim-repository";

export interface ClaimWriteRepository {
  replaceClaimFamilyScope<TFamily extends ClaimFamily>(input: {
    family: TFamily;
    scope : ClaimWriteScope;
    rows  : ClaimCreateDataByFamily[TFamily][];
  }): Promise<ReplaceClaimFamilyScopeResult>;
}

export interface WriteClaimBatchInput<TFamily extends ClaimFamily> {
  family: TFamily;
  scope : ClaimWriteScope;
  drafts: unknown[];
}

export class ClaimWriteServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClaimWriteServiceError";
  }
}

function getDraftChapterId<TFamily extends ClaimFamily>(draft: ClaimDraftByFamily[TFamily]): string | null {
  return "chapterId" in draft ? (draft.chapterId ?? null) : null;
}

function assertDraftMatchesScope<TFamily extends ClaimFamily>(
  family: TFamily,
  scope: ClaimWriteScope,
  draft: ClaimDraftByFamily[TFamily]
): void {
  if (draft.bookId !== scope.bookId) {
    throw new ClaimWriteServiceError(
      `Claim batch bookId mismatch for ${family}: ${draft.bookId} !== ${scope.bookId}`
    );
  }

  if (draft.runId !== scope.runId) {
    throw new ClaimWriteServiceError(
      `Claim batch runId mismatch for ${family}: ${draft.runId} !== ${scope.runId}`
    );
  }

  if (getDraftChapterId(draft) !== (scope.chapterId ?? null)) {
    throw new ClaimWriteServiceError(
      `Claim batch chapterId mismatch for ${family}: ${getDraftChapterId(draft)} !== ${scope.chapterId ?? null}`
    );
  }

  if (draft.source === "MANUAL") {
    throw new ClaimWriteServiceError(
      `Pipeline claim writes must not use MANUAL source for ${family}`
    );
  }
}

export function createClaimWriteService(repository: ClaimWriteRepository) {
  return {
    async writeClaimBatch<TFamily extends ClaimFamily>(
      input: WriteClaimBatchInput<TFamily>
    ): Promise<ReplaceClaimFamilyScopeResult> {
      const validatedDrafts = input.drafts.map((draft) =>
        validateClaimDraftByFamily(input.family, draft)
      );

      validatedDrafts.forEach((draft) => assertDraftMatchesScope(input.family, input.scope, draft));

      return repository.replaceClaimFamilyScope({
        family: input.family,
        scope : input.scope,
        rows  : validatedDrafts.map((draft) => toClaimCreateData(draft))
      });
    }
  };
}
```

- [ ] **Step 4: Run the write-service tests and verify green**

Run:

```bash
pnpm test src/server/modules/analysis/claims/claim-write-service.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/server/modules/analysis/claims/claim-write-service.ts src/server/modules/analysis/claims/claim-write-service.test.ts
git commit -m "feat: add claim write service"
```

## Task 4: Manual Override Helpers With Lineage Preservation

**Files:**
- Create: `src/server/modules/analysis/claims/manual-override.ts`
- Create: `src/server/modules/analysis/claims/manual-override.test.ts`

- [ ] **Step 1: Write the failing manual-override tests**

Create `src/server/modules/analysis/claims/manual-override.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { createManualOverrideService } from "@/server/modules/analysis/claims/manual-override";
import type { ClaimRepository } from "@/server/modules/analysis/claims/claim-repository";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";
const CHAPTER_ID = "22222222-2222-4222-8222-222222222222";
const RUN_ID = "33333333-3333-4333-8333-333333333333";
const EVIDENCE_ID = "44444444-4444-4444-8444-444444444444";
const USER_ID = "55555555-5555-4555-8555-555555555555";

function createRepositoryMock(summary = {
  id         : "relation-1",
  reviewState: "PENDING" as const,
  source     : "AI" as const
}): ClaimRepository {
  let repository: ClaimRepository;

  repository = {
    transaction: async <T>(work: (tx: ClaimRepository) => Promise<T>): Promise<T> => work(repository),
    replaceClaimFamilyScope      : vi.fn(),
    findReviewableClaimSummary   : vi.fn().mockResolvedValue(summary),
    updateReviewableClaimReviewState: vi.fn().mockResolvedValue({
      id         : summary.id,
      reviewState: "EDITED",
      source     : summary.source
    }),
    createReviewableClaim: vi.fn().mockResolvedValue({
      id                       : "manual-relation-1",
      bookId                   : BOOK_ID,
      chapterId                : CHAPTER_ID,
      sourceMentionId          : null,
      targetMentionId          : null,
      sourcePersonaCandidateId : null,
      targetPersonaCandidateId : null,
      relationTypeKey          : "political_patron_of",
      relationLabel            : "政治庇护",
      relationTypeSource       : "CUSTOM",
      direction                : "FORWARD",
      effectiveChapterStart    : 12,
      effectiveChapterEnd      : 18,
      timeHintId               : null,
      evidenceSpanIds          : [EVIDENCE_ID],
      confidence               : 1,
      reviewState              : "ACCEPTED",
      source                   : "MANUAL",
      runId                    : RUN_ID,
      supersedesClaimId        : "relation-1",
      derivedFromClaimId       : "relation-1",
      createdByUserId          : USER_ID,
      reviewedByUserId         : USER_ID,
      reviewNote               : "人工修订"
    })
  };

  return repository;
}

describe("manual override service", () => {
  it("creates an accepted manual relation claim and marks the original as edited", async () => {
    const repository = createRepositoryMock();
    const service = createManualOverrideService(repository);

    const result = await service.createManualOverride({
      family         : "RELATION",
      originalClaimId: "relation-1",
      actorUserId    : USER_ID,
      reviewNote     : "人工修订",
      draft          : {
        bookId                   : BOOK_ID,
        chapterId                : CHAPTER_ID,
        sourceMentionId          : null,
        targetMentionId          : null,
        sourcePersonaCandidateId : null,
        targetPersonaCandidateId : null,
        relationTypeKey          : "political_patron_of",
        relationLabel            : "政治庇护",
        relationTypeSource       : "CUSTOM",
        direction                : "FORWARD",
        effectiveChapterStart    : 12,
        effectiveChapterEnd      : 18,
        timeHintId               : null,
        evidenceSpanIds          : [EVIDENCE_ID],
        confidence               : 1,
        runId                    : RUN_ID
      }
    });

    expect(result).toEqual({
      originalClaimId: "relation-1",
      manualClaimId  : "manual-relation-1"
    });
    expect(repository.updateReviewableClaimReviewState).toHaveBeenCalledWith(
      expect.objectContaining({
        family     : "RELATION",
        claimId    : "relation-1",
        reviewState: "EDITED"
      })
    );
    expect(repository.createReviewableClaim).toHaveBeenCalledWith(
      "RELATION",
      expect.objectContaining({
        source           : "MANUAL",
        reviewState      : "ACCEPTED",
        supersedesClaimId: "relation-1",
        derivedFromClaimId: "relation-1",
        createdByUserId  : USER_ID,
        reviewedByUserId : USER_ID
      })
    );
  });

  it("rejects overrides when the original claim cannot transition to edited", async () => {
    const repository = createRepositoryMock({
      id         : "relation-1",
      reviewState: "REJECTED",
      source     : "AI"
    });
    const service = createManualOverrideService(repository);

    await expect(service.createManualOverride({
      family         : "RELATION",
      originalClaimId: "relation-1",
      actorUserId    : USER_ID,
      reviewNote     : "人工修订",
      draft          : {
        bookId                   : BOOK_ID,
        chapterId                : CHAPTER_ID,
        sourceMentionId          : null,
        targetMentionId          : null,
        sourcePersonaCandidateId : null,
        targetPersonaCandidateId : null,
        relationTypeKey          : "political_patron_of",
        relationLabel            : "政治庇护",
        relationTypeSource       : "CUSTOM",
        direction                : "FORWARD",
        effectiveChapterStart    : 12,
        effectiveChapterEnd      : 18,
        timeHintId               : null,
        evidenceSpanIds          : [EVIDENCE_ID],
        confidence               : 1,
        runId                    : RUN_ID
      }
    })).rejects.toThrowError("Claim review state cannot transition from REJECTED to EDITED");
  });

  it("rejects overrides when the original claim does not exist", async () => {
    const repository = createRepositoryMock(null);
    const service = createManualOverrideService(repository);

    await expect(service.createManualOverride({
      family         : "TIME",
      originalClaimId: "time-404",
      actorUserId    : USER_ID,
      reviewNote     : "人工修订",
      draft          : {
        bookId             : BOOK_ID,
        chapterId          : CHAPTER_ID,
        rawTimeText        : "次日",
        timeType           : "RELATIVE_PHASE",
        normalizedLabel    : "次日",
        relativeOrderWeight: 2,
        chapterRangeStart  : 3,
        chapterRangeEnd    : 3,
        evidenceSpanIds    : [EVIDENCE_ID],
        confidence         : 1,
        runId              : RUN_ID
      }
    })).rejects.toThrowError("Original claim time-404 was not found in family TIME");
  });
});
```

- [ ] **Step 2: Run the manual-override tests and verify red**

Run:

```bash
pnpm test src/server/modules/analysis/claims/manual-override.test.ts
```

Expected: FAIL with module resolution error for `@/server/modules/analysis/claims/manual-override`.

- [ ] **Step 3: Implement the manual-override helper**

Create `src/server/modules/analysis/claims/manual-override.ts`:

```ts
import { assertReviewStateTransition } from "@/server/modules/review/evidence-review/review-state";
import type { ClaimCreateDataByFamily, ClaimDraftByFamily, ManualOverrideFamily } from "@/server/modules/analysis/claims/claim-schemas";
import {
  isManualOverrideFamily,
  toClaimCreateData,
  validateClaimDraftByFamily
} from "@/server/modules/analysis/claims/claim-schemas";
import type { ClaimRepository } from "@/server/modules/analysis/claims/claim-repository";

export interface CreateManualOverrideInput<TFamily extends ManualOverrideFamily> {
  family         : TFamily;
  originalClaimId: string;
  actorUserId    : string;
  reviewNote?    : string | null;
  draft          : Omit<
    ClaimCreateDataByFamily[TFamily],
    "source" |
    "reviewState" |
    "supersedesClaimId" |
    "derivedFromClaimId" |
    "createdByUserId" |
    "reviewedByUserId"
  >;
}

export interface ManualOverrideResult {
  originalClaimId: string;
  manualClaimId  : string;
}

export class ManualOverrideError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManualOverrideError";
  }
}

export function createManualOverrideService(repository: ClaimRepository) {
  return {
    async createManualOverride<TFamily extends ManualOverrideFamily>(
      input: CreateManualOverrideInput<TFamily>
    ): Promise<ManualOverrideResult> {
      if (!isManualOverrideFamily(input.family)) {
        throw new ManualOverrideError(
          `Claim family ${input.family} does not support manual overrides`
        );
      }

      return repository.transaction(async (txRepository) => {
        const original = await txRepository.findReviewableClaimSummary(
          input.family,
          input.originalClaimId
        );

        if (original === null) {
          throw new ManualOverrideError(
            `Original claim ${input.originalClaimId} was not found in family ${input.family}`
          );
        }

        assertReviewStateTransition(original.reviewState, "EDITED");

        const reviewedAt = new Date();
        const manualDraft = validateClaimDraftByFamily(input.family, {
          claimFamily       : input.family,
          ...input.draft,
          source            : "MANUAL",
          reviewState       : "ACCEPTED",
          supersedesClaimId : input.originalClaimId,
          derivedFromClaimId: input.originalClaimId,
          createdByUserId   : input.actorUserId,
          reviewedByUserId  : input.actorUserId,
          reviewNote        : input.reviewNote ?? null
        }) as ClaimDraftByFamily[TFamily];

        await txRepository.updateReviewableClaimReviewState({
          family          : input.family,
          claimId         : input.originalClaimId,
          reviewState     : "EDITED",
          reviewedByUserId: input.actorUserId,
          reviewedAt,
          reviewNote      : input.reviewNote ?? null
        });

        const created = await txRepository.createReviewableClaim(input.family, {
          ...toClaimCreateData(manualDraft),
          reviewedAt
        });

        return {
          originalClaimId: input.originalClaimId,
          manualClaimId  : created.id
        };
      });
    }
  };
}
```

- [ ] **Step 4: Run the manual-override tests and verify green**

Run:

```bash
pnpm test src/server/modules/analysis/claims/manual-override.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 4**

```bash
git add src/server/modules/analysis/claims/manual-override.ts src/server/modules/analysis/claims/manual-override.test.ts
git commit -m "feat: add manual claim override helpers"
```

## Task 5: Task-Level Validation And Documentation Closure

**Files:**
- Modify: `docs/superpowers/tasks/2026-04-18-evidence-review/03-claim-storage-contracts.md`
- Modify: `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`

- [ ] **Step 1: Run the task-scoped test suite**

Run:

```bash
pnpm test src/server/modules/analysis/claims
```

Expected: PASS.

- [ ] **Step 2: Run type check**

Run:

```bash
pnpm type-check
```

Expected: PASS.

- [ ] **Step 3: Update the T03 task execution record**

Modify `docs/superpowers/tasks/2026-04-18-evidence-review/03-claim-storage-contracts.md` by replacing:

```markdown
## Execution Record

No execution recorded yet.
```

with this completed record, filling the commit list with the actual short commit hashes created during this task:

```markdown
## Execution Record

- Status: Completed
- Branch: `dev_2`
- Completed after T02 text evidence layer.
- Implemented claim-family DTO validation, stage-aware replace-by-scope repository helpers, write-service orchestration, and lineage-preserving manual override helpers.
- Validation:
  - `pnpm test src/server/modules/analysis/claims`
  - `pnpm type-check`
- Commits:
  - `feat: add claim schema contracts`
  - `feat: add claim repository replacement helpers`
  - `feat: add claim write service`
  - `feat: add manual claim override helpers`
- Follow-up risks: stage ownership is encoded in repository/service policy because claim tables do not persist `stageKey`; later pipeline and review code must reuse this contract instead of issuing raw claim-table writes.
```

- [ ] **Step 4: Mark T03 complete in the runbook**

Modify `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md` by changing the T03 checklist line from:

```markdown
- [ ] T03: `docs/superpowers/tasks/2026-04-18-evidence-review/03-claim-storage-contracts.md`
```

to:

```markdown
- [x] T03: `docs/superpowers/tasks/2026-04-18-evidence-review/03-claim-storage-contracts.md`
```

Append this note under the current completion log section:

```markdown
### T03 Claim Storage Contracts

- Status: Completed
- Output: claim schema validation, repository semantics, write-service orchestration, and manual override helpers under `src/server/modules/analysis/claims`.
- Validation:
  - `pnpm test src/server/modules/analysis/claims`
  - `pnpm type-check`
- Next task: T04 `docs/superpowers/tasks/2026-04-18-evidence-review/04-run-observability-retry.md`
```

- [ ] **Step 5: Commit documentation closure**

```bash
git add docs/superpowers/tasks/2026-04-18-evidence-review/03-claim-storage-contracts.md docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md
git commit -m "docs: record t03 claim storage contracts completion"
```

## Final Validation

- [ ] **Step 1: Confirm the working tree is clean**

Run:

```bash
git status --short
```

Expected: no output.
