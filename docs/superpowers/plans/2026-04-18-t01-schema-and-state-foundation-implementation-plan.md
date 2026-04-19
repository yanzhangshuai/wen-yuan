# T01 Schema And State Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the evidence-first schema foundation, shared review-state contracts, and claim base types without destructively touching the legacy draft tables.

**Architecture:** Build the new evidence-review path as an additive subsystem beside the existing three-stage pipeline. Reuse existing enums where the semantics already match (`AliasType`, `IdentityClaim`, `NarrativeLens`, `BioCategory`, `AnalysisJobStatus`), reuse the existing `personas` table through `model Persona` as the formal projection anchor, and keep `Profile`, `BiographyRecord`, and `Relationship` out of the new truth path.

**Tech Stack:** Prisma 7 + PostgreSQL, TypeScript strict, Vitest, Zod, generated Prisma client in `src/generated/prisma`

---

## File Structure

- Modify: `prisma/schema.prisma`
  Responsibility: add the additive review-native enums and tables for runs, evidence, claims, projections, and audit logs; keep the new tables relation-light in T01 by using scalar UUID anchors plus indexes so the new path does not force broad back-relation edits into legacy models.
- Create: `prisma/migrations/20260418120000_evidence_review_schema_foundation/migration.sql`
  Responsibility: contain a non-destructive SQL migration that only creates new tables, new enums, and supporting indexes.
- Create: `src/server/modules/review/evidence-review/review-state.ts`
  Responsibility: single runtime source for review states, claim sources, relation direction/source values, and review-state transition helpers.
- Create: `src/server/modules/review/evidence-review/review-state.test.ts`
  Responsibility: lock the allowed and rejected review-state transitions before schema and service code start using them.
- Create: `src/server/modules/analysis/claims/base-types.ts`
  Responsibility: shared Zod-backed claim metadata contracts for evidence binding, review state, lineage, and free-string relation typing.
- Create: `src/server/modules/analysis/claims/base-types.test.ts`
  Responsibility: lock the claim-envelope and relation-type contracts so later claim writers inherit one exact runtime schema.
- Modify: `docs/superpowers/tasks/2026-04-18-evidence-review/01-schema-and-state-foundation.md`
  Responsibility: replace the empty execution record with the real T01 result after validation passes.
- Modify: `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`
  Responsibility: tick T01 and append the completion record after the task is fully validated.

## Task 1: Lock Review State Semantics First

**Files:**
- Create: `src/server/modules/review/evidence-review/review-state.ts`
- Create: `src/server/modules/review/evidence-review/review-state.test.ts`

- [ ] **Step 1: Write the failing review-state test**

```ts
import { describe, expect, it } from "vitest";

import {
  CLAIM_REVIEW_STATE_VALUES,
  CLAIM_SOURCE_VALUES,
  RELATION_DIRECTION_VALUES,
  RELATION_TYPE_SOURCE_VALUES,
  assertReviewStateTransition,
  canTransitionReviewState,
  getNextReviewStates,
  isProjectionEligibleReviewState
} from "@/server/modules/review/evidence-review/review-state";

describe("evidence review state helpers", () => {
  it("allows pending and conflicted claims to move into reviewer outcomes", () => {
    expect(getNextReviewStates("PENDING")).toEqual([
      "ACCEPTED",
      "REJECTED",
      "EDITED",
      "DEFERRED",
      "CONFLICTED"
    ]);
    expect(canTransitionReviewState("CONFLICTED", "REJECTED")).toBe(true);
  });

  it("rejects illegal back transitions", () => {
    expect(canTransitionReviewState("REJECTED", "PENDING")).toBe(false);
    expect(() => assertReviewStateTransition("ACCEPTED", "PENDING")).toThrowError(
      "Claim review state cannot transition from ACCEPTED to PENDING"
    );
  });

  it("marks only accepted claims as projection eligible", () => {
    expect(isProjectionEligibleReviewState("ACCEPTED")).toBe(true);
    expect(isProjectionEligibleReviewState("PENDING")).toBe(false);
    expect(isProjectionEligibleReviewState("EDITED")).toBe(false);
  });

  it("exports the runtime value sets reused by schema and DTO code", () => {
    expect(CLAIM_REVIEW_STATE_VALUES).toEqual([
      "PENDING",
      "ACCEPTED",
      "REJECTED",
      "EDITED",
      "DEFERRED",
      "CONFLICTED"
    ]);
    expect(CLAIM_SOURCE_VALUES).toEqual(["AI", "RULE", "MANUAL", "IMPORTED"]);
    expect(RELATION_DIRECTION_VALUES).toEqual([
      "FORWARD",
      "REVERSE",
      "BIDIRECTIONAL",
      "UNDIRECTED"
    ]);
    expect(RELATION_TYPE_SOURCE_VALUES).toEqual([
      "PRESET",
      "CUSTOM",
      "NORMALIZED_FROM_CUSTOM"
    ]);
  });
});
```

- [ ] **Step 2: Run the test and confirm the module is missing**

Run: `pnpm test src/server/modules/review/evidence-review/review-state.test.ts`
Expected: FAIL with a module resolution error for `@/server/modules/review/evidence-review/review-state`

- [ ] **Step 3: Implement the minimal review-state helper module**

