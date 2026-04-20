# T09 Stage B.5 Conflict Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a deterministic whole-book Stage B.5 conflict detector that writes reviewable `CONFLICT_FLAG` claims for contradictions and uncertainty hot-spots without mutating the underlying claims.

**Architecture:** Add a focused `analysis/pipelines/evidence-review/stageB5` module that reads Stage A and Stage B outputs for one `bookId + runId`, evaluates six explicit rule families, converts findings into additive `CONFLICT_FLAG` drafts, and persists them through the existing reviewable-claim repository. Extend the `ConflictFlag` schema first so every conflict row carries severity, reason, recommended action, source stage, candidate bindings, chapter bindings, and source evidence needed by the review workbench and Stage C ranking.

**Tech Stack:** TypeScript strict, Vitest, Prisma 7 generated client, existing claim repository/write services, existing stage-run/raw-output service, existing Stage B pipeline modules, existing location exclusivity rule helpers.

---

## Source Of Truth

- Architecture spec: `docs/superpowers/specs/2026-04-18-evidence-review-architecture-rewrite-design.md` §5.2, §7.5, §8.1, §8.2, §9.4, §10
- Task doc: `docs/superpowers/tasks/2026-04-18-evidence-review/09-stage-b5-conflict-detection.md`
- Historical PRD: `.trellis/tasks/04-18-evidence-review-09-stage-b5-conflict-detection/prd.md`
- Runbook: `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`
- Upstream completed work:
  - `prisma/schema.prisma`
  - `src/server/modules/analysis/claims/claim-schemas.ts`
  - `src/server/modules/analysis/claims/claim-repository.ts`
  - `src/server/modules/analysis/runs/stage-run-service.ts`
  - `src/server/modules/analysis/pipelines/evidence-review/stageB/**`
  - `src/server/modules/analysis/preprocessor/locationExclusivityGraph.ts`
- Historical reference only:
  - `src/server/modules/analysis/pipelines/threestage/stageB5/types.ts`
  - `src/server/modules/analysis/pipelines/threestage/stageB5/TemporalConsistencyChecker.ts`

## Scope Constraints

- Do not mutate `reviewState`, `confidence`, candidate assignment, or any other field on existing alias/event/relation/time/identity-resolution claims.
- Do not write Stage C attribution rows, Stage D projections, or any UI/API code in T09.
- Do not call an LLM. T09 is deterministic, rule-first, and cost-free.
- Do not hide contradictions only inside logs or `reviewNote`; every detected issue must become a persisted `CONFLICT_FLAG`.
- Do not use `writeClaimBatch()` for Stage B.5 final writes because conflict rows can be mixed-chapter and `chapterId = null`.
- Do not invent new relation-type normalization logic or knowledge-base lookup logic inside T09.
- Stop if Stage B no longer writes parseable `reviewNote` block tags for alias blockers such as `NEGATIVE_ALIAS_RULE`, `IMPERSONATION`, `MISIDENTIFICATION`, or `CONFLICTING_CANONICAL_HINTS`.

## Current Repo Facts

- `ConflictFlag` currently stores only `conflictType`, `relatedClaimKind`, `relatedClaimIds`, `summary`, `evidenceSpanIds`, `reviewState`, `source`, and review audit fields. It does **not** yet store severity, structured reason, recommended action, source stage, related candidates, or related chapters.
- `claim-schemas.ts` already treats `CONFLICT_FLAG` as a reviewable family, but the DTO contract is too thin for the review workbench and Stage C ranking inputs.
- `claim-repository.ts` already recognizes `stage_b5_conflict_detection` as a valid stage key and already allows `replaceClaimFamilyScope()` for `CONFLICT_FLAG` with `source: "RULE"`.
- `claim-write-service.ts` enforces one `chapterId` per batch. This is safe for Stage A and Stage B chapter-grouped writes, but unsafe for Stage B.5 because some conflicts are chapterless or span multiple chapters.
- `stageB/IdentityResolver.ts` already establishes the expected stage-run pattern: start stage run, record raw output, succeed/fail stage run, and keep token/cost fields at zero for deterministic stages.
- `stageB/repository.ts` already demonstrates the preferred whole-book repository pattern: read rows for `bookId + runId`, fetch chapter numbers once, and map them into lightweight DTOs.
- `locationExclusivityGraph.ts` already exposes `areMutuallyExclusive(locA, locB)` with stable pairs including `南京 ↔ 北京`, `京师 ↔ 江南`, `城内 ↔ 城外`.
- Stage B alias and identity-resolution outputs already encode machine tags inside `reviewNote`; T09 should consume those tags rather than reparsing the original chapter text.

## File Structure

- Modify `prisma/schema.prisma`
  - Responsibility: extend `ConflictFlag` storage contract and add a `ConflictSeverity` enum.
- Modify `src/server/modules/analysis/claims/claim-schemas.ts`
  - Responsibility: extend `conflictFlagDraftSchema` and exported DTO types to match the new persisted contract.
- Modify `src/server/modules/analysis/claims/claim-schemas.test.ts`
  - Responsibility: lock the new conflict DTO contract and `toClaimCreateData()` behavior.
- Create `src/server/modules/analysis/pipelines/evidence-review/stageB5/types.ts`
  - Responsibility: stable Stage B.5 constants, repository DTOs, rule output DTOs, run result DTOs, summary helpers.
- Create `src/server/modules/analysis/pipelines/evidence-review/stageB5/types.test.ts`
  - Responsibility: lock stage metadata, recommended-action key catalog, and summary formatting.
- Create `src/server/modules/analysis/pipelines/evidence-review/stageB5/repository.ts`
  - Responsibility: load whole-book candidates and claim rows needed by the conflict rules.
- Create `src/server/modules/analysis/pipelines/evidence-review/stageB5/repository.test.ts`
  - Responsibility: prove source filters, chapter-number mapping, null-chapter handling, and transaction wrapping.
- Create `src/server/modules/analysis/pipelines/evidence-review/stageB5/conflict-rules.ts`
  - Responsibility: implement the six rule families and a deterministic aggregator.
- Create `src/server/modules/analysis/pipelines/evidence-review/stageB5/conflict-rules.test.ts`
  - Responsibility: prove at least six high-risk classical-literature cases, one per required conflict family.
- Create `src/server/modules/analysis/pipelines/evidence-review/stageB5/draft-builder.ts`
  - Responsibility: convert rule findings into valid `CONFLICT_FLAG` drafts with stable sorting and machine-readable review notes.
- Create `src/server/modules/analysis/pipelines/evidence-review/stageB5/draft-builder.test.ts`
  - Responsibility: prove chapter anchoring, deduplication, and output defaults.
- Create `src/server/modules/analysis/pipelines/evidence-review/stageB5/persister.ts`
  - Responsibility: clear prior run-scoped conflict rows and create new reviewable claims one-by-one inside one transaction.
- Create `src/server/modules/analysis/pipelines/evidence-review/stageB5/persister.test.ts`
  - Responsibility: prove clear-first behavior, mixed chapter handling, and stable create order.
- Create `src/server/modules/analysis/pipelines/evidence-review/stageB5/ConflictDetector.ts`
  - Responsibility: stage-run orchestration, raw-output recording, repository reads, rule execution, draft building, and persistence.
- Create `src/server/modules/analysis/pipelines/evidence-review/stageB5/ConflictDetector.test.ts`
  - Responsibility: prove happy path, empty-input path, and failure propagation.
- Create `src/server/modules/analysis/pipelines/evidence-review/stageB5/index.ts`
  - Responsibility: stable public export surface for T10 and future review APIs.
- Modify `docs/superpowers/tasks/2026-04-18-evidence-review/09-stage-b5-conflict-detection.md`
  - Responsibility: execution record and checklist updates only after validation passes.
- Modify `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`
  - Responsibility: mark T09 complete only after validation passes.

## Modeling Decisions

- Stage B.5 is whole-book scoped by `bookId + runId`. It never reruns extraction and never reads projection tables.
- Extend `ConflictFlag` additively with:
  - `severity: ConflictSeverity`
  - `reason: String @db.Text`
  - `recommendedActionKey: String`
  - `sourceStageKey: String`
  - `relatedPersonaCandidateIds: String[]`
  - `relatedChapterIds: String[]`
- Keep `recommendedActionKey` and `sourceStageKey` as database strings, not enums. The code will expose literal-union presets, but the database must stay open for future custom review actions and stage migrations.
- Use Prisma enum for `ConflictSeverity` because the severity taxonomy is closed and the UI needs reliable ordering and filtering.
- `chapterId` on the persisted conflict row is only the primary anchor:
  - one related chapter => set that `chapterId`
  - multiple related chapters => set `chapterId = null` and populate `relatedChapterIds`
- `relatedClaimKind` stays nullable:
  - set it when every related claim belongs to the same family
  - set `null` when a conflict spans multiple families
- `reviewNote` remains machine-readable and compact, for example `STAGE_B5: recommendedActionKey=VERIFY_IDENTITY_SPLIT; sourceStageKey=stage_b_identity_resolution; tags=NEGATIVE_ALIAS_RULE|IMPERSONATION`.
- Persistence strategy:
  - clear the entire Stage B.5 run scope with `replaceClaimFamilyScope({ family: "CONFLICT_FLAG", scope: { bookId, runId, stageKey }, rows: [] })`
  - then create each conflict row with `createReviewableClaim("CONFLICT_FLAG", ...)`
- Rule families and default severity/action policy:
  - `POST_MORTEM_ACTION` => `CRITICAL`, `VERIFY_IDENTITY_SPLIT`
  - `IMPOSSIBLE_LOCATION` => `HIGH`, `VERIFY_LOCATION_ATTRIBUTION`
  - `TIME_ORDER_CONFLICT` => `HIGH`, `VERIFY_TIME_ALIGNMENT`
  - `RELATION_DIRECTION_CONFLICT` => `HIGH`, `VERIFY_RELATION_DIRECTION`
  - `ALIAS_CONFLICT` => `HIGH`, `VERIFY_IDENTITY_SPLIT`
  - `LOW_EVIDENCE_CLAIM` => `LOW`, `REQUEST_MORE_EVIDENCE`
- Rule inputs are conservative:
  - `ALIAS_CONFLICT` consumes Stage B `IDENTITY_RESOLUTION.reviewNote` block tags rather than replaying Stage A+ raw alias parsing.
  - `RELATION_DIRECTION_CONFLICT` compares normalized candidate pairs and ignores `BIDIRECTIONAL` / `UNDIRECTED` claims.
  - `LOW_EVIDENCE_CLAIM` only emits for reviewable claims with `confidence <= 0.55` and exactly one evidence span.
  - `POST_MORTEM_ACTION` requires a `DEATH` event for the same candidate before a later active event.
  - `IMPOSSIBLE_LOCATION` only checks same candidate + same chapter pairs with non-null `locationText`.
  - `TIME_ORDER_CONFLICT` compares chapter order and effective ranges against bound `TIME` claims.

## Task 1: Extend ConflictFlag Schema And Claim Contract

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `src/server/modules/analysis/claims/claim-schemas.ts`
- Modify: `src/server/modules/analysis/claims/claim-schemas.test.ts`

- [ ] **Step 1: Write the failing contract tests**

Add these cases to `src/server/modules/analysis/claims/claim-schemas.test.ts`:

```ts
import { ConflictSeverity } from "@/generated/prisma/enums";

it("requires structured stage-b5 metadata on conflict flags", () => {
  const parsed = validateClaimDraftByFamily("CONFLICT_FLAG", {
    claimFamily               : "CONFLICT_FLAG",
    bookId                    : BOOK_ID,
    chapterId                 : CHAPTER_ID,
    runId                     : RUN_ID,
    conflictType              : ConflictType.POST_MORTEM_ACTION,
    severity                  : ConflictSeverity.CRITICAL,
    reason                    : "候选人物在死亡事件之后仍然出现主动行动事件。",
    recommendedActionKey      : "VERIFY_IDENTITY_SPLIT",
    sourceStageKey            : "stage_b_identity_resolution",
    relatedClaimKind          : "EVENT",
    relatedClaimIds           : ["66666666-6666-4666-8666-666666666666"],
    relatedPersonaCandidateIds: ["77777777-7777-4777-8777-777777777777"],
    relatedChapterIds         : [CHAPTER_ID],
    summary                   : "死亡后仍有主动行动：范进候选在第 12 回后继续出现事件。",
    evidenceSpanIds           : [EVIDENCE_ID],
    reviewState               : "CONFLICTED",
    source                    : "RULE",
    reviewedByUserId          : null,
    reviewNote                : "STAGE_B5: recommendedActionKey=VERIFY_IDENTITY_SPLIT"
  });

  expect(parsed.severity).toBe(ConflictSeverity.CRITICAL);
  expect(toClaimCreateData(parsed)).toMatchObject({
    severity                  : ConflictSeverity.CRITICAL,
    reason                    : "候选人物在死亡事件之后仍然出现主动行动事件。",
    recommendedActionKey      : "VERIFY_IDENTITY_SPLIT",
    sourceStageKey            : "stage_b_identity_resolution",
    relatedPersonaCandidateIds: ["77777777-7777-4777-8777-777777777777"],
    relatedChapterIds         : [CHAPTER_ID]
  });
});

it("rejects conflict flags that omit severity, reason, or chapter bindings", () => {
  const parsed = claimDraftSchema.safeParse({
    claimFamily     : "CONFLICT_FLAG",
    bookId          : BOOK_ID,
    chapterId       : null,
    runId           : RUN_ID,
    conflictType    : ConflictType.TIME_ORDER_CONFLICT,
    relatedClaimKind: "TIME",
    relatedClaimIds : ["88888888-8888-4888-8888-888888888888"],
    summary         : "时间提示与章节顺序冲突",
    evidenceSpanIds : [EVIDENCE_ID],
    reviewState     : "CONFLICTED",
    source          : "RULE",
    reviewedByUserId: null,
    reviewNote      : null
  });

  expect(parsed.success).toBe(false);
  if (parsed.success) {
    return;
  }

  expect(parsed.error.issues).toEqual(expect.arrayContaining([
    expect.objectContaining({ path: ["severity"] }),
    expect.objectContaining({ path: ["reason"] }),
    expect.objectContaining({ path: ["recommendedActionKey"] }),
    expect.objectContaining({ path: ["sourceStageKey"] }),
    expect.objectContaining({ path: ["relatedPersonaCandidateIds"] }),
    expect.objectContaining({ path: ["relatedChapterIds"] })
  ]));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
pnpm exec vitest run src/server/modules/analysis/claims/claim-schemas.test.ts
```

Expected: FAIL with TypeScript/runtime errors because `ConflictSeverity` and the new conflict fields do not exist yet.

- [ ] **Step 3: Write the minimal schema and DTO implementation**

Update `prisma/schema.prisma`:

```prisma
enum ConflictSeverity {
  LOW
  MEDIUM
  HIGH
  CRITICAL

  @@map("conflict_severity")
}

model ConflictFlag {
  id                        String           @id @default(uuid()) @db.Uuid
  bookId                    String           @map("book_id") @db.Uuid
  chapterId                 String?          @map("chapter_id") @db.Uuid
  runId                     String           @map("run_id") @db.Uuid
  conflictType              ConflictType     @map("conflict_type")
  severity                  ConflictSeverity @map("severity")
  reason                    String           @db.Text
  recommendedActionKey      String           @map("recommended_action_key")
  sourceStageKey            String           @map("source_stage_key")
  relatedClaimKind          ClaimKind?       @map("related_claim_kind")
  relatedClaimIds           String[]         @default([]) @map("related_claim_ids")
  relatedPersonaCandidateIds String[]        @default([]) @map("related_persona_candidate_ids")
  relatedChapterIds         String[]         @default([]) @map("related_chapter_ids")
  summary                   String           @db.Text
  evidenceSpanIds           String[]         @default([]) @map("evidence_span_ids")
  reviewState               ClaimReviewState @default(CONFLICTED) @map("review_state")
  source                    ClaimSource      @default(RULE)
  reviewedByUserId          String?          @map("reviewed_by_user_id") @db.Uuid
  reviewedAt                DateTime?        @map("reviewed_at") @db.Timestamptz(6)
  reviewNote                String?          @map("review_note") @db.Text
  createdAt                 DateTime         @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt                 DateTime         @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@index([bookId, reviewState], map: "conflict_flags_book_state_idx")
  @@index([runId], map: "conflict_flags_run_idx")
  @@index([conflictType], map: "conflict_flags_type_idx")
  @@index([severity], map: "conflict_flags_severity_idx")
  @@map("conflict_flags")
}
```

Update `src/server/modules/analysis/claims/claim-schemas.ts`:

```ts
import {
  ClaimKind,
  ConflictSeverity,
  ConflictType,
  IdentityClaim,
  IdentityResolutionKind,
  MentionKind,
  NarrativeLens,
  TimeType
} from "@/generated/prisma/enums";

export const conflictFlagDraftSchema = z.object({
  claimFamily               : z.literal("CONFLICT_FLAG"),
  bookId                    : uuidSchema,
  chapterId                 : nullableUuidSchema,
  runId                     : uuidSchema,
  conflictType              : z.nativeEnum(ConflictType),
  severity                  : z.nativeEnum(ConflictSeverity),
  reason                    : z.string().trim().min(1),
  recommendedActionKey      : z.string().trim().min(1),
  sourceStageKey            : z.string().trim().min(1),
  relatedClaimKind          : z.nativeEnum(ClaimKind).nullable(),
  relatedClaimIds           : z.array(uuidSchema),
  relatedPersonaCandidateIds: z.array(uuidSchema),
  relatedChapterIds         : z.array(uuidSchema),
  summary                   : z.string().trim().min(1),
  evidenceSpanIds           : z.array(uuidSchema).min(1),
  reviewState               : claimReviewStateSchema,
  source                    : claimSourceSchema,
  reviewedByUserId          : nullableUuidSchema,
  reviewNote                : nullableTrimmedTextSchema
}).superRefine((value, ctx) => {
  if (value.source === "MANUAL") {
    ctx.addIssue({
      code   : z.ZodIssueCode.custom,
      path   : ["source"],
      message: "CONFLICT_FLAG does not support manual claim writes"
    });
  }
});
```

Generate the migration and client:

```bash
pnpm prisma migrate dev --name t09_conflict_flag_contract
pnpm prisma generate
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```bash
pnpm exec vitest run src/server/modules/analysis/claims/claim-schemas.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/generated/prisma src/server/modules/analysis/claims/claim-schemas.ts src/server/modules/analysis/claims/claim-schemas.test.ts
git commit -m "feat: extend conflict flag claim contract"
```

## Task 2: Define Stage B.5 Types And Stable Summary Helpers

**Files:**
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageB5/types.test.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageB5/types.ts`

- [ ] **Step 1: Write the failing type-contract tests**

Create `src/server/modules/analysis/pipelines/evidence-review/stageB5/types.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  ConflictSeverity,
  ConflictType
} from "@/generated/prisma/enums";
import {
  CONFLICT_RECOMMENDED_ACTION_KEYS,
  STAGE_B5_RULE_MODEL,
  STAGE_B5_RULE_PROVIDER,
  STAGE_B5_RULE_VERSION,
  STAGE_B5_STAGE_KEY,
  summarizeStageB5ConflictCounts
} from "@/server/modules/analysis/pipelines/evidence-review/stageB5/types";

describe("stageB5/types", () => {
  it("exports stable stage metadata and action keys", () => {
    expect(STAGE_B5_STAGE_KEY).toBe("stage_b5_conflict_detection");
    expect(STAGE_B5_RULE_PROVIDER).toBe("rule-engine");
    expect(STAGE_B5_RULE_MODEL).toBe("stage-b5-conflict-detection-v1");
    expect(STAGE_B5_RULE_VERSION).toBe("2026-04-20-stage-b5-v1");
    expect(CONFLICT_RECOMMENDED_ACTION_KEYS).toEqual([
      "REQUEST_MORE_EVIDENCE",
      "VERIFY_IDENTITY_SPLIT",
      "VERIFY_LOCATION_ATTRIBUTION",
      "VERIFY_RELATION_DIRECTION",
      "VERIFY_TIME_ALIGNMENT"
    ]);
  });

  it("summarizes conflict counts by type and severity deterministically", () => {
    expect(summarizeStageB5ConflictCounts([
      { conflictType: ConflictType.POST_MORTEM_ACTION, severity: ConflictSeverity.CRITICAL },
      { conflictType: ConflictType.ALIAS_CONFLICT, severity: ConflictSeverity.HIGH },
      { conflictType: ConflictType.ALIAS_CONFLICT, severity: ConflictSeverity.HIGH },
      { conflictType: ConflictType.LOW_EVIDENCE_CLAIM, severity: ConflictSeverity.LOW }
    ])).toBe("ALIAS_CONFLICT:2,LOW_EVIDENCE_CLAIM:1,POST_MORTEM_ACTION:1 | CRITICAL:1,HIGH:2,LOW:1");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stageB5/types.test.ts
```

Expected: FAIL because the `stageB5/types.ts` module does not exist yet.

- [ ] **Step 3: Write the minimal types module**

Create `src/server/modules/analysis/pipelines/evidence-review/stageB5/types.ts`:

```ts
import type { ClaimReviewState, ClaimSource, RelationDirection, RelationTypeSource } from "@/server/modules/analysis/claims/base-types";
import type { ClaimDraftByFamily } from "@/server/modules/analysis/claims/claim-schemas";
import type {
  BioCategory,
  ClaimKind,
  ConflictSeverity,
  ConflictType,
  IdentityResolutionKind,
  MentionKind,
  NarrativeLens,
  TimeType
} from "@/generated/prisma/enums";

export const STAGE_B5_STAGE_KEY = "stage_b5_conflict_detection";
export const STAGE_B5_RULE_VERSION = "2026-04-20-stage-b5-v1";
export const STAGE_B5_RULE_PROVIDER = "rule-engine";
export const STAGE_B5_RULE_MODEL = "stage-b5-conflict-detection-v1";
export const STAGE_B5_LOW_EVIDENCE_THRESHOLD = 0.55;

export const CONFLICT_RECOMMENDED_ACTION_KEYS = [
  "REQUEST_MORE_EVIDENCE",
  "VERIFY_IDENTITY_SPLIT",
  "VERIFY_LOCATION_ATTRIBUTION",
  "VERIFY_RELATION_DIRECTION",
  "VERIFY_TIME_ALIGNMENT"
] as const;

export type ConflictRecommendedActionKey = (typeof CONFLICT_RECOMMENDED_ACTION_KEYS)[number];

export interface StageB5PersonaCandidateRow {
  id                 : string;
  bookId             : string;
  runId              : string;
  canonicalLabel     : string;
  firstSeenChapterNo : number | null;
  lastSeenChapterNo  : number | null;
  mentionCount       : number;
  evidenceScore      : number;
}

export interface StageB5AliasClaimRow {
  id             : string;
  bookId         : string;
  chapterId      : string | null;
  chapterNo      : number | null;
  runId          : string;
  aliasText      : string;
  claimKind      : string;
  evidenceSpanIds: string[];
  confidence     : number;
  reviewState    : ClaimReviewState;
  source         : ClaimSource;
  reviewNote     : string | null;
}

export interface StageB5EventClaimRow {
  id                        : string;
  bookId                    : string;
  chapterId                 : string;
  chapterNo                 : number;
  runId                     : string;
  subjectPersonaCandidateId : string | null;
  objectPersonaCandidateId  : string | null;
  predicate                 : string;
  objectText                : string | null;
  locationText              : string | null;
  timeHintId                : string | null;
  eventCategory             : BioCategory;
  narrativeLens             : NarrativeLens;
  evidenceSpanIds           : string[];
  confidence                : number;
  reviewState               : ClaimReviewState;
  source                    : ClaimSource;
  derivedFromClaimId        : string | null;
  reviewNote                : string | null;
}

export interface StageB5RelationClaimRow {
  id                       : string;
  bookId                   : string;
  chapterId                : string;
  chapterNo                : number;
  runId                    : string;
  sourcePersonaCandidateId : string | null;
  targetPersonaCandidateId : string | null;
  relationTypeKey          : string;
  relationLabel            : string;
  relationTypeSource       : RelationTypeSource;
  direction                : RelationDirection;
  effectiveChapterStart    : number | null;
  effectiveChapterEnd      : number | null;
  timeHintId               : string | null;
  evidenceSpanIds          : string[];
  confidence               : number;
  reviewState              : ClaimReviewState;
  source                   : ClaimSource;
  derivedFromClaimId       : string | null;
  reviewNote               : string | null;
}

export interface StageB5TimeClaimRow {
  id                  : string;
  bookId              : string;
  chapterId           : string;
  chapterNo           : number;
  runId               : string;
  rawTimeText         : string;
  timeType            : TimeType;
  normalizedLabel     : string;
  relativeOrderWeight : number | null;
  chapterRangeStart   : number | null;
  chapterRangeEnd     : number | null;
  evidenceSpanIds     : string[];
  confidence          : number;
  reviewState         : ClaimReviewState;
  source              : ClaimSource;
  derivedFromClaimId  : string | null;
  reviewNote          : string | null;
}

export interface StageB5IdentityResolutionClaimRow {
  id                 : string;
  bookId             : string;
  chapterId          : string | null;
  chapterNo          : number | null;
  runId              : string;
  mentionId          : string;
  personaCandidateId : string | null;
  resolutionKind     : IdentityResolutionKind;
  rationale          : string | null;
  evidenceSpanIds    : string[];
  confidence         : number;
  reviewState        : ClaimReviewState;
  source             : ClaimSource;
  reviewNote         : string | null;
}

export interface StageB5RepositoryPayload {
  personaCandidates        : StageB5PersonaCandidateRow[];
  aliasClaims              : StageB5AliasClaimRow[];
  eventClaims              : StageB5EventClaimRow[];
  relationClaims           : StageB5RelationClaimRow[];
  timeClaims               : StageB5TimeClaimRow[];
  identityResolutionClaims : StageB5IdentityResolutionClaimRow[];
}

export interface StageB5ConflictFinding {
  conflictType              : ConflictType;
  severity                  : ConflictSeverity;
  reason                    : string;
  summary                   : string;
  recommendedActionKey      : ConflictRecommendedActionKey;
  sourceStageKey            : string;
  relatedClaimKind          : ClaimKind | null;
  relatedClaimIds           : string[];
  relatedPersonaCandidateIds: string[];
  relatedChapterIds         : string[];
  evidenceSpanIds           : string[];
  tags                      : string[];
}

export interface StageB5ConflictDraftBundle {
  drafts: ClaimDraftByFamily["CONFLICT_FLAG"][];
}

export interface StageB5RunInput {
  bookId  : string;
  runId   : string | null;
  attempt?: number;
}

export interface StageB5RunResult {
  bookId         : string;
  runId          : string | null;
  stageRunId     : string | null;
  rawOutputId    : string | null;
  inputCount     : number;
  outputCount    : number;
  skippedCount   : number;
  decisionSummary: string;
}

export function summarizeStageB5ConflictCounts(
  rows: Array<{ conflictType: ConflictType; severity: ConflictSeverity }>
): string {
  const typeCounts = new Map<ConflictType, number>();
  const severityCounts = new Map<ConflictSeverity, number>();

  for (const row of rows) {
    typeCounts.set(row.conflictType, (typeCounts.get(row.conflictType) ?? 0) + 1);
    severityCounts.set(row.severity, (severityCounts.get(row.severity) ?? 0) + 1);
  }

  const typeSummary = Array.from(typeCounts.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([type, count]) => `${type}:${count}`)
    .join(",");

  const severitySummary = Array.from(severityCounts.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([severity, count]) => `${severity}:${count}`)
    .join(",");

  return `${typeSummary} | ${severitySummary}`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```bash
pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stageB5/types.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/modules/analysis/pipelines/evidence-review/stageB5/types.ts src/server/modules/analysis/pipelines/evidence-review/stageB5/types.test.ts
git commit -m "feat: add stage b5 type contracts"
```

## Task 3: Build The Whole-Book Conflict Input Repository

**Files:**
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageB5/repository.test.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageB5/repository.ts`

- [ ] **Step 1: Write the failing repository tests**

Create `src/server/modules/analysis/pipelines/evidence-review/stageB5/repository.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import type {
  StageB5RepositoryClient,
  StageB5RepositoryTransactionClient
} from "@/server/modules/analysis/pipelines/evidence-review/stageB5/repository";
import { createStageB5Repository } from "@/server/modules/analysis/pipelines/evidence-review/stageB5/repository";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";
const RUN_ID = "22222222-2222-4222-8222-222222222222";
const CHAPTER_ID_1 = "33333333-3333-4333-8333-333333333333";
const CHAPTER_ID_2 = "44444444-4444-4444-8444-444444444444";

function createRepositoryClient() {
  const tx: StageB5RepositoryTransactionClient = {
    chapter: {
      findMany: vi.fn().mockResolvedValue([
        { id: CHAPTER_ID_1, no: 10 },
        { id: CHAPTER_ID_2, no: 12 }
      ])
    },
    personaCandidate: {
      findMany: vi.fn().mockResolvedValue([
        {
          id                 : "candidate-1",
          bookId             : BOOK_ID,
          runId              : RUN_ID,
          canonicalLabel     : "范进",
          firstSeenChapterNo : 1,
          lastSeenChapterNo  : 20,
          mentionCount       : 14,
          evidenceScore      : 0.92
        }
      ])
    },
    aliasClaim: {
      findMany: vi.fn().mockResolvedValue([
        {
          id             : "alias-1",
          bookId         : BOOK_ID,
          chapterId      : CHAPTER_ID_1,
          runId          : RUN_ID,
          aliasText      : "范老爷",
          claimKind      : "TITLE_OF",
          evidenceSpanIds: ["evidence-1"],
          confidence     : 0.8,
          reviewState    : "PENDING",
          source         : "RULE",
          reviewNote     : "KB_VERIFIED: canonicalName=范进",
          createdAt      : new Date("2026-04-20T00:00:00.000Z")
        }
      ])
    },
    eventClaim: {
      findMany: vi.fn().mockResolvedValue([
        {
          id                        : "event-1",
          bookId                    : BOOK_ID,
          chapterId                 : CHAPTER_ID_2,
          runId                     : RUN_ID,
          subjectPersonaCandidateId : "candidate-1",
          objectPersonaCandidateId  : null,
          predicate                 : "赴宴",
          objectText                : null,
          locationText              : "北京",
          timeHintId                : "time-1",
          eventCategory             : "EVENT",
          narrativeLens             : "SELF",
          evidenceSpanIds           : ["evidence-2"],
          confidence                : 0.7,
          reviewState               : "PENDING",
          source                    : "AI",
          derivedFromClaimId        : null,
          reviewNote                : null,
          createdAt                 : new Date("2026-04-20T00:00:01.000Z")
        }
      ])
    },
    relationClaim: {
      findMany: vi.fn().mockResolvedValue([
        {
          id                       : "relation-1",
          bookId                   : BOOK_ID,
          chapterId                : CHAPTER_ID_1,
          runId                    : RUN_ID,
          sourcePersonaCandidateId : "candidate-1",
          targetPersonaCandidateId : "candidate-2",
          relationTypeKey          : "teacher_of",
          relationLabel            : "师生",
          relationTypeSource       : "PRESET",
          direction                : "FORWARD",
          effectiveChapterStart    : 10,
          effectiveChapterEnd      : 12,
          timeHintId               : null,
          evidenceSpanIds          : ["evidence-3"],
          confidence               : 0.88,
          reviewState              : "PENDING",
          source                   : "AI",
          derivedFromClaimId       : null,
          reviewNote               : null,
          createdAt                : new Date("2026-04-20T00:00:02.000Z")
        }
      ])
    },
    timeClaim: {
      findMany: vi.fn().mockResolvedValue([
        {
          id                 : "time-1",
          bookId             : BOOK_ID,
          chapterId          : CHAPTER_ID_1,
          runId              : RUN_ID,
          rawTimeText        : "次日",
          timeType           : "RELATIVE_PHASE",
          normalizedLabel    : "次日",
          relativeOrderWeight: 2,
          chapterRangeStart  : 11,
          chapterRangeEnd    : 11,
          evidenceSpanIds    : ["evidence-4"],
          confidence         : 0.61,
          reviewState        : "PENDING",
          source             : "AI",
          derivedFromClaimId : null,
          reviewNote         : null,
          createdAt          : new Date("2026-04-20T00:00:03.000Z")
        }
      ])
    },
    identityResolutionClaim: {
      findMany: vi.fn().mockResolvedValue([
        {
          id                : "identity-1",
          bookId            : BOOK_ID,
          chapterId         : null,
          runId             : RUN_ID,
          mentionId         : "mention-1",
          personaCandidateId: "candidate-1",
          resolutionKind    : "SPLIT_FROM",
          rationale         : "blocked alias chain",
          evidenceSpanIds   : ["evidence-5"],
          confidence        : 0.79,
          reviewState       : "CONFLICTED",
          source            : "AI",
          reviewNote        : "STAGE_B: blocks=NEGATIVE_ALIAS_RULE",
          createdAt         : new Date("2026-04-20T00:00:04.000Z")
        }
      ])
    }
  };

  const client: StageB5RepositoryClient = {
    ...tx,
    $transaction: vi.fn(
      async (callback: (inner: StageB5RepositoryTransactionClient) => Promise<unknown>) => callback(tx)
    ) as StageB5RepositoryClient["$transaction"]
  };

  return { client, tx };
}

describe("stageB5/repository", () => {
  it("loads whole-book conflict inputs and maps chapter numbers", async () => {
    const { client, tx } = createRepositoryClient();
    const repository = createStageB5Repository(client);

    const payload = await repository.loadConflictInputs({ bookId: BOOK_ID, runId: RUN_ID });

    expect(payload.personaCandidates).toHaveLength(1);
    expect(payload.aliasClaims[0]?.chapterNo).toBe(10);
    expect(payload.eventClaims[0]?.chapterNo).toBe(12);
    expect(payload.identityResolutionClaims[0]?.chapterNo).toBeNull();
    expect(tx.eventClaim.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        bookId: BOOK_ID,
        runId : RUN_ID,
        source: { in: ["AI", "RULE"] }
      })
    }));
  });

  it("wraps nested work inside the provided transaction client", async () => {
    const { client } = createRepositoryClient();
    const repository = createStageB5Repository(client);

    const labels = await repository.transaction(async (txRepository) => {
      const payload = await txRepository.loadConflictInputs({ bookId: BOOK_ID, runId: RUN_ID });
      return payload.personaCandidates.map((row) => row.canonicalLabel);
    });

    expect(labels).toEqual(["范进"]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stageB5/repository.test.ts
```

Expected: FAIL because the repository module does not exist yet.

- [ ] **Step 3: Write the minimal repository implementation**

Create `src/server/modules/analysis/pipelines/evidence-review/stageB5/repository.ts`:

```ts
import { prisma } from "@/server/db/prisma";
import type {
  StageB5AliasClaimRow,
  StageB5EventClaimRow,
  StageB5IdentityResolutionClaimRow,
  StageB5PersonaCandidateRow,
  StageB5RelationClaimRow,
  StageB5RepositoryPayload,
  StageB5TimeClaimRow
} from "@/server/modules/analysis/pipelines/evidence-review/stageB5/types";

const READ_SOURCES = ["AI", "RULE"] as const;

type ChapterRow = { id: string; no: number };

interface TimestampedRow {
  chapterId : string | null;
  createdAt : Date;
}

type ChapterBoundRow = (StageB5AliasClaimRow | StageB5EventClaimRow | StageB5RelationClaimRow | StageB5TimeClaimRow | StageB5IdentityResolutionClaimRow) & TimestampedRow;

export interface StageB5RepositoryTransactionClient {
  chapter: {
    findMany(args: {
      where: { bookId: string; id: { in: string[] } };
      select: { id: true; no: true };
      orderBy: { no: "asc" };
    }): Promise<ChapterRow[]>;
  };
  personaCandidate: {
    findMany(args: {
      where: { bookId: string; runId: string };
      orderBy: { canonicalLabel: "asc" };
      select: {
        id                 : true;
        bookId             : true;
        runId              : true;
        canonicalLabel     : true;
        firstSeenChapterNo : true;
        lastSeenChapterNo  : true;
        mentionCount       : true;
        evidenceScore      : true;
      };
    }): Promise<StageB5PersonaCandidateRow[]>;
  };
  aliasClaim: {
    findMany(args: {
      where: { bookId: string; runId: string; source: { in: readonly ["AI", "RULE"] } };
      orderBy: Array<{ chapterId: "asc" } | { createdAt: "asc" }>;
      select: {
        id             : true;
        bookId         : true;
        chapterId      : true;
        runId          : true;
        aliasText      : true;
        claimKind      : true;
        evidenceSpanIds: true;
        confidence     : true;
        reviewState    : true;
        source         : true;
        reviewNote     : true;
        createdAt      : true;
      };
    }): Promise<Array<Omit<StageB5AliasClaimRow, "chapterNo"> & { createdAt: Date }>>;
  };
  eventClaim: {
    findMany(args: {
      where: { bookId: string; runId: string; source: { in: readonly ["AI", "RULE"] } };
      orderBy: Array<{ chapterId: "asc" } | { createdAt: "asc" }>;
      select: {
        id                        : true;
        bookId                    : true;
        chapterId                 : true;
        runId                     : true;
        subjectPersonaCandidateId : true;
        objectPersonaCandidateId  : true;
        predicate                 : true;
        objectText                : true;
        locationText              : true;
        timeHintId                : true;
        eventCategory             : true;
        narrativeLens             : true;
        evidenceSpanIds           : true;
        confidence                : true;
        reviewState               : true;
        source                    : true;
        derivedFromClaimId        : true;
        reviewNote                : true;
        createdAt                 : true;
      };
    }): Promise<Array<Omit<StageB5EventClaimRow, "chapterNo"> & { createdAt: Date }>>;
  };
  relationClaim: {
    findMany(args: {
      where: { bookId: string; runId: string; source: { in: readonly ["AI", "RULE"] } };
      orderBy: Array<{ chapterId: "asc" } | { createdAt: "asc" }>;
      select: {
        id                       : true;
        bookId                   : true;
        chapterId                : true;
        runId                    : true;
        sourcePersonaCandidateId : true;
        targetPersonaCandidateId : true;
        relationTypeKey          : true;
        relationLabel            : true;
        relationTypeSource       : true;
        direction                : true;
        effectiveChapterStart    : true;
        effectiveChapterEnd      : true;
        timeHintId               : true;
        evidenceSpanIds          : true;
        confidence               : true;
        reviewState              : true;
        source                   : true;
        derivedFromClaimId       : true;
        reviewNote               : true;
        createdAt                : true;
      };
    }): Promise<Array<Omit<StageB5RelationClaimRow, "chapterNo"> & { createdAt: Date }>>;
  };
  timeClaim: {
    findMany(args: {
      where: { bookId: string; runId: string; source: { in: readonly ["AI", "RULE"] } };
      orderBy: Array<{ chapterId: "asc" } | { createdAt: "asc" }>;
      select: {
        id                 : true;
        bookId             : true;
        chapterId          : true;
        runId              : true;
        rawTimeText        : true;
        timeType           : true;
        normalizedLabel    : true;
        relativeOrderWeight: true;
        chapterRangeStart  : true;
        chapterRangeEnd    : true;
        evidenceSpanIds    : true;
        confidence         : true;
        reviewState        : true;
        source             : true;
        derivedFromClaimId : true;
        reviewNote         : true;
        createdAt          : true;
      };
    }): Promise<Array<Omit<StageB5TimeClaimRow, "chapterNo"> & { createdAt: Date }>>;
  };
  identityResolutionClaim: {
    findMany(args: {
      where: { bookId: string; runId: string; source: { in: readonly ["AI"] } };
      orderBy: Array<{ chapterId: "asc" } | { createdAt: "asc" }>;
      select: {
        id                : true;
        bookId            : true;
        chapterId         : true;
        runId             : true;
        mentionId         : true;
        personaCandidateId: true;
        resolutionKind    : true;
        rationale         : true;
        evidenceSpanIds   : true;
        confidence        : true;
        reviewState       : true;
        source            : true;
        reviewNote        : true;
        createdAt         : true;
      };
    }): Promise<Array<Omit<StageB5IdentityResolutionClaimRow, "chapterNo"> & { createdAt: Date }>>;
  };
}

export interface StageB5RepositoryClient extends StageB5RepositoryTransactionClient {
  $transaction<T>(callback: (tx: StageB5RepositoryTransactionClient) => Promise<T>): Promise<T>;
}

export interface StageB5BookRunScope {
  bookId: string;
  runId : string;
}

export interface StageB5Repository {
  loadConflictInputs(scope: StageB5BookRunScope): Promise<StageB5RepositoryPayload>;
  transaction<T>(work: (repository: StageB5Repository) => Promise<T>): Promise<T>;
}

function mapChapterNos<T extends { chapterId: string | null; createdAt: Date }>(
  rows: T[],
  chapterNoById: Map<string, number>
): Array<Omit<T, "createdAt" | "chapterNo"> & { chapterNo: number | null }> {
  return rows.map(({ createdAt: _createdAt, ...row }) => ({
    ...row,
    chapterNo: row.chapterId === null ? null : chapterNoById.get(row.chapterId) ?? null
  }));
}

function createMethods(tx: StageB5RepositoryTransactionClient): Omit<StageB5Repository, "transaction"> {
  return {
    async loadConflictInputs(scope: StageB5BookRunScope): Promise<StageB5RepositoryPayload> {
      const [
        personaCandidates,
        aliasClaims,
        eventClaims,
        relationClaims,
        timeClaims,
        identityResolutionClaims
      ] = await Promise.all([
        tx.personaCandidate.findMany({
          where  : { bookId: scope.bookId, runId: scope.runId },
          orderBy: { canonicalLabel: "asc" },
          select : {
            id                 : true,
            bookId             : true,
            runId              : true,
            canonicalLabel     : true,
            firstSeenChapterNo : true,
            lastSeenChapterNo  : true,
            mentionCount       : true,
            evidenceScore      : true
          }
        }),
        tx.aliasClaim.findMany({
          where  : { bookId: scope.bookId, runId: scope.runId, source: { in: READ_SOURCES } },
          orderBy: [{ chapterId: "asc" }, { createdAt: "asc" }],
          select : {
            id             : true,
            bookId         : true,
            chapterId      : true,
            runId          : true,
            aliasText      : true,
            claimKind      : true,
            evidenceSpanIds: true,
            confidence     : true,
            reviewState    : true,
            source         : true,
            reviewNote     : true,
            createdAt      : true
          }
        }),
        tx.eventClaim.findMany({
          where  : { bookId: scope.bookId, runId: scope.runId, source: { in: READ_SOURCES } },
          orderBy: [{ chapterId: "asc" }, { createdAt: "asc" }],
          select : {
            id                        : true,
            bookId                    : true,
            chapterId                 : true,
            runId                     : true,
            subjectPersonaCandidateId : true,
            objectPersonaCandidateId  : true,
            predicate                 : true,
            objectText                : true,
            locationText              : true,
            timeHintId                : true,
            eventCategory             : true,
            narrativeLens             : true,
            evidenceSpanIds           : true,
            confidence                : true,
            reviewState               : true,
            source                    : true,
            derivedFromClaimId        : true,
            reviewNote                : true,
            createdAt                 : true
          }
        }),
        tx.relationClaim.findMany({
          where  : { bookId: scope.bookId, runId: scope.runId, source: { in: READ_SOURCES } },
          orderBy: [{ chapterId: "asc" }, { createdAt: "asc" }],
          select : {
            id                       : true,
            bookId                   : true,
            chapterId                : true,
            runId                    : true,
            sourcePersonaCandidateId : true,
            targetPersonaCandidateId : true,
            relationTypeKey          : true,
            relationLabel            : true,
            relationTypeSource       : true,
            direction                : true,
            effectiveChapterStart    : true,
            effectiveChapterEnd      : true,
            timeHintId               : true,
            evidenceSpanIds          : true,
            confidence               : true,
            reviewState              : true,
            source                   : true,
            derivedFromClaimId       : true,
            reviewNote               : true,
            createdAt                : true
          }
        }),
        tx.timeClaim.findMany({
          where  : { bookId: scope.bookId, runId: scope.runId, source: { in: READ_SOURCES } },
          orderBy: [{ chapterId: "asc" }, { createdAt: "asc" }],
          select : {
            id                 : true,
            bookId             : true,
            chapterId          : true,
            runId              : true,
            rawTimeText        : true,
            timeType           : true,
            normalizedLabel    : true,
            relativeOrderWeight: true,
            chapterRangeStart  : true,
            chapterRangeEnd    : true,
            evidenceSpanIds    : true,
            confidence         : true,
            reviewState        : true,
            source             : true,
            derivedFromClaimId : true,
            reviewNote         : true,
            createdAt          : true
          }
        }),
        tx.identityResolutionClaim.findMany({
          where  : { bookId: scope.bookId, runId: scope.runId, source: { in: ["AI"] } },
          orderBy: [{ chapterId: "asc" }, { createdAt: "asc" }],
          select : {
            id                : true,
            bookId            : true,
            chapterId         : true,
            runId             : true,
            mentionId         : true,
            personaCandidateId: true,
            resolutionKind    : true,
            rationale         : true,
            evidenceSpanIds   : true,
            confidence        : true,
            reviewState       : true,
            source            : true,
            reviewNote        : true,
            createdAt         : true
          }
        })
      ]);

      const chapterIds = Array.from(new Set([
        ...aliasClaims.map((row) => row.chapterId).filter((value): value is string => value !== null),
        ...eventClaims.map((row) => row.chapterId),
        ...relationClaims.map((row) => row.chapterId),
        ...timeClaims.map((row) => row.chapterId),
        ...identityResolutionClaims.map((row) => row.chapterId).filter((value): value is string => value !== null)
      ]));

      const chapterRows = chapterIds.length === 0
        ? []
        : await tx.chapter.findMany({
          where  : { bookId: scope.bookId, id: { in: chapterIds } },
          select : { id: true, no: true },
          orderBy: { no: "asc" }
        });
      const chapterNoById = new Map(chapterRows.map((row) => [row.id, row.no]));

      return {
        personaCandidates,
        aliasClaims             : mapChapterNos(aliasClaims, chapterNoById),
        eventClaims             : mapChapterNos(eventClaims, chapterNoById) as StageB5EventClaimRow[],
        relationClaims          : mapChapterNos(relationClaims, chapterNoById) as StageB5RelationClaimRow[],
        timeClaims              : mapChapterNos(timeClaims, chapterNoById) as StageB5TimeClaimRow[],
        identityResolutionClaims: mapChapterNos(identityResolutionClaims, chapterNoById) as StageB5IdentityResolutionClaimRow[]
      };
    }
  };
}

function createRepositoryFromTransaction(tx: StageB5RepositoryTransactionClient): StageB5Repository {
  const methods = createMethods(tx);
  return {
    ...methods,
    transaction: async <T>(work: (repository: StageB5Repository) => Promise<T>): Promise<T> =>
      work(createRepositoryFromTransaction(tx))
  };
}

function hasTransaction(client: StageB5RepositoryClient | StageB5RepositoryTransactionClient): client is StageB5RepositoryClient {
  return "$transaction" in client;
}

export function createStageB5Repository(
  client: StageB5RepositoryClient | StageB5RepositoryTransactionClient = prisma as unknown as StageB5RepositoryClient
): StageB5Repository {
  if (!hasTransaction(client)) {
    return createRepositoryFromTransaction(client);
  }

  const methods = createMethods(client);
  return {
    ...methods,
    transaction: async <T>(work: (repository: StageB5Repository) => Promise<T>): Promise<T> =>
      client.$transaction(async (tx) => work(createRepositoryFromTransaction(tx)))
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```bash
pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stageB5/repository.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/modules/analysis/pipelines/evidence-review/stageB5/repository.ts src/server/modules/analysis/pipelines/evidence-review/stageB5/repository.test.ts
git commit -m "feat: add stage b5 input repository"
```

## Task 4: Implement Alias, Relation-Direction, And Low-Evidence Rules

**Files:**
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageB5/conflict-rules.test.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageB5/conflict-rules.ts`

- [ ] **Step 1: Write the failing rule tests for the first three conflict families**

Create `src/server/modules/analysis/pipelines/evidence-review/stageB5/conflict-rules.test.ts` with the first three cases:

```ts
import { describe, expect, it } from "vitest";

import {
  ConflictSeverity,
  ConflictType
} from "@/generated/prisma/enums";
import {
  detectAliasConflicts,
  detectLowEvidenceClaimConflicts,
  detectRelationDirectionConflicts
} from "@/server/modules/analysis/pipelines/evidence-review/stageB5/conflict-rules";
import type {
  StageB5EventClaimRow,
  StageB5IdentityResolutionClaimRow,
  StageB5RelationClaimRow
} from "@/server/modules/analysis/pipelines/evidence-review/stageB5/types";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";
const RUN_ID = "22222222-2222-4222-8222-222222222222";
const CHAPTER_ID = "33333333-3333-4333-8333-333333333333";

function identityClaim(overrides: Partial<StageB5IdentityResolutionClaimRow> = {}): StageB5IdentityResolutionClaimRow {
  return {
    id                : "identity-1",
    bookId            : BOOK_ID,
    chapterId         : CHAPTER_ID,
    chapterNo         : 10,
    runId             : RUN_ID,
    mentionId         : "mention-1",
    personaCandidateId: "candidate-1",
    resolutionKind    : "SPLIT_FROM",
    rationale         : "blocked alias chain",
    evidenceSpanIds   : ["evidence-1"],
    confidence        : 0.81,
    reviewState       : "CONFLICTED",
    source            : "AI",
    reviewNote        : "STAGE_B: blocks=NEGATIVE_ALIAS_RULE|MISIDENTIFICATION",
    ...overrides
  };
}

function relationClaim(overrides: Partial<StageB5RelationClaimRow> = {}): StageB5RelationClaimRow {
  return {
    id                       : "relation-1",
    bookId                   : BOOK_ID,
    chapterId                : CHAPTER_ID,
    chapterNo                : 10,
    runId                    : RUN_ID,
    sourcePersonaCandidateId : "candidate-1",
    targetPersonaCandidateId : "candidate-2",
    relationTypeKey          : "teacher_of",
    relationLabel            : "师生",
    relationTypeSource       : "PRESET",
    direction                : "FORWARD",
    effectiveChapterStart    : 10,
    effectiveChapterEnd      : 12,
    timeHintId               : null,
    evidenceSpanIds          : ["evidence-2"],
    confidence               : 0.84,
    reviewState              : "PENDING",
    source                   : "AI",
    derivedFromClaimId       : null,
    reviewNote               : null,
    ...overrides
  };
}

function eventClaim(overrides: Partial<StageB5EventClaimRow> = {}): StageB5EventClaimRow {
  return {
    id                        : "event-1",
    bookId                    : BOOK_ID,
    chapterId                 : CHAPTER_ID,
    chapterNo                 : 10,
    runId                     : RUN_ID,
    subjectPersonaCandidateId : "candidate-1",
    objectPersonaCandidateId  : null,
    predicate                 : "赴宴",
    objectText                : null,
    locationText              : null,
    timeHintId                : null,
    eventCategory             : "EVENT",
    narrativeLens             : "SELF",
    evidenceSpanIds           : ["evidence-3"],
    confidence                : 0.42,
    reviewState               : "PENDING",
    source                    : "AI",
    derivedFromClaimId        : null,
    reviewNote                : null,
    ...overrides
  };
}

describe("stageB5/conflict-rules first pass", () => {
  it("emits ALIAS_CONFLICT from stage-b blocker tags", () => {
    const findings = detectAliasConflicts([
      identityClaim()
    ]);

    expect(findings).toEqual([
      expect.objectContaining({
        conflictType              : ConflictType.ALIAS_CONFLICT,
        severity                  : ConflictSeverity.HIGH,
        recommendedActionKey      : "VERIFY_IDENTITY_SPLIT",
        sourceStageKey            : "stage_b_identity_resolution",
        relatedPersonaCandidateIds: ["candidate-1"]
      })
    ]);
  });

  it("emits RELATION_DIRECTION_CONFLICT for reversed directional edges on the same pair", () => {
    const findings = detectRelationDirectionConflicts([
      relationClaim(),
      relationClaim({
        id                      : "relation-2",
        sourcePersonaCandidateId: "candidate-2",
        targetPersonaCandidateId: "candidate-1",
        direction               : "FORWARD",
        evidenceSpanIds         : ["evidence-4"]
      })
    ]);

    expect(findings).toEqual([
      expect.objectContaining({
        conflictType    : ConflictType.RELATION_DIRECTION_CONFLICT,
        relatedClaimIds : ["relation-1", "relation-2"],
        relatedClaimKind: "RELATION"
      })
    ]);
  });

  it("emits LOW_EVIDENCE_CLAIM for weak single-evidence reviewable rows", () => {
    const findings = detectLowEvidenceClaimConflicts({
      aliasClaims             : [],
      eventClaims             : [eventClaim()],
      relationClaims          : [],
      timeClaims              : [],
      identityResolutionClaims: []
    });

    expect(findings).toEqual([
      expect.objectContaining({
        conflictType         : ConflictType.LOW_EVIDENCE_CLAIM,
        severity             : ConflictSeverity.LOW,
        recommendedActionKey : "REQUEST_MORE_EVIDENCE",
        relatedClaimKind     : "EVENT",
        relatedClaimIds      : ["event-1"]
      })
    ]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stageB5/conflict-rules.test.ts
```

Expected: FAIL because the rule module does not exist yet.

- [ ] **Step 3: Write the minimal first-pass rule implementation**

Create `src/server/modules/analysis/pipelines/evidence-review/stageB5/conflict-rules.ts`:

```ts
import {
  ConflictSeverity,
  ConflictType
} from "@/generated/prisma/enums";
import {
  STAGE_B5_LOW_EVIDENCE_THRESHOLD,
  type StageB5AliasClaimRow,
  type StageB5ConflictFinding,
  type StageB5EventClaimRow,
  type StageB5IdentityResolutionClaimRow,
  type StageB5RelationClaimRow,
  type StageB5RepositoryPayload,
  type StageB5TimeClaimRow
} from "@/server/modules/analysis/pipelines/evidence-review/stageB5/types";

const ALIAS_BLOCK_TAGS = [
  "NEGATIVE_ALIAS_RULE",
  "IMPERSONATION",
  "MISIDENTIFICATION",
  "CONFLICTING_CANONICAL_HINTS"
] as const;

function uniqueSorted(values: readonly string[]): string[] {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}

function hasAnyAliasBlockTag(note: string | null): string[] {
  if (!note) {
    return [];
  }

  return ALIAS_BLOCK_TAGS.filter((tag) => note.includes(tag));
}

export function detectAliasConflicts(
  rows: StageB5IdentityResolutionClaimRow[]
): StageB5ConflictFinding[] {
  return rows
    .map((row) => ({ row, tags: hasAnyAliasBlockTag(row.reviewNote) }))
    .filter(({ row, tags }) => tags.length > 0 && row.personaCandidateId !== null)
    .map(({ row, tags }) => ({
      conflictType              : ConflictType.ALIAS_CONFLICT,
      severity                  : ConflictSeverity.HIGH,
      reason                    : `Stage B 对 mention=${row.mentionId} 给出了互斥 alias/身份阻断信号。`,
      summary                   : `Alias 归并存在互斥阻断：candidate=${row.personaCandidateId}`,
      recommendedActionKey      : "VERIFY_IDENTITY_SPLIT",
      sourceStageKey            : "stage_b_identity_resolution",
      relatedClaimKind          : "IDENTITY_RESOLUTION",
      relatedClaimIds           : [row.id],
      relatedPersonaCandidateIds: [row.personaCandidateId!],
      relatedChapterIds         : row.chapterId ? [row.chapterId] : [],
      evidenceSpanIds           : row.evidenceSpanIds,
      tags
    }));
}

function normalizeDirectionalPair(row: StageB5RelationClaimRow): string | null {
  if (!row.sourcePersonaCandidateId || !row.targetPersonaCandidateId) {
    return null;
  }
  if (row.direction === "BIDIRECTIONAL" || row.direction === "UNDIRECTED") {
    return null;
  }

  const left = row.sourcePersonaCandidateId;
  const right = row.targetPersonaCandidateId;
  const ordered = left.localeCompare(right) <= 0 ? [left, right] : [right, left];
  return `${row.relationTypeKey}:${ordered[0]}:${ordered[1]}`;
}

export function detectRelationDirectionConflicts(
  rows: StageB5RelationClaimRow[]
): StageB5ConflictFinding[] {
  const groups = new Map<string, StageB5RelationClaimRow[]>();

  for (const row of rows) {
    const key = normalizeDirectionalPair(row);
    if (!key) {
      continue;
    }
    const current = groups.get(key) ?? [];
    current.push(row);
    groups.set(key, current);
  }

  const findings: StageB5ConflictFinding[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) {
      continue;
    }

    const [first, second] = group;
    const reversed =
      first.sourcePersonaCandidateId === second.targetPersonaCandidateId
      && first.targetPersonaCandidateId === second.sourcePersonaCandidateId;
    if (!reversed) {
      continue;
    }

    findings.push({
      conflictType              : ConflictType.RELATION_DIRECTION_CONFLICT,
      severity                  : ConflictSeverity.HIGH,
      reason                    : `同一人物对的关系 ${first.relationTypeKey} 出现了相反方向。`,
      summary                   : `关系方向冲突：${first.relationTypeKey} 在同一人物对上方向不一致。`,
      recommendedActionKey      : "VERIFY_RELATION_DIRECTION",
      sourceStageKey            : "stage_a_extraction",
      relatedClaimKind          : "RELATION",
      relatedClaimIds           : uniqueSorted(group.map((row) => row.id)),
      relatedPersonaCandidateIds: uniqueSorted([
        first.sourcePersonaCandidateId!,
        first.targetPersonaCandidateId!
      ]),
      relatedChapterIds         : uniqueSorted(group.map((row) => row.chapterId)),
      evidenceSpanIds           : uniqueSorted(group.flatMap((row) => row.evidenceSpanIds)),
      tags                      : ["REVERSED_DIRECTION"]
    });
  }

  return findings;
}

function lowEvidenceFromFamily(
  family: "ALIAS" | "EVENT" | "RELATION" | "TIME" | "IDENTITY_RESOLUTION",
  rows: Array<StageB5AliasClaimRow | StageB5EventClaimRow | StageB5RelationClaimRow | StageB5TimeClaimRow | StageB5IdentityResolutionClaimRow>
): StageB5ConflictFinding[] {
  return rows
    .filter((row) => row.confidence <= STAGE_B5_LOW_EVIDENCE_THRESHOLD && row.evidenceSpanIds.length === 1)
    .map((row) => ({
      conflictType              : ConflictType.LOW_EVIDENCE_CLAIM,
      severity                  : ConflictSeverity.LOW,
      reason                    : `claim=${row.id} 只有单条证据且置信度为 ${row.confidence.toFixed(2)}。`,
      summary                   : `证据薄弱：${family} claim=${row.id}`,
      recommendedActionKey      : "REQUEST_MORE_EVIDENCE",
      sourceStageKey            : family === "IDENTITY_RESOLUTION" ? "stage_b_identity_resolution" : "stage_a_extraction",
      relatedClaimKind          : family,
      relatedClaimIds           : [row.id],
      relatedPersonaCandidateIds: "personaCandidateId" in row && row.personaCandidateId
        ? [row.personaCandidateId]
        : "subjectPersonaCandidateId" in row && row.subjectPersonaCandidateId
          ? [row.subjectPersonaCandidateId]
          : "sourcePersonaCandidateId" in row && row.sourcePersonaCandidateId && row.targetPersonaCandidateId
            ? uniqueSorted([row.sourcePersonaCandidateId, row.targetPersonaCandidateId])
            : [],
      relatedChapterIds         : row.chapterId ? [row.chapterId] : [],
      evidenceSpanIds           : row.evidenceSpanIds,
      tags                      : ["LOW_CONFIDENCE", "SINGLE_EVIDENCE_SPAN"]
    }));
}

export function detectLowEvidenceClaimConflicts(input: Pick<
  StageB5RepositoryPayload,
  "aliasClaims" | "eventClaims" | "relationClaims" | "timeClaims" | "identityResolutionClaims"
>): StageB5ConflictFinding[] {
  return [
    ...lowEvidenceFromFamily("ALIAS", input.aliasClaims),
    ...lowEvidenceFromFamily("EVENT", input.eventClaims),
    ...lowEvidenceFromFamily("RELATION", input.relationClaims),
    ...lowEvidenceFromFamily("TIME", input.timeClaims),
    ...lowEvidenceFromFamily("IDENTITY_RESOLUTION", input.identityResolutionClaims)
  ];
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```bash
pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stageB5/conflict-rules.test.ts
```

Expected: PASS for the first three cases.

- [ ] **Step 5: Commit**

```bash
git add src/server/modules/analysis/pipelines/evidence-review/stageB5/conflict-rules.ts src/server/modules/analysis/pipelines/evidence-review/stageB5/conflict-rules.test.ts
git commit -m "feat: add initial stage b5 conflict rules"
```

## Task 5: Add Post-Mortem, Impossible-Location, And Time-Order Rules

**Files:**
- Modify: `src/server/modules/analysis/pipelines/evidence-review/stageB5/conflict-rules.test.ts`
- Modify: `src/server/modules/analysis/pipelines/evidence-review/stageB5/conflict-rules.ts`

- [ ] **Step 1: Add the failing tests for the remaining three conflict families**

First replace the existing top-of-file rule import and type import blocks in `src/server/modules/analysis/pipelines/evidence-review/stageB5/conflict-rules.test.ts` with:

```ts
import {
  detectAliasConflicts,
  detectImpossibleLocationConflicts,
  detectLowEvidenceClaimConflicts,
  detectPostMortemActionConflicts,
  detectRelationDirectionConflicts,
  detectTimeOrderConflicts
} from "@/server/modules/analysis/pipelines/evidence-review/stageB5/conflict-rules";
import type {
  StageB5EventClaimRow,
  StageB5IdentityResolutionClaimRow,
  StageB5RelationClaimRow,
  StageB5TimeClaimRow
} from "@/server/modules/analysis/pipelines/evidence-review/stageB5/types";
```

Then append the `timeClaim(...)` helper immediately after the existing `eventClaim(...)` helper:

```ts
function timeClaim(overrides: Partial<StageB5TimeClaimRow> = {}): StageB5TimeClaimRow {
  return {
    id                 : "time-1",
    bookId             : BOOK_ID,
    chapterId          : CHAPTER_ID,
    chapterNo          : 10,
    runId              : RUN_ID,
    rawTimeText        : "次日",
    timeType           : "RELATIVE_PHASE",
    normalizedLabel    : "次日",
    relativeOrderWeight: 2,
    chapterRangeStart  : 11,
    chapterRangeEnd    : 11,
    evidenceSpanIds    : ["evidence-7"],
    confidence         : 0.7,
    reviewState        : "PENDING",
    source             : "AI",
    derivedFromClaimId : null,
    reviewNote         : null,
    ...overrides
  };
}
```

Then append the following three `it(...)` cases before the closing `});` of the existing `describe("stageB5/conflict-rules first pass", ...)` block:

```ts
it("emits POST_MORTEM_ACTION when a candidate acts after a death event", () => {
  const findings = detectPostMortemActionConflicts([
    eventClaim({
      id                       : "death-event",
      chapterNo                : 8,
      eventCategory            : "DEATH",
      predicate                : "病逝",
      evidenceSpanIds          : ["evidence-8"],
      subjectPersonaCandidateId: "candidate-1"
    }),
    eventClaim({
      id                       : "later-event",
      chapterNo                : 12,
      eventCategory            : "EVENT",
      predicate                : "赴宴",
      evidenceSpanIds          : ["evidence-9"],
      subjectPersonaCandidateId: "candidate-1"
    })
  ]);

  expect(findings).toEqual([
    expect.objectContaining({
      conflictType              : ConflictType.POST_MORTEM_ACTION,
      severity                  : ConflictSeverity.CRITICAL,
      relatedClaimIds           : ["death-event", "later-event"],
      relatedPersonaCandidateIds: ["candidate-1"]
    })
  ]);
});