```ts
export const CLAIM_REVIEW_STATE_VALUES = [
  "PENDING",
  "ACCEPTED",
  "REJECTED",
  "EDITED",
  "DEFERRED",
  "CONFLICTED"
] as const;

export type ClaimReviewState = (typeof CLAIM_REVIEW_STATE_VALUES)[number];

export const CLAIM_SOURCE_VALUES = [
  "AI",
  "RULE",
  "MANUAL",
  "IMPORTED"
] as const;

export type ClaimSource = (typeof CLAIM_SOURCE_VALUES)[number];

export const RELATION_DIRECTION_VALUES = [
  "FORWARD",
  "REVERSE",
  "BIDIRECTIONAL",
  "UNDIRECTED"
] as const;

export type RelationDirection = (typeof RELATION_DIRECTION_VALUES)[number];

export const RELATION_TYPE_SOURCE_VALUES = [
  "PRESET",
  "CUSTOM",
  "NORMALIZED_FROM_CUSTOM"
] as const;

export type RelationTypeSource = (typeof RELATION_TYPE_SOURCE_VALUES)[number];

const REVIEW_STATE_TRANSITIONS: Record<ClaimReviewState, readonly ClaimReviewState[]> = {
  PENDING   : ["ACCEPTED", "REJECTED", "EDITED", "DEFERRED", "CONFLICTED"],
  ACCEPTED  : ["EDITED", "DEFERRED"],
  REJECTED  : [],
  EDITED    : ["ACCEPTED", "DEFERRED"],
  DEFERRED  : ["PENDING", "ACCEPTED", "REJECTED", "EDITED", "CONFLICTED"],
  CONFLICTED: ["ACCEPTED", "REJECTED", "EDITED", "DEFERRED"]
};

export function getNextReviewStates(state: ClaimReviewState): readonly ClaimReviewState[] {
  return REVIEW_STATE_TRANSITIONS[state];
}

export function canTransitionReviewState(from: ClaimReviewState, to: ClaimReviewState): boolean {
  return REVIEW_STATE_TRANSITIONS[from].includes(to);
}

export function assertReviewStateTransition(from: ClaimReviewState, to: ClaimReviewState): void {
  if (!canTransitionReviewState(from, to)) {
    throw new Error(`Claim review state cannot transition from ${from} to ${to}`);
  }
}

export function isProjectionEligibleReviewState(state: ClaimReviewState): boolean {
  return state === "ACCEPTED";
}
```

- [ ] **Step 4: Re-run the review-state test**

Run: `pnpm test src/server/modules/review/evidence-review/review-state.test.ts`
Expected: PASS

- [ ] **Step 5: Commit the review-state foundation**

```bash
git add src/server/modules/review/evidence-review/review-state.ts src/server/modules/review/evidence-review/review-state.test.ts
git commit -m "feat: add evidence review state helpers"
```

## Task 2: Lock Shared Claim Base Types Before Schema Work

**Files:**
- Create: `src/server/modules/analysis/claims/base-types.ts`
- Create: `src/server/modules/analysis/claims/base-types.test.ts`

- [ ] **Step 1: Write the failing claim base-types test**

```ts
import { describe, expect, it } from "vitest";

import {
  claimEnvelopeSchema,
  claimReviewStateSchema,
  claimSourceSchema,
  relationTypeSelectionSchema
} from "@/server/modules/analysis/claims/base-types";

const RUN_ID = "11111111-1111-4111-8111-111111111111";
const EVIDENCE_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "33333333-3333-4333-8333-333333333333";

describe("claim base type schemas", () => {
  it("accepts an evidence-bound ai claim envelope", () => {
    const parsed = claimEnvelopeSchema.parse({
      source           : "AI",
      reviewState      : "PENDING",
      runId            : RUN_ID,
      evidenceSpanIds  : [EVIDENCE_ID],
      supersedesClaimId: null,
      derivedFromClaimId: null,
      createdByUserId  : null,
      reviewedByUserId : USER_ID,
      reviewNote       : "初始待审"
    });

    expect(parsed.source).toBe("AI");
    expect(parsed.reviewState).toBe("PENDING");
  });

  it("rejects envelopes without evidence spans", () => {
    expect(() => claimEnvelopeSchema.parse({
      source           : "RULE",
      reviewState      : "PENDING",
      runId            : RUN_ID,
      evidenceSpanIds  : [],
      supersedesClaimId: null,
      derivedFromClaimId: null,
      createdByUserId  : null,
      reviewedByUserId : null,
      reviewNote       : null
    })).toThrowError(/at least 1/i);
  });

  it("keeps relationTypeKey as a free string key instead of an enum", () => {
    const parsed = relationTypeSelectionSchema.parse({
      relationTypeKey   : "political_patron_of",
      relationLabel     : "政治庇护",
      relationTypeSource: "CUSTOM",
      direction         : "FORWARD"
    });

    expect(parsed.relationTypeKey).toBe("political_patron_of");
    expect(() => relationTypeSelectionSchema.parse({
      relationTypeKey   : 42,
      relationLabel     : "政治庇护",
      relationTypeSource: "CUSTOM",
      direction         : "FORWARD"
    })).toThrowError();
  });

  it("reuses the shared source and review-state schemas", () => {
    expect(claimSourceSchema.parse("MANUAL")).toBe("MANUAL");
    expect(claimReviewStateSchema.parse("CONFLICTED")).toBe("CONFLICTED");
  });
});
```

- [ ] **Step 2: Run the test and confirm the new module is missing**

Run: `pnpm test src/server/modules/analysis/claims/base-types.test.ts`
Expected: FAIL with a module resolution error for `@/server/modules/analysis/claims/base-types`

- [ ] **Step 3: Implement the minimal shared claim contract module**

```ts
import { z } from "zod";

import {
  CLAIM_SOURCE_VALUES,
  CLAIM_REVIEW_STATE_VALUES,
  RELATION_DIRECTION_VALUES,
  RELATION_TYPE_SOURCE_VALUES,
  type ClaimSource,
  type ClaimReviewState,
  type RelationDirection,
  type RelationTypeSource
} from "@/server/modules/review/evidence-review/review-state";

export const claimSourceSchema = z.enum(CLAIM_SOURCE_VALUES);
export const claimReviewStateSchema = z.enum(CLAIM_REVIEW_STATE_VALUES);
export const relationDirectionSchema = z.enum(RELATION_DIRECTION_VALUES);
export const relationTypeSourceSchema = z.enum(RELATION_TYPE_SOURCE_VALUES);

export const claimLineageSchema = z.object({
  supersedesClaimId : z.string().uuid().nullable(),
  derivedFromClaimId: z.string().uuid().nullable()
});

export const claimAuditFieldsSchema = z.object({
  source          : claimSourceSchema,
  reviewState     : claimReviewStateSchema,
  runId           : z.string().uuid(),
  createdByUserId : z.string().uuid().nullable(),
  reviewedByUserId: z.string().uuid().nullable(),
  reviewNote      : z.string().trim().min(1).nullable()
});

export const evidenceBindingSchema = z.object({
  evidenceSpanIds: z.array(z.string().uuid()).min(1)
});

export const relationTypeSelectionSchema = z.object({
  relationTypeKey   : z.string().trim().min(1),
  relationLabel     : z.string().trim().min(1),
  relationTypeSource: relationTypeSourceSchema,
  direction         : relationDirectionSchema
});

export const claimEnvelopeSchema = claimAuditFieldsSchema
  .merge(evidenceBindingSchema)
  .merge(claimLineageSchema);

export interface ClaimEnvelope extends z.infer<typeof claimEnvelopeSchema> {}
export interface RelationTypeSelection extends z.infer<typeof relationTypeSelectionSchema> {}

export type {
  ClaimSource,
  ClaimReviewState,
  RelationDirection,
  RelationTypeSource
};
```

- [ ] **Step 4: Re-run the claim base-types test**

Run: `pnpm test src/server/modules/analysis/claims/base-types.test.ts`
Expected: PASS

- [ ] **Step 5: Commit the shared claim contracts**

```bash
git add src/server/modules/analysis/claims/base-types.ts src/server/modules/analysis/claims/base-types.test.ts
git commit -m "feat: add evidence claim base types"
```

## Task 3: Add Review-Native Enums And Ingest Foundation To Prisma

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Inspect the existing schema anchors that must be reused**

Run: `rg -n "enum (AliasType|IdentityClaim|NarrativeLens|BioCategory|AnalysisJobStatus)|model Persona\\b|model Profile\\b|model BiographyRecord\\b|model Relationship\\b" prisma/schema.prisma`
Expected: existing enums and legacy models are present; `model Persona` already maps to `personas`, so T01 must reuse it instead of creating a second persona table.

- [ ] **Step 2: Add the new enums required by the evidence-first subsystem**

```prisma
enum ClaimReviewState {
  PENDING
  ACCEPTED
  REJECTED
  EDITED
  DEFERRED
  CONFLICTED

  @@map("claim_review_state")
}

enum ClaimSource {
  AI
  RULE
  MANUAL
  IMPORTED

  @@map("claim_source")
}

enum AnalysisStageRunStatus {
  PENDING
  RUNNING
  SUCCEEDED
  FAILED
  SKIPPED
  CANCELED

  @@map("analysis_stage_run_status")
}

enum ChapterSegmentType {
  TITLE
  NARRATIVE
  DIALOGUE_LEAD
  DIALOGUE_CONTENT
  POEM
  COMMENTARY
  UNKNOWN

  @@map("chapter_segment_type")
}

enum MentionKind {
  NAMED
  TITLE_ONLY
  COURTESY_NAME
  KINSHIP
  ORGANIZATION
  LOCATION
  UNKNOWN

  @@map("mention_kind")
}

enum PersonaCandidateStatus {
  OPEN
  CONFIRMED
  MERGED
  REJECTED

  @@map("persona_candidate_status")
}

enum RelationDirection {
  FORWARD
  REVERSE
  BIDIRECTIONAL
  UNDIRECTED

  @@map("relation_direction")
}

enum RelationTypeSource {
  PRESET
  CUSTOM
  NORMALIZED_FROM_CUSTOM

  @@map("relation_type_source")
}

enum TimeType {
  CHAPTER_ORDER
  RELATIVE_PHASE
  NAMED_EVENT
  HISTORICAL_YEAR
  BATTLE_PHASE
  UNCERTAIN

  @@map("time_type")
}

enum ConflictType {
  POSSIBLE_DUPLICATE
  POSSIBLE_SPLIT
  POST_MORTEM_ACTION
  IMPOSSIBLE_LOCATION
  RELATION_DIRECTION_CONFLICT
  ALIAS_CONFLICT
  TIME_ORDER_CONFLICT
  LOW_EVIDENCE_CLAIM

  @@map("conflict_type")
}
```

- [ ] **Step 3: Add run, evidence, mention, and candidate foundation models**