it("emits IMPOSSIBLE_LOCATION when the same candidate appears in mutually exclusive places in one chapter", () => {
  const findings = detectImpossibleLocationConflicts([
    eventClaim({
      id          : "event-beijing",
      locationText: "北京",
      evidenceSpanIds: ["evidence-10"]
    }),
    eventClaim({
      id          : "event-nanjing",
      locationText: "南京",
      evidenceSpanIds: ["evidence-11"]
    })
  ]);

  expect(findings).toEqual([
    expect.objectContaining({
      conflictType    : ConflictType.IMPOSSIBLE_LOCATION,
      relatedClaimKind: "EVENT",
      relatedClaimIds : ["event-beijing", "event-nanjing"]
    })
  ]);
});

it("emits TIME_ORDER_CONFLICT when an event chapter falls outside the bound time hint range", () => {
  const findings = detectTimeOrderConflicts({
    eventClaims: [
      eventClaim({
        id        : "event-out-of-range",
        chapterNo : 20,
        timeHintId: "time-1"
      })
    ],
    relationClaims: [],
    timeClaims: [
      timeClaim({
        id               : "time-1",
        chapterRangeStart: 4,
        chapterRangeEnd  : 6
      })
    ]
  });

  expect(findings).toEqual([
    expect.objectContaining({
      conflictType    : ConflictType.TIME_ORDER_CONFLICT,
      relatedClaimKind: null,
      relatedClaimIds : ["event-out-of-range", "time-1"],
      relatedChapterIds: [CHAPTER_ID]
    })
  ]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stageB5/conflict-rules.test.ts
```

Expected: FAIL because the new rule functions do not exist yet.

- [ ] **Step 3: Extend the rule implementation**

First add this import alongside the existing imports at the top of `src/server/modules/analysis/pipelines/evidence-review/stageB5/conflict-rules.ts`:

```ts
import { areMutuallyExclusive } from "@/server/modules/analysis/preprocessor/locationExclusivityGraph";
```

Then append these functions after the existing `detectLowEvidenceClaimConflicts(...)` implementation:

```ts
export function detectPostMortemActionConflicts(
  rows: StageB5EventClaimRow[]
): StageB5ConflictFinding[] {
  const deathByCandidate = new Map<string, StageB5EventClaimRow>();

  for (const row of rows) {
    if (row.eventCategory === "DEATH" && row.subjectPersonaCandidateId) {
      const current = deathByCandidate.get(row.subjectPersonaCandidateId);
      if (!current || row.chapterNo < current.chapterNo) {
        deathByCandidate.set(row.subjectPersonaCandidateId, row);
      }
    }
  }

  const findings: StageB5ConflictFinding[] = [];
  for (const row of rows) {
    const candidateId = row.subjectPersonaCandidateId;
    if (!candidateId || row.eventCategory === "DEATH") {
      continue;
    }
    const death = deathByCandidate.get(candidateId);
    if (!death || row.chapterNo <= death.chapterNo) {
      continue;
    }

    findings.push({
      conflictType              : ConflictType.POST_MORTEM_ACTION,
      severity                  : ConflictSeverity.CRITICAL,
      reason                    : `candidate=${candidateId} 在第 ${death.chapterNo} 回死亡后，又在第 ${row.chapterNo} 回出现主动事件。`,
      summary                   : `死亡后行动冲突：candidate=${candidateId} 在死亡章节之后仍有事件。`,
      recommendedActionKey      : "VERIFY_IDENTITY_SPLIT",
      sourceStageKey            : "stage_a_extraction",
      relatedClaimKind          : "EVENT",
      relatedClaimIds           : uniqueSorted([death.id, row.id]),
      relatedPersonaCandidateIds: [candidateId],
      relatedChapterIds         : uniqueSorted([death.chapterId, row.chapterId]),
      evidenceSpanIds           : uniqueSorted([...death.evidenceSpanIds, ...row.evidenceSpanIds]),
      tags                      : ["POST_DEATH_EVENT"]
    });
  }

  return findings;
}

export function detectImpossibleLocationConflicts(
  rows: StageB5EventClaimRow[]
): StageB5ConflictFinding[] {
  const groups = new Map<string, StageB5EventClaimRow[]>();

  for (const row of rows) {
    if (!row.subjectPersonaCandidateId || !row.locationText) {
      continue;
    }
    const key = `${row.subjectPersonaCandidateId}:${row.chapterId}`;
    const current = groups.get(key) ?? [];
    current.push(row);
    groups.set(key, current);
  }

  const findings: StageB5ConflictFinding[] = [];
  for (const group of groups.values()) {
    for (let index = 0; index < group.length; index += 1) {
      const left = group[index]!;
      for (let inner = index + 1; inner < group.length; inner += 1) {
        const right = group[inner]!;
        if (!left.locationText || !right.locationText) {
          continue;
        }
        if (!areMutuallyExclusive(left.locationText, right.locationText)) {
          continue;
        }

        findings.push({
          conflictType              : ConflictType.IMPOSSIBLE_LOCATION,
          severity                  : ConflictSeverity.HIGH,
          reason                    : `candidate=${left.subjectPersonaCandidateId} 在同一章节同时落在互斥地点 ${left.locationText} / ${right.locationText}。`,
          summary                   : `同章跨地点冲突：${left.locationText} 与 ${right.locationText} 互斥。`,
          recommendedActionKey      : "VERIFY_LOCATION_ATTRIBUTION",
          sourceStageKey            : "stage_a_extraction",
          relatedClaimKind          : "EVENT",
          relatedClaimIds           : uniqueSorted([left.id, right.id]),
          relatedPersonaCandidateIds: [left.subjectPersonaCandidateId!],
          relatedChapterIds         : [left.chapterId],
          evidenceSpanIds           : uniqueSorted([...left.evidenceSpanIds, ...right.evidenceSpanIds]),
          tags                      : ["MUTUALLY_EXCLUSIVE_LOCATIONS"]
        });
      }
    }
  }

  return findings;
}

export function detectTimeOrderConflicts(input: {
  eventClaims   : StageB5EventClaimRow[];
  relationClaims: StageB5RelationClaimRow[];
  timeClaims    : StageB5TimeClaimRow[];
}): StageB5ConflictFinding[] {
  const timeById = new Map(input.timeClaims.map((row) => [row.id, row]));
  const findings: StageB5ConflictFinding[] = [];

  for (const event of input.eventClaims) {
    if (!event.timeHintId) {
      continue;
    }
    const time = timeById.get(event.timeHintId);
    if (!time) {
      continue;
    }
    const outOfRange =
      (time.chapterRangeStart !== null && event.chapterNo < time.chapterRangeStart)
      || (time.chapterRangeEnd !== null && event.chapterNo > time.chapterRangeEnd);
    if (!outOfRange) {
      continue;
    }

    findings.push({
      conflictType              : ConflictType.TIME_ORDER_CONFLICT,
      severity                  : ConflictSeverity.HIGH,
      reason                    : `事件 claim=${event.id} 位于第 ${event.chapterNo} 回，但 timeHint=${time.id} 约束在 ${time.chapterRangeStart}-${time.chapterRangeEnd}。`,
      summary                   : `时间顺序冲突：事件章节超出 timeHint 范围。`,
      recommendedActionKey      : "VERIFY_TIME_ALIGNMENT",
      sourceStageKey            : "stage_a_extraction",
      relatedClaimKind          : null,
      relatedClaimIds           : uniqueSorted([event.id, time.id]),
      relatedPersonaCandidateIds: event.subjectPersonaCandidateId ? [event.subjectPersonaCandidateId] : [],
      relatedChapterIds         : [event.chapterId],
      evidenceSpanIds           : uniqueSorted([...event.evidenceSpanIds, ...time.evidenceSpanIds]),
      tags                      : ["EVENT_TIME_RANGE_MISMATCH"]
    });
  }

  for (const relation of input.relationClaims) {
    if (!relation.timeHintId) {
      continue;
    }
    const time = timeById.get(relation.timeHintId);
    if (!time) {
      continue;
    }
    const start = relation.effectiveChapterStart ?? relation.chapterNo;
    const end = relation.effectiveChapterEnd ?? relation.chapterNo;
    const outOfRange =
      (time.chapterRangeStart !== null && end < time.chapterRangeStart)
      || (time.chapterRangeEnd !== null && start > time.chapterRangeEnd);
    if (!outOfRange) {
      continue;
    }

    findings.push({
      conflictType              : ConflictType.TIME_ORDER_CONFLICT,
      severity                  : ConflictSeverity.HIGH,
      reason                    : `关系 claim=${relation.id} 的有效区间 ${start}-${end} 与 timeHint=${time.id} 的章节范围不一致。`,
      summary                   : `时间顺序冲突：关系生效区间与 timeHint 范围不一致。`,
      recommendedActionKey      : "VERIFY_TIME_ALIGNMENT",
      sourceStageKey            : "stage_a_extraction",
      relatedClaimKind          : null,
      relatedClaimIds           : uniqueSorted([relation.id, time.id]),
      relatedPersonaCandidateIds: uniqueSorted([
        relation.sourcePersonaCandidateId ?? "",
        relation.targetPersonaCandidateId ?? ""
      ].filter(Boolean)),
      relatedChapterIds         : [relation.chapterId],
      evidenceSpanIds           : uniqueSorted([...relation.evidenceSpanIds, ...time.evidenceSpanIds]),
      tags                      : ["RELATION_TIME_RANGE_MISMATCH"]
    });
  }

  return findings;
}

export function detectStageB5Conflicts(input: StageB5RepositoryPayload): StageB5ConflictFinding[] {
  return [
    ...detectAliasConflicts(input.identityResolutionClaims),
    ...detectRelationDirectionConflicts(input.relationClaims),
    ...detectLowEvidenceClaimConflicts(input),
    ...detectPostMortemActionConflicts(input.eventClaims),
    ...detectImpossibleLocationConflicts(input.eventClaims),
    ...detectTimeOrderConflicts({
      eventClaims   : input.eventClaims,
      relationClaims: input.relationClaims,
      timeClaims    : input.timeClaims
    })
  ].sort((left, right) => left.summary.localeCompare(right.summary));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```bash
pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stageB5/conflict-rules.test.ts
```

Expected: PASS with six covered conflict families.

- [ ] **Step 5: Commit**

```bash
git add src/server/modules/analysis/pipelines/evidence-review/stageB5/conflict-rules.ts src/server/modules/analysis/pipelines/evidence-review/stageB5/conflict-rules.test.ts
git commit -m "feat: complete stage b5 conflict rule coverage"
```

## Task 6: Build Conflict Drafts And Persist Them Safely

**Files:**
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageB5/draft-builder.test.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageB5/draft-builder.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageB5/persister.test.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageB5/persister.ts`

- [ ] **Step 1: Write the failing draft-builder and persister tests**

Create `src/server/modules/analysis/pipelines/evidence-review/stageB5/draft-builder.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { ConflictSeverity, ConflictType } from "@/generated/prisma/enums";
import { buildStageB5ConflictDrafts } from "@/server/modules/analysis/pipelines/evidence-review/stageB5/draft-builder";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";
const RUN_ID = "22222222-2222-4222-8222-222222222222";
const CHAPTER_ID_1 = "33333333-3333-4333-8333-333333333333";
const CHAPTER_ID_2 = "44444444-4444-4444-8444-444444444444";

describe("stageB5/draft-builder", () => {
  it("anchors one-chapter conflicts and nulls multi-chapter conflicts", () => {
    const drafts = buildStageB5ConflictDrafts({
      bookId: BOOK_ID,
      runId : RUN_ID,
      findings: [
        {
          conflictType              : ConflictType.ALIAS_CONFLICT,
          severity                  : ConflictSeverity.HIGH,
          reason                    : "single chapter",
          summary                   : "单章 alias 冲突",
          recommendedActionKey      : "VERIFY_IDENTITY_SPLIT",
          sourceStageKey            : "stage_b_identity_resolution",
          relatedClaimKind          : "IDENTITY_RESOLUTION",
          relatedClaimIds           : ["claim-1"],
          relatedPersonaCandidateIds: ["candidate-1"],
          relatedChapterIds         : [CHAPTER_ID_1],
          evidenceSpanIds           : ["evidence-1"],
          tags                      : ["NEGATIVE_ALIAS_RULE"]
        },
        {
          conflictType              : ConflictType.TIME_ORDER_CONFLICT,
          severity                  : ConflictSeverity.HIGH,
          reason                    : "multi chapter",
          summary                   : "跨章时间冲突",
          recommendedActionKey      : "VERIFY_TIME_ALIGNMENT",
          sourceStageKey            : "stage_a_extraction",
          relatedClaimKind          : null,
          relatedClaimIds           : ["claim-2", "claim-3"],
          relatedPersonaCandidateIds: ["candidate-2"],
          relatedChapterIds         : [CHAPTER_ID_1, CHAPTER_ID_2],
          evidenceSpanIds           : ["evidence-2", "evidence-3"],
          tags                      : ["EVENT_TIME_RANGE_MISMATCH"]
        }
      ]
    });

    expect(drafts[0]).toMatchObject({
      chapterId                 : CHAPTER_ID_1,
      reviewState               : "CONFLICTED",
      source                    : "RULE",
      recommendedActionKey      : "VERIFY_IDENTITY_SPLIT",
      sourceStageKey            : "stage_b_identity_resolution",
      relatedChapterIds         : [CHAPTER_ID_1]
    });
    expect(drafts[1]?.chapterId).toBeNull();
    expect(drafts[1]?.reviewNote).toContain("EVENT_TIME_RANGE_MISMATCH");
  });
});
```

Create `src/server/modules/analysis/pipelines/evidence-review/stageB5/persister.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { createStageB5Persister } from "@/server/modules/analysis/pipelines/evidence-review/stageB5/persister";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";
const RUN_ID = "22222222-2222-4222-8222-222222222222";

describe("stageB5/persister", () => {
  it("clears prior conflict scope and creates each row individually", async () => {
    const repository = {
      transaction: vi.fn(async (work: (tx: typeof repository) => Promise<unknown>) => work(repository)),
      replaceClaimFamilyScope: vi.fn().mockResolvedValue({ deletedCount: 3, createdCount: 0 }),
      createReviewableClaim: vi.fn()
        .mockResolvedValueOnce({ id: "conflict-1" })
        .mockResolvedValueOnce({ id: "conflict-2" })
    };
    const persister = createStageB5Persister({ claimRepository: repository as never });

    const result = await persister.persistConflictDrafts({
      bookId : BOOK_ID,
      runId  : RUN_ID,
      drafts : [
        {
          claimFamily               : "CONFLICT_FLAG",
          bookId                    : BOOK_ID,
          chapterId                 : "33333333-3333-4333-8333-333333333333",
          runId                     : RUN_ID,
          conflictType              : "ALIAS_CONFLICT",
          severity                  : "HIGH",
          reason                    : "reason-1",
          recommendedActionKey      : "VERIFY_IDENTITY_SPLIT",
          sourceStageKey            : "stage_b_identity_resolution",
          relatedClaimKind          : "IDENTITY_RESOLUTION",
          relatedClaimIds           : ["claim-1"],
          relatedPersonaCandidateIds: ["candidate-1"],
          relatedChapterIds         : ["33333333-3333-4333-8333-333333333333"],
          summary                   : "summary-1",
          evidenceSpanIds           : ["evidence-1"],
          reviewState               : "CONFLICTED",
          source                    : "RULE",
          reviewedByUserId          : null,
          reviewNote                : "STAGE_B5: tags=NEGATIVE_ALIAS_RULE"
        },
        {
          claimFamily               : "CONFLICT_FLAG",
          bookId                    : BOOK_ID,
          chapterId                 : null,
          runId                     : RUN_ID,
          conflictType              : "TIME_ORDER_CONFLICT",
          severity                  : "HIGH",
          reason                    : "reason-2",
          recommendedActionKey      : "VERIFY_TIME_ALIGNMENT",
          sourceStageKey            : "stage_a_extraction",
          relatedClaimKind          : null,
          relatedClaimIds           : ["claim-2", "claim-3"],
          relatedPersonaCandidateIds: ["candidate-2"],
          relatedChapterIds         : [
            "33333333-3333-4333-8333-333333333333",
            "44444444-4444-4444-8444-444444444444"
          ],
          summary                   : "summary-2",
          evidenceSpanIds           : ["evidence-2"],
          reviewState               : "CONFLICTED",
          source                    : "RULE",
          reviewedByUserId          : null,
          reviewNote                : "STAGE_B5: tags=EVENT_TIME_RANGE_MISMATCH"
        }
      ]
    });

    expect(repository.replaceClaimFamilyScope).toHaveBeenCalledWith({
      family: "CONFLICT_FLAG",
      scope : {
        bookId  : BOOK_ID,
        runId   : RUN_ID,
        stageKey: "stage_b5_conflict_detection"
      },
      rows: []
    });
    expect(repository.createReviewableClaim).toHaveBeenCalledTimes(2);
    expect(result.createdCount).toBe(2);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
pnpm exec vitest run \
  src/server/modules/analysis/pipelines/evidence-review/stageB5/draft-builder.test.ts \
  src/server/modules/analysis/pipelines/evidence-review/stageB5/persister.test.ts
```

Expected: FAIL because the draft-builder and persister modules do not exist yet.

- [ ] **Step 3: Write the minimal draft-builder and persister implementation**

Create `src/server/modules/analysis/pipelines/evidence-review/stageB5/draft-builder.ts`:

```ts
import type { ClaimDraftByFamily } from "@/server/modules/analysis/claims/claim-schemas";
import type { StageB5ConflictFinding } from "@/server/modules/analysis/pipelines/evidence-review/stageB5/types";

function uniqueSorted(values: readonly string[]): string[] {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}

export function buildStageB5ConflictDrafts(input: {
  bookId  : string;
  runId   : string;
  findings: StageB5ConflictFinding[];
}): ClaimDraftByFamily["CONFLICT_FLAG"][] {
  return input.findings
    .map((finding) => {
      const relatedChapterIds = uniqueSorted(finding.relatedChapterIds);
      const chapterId = relatedChapterIds.length === 1 ? relatedChapterIds[0]! : null;

      return {
        claimFamily               : "CONFLICT_FLAG" as const,
        bookId                    : input.bookId,
        chapterId,
        runId                     : input.runId,
        conflictType              : finding.conflictType,
        severity                  : finding.severity,
        reason                    : finding.reason,
        recommendedActionKey      : finding.recommendedActionKey,
        sourceStageKey            : finding.sourceStageKey,
        relatedClaimKind          : finding.relatedClaimKind,
        relatedClaimIds           : uniqueSorted(finding.relatedClaimIds),
        relatedPersonaCandidateIds: uniqueSorted(finding.relatedPersonaCandidateIds),
        relatedChapterIds,
        summary                   : finding.summary,
        evidenceSpanIds           : uniqueSorted(finding.evidenceSpanIds),
        reviewState               : "CONFLICTED" as const,
        source                    : "RULE" as const,
        reviewedByUserId          : null,
        reviewNote                : `STAGE_B5: recommendedActionKey=${finding.recommendedActionKey}; sourceStageKey=${finding.sourceStageKey}; tags=${finding.tags.join("|")}`
      };
    })
    .sort((left, right) => left.summary.localeCompare(right.summary));
}
```

Create `src/server/modules/analysis/pipelines/evidence-review/stageB5/persister.ts`:

```ts
import {
  createClaimRepository,
  type ClaimRepository,
  type ClaimRepositoryClient
} from "@/server/modules/analysis/claims/claim-repository";
import { prisma } from "@/server/db/prisma";
import {
  toClaimCreateData,
  validateClaimDraftByFamily
} from "@/server/modules/analysis/claims/claim-schemas";
import { STAGE_B5_STAGE_KEY } from "@/server/modules/analysis/pipelines/evidence-review/stageB5/types";

export interface StageB5PersisterDependencies {
  claimRepository?: Pick<ClaimRepository, "transaction" | "replaceClaimFamilyScope" | "createReviewableClaim">;
}

export function createStageB5Persister(
  dependencies: StageB5PersisterDependencies = {}
) {
  const claimRepository =
    dependencies.claimRepository
    ?? createClaimRepository(prisma as unknown as ClaimRepositoryClient);

  async function persistConflictDrafts(input: {
    bookId : string;
    runId  : string;
    drafts : unknown[];
  }): Promise<{ createdCount: number }> {
    return claimRepository.transaction(async (txRepository) => {
      await txRepository.replaceClaimFamilyScope({
        family: "CONFLICT_FLAG",
        scope : {
          bookId  : input.bookId,
          runId   : input.runId,
          stageKey: STAGE_B5_STAGE_KEY
        },
        rows: []
      });

      let createdCount = 0;
      for (const draft of input.drafts) {
        const validated = validateClaimDraftByFamily("CONFLICT_FLAG", draft);
        await txRepository.createReviewableClaim("CONFLICT_FLAG", toClaimCreateData(validated));
        createdCount += 1;
      }

      return { createdCount };
    });
  }

  return { persistConflictDrafts };
}

export type StageB5Persister = ReturnType<typeof createStageB5Persister>;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```bash
pnpm exec vitest run \
  src/server/modules/analysis/pipelines/evidence-review/stageB5/draft-builder.test.ts \
  src/server/modules/analysis/pipelines/evidence-review/stageB5/persister.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/modules/analysis/pipelines/evidence-review/stageB5/draft-builder.ts src/server/modules/analysis/pipelines/evidence-review/stageB5/draft-builder.test.ts src/server/modules/analysis/pipelines/evidence-review/stageB5/persister.ts src/server/modules/analysis/pipelines/evidence-review/stageB5/persister.test.ts
git commit -m "feat: add stage b5 conflict persistence"
```

## Task 7: Wire The Stage B.5 Orchestrator, Public Exports, And Docs

**Files:**
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageB5/ConflictDetector.test.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageB5/ConflictDetector.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageB5/index.ts`
- Modify: `docs/superpowers/tasks/2026-04-18-evidence-review/09-stage-b5-conflict-detection.md`
- Modify: `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`

- [ ] **Step 1: Write the failing orchestrator tests**

Create `src/server/modules/analysis/pipelines/evidence-review/stageB5/ConflictDetector.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { createConflictDetector } from "@/server/modules/analysis/pipelines/evidence-review/stageB5/ConflictDetector";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";
const RUN_ID = "22222222-2222-4222-8222-222222222222";

function createStageRunService() {
  return {
    startStageRun : vi.fn().mockResolvedValue({ id: "stage-run-1" }),
    recordRawOutput: vi.fn().mockResolvedValue({ id: "raw-output-1" }),
    succeedStageRun: vi.fn().mockResolvedValue(undefined),
    failStageRun   : vi.fn().mockResolvedValue(undefined)
  };
}

describe("stageB5/ConflictDetector", () => {
  it("runs the whole pipeline and records deterministic raw output", async () => {
    const repository = {
      loadConflictInputs: vi.fn().mockResolvedValue({
        personaCandidates        : [],
        aliasClaims              : [],
        eventClaims              : [
          {
            id                        : "death-event",
            bookId                    : BOOK_ID,
            chapterId                 : "33333333-3333-4333-8333-333333333333",
            chapterNo                 : 8,
            runId                     : RUN_ID,
            subjectPersonaCandidateId : "candidate-1",
            objectPersonaCandidateId  : null,
            predicate                 : "病逝",
            objectText                : null,
            locationText              : null,
            timeHintId                : null,
            eventCategory             : "DEATH",
            narrativeLens             : "SELF",
            evidenceSpanIds           : ["evidence-1"],
            confidence                : 0.9,
            reviewState               : "PENDING",
            source                    : "AI",
            derivedFromClaimId        : null,
            reviewNote                : null
          },
          {
            id                        : "later-event",
            bookId                    : BOOK_ID,
            chapterId                 : "44444444-4444-4444-8444-444444444444",
            chapterNo                 : 12,
            runId                     : RUN_ID,
            subjectPersonaCandidateId : "candidate-1",
            objectPersonaCandidateId  : null,
            predicate                 : "赴宴",
            objectText                : null,
            locationText              : null,
            timeHintId                : null,
            eventCategory             : "EVENT",
            narrativeLens             : "SELF",
            evidenceSpanIds           : ["evidence-2"],
            confidence                : 0.7,
            reviewState               : "PENDING",
            source                    : "AI",
            derivedFromClaimId        : null,
            reviewNote                : null
          }
        ],
        relationClaims           : [],
        timeClaims               : [],
        identityResolutionClaims : []
      })
    };
    const persister = {
      persistConflictDrafts: vi.fn().mockResolvedValue({ createdCount: 1 })
    };
    const stageRunService = createStageRunService();
    const detector = createConflictDetector({
      repository     : repository as never,
      persister      : persister as never,
      stageRunService: stageRunService as never
    });

    const result = await detector.runForBook({ bookId: BOOK_ID, runId: RUN_ID });

    expect(result.outputCount).toBe(1);
    expect(result.decisionSummary).toContain("POST_MORTEM_ACTION:1");
    expect(stageRunService.recordRawOutput).toHaveBeenCalledWith(expect.objectContaining({
      provider    : "rule-engine",
      model       : "stage-b5-conflict-detection-v1",
      promptTokens: 0
    }));
  });

  it("marks the stage run as failed when persistence throws", async () => {
    const repository = {
      loadConflictInputs: vi.fn().mockResolvedValue({
        personaCandidates        : [],
        aliasClaims              : [],
        eventClaims              : [],
        relationClaims           : [],
        timeClaims               : [],
        identityResolutionClaims : []
      })
    };
    const persister = {
      persistConflictDrafts: vi.fn().mockRejectedValue(new Error("persist failed"))
    };
    const stageRunService = createStageRunService();
    const detector = createConflictDetector({
      repository     : repository as never,
      persister      : persister as never,
      stageRunService: stageRunService as never
    });

    await expect(detector.runForBook({ bookId: BOOK_ID, runId: RUN_ID })).rejects.toThrow("persist failed");
    expect(stageRunService.failStageRun).toHaveBeenCalledWith("stage-run-1", expect.any(Error));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stageB5/ConflictDetector.test.ts
```

Expected: FAIL because the orchestrator module does not exist yet.

- [ ] **Step 3: Implement the orchestrator and export surface**

Create `src/server/modules/analysis/pipelines/evidence-review/stageB5/ConflictDetector.ts`:

```ts
import { createHash } from "node:crypto";

import type { Prisma } from "@/generated/prisma/client";
import {
  analysisStageRunService,
  type AnalysisStageRunService
} from "@/server/modules/analysis/runs/stage-run-service";
import { buildStageB5ConflictDrafts } from "@/server/modules/analysis/pipelines/evidence-review/stageB5/draft-builder";
import { detectStageB5Conflicts } from "@/server/modules/analysis/pipelines/evidence-review/stageB5/conflict-rules";
import {
  createStageB5Persister,
  type StageB5Persister
} from "@/server/modules/analysis/pipelines/evidence-review/stageB5/persister";
import {
  createStageB5Repository,
  type StageB5Repository
} from "@/server/modules/analysis/pipelines/evidence-review/stageB5/repository";
import {
  STAGE_B5_RULE_MODEL,
  STAGE_B5_RULE_PROVIDER,
  STAGE_B5_RULE_VERSION,
  STAGE_B5_STAGE_KEY,
  summarizeStageB5ConflictCounts,
  type StageB5RunInput,
  type StageB5RunResult
} from "@/server/modules/analysis/pipelines/evidence-review/stageB5/types";

function stableHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export interface ConflictDetectorDependencies {
  repository?     : Pick<StageB5Repository, "loadConflictInputs">;
  persister?      : Pick<StageB5Persister, "persistConflictDrafts">;
  stageRunService?: Pick<
    AnalysisStageRunService,
    "startStageRun" | "recordRawOutput" | "succeedStageRun" | "failStageRun"
  >;
}

export function createConflictDetector(
  dependencies: ConflictDetectorDependencies = {}
) {
  const repository = dependencies.repository ?? createStageB5Repository();
  const persister = dependencies.persister ?? createStageB5Persister();
  const stageRunService = dependencies.stageRunService ?? analysisStageRunService;

  async function runForBook(input: StageB5RunInput): Promise<StageB5RunResult> {
    if (input.runId === null) {
      throw new Error("Stage B.5 persistence requires a non-null runId");
    }

    const payload = await repository.loadConflictInputs({
      bookId: input.bookId,
      runId : input.runId
    });
    const chapterNos = [
      ...payload.aliasClaims.map((row) => row.chapterNo).filter((value): value is number => value !== null),
      ...payload.eventClaims.map((row) => row.chapterNo),
      ...payload.relationClaims.map((row) => row.chapterNo),
      ...payload.timeClaims.map((row) => row.chapterNo),
      ...payload.identityResolutionClaims.map((row) => row.chapterNo).filter((value): value is number => value !== null)
    ];

    const started = await stageRunService.startStageRun({
      runId         : input.runId,
      bookId        : input.bookId,
      stageKey      : STAGE_B5_STAGE_KEY,
      attempt       : input.attempt ?? 1,
      inputHash     : stableHash({
        ruleVersion               : STAGE_B5_RULE_VERSION,
        personaCandidateIds       : payload.personaCandidates.map((row) => row.id),
        aliasClaimIds             : payload.aliasClaims.map((row) => row.id),
        eventClaimIds             : payload.eventClaims.map((row) => row.id),
        relationClaimIds          : payload.relationClaims.map((row) => row.id),
        timeClaimIds              : payload.timeClaims.map((row) => row.id),
        identityResolutionClaimIds: payload.identityResolutionClaims.map((row) => row.id)
      }),
      inputCount    : payload.personaCandidates.length
        + payload.aliasClaims.length
        + payload.eventClaims.length
        + payload.relationClaims.length
        + payload.timeClaims.length
        + payload.identityResolutionClaims.length,
      chapterStartNo: chapterNos.length > 0 ? Math.min(...chapterNos) : null,
      chapterEndNo  : chapterNos.length > 0 ? Math.max(...chapterNos) : null
    });

    try {
      const findings = detectStageB5Conflicts(payload);
      const drafts = buildStageB5ConflictDrafts({
        bookId  : input.bookId,
        runId   : input.runId,
        findings
      });
      const persisted = await persister.persistConflictDrafts({
        bookId : input.bookId,
        runId  : input.runId,
        drafts
      });
      const decisionSummary = summarizeStageB5ConflictCounts(findings.map((finding) => ({
        conflictType: finding.conflictType,
        severity    : finding.severity
      })));
      const responseJson: Prisma.InputJsonObject = {
        ruleVersion    : STAGE_B5_RULE_VERSION,
        conflictCount  : drafts.length,
        decisionSummary,
        persistedCount : persisted.createdCount
      };
      const rawOutput = await stageRunService.recordRawOutput({
        runId               : input.runId,
        stageRunId          : started.id,
        bookId              : input.bookId,
        provider            : STAGE_B5_RULE_PROVIDER,
        model               : STAGE_B5_RULE_MODEL,
        requestPayload      : {
          ruleVersion               : STAGE_B5_RULE_VERSION,
          personaCandidateCount     : payload.personaCandidates.length,
          aliasClaimCount           : payload.aliasClaims.length,
          eventClaimCount           : payload.eventClaims.length,
          relationClaimCount        : payload.relationClaims.length,
          timeClaimCount            : payload.timeClaims.length,
          identityResolutionCount   : payload.identityResolutionClaims.length
        } as Prisma.InputJsonValue,
        responseText        : JSON.stringify(responseJson),
        responseJson,
        parseError          : null,
        schemaError         : null,
        discardReason       : decisionSummary,
        promptTokens        : 0,
        completionTokens    : 0,
        estimatedCostMicros : BigInt(0)
      });

      await stageRunService.succeedStageRun(started.id, {
        outputHash         : stableHash(responseJson),
        outputCount        : persisted.createdCount,
        skippedCount       : 0,
        promptTokens       : 0,
        completionTokens   : 0,
        estimatedCostMicros: BigInt(0)
      });

      return {
        bookId         : input.bookId,
        runId          : input.runId,
        stageRunId     : started.id,
        rawOutputId    : rawOutput.id,
        inputCount     : payload.personaCandidates.length
          + payload.aliasClaims.length
          + payload.eventClaims.length
          + payload.relationClaims.length
          + payload.timeClaims.length
          + payload.identityResolutionClaims.length,
        outputCount    : persisted.createdCount,
        skippedCount   : 0,
        decisionSummary
      };
    } catch (error) {
      await stageRunService.failStageRun(started.id, error);
      throw error;
    }
  }

  return { runForBook };
}

export type ConflictDetector = ReturnType<typeof createConflictDetector>;
export const conflictDetector = createConflictDetector();
```

Create `src/server/modules/analysis/pipelines/evidence-review/stageB5/index.ts`:

```ts
export * from "@/server/modules/analysis/pipelines/evidence-review/stageB5/types";
export * from "@/server/modules/analysis/pipelines/evidence-review/stageB5/repository";
export * from "@/server/modules/analysis/pipelines/evidence-review/stageB5/conflict-rules";
export * from "@/server/modules/analysis/pipelines/evidence-review/stageB5/draft-builder";
export * from "@/server/modules/analysis/pipelines/evidence-review/stageB5/persister";
export * from "@/server/modules/analysis/pipelines/evidence-review/stageB5/ConflictDetector";
```

- [ ] **Step 4: Run the full validation, then update docs**

Run:

```bash
pnpm exec vitest run \
  src/server/modules/analysis/claims/claim-schemas.test.ts \
  src/server/modules/analysis/pipelines/evidence-review/stageB5/types.test.ts \
  src/server/modules/analysis/pipelines/evidence-review/stageB5/repository.test.ts \
  src/server/modules/analysis/pipelines/evidence-review/stageB5/conflict-rules.test.ts \
  src/server/modules/analysis/pipelines/evidence-review/stageB5/draft-builder.test.ts \
  src/server/modules/analysis/pipelines/evidence-review/stageB5/persister.test.ts \
  src/server/modules/analysis/pipelines/evidence-review/stageB5/ConflictDetector.test.ts
pnpm type-check
```

Expected: PASS.

Then update `docs/superpowers/tasks/2026-04-18-evidence-review/09-stage-b5-conflict-detection.md`:

```md
- [x] Implement conflict families: `POST_MORTEM_ACTION`, `IMPOSSIBLE_LOCATION`, `TIME_ORDER_CONFLICT`, `RELATION_DIRECTION_CONFLICT`, `ALIAS_CONFLICT`, and `LOW_EVIDENCE_CLAIM`.
- [x] Bind conflicts to related claims, candidates, chapters, and evidence spans.
- [x] Store severity, reason, recommended action, and source stage.
- [x] Ensure conflicts are reviewable without changing the underlying claim.
- [x] Expose conflict summaries for Stage C and later review projections.
- [x] Add tests for at least five classical-literature high-risk cases.
- [x] Add an execution record and mark T09 complete in the runbook only after validation passes.
```

Update `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md` to mark T09 complete with the validation date and commit hash.

- [ ] **Step 5: Commit**

```bash
git add src/server/modules/analysis/pipelines/evidence-review/stageB5 docs/superpowers/tasks/2026-04-18-evidence-review/09-stage-b5-conflict-detection.md docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md
git commit -m "feat: implement stage b5 conflict detection"
```

## Final Verification Checklist

- `ConflictFlag` rows now persist severity, reason, recommended action, source stage, related candidates, related chapters, source claim ids, and evidence ids.
- Stage B.5 produces reviewable rows only; it never mutates the truth state of upstream claims.
- Stage C can consume persisted conflict flags as ranking penalties or review hints.
- Review pages can filter by `chapterId`, `relatedChapterIds`, `relatedPersonaCandidateIds`, and `conflictType`.
- Deterministic stage-run metrics and raw output are recorded with zero token and zero cost values.

## Execution Notes

- Execute tasks strictly in order.
- Do not start T10 before Task 7 passes.
- When a step says “update docs”, only do it after the listed validation command passes.
- If a migration conflicts with concurrent local schema changes, stop and reconcile the schema before proceeding.