```prisma
model AnalysisRun {
  id                String            @id @default(uuid()) @db.Uuid
  bookId            String            @map("book_id") @db.Uuid
  trigger           String
  scope             String
  status            AnalysisJobStatus @default(QUEUED)
  currentStageKey   String?           @map("current_stage_key")
  requestedByUserId String?           @map("requested_by_user_id") @db.Uuid
  startedAt         DateTime?         @map("started_at") @db.Timestamptz(6)
  finishedAt        DateTime?         @map("finished_at") @db.Timestamptz(6)
  errorMessage      String?           @map("error_message") @db.Text
  createdAt         DateTime          @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt         DateTime          @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@index([bookId, createdAt], map: "analysis_runs_book_created_at_idx")
  @@index([status, createdAt], map: "analysis_runs_status_created_at_idx")
  @@map("analysis_runs")
}

model AnalysisStageRun {
  id           String                 @id @default(uuid()) @db.Uuid
  runId        String                 @map("run_id") @db.Uuid
  bookId       String                 @map("book_id") @db.Uuid
  chapterId    String?                @map("chapter_id") @db.Uuid
  stageKey     String                 @map("stage_key")
  status       AnalysisStageRunStatus @default(PENDING)
  attempt      Int                    @default(1)
  inputHash    String?                @map("input_hash")
  outputHash   String?                @map("output_hash")
  errorMessage String?                @map("error_message") @db.Text
  startedAt    DateTime?              @map("started_at") @db.Timestamptz(6)
  finishedAt   DateTime?              @map("finished_at") @db.Timestamptz(6)
  createdAt    DateTime               @default(now()) @map("created_at") @db.Timestamptz(6)

  @@index([runId, stageKey], map: "analysis_stage_runs_run_stage_idx")
  @@index([chapterId, stageKey], map: "analysis_stage_runs_chapter_stage_idx")
  @@map("analysis_stage_runs")
}

model LlmRawOutput {
  id               String   @id @default(uuid()) @db.Uuid
  runId            String   @map("run_id") @db.Uuid
  stageRunId       String?  @map("stage_run_id") @db.Uuid
  bookId           String   @map("book_id") @db.Uuid
  chapterId        String?  @map("chapter_id") @db.Uuid
  provider         String
  model            String
  requestPayload   Json     @map("request_payload")
  responseText     String   @map("response_text") @db.Text
  responseJson     Json?    @map("response_json")
  promptTokens     Int?     @map("prompt_tokens")
  completionTokens Int?     @map("completion_tokens")
  durationMs       Int?     @map("duration_ms")
  createdAt        DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  @@index([runId], map: "llm_raw_outputs_run_idx")
  @@index([stageRunId], map: "llm_raw_outputs_stage_run_idx")
  @@index([chapterId], map: "llm_raw_outputs_chapter_idx")
  @@map("llm_raw_outputs")
}

model ChapterSegment {
  id             String             @id @default(uuid()) @db.Uuid
  bookId         String             @map("book_id") @db.Uuid
  chapterId      String             @map("chapter_id") @db.Uuid
  runId          String             @map("run_id") @db.Uuid
  segmentIndex   Int                @map("segment_index")
  segmentType    ChapterSegmentType @map("segment_type")
  startOffset    Int                @map("start_offset")
  endOffset      Int                @map("end_offset")
  text           String             @db.Text
  normalizedText String             @map("normalized_text") @db.Text
  speakerHint    String?            @map("speaker_hint")
  createdAt      DateTime           @default(now()) @map("created_at") @db.Timestamptz(6)

  @@unique([runId, chapterId, segmentIndex], map: "chapter_segments_run_chapter_index_key")
  @@index([chapterId, segmentType], map: "chapter_segments_chapter_type_idx")
  @@map("chapter_segments")
}

model EvidenceSpan {
  id                  String   @id @default(uuid()) @db.Uuid
  bookId              String   @map("book_id") @db.Uuid
  chapterId           String   @map("chapter_id") @db.Uuid
  segmentId           String   @map("segment_id") @db.Uuid
  startOffset         Int      @map("start_offset")
  endOffset           Int      @map("end_offset")
  quotedText          String   @map("quoted_text") @db.Text
  normalizedText      String   @map("normalized_text") @db.Text
  speakerHint         String?  @map("speaker_hint")
  narrativeRegionType String   @map("narrative_region_type")
  createdByRunId      String   @map("created_by_run_id") @db.Uuid
  createdAt           DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  @@index([chapterId, startOffset], map: "evidence_spans_chapter_offset_idx")
  @@index([segmentId], map: "evidence_spans_segment_idx")
  @@index([createdByRunId], map: "evidence_spans_run_idx")
  @@map("evidence_spans")
}

model EntityMention {
  id                         String       @id @default(uuid()) @db.Uuid
  bookId                     String       @map("book_id") @db.Uuid
  chapterId                  String       @map("chapter_id") @db.Uuid
  surfaceText                String       @map("surface_text")
  mentionKind                MentionKind  @map("mention_kind")
  identityClaim              IdentityClaim? @map("identity_claim")
  aliasTypeHint              AliasType?   @map("alias_type_hint")
  speakerPersonaCandidateId  String?      @map("speaker_persona_candidate_id") @db.Uuid
  suspectedResolvesTo        String?      @map("suspected_resolves_to") @db.Uuid
  evidenceSpanId             String       @map("evidence_span_id") @db.Uuid
  confidence                 Float        @default(0)
  source                     ClaimSource  @default(AI)
  runId                      String       @map("run_id") @db.Uuid
  createdAt                  DateTime     @default(now()) @map("created_at") @db.Timestamptz(6)

  @@index([bookId, chapterId], map: "entity_mentions_book_chapter_idx")
  @@index([evidenceSpanId], map: "entity_mentions_evidence_idx")
  @@index([runId], map: "entity_mentions_run_idx")
  @@map("entity_mentions")
}

model PersonaCandidate {
  id                String                 @id @default(uuid()) @db.Uuid
  bookId            String                 @map("book_id") @db.Uuid
  canonicalLabel    String                 @map("canonical_label")
  candidateStatus   PersonaCandidateStatus @default(OPEN) @map("candidate_status")
  firstSeenChapterNo Int?                  @map("first_seen_chapter_no")
  lastSeenChapterNo Int?                   @map("last_seen_chapter_no")
  mentionCount      Int                    @default(0) @map("mention_count")
  evidenceScore     Float                  @default(0) @map("evidence_score")
  runId             String                 @map("run_id") @db.Uuid
  createdAt         DateTime               @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt         DateTime               @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@index([bookId, candidateStatus], map: "persona_candidates_book_status_idx")
  @@index([runId], map: "persona_candidates_run_idx")
  @@map("persona_candidates")
}
```

- [ ] **Step 4: Format the schema after the first insert**

Run: `pnpm prisma format --schema prisma/schema.prisma`
Expected: Prisma rewrites the new enums and models into canonical formatting without changing their names.

## Task 4: Add Claim, Projection, And Audit Models To Prisma

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add the claim-kind and review-action enums used by audit and conflict tables**

```prisma
enum ClaimKind {
  ALIAS
  EVENT
  RELATION
  TIME
  IDENTITY_RESOLUTION
  CONFLICT_FLAG

  @@map("claim_kind")
}

enum ReviewAction {
  ACCEPT
  REJECT
  EDIT
  CREATE_MANUAL_CLAIM
  MERGE_PERSONA
  SPLIT_PERSONA
  CHANGE_RELATION_TYPE
  CHANGE_RELATION_INTERVAL
  RELINK_EVIDENCE

  @@map("review_action")
}

enum AliasClaimKind {
  ALIAS_OF
  COURTESY_NAME_OF
  TITLE_OF
  KINSHIP_REFERENCE_TO
  IMPERSONATES
  MISIDENTIFIED_AS
  UNSURE

  @@map("alias_claim_kind")
}

enum IdentityResolutionKind {
  RESOLVES_TO
  SPLIT_FROM
  MERGE_INTO
  UNSURE

  @@map("identity_resolution_kind")
}
```

- [ ] **Step 2: Add the claim tables with shared review-state and lineage fields**

```prisma
model AliasClaim {
  id                       String           @id @default(uuid()) @db.Uuid
  bookId                   String           @map("book_id") @db.Uuid
  chapterId                String?          @map("chapter_id") @db.Uuid
  aliasText                String           @map("alias_text")
  aliasType                AliasType        @map("alias_type")
  personaCandidateId       String?          @map("persona_candidate_id") @db.Uuid
  targetPersonaCandidateId String?          @map("target_persona_candidate_id") @db.Uuid
  claimKind                AliasClaimKind   @map("claim_kind")
  evidenceSpanIds          String[]         @default([]) @map("evidence_span_ids")
  confidence               Float            @default(0)
  reviewState              ClaimReviewState @default(PENDING) @map("review_state")
  source                   ClaimSource      @default(AI)
  runId                    String           @map("run_id") @db.Uuid
  supersedesClaimId        String?          @map("supersedes_claim_id") @db.Uuid
  derivedFromClaimId       String?          @map("derived_from_claim_id") @db.Uuid
  createdByUserId          String?          @map("created_by_user_id") @db.Uuid
  reviewedByUserId         String?          @map("reviewed_by_user_id") @db.Uuid
  reviewedAt               DateTime?        @map("reviewed_at") @db.Timestamptz(6)
  reviewNote               String?          @map("review_note") @db.Text
  createdAt                DateTime         @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt                DateTime         @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@index([bookId, reviewState], map: "alias_claims_book_state_idx")
  @@index([personaCandidateId], map: "alias_claims_candidate_idx")
  @@index([runId], map: "alias_claims_run_idx")
  @@map("alias_claims")
}

model EventClaim {
  id                       String           @id @default(uuid()) @db.Uuid
  bookId                   String           @map("book_id") @db.Uuid
  chapterId                String           @map("chapter_id") @db.Uuid
  subjectMentionId         String?          @map("subject_mention_id") @db.Uuid
  subjectPersonaCandidateId String?         @map("subject_persona_candidate_id") @db.Uuid
  predicate                String
  objectText               String?          @map("object_text")
  objectPersonaCandidateId String?          @map("object_persona_candidate_id") @db.Uuid
  locationText             String?          @map("location_text")
  timeHintId               String?          @map("time_hint_id") @db.Uuid
  eventCategory            BioCategory      @default(EVENT) @map("event_category")
  narrativeLens            NarrativeLens    @default(SELF) @map("narrative_lens")
  evidenceSpanIds          String[]         @default([]) @map("evidence_span_ids")
  confidence               Float            @default(0)
  reviewState              ClaimReviewState @default(PENDING) @map("review_state")
  source                   ClaimSource      @default(AI)
  runId                    String           @map("run_id") @db.Uuid
  supersedesClaimId        String?          @map("supersedes_claim_id") @db.Uuid
  derivedFromClaimId       String?          @map("derived_from_claim_id") @db.Uuid
  createdByUserId          String?          @map("created_by_user_id") @db.Uuid
  reviewedByUserId         String?          @map("reviewed_by_user_id") @db.Uuid
  reviewedAt               DateTime?        @map("reviewed_at") @db.Timestamptz(6)
  reviewNote               String?          @map("review_note") @db.Text
  createdAt                DateTime         @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt                DateTime         @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@index([bookId, chapterId, reviewState], map: "event_claims_book_chapter_state_idx")
  @@index([subjectPersonaCandidateId], map: "event_claims_subject_candidate_idx")
  @@index([timeHintId], map: "event_claims_time_hint_idx")
  @@map("event_claims")
}

model RelationClaim {
  id                       String             @id @default(uuid()) @db.Uuid
  bookId                   String             @map("book_id") @db.Uuid
  chapterId                String             @map("chapter_id") @db.Uuid
  sourceMentionId          String?            @map("source_mention_id") @db.Uuid
  targetMentionId          String?            @map("target_mention_id") @db.Uuid
  sourcePersonaCandidateId String?            @map("source_persona_candidate_id") @db.Uuid
  targetPersonaCandidateId String?            @map("target_persona_candidate_id") @db.Uuid
  relationTypeKey          String             @map("relation_type_key")
  relationLabel            String             @map("relation_label")
  relationTypeSource       RelationTypeSource @map("relation_type_source")
  direction                RelationDirection
  effectiveChapterStart    Int?               @map("effective_chapter_start")
  effectiveChapterEnd      Int?               @map("effective_chapter_end")
  timeHintId               String?            @map("time_hint_id") @db.Uuid
  evidenceSpanIds          String[]           @default([]) @map("evidence_span_ids")
  confidence               Float              @default(0)
  reviewState              ClaimReviewState   @default(PENDING) @map("review_state")
  source                   ClaimSource        @default(AI)
  runId                    String             @map("run_id") @db.Uuid
  supersedesClaimId        String?            @map("supersedes_claim_id") @db.Uuid
  derivedFromClaimId       String?            @map("derived_from_claim_id") @db.Uuid
  createdByUserId          String?            @map("created_by_user_id") @db.Uuid
  reviewedByUserId         String?            @map("reviewed_by_user_id") @db.Uuid
  reviewedAt               DateTime?          @map("reviewed_at") @db.Timestamptz(6)
  reviewNote               String?            @map("review_note") @db.Text
  createdAt                DateTime           @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt                DateTime           @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@index([bookId, chapterId, reviewState], map: "relation_claims_book_chapter_state_idx")
  @@index([sourcePersonaCandidateId, targetPersonaCandidateId], map: "relation_claims_candidate_pair_idx")
  @@index([relationTypeKey], map: "relation_claims_type_key_idx")
  @@map("relation_claims")
}

model TimeClaim {
  id                String           @id @default(uuid()) @db.Uuid
  bookId            String           @map("book_id") @db.Uuid
  chapterId         String           @map("chapter_id") @db.Uuid
  rawTimeText       String           @map("raw_time_text")
  timeType          TimeType         @map("time_type")
  normalizedLabel   String           @map("normalized_label")
  relativeOrderWeight Float?         @map("relative_order_weight")
  chapterRangeStart Int?             @map("chapter_range_start")
  chapterRangeEnd   Int?             @map("chapter_range_end")
  evidenceSpanIds   String[]         @default([]) @map("evidence_span_ids")
  confidence        Float            @default(0)
  reviewState       ClaimReviewState @default(PENDING) @map("review_state")
  source            ClaimSource      @default(AI)
  runId             String           @map("run_id") @db.Uuid
  supersedesClaimId String?          @map("supersedes_claim_id") @db.Uuid
  derivedFromClaimId String?         @map("derived_from_claim_id") @db.Uuid
  createdByUserId   String?          @map("created_by_user_id") @db.Uuid
  reviewedByUserId  String?          @map("reviewed_by_user_id") @db.Uuid
  reviewedAt        DateTime?        @map("reviewed_at") @db.Timestamptz(6)
  reviewNote        String?          @map("review_note") @db.Text
  createdAt         DateTime         @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt         DateTime         @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@index([bookId, chapterId, reviewState], map: "time_claims_book_chapter_state_idx")
  @@index([timeType], map: "time_claims_type_idx")
  @@index([runId], map: "time_claims_run_idx")
  @@map("time_claims")
}

model IdentityResolutionClaim {
  id                String                 @id @default(uuid()) @db.Uuid
  bookId            String                 @map("book_id") @db.Uuid
  chapterId         String?                @map("chapter_id") @db.Uuid
  mentionId         String                 @map("mention_id") @db.Uuid
  personaCandidateId String?               @map("persona_candidate_id") @db.Uuid
  resolvedPersonaId String?                @map("resolved_persona_id") @db.Uuid
  resolutionKind    IdentityResolutionKind @map("resolution_kind")
  rationale         String?                @db.Text
  evidenceSpanIds   String[]               @default([]) @map("evidence_span_ids")
  confidence        Float                  @default(0)
  reviewState       ClaimReviewState       @default(PENDING) @map("review_state")
  source            ClaimSource            @default(AI)
  runId             String                 @map("run_id") @db.Uuid
  supersedesClaimId String?                @map("supersedes_claim_id") @db.Uuid
  derivedFromClaimId String?               @map("derived_from_claim_id") @db.Uuid
  createdByUserId   String?                @map("created_by_user_id") @db.Uuid
  reviewedByUserId  String?                @map("reviewed_by_user_id") @db.Uuid
  reviewedAt        DateTime?              @map("reviewed_at") @db.Timestamptz(6)
  reviewNote        String?                @map("review_note") @db.Text
  createdAt         DateTime               @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt         DateTime               @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@index([bookId, reviewState], map: "identity_resolution_claims_book_state_idx")
  @@index([mentionId], map: "identity_resolution_claims_mention_idx")
  @@index([runId], map: "identity_resolution_claims_run_idx")
  @@map("identity_resolution_claims")
}

model ConflictFlag {
  id               String           @id @default(uuid()) @db.Uuid
  bookId           String           @map("book_id") @db.Uuid
  chapterId        String?          @map("chapter_id") @db.Uuid
  runId            String           @map("run_id") @db.Uuid
  conflictType     ConflictType     @map("conflict_type")
  relatedClaimKind ClaimKind?       @map("related_claim_kind")
  relatedClaimIds  String[]         @default([]) @map("related_claim_ids")
  summary          String           @db.Text
  evidenceSpanIds  String[]         @default([]) @map("evidence_span_ids")
  reviewState      ClaimReviewState @default(CONFLICTED) @map("review_state")
  source           ClaimSource      @default(RULE)
  reviewedByUserId String?          @map("reviewed_by_user_id") @db.Uuid
  reviewedAt       DateTime?        @map("reviewed_at") @db.Timestamptz(6)
  reviewNote       String?          @map("review_note") @db.Text
  createdAt        DateTime         @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt        DateTime         @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@index([bookId, reviewState], map: "conflict_flags_book_state_idx")
  @@index([runId], map: "conflict_flags_run_idx")
  @@index([conflictType], map: "conflict_flags_type_idx")
  @@map("conflict_flags")
}
```

- [ ] **Step 3: Add the projection satellites and review audit log**

```prisma
model PersonaAlias {
  id            String      @id @default(uuid()) @db.Uuid
  bookId        String      @map("book_id") @db.Uuid
  personaId     String      @map("persona_id") @db.Uuid
  aliasText     String      @map("alias_text")
  aliasType     AliasType   @map("alias_type")
  sourceClaimId String?     @map("source_claim_id") @db.Uuid
  createdAt     DateTime    @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt     DateTime    @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@unique([bookId, personaId, aliasText], map: "persona_aliases_book_persona_alias_key")
  @@index([personaId], map: "persona_aliases_persona_idx")
  @@map("persona_aliases")
}

model PersonaChapterFact {
  id                 String   @id @default(uuid()) @db.Uuid
  bookId             String   @map("book_id") @db.Uuid
  personaId          String   @map("persona_id") @db.Uuid
  chapterId          String   @map("chapter_id") @db.Uuid
  chapterNo          Int      @map("chapter_no")
  eventCount         Int      @default(0) @map("event_count")
  relationCount      Int      @default(0) @map("relation_count")
  conflictCount      Int      @default(0) @map("conflict_count")
  reviewStateSummary Json     @map("review_state_summary")
  latestUpdatedAt    DateTime @map("latest_updated_at") @db.Timestamptz(6)
  createdAt          DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt          DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@unique([bookId, personaId, chapterId], map: "persona_chapter_facts_book_persona_chapter_key")
  @@index([bookId, chapterNo], map: "persona_chapter_facts_book_chapter_no_idx")
  @@index([personaId, chapterNo], map: "persona_chapter_facts_persona_chapter_no_idx")
  @@map("persona_chapter_facts")
}

model PersonaTimeFact {
  id               String   @id @default(uuid()) @db.Uuid
  bookId           String   @map("book_id") @db.Uuid
  personaId        String   @map("persona_id") @db.Uuid
  timeLabel        String   @map("time_label")
  timeSortKey      Float?   @map("time_sort_key")
  chapterRangeStart Int?    @map("chapter_range_start")
  chapterRangeEnd  Int?     @map("chapter_range_end")
  eventCount       Int      @default(0) @map("event_count")
  relationCount    Int      @default(0) @map("relation_count")
  sourceTimeClaimIds String[] @default([]) @map("source_time_claim_ids")
  createdAt        DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt        DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@index([bookId, personaId], map: "persona_time_facts_book_persona_idx")
  @@index([bookId, timeSortKey], map: "persona_time_facts_book_sort_key_idx")
  @@map("persona_time_facts")
}

model RelationshipEdge {
  id                   String             @id @default(uuid()) @db.Uuid
  bookId               String             @map("book_id") @db.Uuid
  sourcePersonaId      String             @map("source_persona_id") @db.Uuid
  targetPersonaId      String             @map("target_persona_id") @db.Uuid
  relationTypeKey      String             @map("relation_type_key")
  relationLabel        String             @map("relation_label")
  relationTypeSource   RelationTypeSource @map("relation_type_source")
  direction            RelationDirection
  effectiveChapterStart Int?              @map("effective_chapter_start")
  effectiveChapterEnd  Int?               @map("effective_chapter_end")
  sourceClaimIds       String[]           @default([]) @map("source_claim_ids")
  latestClaimId        String?            @map("latest_claim_id") @db.Uuid
  createdAt            DateTime           @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt            DateTime           @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@index([bookId, sourcePersonaId, targetPersonaId], map: "relationship_edges_book_pair_idx")
  @@index([relationTypeKey], map: "relationship_edges_type_key_idx")
  @@map("relationship_edges")
}

model TimelineEvent {
  id               String   @id @default(uuid()) @db.Uuid
  bookId           String   @map("book_id") @db.Uuid
  personaId        String   @map("persona_id") @db.Uuid
  chapterId        String?  @map("chapter_id") @db.Uuid
  chapterNo        Int?     @map("chapter_no")
  timeLabel        String?  @map("time_label")
  eventLabel       String   @map("event_label")
  narrativeLens    NarrativeLens @default(SELF) @map("narrative_lens")
  sourceClaimIds   String[] @default([]) @map("source_claim_ids")
  createdAt        DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt        DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@index([bookId, personaId, chapterNo], map: "timeline_events_book_persona_chapter_idx")
  @@index([bookId, timeLabel], map: "timeline_events_book_time_label_idx")
  @@map("timeline_events")
}

model ReviewAuditLog {
  id             String       @id @default(uuid()) @db.Uuid
  bookId         String       @map("book_id") @db.Uuid
  claimKind      ClaimKind?   @map("claim_kind")
  claimId        String?      @map("claim_id") @db.Uuid
  personaId      String?      @map("persona_id") @db.Uuid
  action         ReviewAction
  actorUserId    String?      @map("actor_user_id") @db.Uuid
  beforeState    Json?        @map("before_state")
  afterState     Json?        @map("after_state")
  note           String?      @db.Text
  evidenceSpanIds String[]    @default([]) @map("evidence_span_ids")
  createdAt      DateTime     @default(now()) @map("created_at") @db.Timestamptz(6)

  @@index([bookId, createdAt], map: "review_audit_logs_book_created_at_idx")
  @@index([claimKind, claimId], map: "review_audit_logs_claim_idx")
  @@index([personaId], map: "review_audit_logs_persona_idx")
  @@map("review_audit_logs")
}
```

- [ ] **Step 4: Validate the full Prisma schema before generating SQL**

Run: `pnpm prisma validate --schema prisma/schema.prisma`
Expected: PASS with `The schema at prisma/schema.prisma is valid`

## Task 5: Generate The Migration, Rebuild The Client, And Close T01

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260418120000_evidence_review_schema_foundation/migration.sql`
- Modify: `docs/superpowers/tasks/2026-04-18-evidence-review/01-schema-and-state-foundation.md`
- Modify: `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`

- [ ] **Step 1: Generate the migration SQL without touching existing data**

```bash
pnpm prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --script > /tmp/evidence_review_schema_foundation.sql
mkdir -p prisma/migrations/20260418120000_evidence_review_schema_foundation
mv /tmp/evidence_review_schema_foundation.sql prisma/migrations/20260418120000_evidence_review_schema_foundation/migration.sql
```

Expected: `prisma/migrations/20260418120000_evidence_review_schema_foundation/migration.sql` exists and contains only additive SQL.

- [ ] **Step 2: Inspect the migration for destructive operations**

Run: `rg -n "DROP TABLE|DROP COLUMN|DROP TYPE|ALTER TABLE .* RENAME|TRUNCATE" prisma/migrations/20260418120000_evidence_review_schema_foundation/migration.sql`
Expected: no matches

- [ ] **Step 3: Rebuild the Prisma client against the new schema**

Run: `pnpm prisma:generate`
Expected: PASS with generated client output under `src/generated/prisma`

- [ ] **Step 4: Run the task-scoped validation commands**

Run: `pnpm test src/server/modules/review/evidence-review/review-state.test.ts`
Expected: PASS

Run: `pnpm test src/server/modules/analysis/claims/base-types.test.ts`
Expected: PASS

Run: `pnpm type-check`
Expected: PASS

- [ ] **Step 5: Update the T01 task doc execution record**

```md
- Added additive evidence-first enums, schema tables, review-state helpers, and claim base schemas.
- Validation:
  - `pnpm prisma validate --schema prisma/schema.prisma`
  - `pnpm prisma:generate`
  - `pnpm test src/server/modules/review/evidence-review/review-state.test.ts`
  - `pnpm test src/server/modules/analysis/claims/base-types.test.ts`
  - `pnpm type-check`
- Result: pass
- Blockers: none
```

- [ ] **Step 6: Update the runbook and mark T01 complete**

```md
### T01 Completion - 2026-04-18

- Changed files: `prisma/schema.prisma`, `prisma/migrations/20260418120000_evidence_review_schema_foundation/migration.sql`, `src/server/modules/review/evidence-review/review-state.ts`, `src/server/modules/review/evidence-review/review-state.test.ts`, `src/server/modules/analysis/claims/base-types.ts`, `src/server/modules/analysis/claims/base-types.test.ts`, `docs/superpowers/tasks/2026-04-18-evidence-review/01-schema-and-state-foundation.md`, `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`
- Validation commands: `pnpm prisma validate --schema prisma/schema.prisma`, `pnpm prisma:generate`, `pnpm test src/server/modules/review/evidence-review/review-state.test.ts`, `pnpm test src/server/modules/analysis/claims/base-types.test.ts`, `pnpm type-check`
- Result: additive evidence-review foundation is in place, `relationTypeKey` remains a string field, and no legacy truth table was repurposed as the new review truth source
- Follow-up risks: the new tables are intentionally relation-light until the write path lands in T02-T04, so later tasks must keep repository joins explicit
- Next task: T02 `docs/superpowers/tasks/2026-04-18-evidence-review/02-text-evidence-layer.md`
```

- [ ] **Step 7: Commit the completed T01 foundation**

```bash
git add prisma/schema.prisma prisma/migrations/20260418120000_evidence_review_schema_foundation/migration.sql src/server/modules/review/evidence-review/review-state.ts src/server/modules/review/evidence-review/review-state.test.ts src/server/modules/analysis/claims/base-types.ts src/server/modules/analysis/claims/base-types.test.ts docs/superpowers/tasks/2026-04-18-evidence-review/01-schema-and-state-foundation.md docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md
git commit -m "feat: add evidence review schema foundation"
```

## Self-Review

- Spec coverage:
  - Review state and source semantics from spec §6 are covered by Task 1 and Task 2.
  - Evidence, entity mention, candidate, and claim tables from spec §5.1-§5.2 are covered by Task 3 and Task 4.
  - Projection and audit tables from spec §5.3 are covered by Task 4.
  - Non-destructive migration, rebuildable projection discipline, and T01 closure requirements from the task doc are covered by Task 5.
  - Real-repo integration detail not obvious from the spec is covered explicitly: `model Persona` already maps to `personas`, so the plan reuses it and does not create a second persona table.
- Placeholder scan:
  - No `TBD`, `TODO`, `implement later`, `similar to`, or angle-bracket placeholders remain.
  - The migration path is fixed to `prisma/migrations/20260418120000_evidence_review_schema_foundation/migration.sql` so execution does not depend on ad-hoc timestamp choices.
- Type consistency:
  - Runtime values in `review-state.ts` match the Prisma enums introduced in Task 3 and Task 4.
  - `relationTypeKey` is always a string field and never a Prisma enum in tests, shared types, or schema.
  - Later schema snippets reuse existing enums (`AliasType`, `IdentityClaim`, `NarrativeLens`, `BioCategory`, `AnalysisJobStatus`) instead of redefining near-duplicates.
