# T08 Stage B Identity Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a deterministic full-book Stage B resolver that reads Stage A mentions plus Stage A+ alias/knowledge hints, creates review-native `persona_candidates`, and writes `identity_resolution_claims` without creating final `personas`.

**Architecture:** Add a focused `analysis/pipelines/evidence-review/stageB` module that stays whole-book scoped and rule-first. Stage B reads persisted `ENTITY_MENTION` and `ALIAS` claims for one `bookId + runId`, converts Stage A+ review notes into conservative merge/block signals, clusters mentions into candidate buckets, materializes `persona_candidates`, and writes chapter-scoped `IDENTITY_RESOLUTION` claims while recording a cost-free T04 stage run.

**Tech Stack:** TypeScript strict, Vitest, Prisma 7 generated client, existing T03 claim contracts, existing T04 stage-run/raw-output service, existing T06/T07 evidence-review pipeline modules

---

## Source Of Truth

- Architecture spec: `docs/superpowers/specs/2026-04-18-evidence-review-architecture-rewrite-design.md` §5.2, §7.4, §8.1, §9
- Task doc: `docs/superpowers/tasks/2026-04-18-evidence-review/08-stage-b-identity-resolution.md`
- Historical PRD: `.trellis/tasks/04-18-evidence-review-08-stage-b-identity-resolution/prd.md`
- Runbook: `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`
- Upstream completed work:
  - `src/server/modules/analysis/claims/claim-schemas.ts`
  - `src/server/modules/analysis/claims/claim-repository.ts`
  - `src/server/modules/analysis/claims/claim-write-service.ts`
  - `src/server/modules/analysis/pipelines/evidence-review/stageA/**`
  - `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/**`
  - `src/server/modules/analysis/runs/stage-run-service.ts`
- Historical reference only:
  - `src/server/modules/analysis/pipelines/threestage/stageB/**`

## Scope Constraints

- Do not create or mutate final `personas`, `persona_aliases`, `persona_chapter_facts`, `persona_time_facts`, `relationship_edges`, or any Stage D projection.
- Do not silently merge low-confidence title-only, kinship-only, or impersonation mentions.
- Do not flatten `IMPERSONATES` or `MISIDENTIFIED_AS` into ordinary alias equivalence.
- Do not implement T09 `conflict_flags`, T10 fact attribution, review APIs, or UI in this task.
- Do not introduce an LLM dependency. T08 is deterministic and must remain explainable and cheap.
- Do not change the existing T03 claim family ownership matrix unless a failing test proves it is necessary.
- Stop if Stage A+ alias review notes no longer contain parseable canonical or blocked-name details; T08 depends on that current contract.

## Current Repo Facts

- `PersonaCandidate` and `IdentityResolutionClaim` already exist in `prisma/schema.prisma`; T08 does not require a schema migration.
- `IdentityResolutionKind` is limited to `RESOLVES_TO`, `SPLIT_FROM`, `MERGE_INTO`, and `UNSURE`.
- `claim-schemas.ts` already exposes `identityResolutionClaimDraftSchema`.
- `claim-repository.ts` already allows `stage_b_identity_resolution` to replace `IDENTITY_RESOLUTION`, and that replacement scope currently deletes only `source: "AI"` rows.
- `claim-write-service.ts` requires every draft in a batch to match the scope `chapterId`. Because T08 is whole-book scoped but `IDENTITY_RESOLUTION` drafts must keep their original `chapterId`, Stage B cannot write one mixed-chapter batch through `writeClaimBatch()`. The safe pattern is:
  - clear the entire run scope once with `replaceClaimFamilyScope(... rows: [])`
  - then write chapter-grouped batches through `writeClaimBatch()`
- T07 `rule-recall.ts` stores alias equivalence and alias negative metadata inside `reviewNote`, for example:
  - positive: `KB_VERIFIED: knowledgeId=...; aliasText=范老爷; canonicalName=范进`
  - negative: `KB_ALIAS_NEGATIVE: knowledgeId=...; aliasText=牛布衣; blockedCanonicalNames=牛浦|牛玉圃; reason=...`
- T07 alias claims leave `personaCandidateId` and `targetPersonaCandidateId` as `null`, so T08 must derive merge signals from text plus review-note metadata, not foreign keys.
- T07 mention recall writes many title/courtesy/kinship mentions as `source: "RULE"`; Stage B must read both `AI` and `RULE` mentions.
- No `stageB/` module exists yet under `src/server/modules/analysis/pipelines/evidence-review/`.

## File Structure

- Create `src/server/modules/analysis/pipelines/evidence-review/stageB/types.ts`
  - Responsibility: Stage B constants, repository DTOs, cluster DTOs, pending draft DTOs, result DTOs, and stable summary helpers.
- Create `src/server/modules/analysis/pipelines/evidence-review/stageB/types.test.ts`
  - Responsibility: lock stage metadata and summary formatting.
- Create `src/server/modules/analysis/pipelines/evidence-review/stageB/alias-conflicts.ts`
  - Responsibility: parse Stage A+ alias `reviewNote` strings into typed positive/negative/conflict signals.
- Create `src/server/modules/analysis/pipelines/evidence-review/stageB/alias-conflicts.test.ts`
  - Responsibility: prove note parsing for verified alias equivalence, pending hints, negative blocks, impersonation, and misidentification.
- Create `src/server/modules/analysis/pipelines/evidence-review/stageB/repository.ts`
  - Responsibility: read whole-book mentions and alias claims, and provide `persona_candidates` transaction/write primitives for T08 persistence.
- Create `src/server/modules/analysis/pipelines/evidence-review/stageB/repository.test.ts`
  - Responsibility: prove source filters, select shapes, ordering, transaction wrapping, and candidate clear/create behavior.
- Create `src/server/modules/analysis/pipelines/evidence-review/stageB/candidate-clustering.ts`
  - Responsibility: conservative whole-book mention grouping with merge support reasons and split/block reasons.
- Create `src/server/modules/analysis/pipelines/evidence-review/stageB/candidate-clustering.test.ts`
  - Responsibility: prove exact named-surface merge, alias-guided merge, title ambiguity keep-separate, negative merge denial, and impersonation isolation.
- Create `src/server/modules/analysis/pipelines/evidence-review/stageB/resolution-drafts.ts`
  - Responsibility: turn clusters into `persona_candidates` seeds plus pending `IDENTITY_RESOLUTION` drafts.
- Create `src/server/modules/analysis/pipelines/evidence-review/stageB/resolution-drafts.test.ts`
  - Responsibility: prove canonical-label policy, decision-kind policy, evidence carry-forward, and conflict review-state policy.
- Create `src/server/modules/analysis/pipelines/evidence-review/stageB/persister.ts`
  - Responsibility: clear run-scoped prior outputs, create `persona_candidates`, map temporary candidate refs to DB ids, and write chapter-grouped `IDENTITY_RESOLUTION` batches.
- Create `src/server/modules/analysis/pipelines/evidence-review/stageB/persister.test.ts`
  - Responsibility: prove clear order, candidate-id remapping, chapter grouping, and empty-output behavior.
- Create `src/server/modules/analysis/pipelines/evidence-review/stageB/IdentityResolver.ts`
  - Responsibility: T04 stage-run orchestration, raw-output summary, repository reads, clustering, draft building, and persistence.
- Create `src/server/modules/analysis/pipelines/evidence-review/stageB/IdentityResolver.test.ts`
  - Responsibility: prove happy path, empty-input path, and failure propagation with `failStageRun()`.
- Create `src/server/modules/analysis/pipelines/evidence-review/stageB/index.ts`
  - Responsibility: stable public export for T09/T10 and future review APIs.
- Modify `docs/superpowers/tasks/2026-04-18-evidence-review/08-stage-b-identity-resolution.md`
  - Responsibility: execution record and checklist updates only after validation passes.
- Modify `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`
  - Responsibility: mark T08 complete only after validation passes.

## Modeling Decisions

- Stage B is whole-book scoped by `bookId + runId`, not chapter scoped. It consumes the persisted chapter outputs from T06/T07 rather than rerunning extraction.
- `persona_candidates` created in T08 all start as `candidateStatus: "OPEN"`. Promotion to `CONFIRMED` is out of scope because T08 is still review-native and conservative.
- Exact-surface auto-merge is allowed only for `mentionKind: "NAMED" | "COURTESY_NAME"`. `TITLE_ONLY`, `KINSHIP`, and `UNKNOWN` mentions require either `suspectedResolvesTo` or a positive alias signal with a unique canonical label.
- Positive alias equivalence is derived from T07 alias-claim `reviewNote`. Negative alias rules, `IMPERSONATES`, and `MISIDENTIFIED_AS` are blockers or conflict signals, never merge edges.
- `suspectedResolvesTo` is the strongest deterministic hint. If different non-null values collide, split the mentions instead of forcing a merge.
- Stage B writes `IDENTITY_RESOLUTION` claim `source: "AI"` to respect the current T03 stage/family contract, even though the algorithm is deterministic. Do not change this in T08.
- Every cluster gets a temporary `candidateRef` such as `candidate-1`, `candidate-2`. `persister.ts` maps those refs to real `persona_candidates.id` values before claim persistence.
- Canonical label selection order is:
  1. one unique verified alias canonical name
  2. one unique pending alias canonical name
  3. earliest `NAMED` or `COURTESY_NAME` surface text in the cluster
  4. earliest remaining surface text
- Decision policy for `IDENTITY_RESOLUTION` drafts is:
  - `RESOLVES_TO`: strong deterministic support (`suspectedResolvesTo` or one verified alias canonical signal)
  - `MERGE_INTO`: conservative same-person suggestion from repeated named-surface evidence or only pending alias support
  - `SPLIT_FROM`: explicit keep-separate outcome from blocked merge or conflicting strong hints
  - `UNSURE`: impersonation, misidentification, or unresolved title-only ambiguity
- `rationale` stays human-readable. `reviewNote` carries compact machine-readable tags such as `STAGE_B: support=KB_ALIAS_EQUIVALENCE|EXACT_NAMED_SURFACE; blocks=NEGATIVE_ALIAS_RULE`.

## Task 1: Define Stage B Contracts And Alias Signal Parsing

**Files:**
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageB/types.test.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageB/types.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageB/alias-conflicts.test.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageB/alias-conflicts.ts`

- [ ] **Step 1: Write the failing contract tests**

Create `src/server/modules/analysis/pipelines/evidence-review/stageB/types.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  STAGE_B_RULE_MODEL,
  STAGE_B_RULE_PROVIDER,
  STAGE_B_RULE_VERSION,
  STAGE_B_STAGE_KEY,
  summarizeStageBDecisionCounts
} from "@/server/modules/analysis/pipelines/evidence-review/stageB/types";

describe("stageB/types", () => {
  it("exports stable stage metadata", () => {
    expect(STAGE_B_STAGE_KEY).toBe("stage_b_identity_resolution");
    expect(STAGE_B_RULE_PROVIDER).toBe("rule-engine");
    expect(STAGE_B_RULE_MODEL).toBe("stage-b-identity-resolution-v1");
    expect(STAGE_B_RULE_VERSION).toBe("2026-04-20-stage-b-v1");
  });

  it("summarizes resolution kinds and review states deterministically", () => {
    expect(summarizeStageBDecisionCounts([
      { resolutionKind: "RESOLVES_TO", reviewState: "PENDING" },
      { resolutionKind: "RESOLVES_TO", reviewState: "PENDING" },
      { resolutionKind: "MERGE_INTO", reviewState: "PENDING" },
      { resolutionKind: "UNSURE", reviewState: "CONFLICTED" }
    ])).toBe("MERGE_INTO:1,RESOLVES_TO:2,UNSURE:1 | CONFLICTED:1,PENDING:3");
  });
});
```

Create `src/server/modules/analysis/pipelines/evidence-review/stageB/alias-conflicts.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { collectStageBAliasSignals } from "@/server/modules/analysis/pipelines/evidence-review/stageB/alias-conflicts";
import type { StageBAliasClaimRow } from "@/server/modules/analysis/pipelines/evidence-review/stageB/types";

const BOOK_ID = "11111111-1111-1111-1111-111111111111";
const RUN_ID = "22222222-2222-2222-2222-222222222222";
const CHAPTER_ID = "33333333-3333-3333-3333-333333333333";

function aliasClaim(overrides: Partial<StageBAliasClaimRow> = {}): StageBAliasClaimRow {
  return {
    id            : "44444444-4444-4444-4444-444444444444",
    bookId        : BOOK_ID,
    chapterId     : CHAPTER_ID,
    runId         : RUN_ID,
    aliasText     : "范老爷",
    aliasType     : "TITLE",
    claimKind     : "TITLE_OF",
    evidenceSpanIds: ["55555555-5555-5555-5555-555555555555"],
    confidence    : 0.9,
    reviewState   : "PENDING",
    source        : "RULE",
    reviewNote    : "KB_VERIFIED: knowledgeId=knowledge-1; aliasText=范老爷; canonicalName=范进",
    ...overrides
  };
}

describe("collectStageBAliasSignals", () => {
  it("extracts positive canonical signals from verified and pending notes", () => {
    const signals = collectStageBAliasSignals([
      aliasClaim(),
      aliasClaim({
        id        : "66666666-6666-6666-6666-666666666666",
        aliasText : "周学道",
        reviewNote: "KB_PENDING_HINT: knowledgeId=knowledge-2; aliasText=周学道; canonicalName=周进",
        confidence: 0.55
      })
    ]);

    expect(signals.positiveSignals).toEqual([
      expect.objectContaining({
        aliasText     : "范老爷",
        canonicalName : "范进",
        reviewStrength: "VERIFIED"
      }),
      expect.objectContaining({
        aliasText     : "周学道",
        canonicalName : "周进",
        reviewStrength: "PENDING"
      })
    ]);
  });

  it("extracts negative merge blocks from alias negative notes", () => {
    const signals = collectStageBAliasSignals([
      aliasClaim({
        id         : "77777777-7777-7777-7777-777777777777",
        aliasText  : "牛布衣",
        claimKind  : "UNSURE",
        reviewState: "CONFLICTED",
        reviewNote : "KB_ALIAS_NEGATIVE: knowledgeId=knowledge-3; aliasText=牛布衣; blockedCanonicalNames=牛浦|牛玉圃; reason=冒名链路"
      })
    ]);

    expect(signals.negativeSignals).toEqual([
      expect.objectContaining({
        aliasText            : "牛布衣",
        blockedCanonicalNames: ["牛浦", "牛玉圃"]
      })
    ]);
  });

  it("treats impersonation and misidentification as conflict signals instead of merge hints", () => {
    const signals = collectStageBAliasSignals([
      aliasClaim({
        id       : "88888888-8888-8888-8888-888888888888",
        aliasText: "牛布衣",
        claimKind: "IMPERSONATES",
        reviewNote: "KB_VERIFIED: knowledgeId=knowledge-4; aliasText=牛布衣; canonicalName=牛浦"
      }),
      aliasClaim({
        id       : "99999999-9999-9999-9999-999999999999",
        aliasText: "张老爷",
        claimKind: "MISIDENTIFIED_AS",
        reviewNote: "KB_VERIFIED: knowledgeId=knowledge-5; aliasText=张老爷; canonicalName=张静斋"
      })
    ]);

    expect(signals.impersonationAliasTexts).toEqual(new Set(["牛布衣"]));
    expect(signals.misidentifiedAliasTexts).toEqual(new Set(["张老爷"]));
    expect(signals.positiveSignals).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run:

```bash
pnpm exec vitest run \
  src/server/modules/analysis/pipelines/evidence-review/stageB/types.test.ts \
  src/server/modules/analysis/pipelines/evidence-review/stageB/alias-conflicts.test.ts \
  --coverage=false
```

Expected: FAIL because the `stageB` module does not exist yet.

- [ ] **Step 3: Implement the Stage B contracts**

Create `src/server/modules/analysis/pipelines/evidence-review/stageB/types.ts`:

```ts
import type { ClaimReviewState, ClaimSource } from "@/server/modules/analysis/claims/base-types";
import type { ClaimDraftByFamily } from "@/server/modules/analysis/claims/claim-schemas";
import type {
  AliasClaimKind,
  AliasType,
  IdentityClaim,
  IdentityResolutionKind,
  MentionKind,
  PersonaCandidateStatus
} from "@/generated/prisma/enums";

export const STAGE_B_STAGE_KEY = "stage_b_identity_resolution";
export const STAGE_B_RULE_VERSION = "2026-04-20-stage-b-v1";
export const STAGE_B_RULE_PROVIDER = "rule-engine";
export const STAGE_B_RULE_MODEL = "stage-b-identity-resolution-v1";

export type StageBSupportReason =
  | "SUSPECTED_RESOLVES_TO"
  | "KB_ALIAS_EQUIVALENCE"
  | "KB_ALIAS_PENDING_HINT"
  | "EXACT_NAMED_SURFACE";

export type StageBBlockReason =
  | "NEGATIVE_ALIAS_RULE"
  | "CONFLICTING_CANONICAL_HINTS"
  | "SUSPECTED_RESOLVES_TO_CONFLICT"
  | "TITLE_ONLY_AMBIGUITY"
  | "IMPERSONATION"
  | "MISIDENTIFICATION";

export interface StageBMentionRow {
  id                 : string;
  bookId             : string;
  chapterId          : string;
  chapterNo          : number;
  runId              : string;
  surfaceText        : string;
  mentionKind        : MentionKind;
  identityClaim      : IdentityClaim | null;
  aliasTypeHint      : AliasType | null;
  suspectedResolvesTo: string | null;
  evidenceSpanId     : string;
  confidence         : number;
  source             : ClaimSource;
}

export interface StageBAliasClaimRow {
  id             : string;
  bookId         : string;
  chapterId      : string | null;
  runId          : string;
  aliasText      : string;
  aliasType      : AliasType;
  claimKind      : AliasClaimKind;
  evidenceSpanIds: string[];
  confidence     : number;
  reviewState    : ClaimReviewState;
  source         : ClaimSource;
  reviewNote     : string | null;
}

export interface StageBAliasPositiveSignal {
  aliasText       : string;
  canonicalName   : string;
  knowledgeId     : string | null;
  reviewStrength  : "VERIFIED" | "PENDING";
  confidence      : number;
  evidenceSpanIds : string[];
}

export interface StageBAliasNegativeSignal {
  aliasText            : string;
  blockedCanonicalNames: string[];
  knowledgeId          : string | null;
  confidence           : number;
  evidenceSpanIds      : string[];
}

export interface StageBAliasSignalBundle {
  positiveSignals        : StageBAliasPositiveSignal[];
  negativeSignals        : StageBAliasNegativeSignal[];
  impersonationAliasTexts: Set<string>;
  misidentifiedAliasTexts: Set<string>;
}

export interface StageBCandidateCluster {
  candidateRef        : string;
  mentions            : StageBMentionRow[];
  canonicalHints      : string[];
  supportReasons      : StageBSupportReason[];
  blockReasons        : StageBBlockReason[];
  supportEvidenceSpanIds: string[];
  mergeConfidence     : number;
}

export interface StageBPersonaCandidateSeed {
  candidateRef        : string;
  canonicalLabel      : string;
  candidateStatus     : PersonaCandidateStatus;
  firstSeenChapterNo  : number | null;
  lastSeenChapterNo   : number | null;
  mentionCount        : number;
  evidenceScore       : number;
}

export interface StageBPendingIdentityResolutionDraft {
  candidateRef: string;
  draft       : ClaimDraftByFamily["IDENTITY_RESOLUTION"];
}

export interface StageBResolutionDraftBundle {
  personaCandidates        : StageBPersonaCandidateSeed[];
  identityResolutionDrafts : StageBPendingIdentityResolutionDraft[];
}

export interface StageBPersistedCounts {
  personaCandidates       : number;
  identityResolutionClaims: number;
}

export interface StageBRunInput {
  bookId  : string;
  runId   : string | null;
  attempt?: number;
}

export interface StageBRunResult {
  bookId          : string;
  runId           : string | null;
  stageRunId      : string | null;
  rawOutputId     : string | null;
  inputCount      : number;
  outputCount     : number;
  skippedCount    : number;
  persistedCounts : StageBPersistedCounts;
  candidateCount  : number;
  decisionSummary : string;
}

export function summarizeStageBDecisionCounts(
  rows: Array<{ resolutionKind: IdentityResolutionKind; reviewState: ClaimReviewState }>
): string {
  const kindCounts = new Map<IdentityResolutionKind, number>();
  const stateCounts = new Map<ClaimReviewState, number>();

  for (const row of rows) {
    kindCounts.set(row.resolutionKind, (kindCounts.get(row.resolutionKind) ?? 0) + 1);
    stateCounts.set(row.reviewState, (stateCounts.get(row.reviewState) ?? 0) + 1);
  }

  const kinds = Array.from(kindCounts.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([kind, count]) => `${kind}:${count}`)
    .join(",");

  const states = Array.from(stateCounts.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([state, count]) => `${state}:${count}`)
    .join(",");

  return `${kinds} | ${states}`;
}
```

Create `src/server/modules/analysis/pipelines/evidence-review/stageB/alias-conflicts.ts`:

```ts
import type { StageBAliasClaimRow, StageBAliasSignalBundle } from "@/server/modules/analysis/pipelines/evidence-review/stageB/types";

function parseReviewNoteFields(note: string | null): {
  prefix    : string;
  knowledgeId: string | null;
  fields    : Record<string, string>;
} | null {
  if (!note || !note.includes(":")) {
    return null;
  }

  const [prefixPart, detailPart] = note.split(":", 2);
  const prefix = prefixPart.trim();
  const fields: Record<string, string> = {};
  let knowledgeId: string | null = null;

  for (const token of detailPart.split(";")) {
    const trimmed = token.trim();
    if (!trimmed.includes("=")) {
      continue;
    }

    const [rawKey, ...rawValue] = trimmed.split("=");
    const key = rawKey.trim();
    const value = rawValue.join("=").trim();

    if (key === "knowledgeId") {
      knowledgeId = value || null;
      continue;
    }

    if (value.length > 0) {
      fields[key] = value;
    }
  }

  return { prefix, knowledgeId, fields };
}

export function collectStageBAliasSignals(
  aliasClaims: StageBAliasClaimRow[]
): StageBAliasSignalBundle {
  const positiveSignals: StageBAliasSignalBundle["positiveSignals"] = [];
  const negativeSignals: StageBAliasSignalBundle["negativeSignals"] = [];
  const impersonationAliasTexts = new Set<string>();
  const misidentifiedAliasTexts = new Set<string>();

  for (const aliasClaim of aliasClaims) {
    if (aliasClaim.claimKind === "IMPERSONATES") {
      impersonationAliasTexts.add(aliasClaim.aliasText);
      continue;
    }

    if (aliasClaim.claimKind === "MISIDENTIFIED_AS") {
      misidentifiedAliasTexts.add(aliasClaim.aliasText);
      continue;
    }

    const parsed = parseReviewNoteFields(aliasClaim.reviewNote);
    if (!parsed) {
      continue;
    }

    if (
      (parsed.prefix === "KB_VERIFIED" || parsed.prefix === "KB_PENDING_HINT")
      && parsed.fields.aliasText
      && parsed.fields.canonicalName
    ) {
      positiveSignals.push({
        aliasText      : parsed.fields.aliasText,
        canonicalName  : parsed.fields.canonicalName,
        knowledgeId    : parsed.knowledgeId,
        reviewStrength : parsed.prefix === "KB_VERIFIED" ? "VERIFIED" : "PENDING",
        confidence     : aliasClaim.confidence,
        evidenceSpanIds: aliasClaim.evidenceSpanIds
      });
      continue;
    }

    if (
      parsed.prefix === "KB_ALIAS_NEGATIVE"
      && parsed.fields.aliasText
      && parsed.fields.blockedCanonicalNames
    ) {
      negativeSignals.push({
        aliasText            : parsed.fields.aliasText,
        blockedCanonicalNames: parsed.fields.blockedCanonicalNames.split("|").map((item) => item.trim()).filter(Boolean),
        knowledgeId          : parsed.knowledgeId,
        confidence           : aliasClaim.confidence,
        evidenceSpanIds      : aliasClaim.evidenceSpanIds
      });
    }
  }

  return {
    positiveSignals,
    negativeSignals,
    impersonationAliasTexts,
    misidentifiedAliasTexts
  };
}
```

- [ ] **Step 4: Run the contract tests again**

Run:

```bash
pnpm exec vitest run \
  src/server/modules/analysis/pipelines/evidence-review/stageB/types.test.ts \
  src/server/modules/analysis/pipelines/evidence-review/stageB/alias-conflicts.test.ts \
  --coverage=false
```

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/server/modules/analysis/pipelines/evidence-review/stageB/types.ts src/server/modules/analysis/pipelines/evidence-review/stageB/types.test.ts src/server/modules/analysis/pipelines/evidence-review/stageB/alias-conflicts.ts src/server/modules/analysis/pipelines/evidence-review/stageB/alias-conflicts.test.ts
git commit -m "feat: add stage-b identity resolution contracts"
```

## Task 2: Build The Stage B Repository Read/Write Surface

**Files:**
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageB/repository.test.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageB/repository.ts`

- [ ] **Step 1: Write the failing repository tests**

Create `src/server/modules/analysis/pipelines/evidence-review/stageB/repository.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { createStageBRepository } from "@/server/modules/analysis/pipelines/evidence-review/stageB/repository";

const BOOK_ID = "11111111-1111-1111-1111-111111111111";
const RUN_ID = "22222222-2222-2222-2222-222222222222";

describe("createStageBRepository", () => {
  it("lists whole-book mentions from AI and RULE sources with chapter numbers", async () => {
    const client = {
      entityMention: {
        findMany: vi.fn().mockResolvedValue([
          {
            id                 : "mention-1",
            bookId             : BOOK_ID,
            chapterId          : "chapter-1",
            runId              : RUN_ID,
            surfaceText        : "范进",
            mentionKind        : "NAMED",
            identityClaim      : "SELF",
            aliasTypeHint      : null,
            suspectedResolvesTo: null,
            evidenceSpanId     : "evidence-1",
            confidence         : 0.91,
            source             : "AI",
            chapter            : { no: 5 }
          }
        ])
      },
      aliasClaim: {
        findMany: vi.fn().mockResolvedValue([])
      },
      personaCandidate: {
        deleteMany: vi.fn(),
        create    : vi.fn()
      }
    };

    const repository = createStageBRepository(client as never);
    const rows = await repository.listStageBMentions({ bookId: BOOK_ID, runId: RUN_ID });

    expect(client.entityMention.findMany).toHaveBeenCalledWith({
      where: {
        bookId: BOOK_ID,
        runId : RUN_ID,
        source: { in: ["AI", "RULE"] }
      },
      orderBy: [
        { chapter: { no: "asc" } },
        { createdAt: "asc" }
      ],
      select: {
        id                 : true,
        bookId             : true,
        chapterId          : true,
        runId              : true,
        surfaceText        : true,
        mentionKind        : true,
        identityClaim      : true,
        aliasTypeHint      : true,
        suspectedResolvesTo: true,
        evidenceSpanId     : true,
        confidence         : true,
        source             : true,
        chapter            : { select: { no: true } }
      }
    });
    expect(rows).toEqual([
      expect.objectContaining({
        id       : "mention-1",
        chapterNo: 5
      })
    ]);
  });

  it("lists alias claims with review notes for Stage A+ merge hints", async () => {
    const client = {
      entityMention: {
        findMany: vi.fn().mockResolvedValue([])
      },
      aliasClaim: {
        findMany: vi.fn().mockResolvedValue([
          {
            id             : "alias-1",
            bookId         : BOOK_ID,
            chapterId      : "chapter-1",
            runId          : RUN_ID,
            aliasText      : "范老爷",
            aliasType      : "TITLE",
            claimKind      : "TITLE_OF",
            evidenceSpanIds: ["evidence-1"],
            confidence     : 0.9,
            reviewState    : "PENDING",
            source         : "RULE",
            reviewNote     : "KB_VERIFIED: knowledgeId=knowledge-1; aliasText=范老爷; canonicalName=范进"
          }
        ])
      },
      personaCandidate: {
        deleteMany: vi.fn(),
        create    : vi.fn()
      }
    };

    const repository = createStageBRepository(client as never);
    const rows = await repository.listStageBAliasClaims({ bookId: BOOK_ID, runId: RUN_ID });

    expect(client.aliasClaim.findMany).toHaveBeenCalledWith({
      where: {
        bookId: BOOK_ID,
        runId : RUN_ID,
        source: { in: ["AI", "RULE"] }
      },
      orderBy: [
        { chapterId: "asc" },
        { createdAt: "asc" }
      ],
      select: {
        id             : true,
        bookId         : true,
        chapterId      : true,
        runId          : true,
        aliasText      : true,
        aliasType      : true,
        claimKind      : true,
        evidenceSpanIds: true,
        confidence     : true,
        reviewState    : true,
        source         : true,
        reviewNote     : true
      }
    });
    expect(rows[0]?.aliasText).toBe("范老爷");
  });

  it("clears and creates persona candidates inside one transaction wrapper", async () => {
    const client = {
      entityMention: {
        findMany: vi.fn().mockResolvedValue([])
      },
      aliasClaim: {
        findMany: vi.fn().mockResolvedValue([])
      },
      personaCandidate: {
        deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
        create    : vi.fn().mockResolvedValue({ id: "candidate-db-1" })
      },
      $transaction: vi.fn(async (work: (tx: unknown) => Promise<unknown>) => await work(client))
    };

    const repository = createStageBRepository(client as never);
    const createdId = await repository.transaction(async (tx) => {
      await tx.clearPersonaCandidatesForRun({ bookId: BOOK_ID, runId: RUN_ID });
      const created = await tx.createPersonaCandidate({
        bookId            : BOOK_ID,
        canonicalLabel    : "范进",
        candidateStatus   : "OPEN",
        firstSeenChapterNo: 5,
        lastSeenChapterNo : 8,
        mentionCount      : 3,
        evidenceScore     : 0.91,
        runId             : RUN_ID
      });

      return created.id;
    });

    expect(client.$transaction).toHaveBeenCalledTimes(1);
    expect(client.personaCandidate.deleteMany).toHaveBeenCalledWith({
      where: { bookId: BOOK_ID, runId: RUN_ID }
    });
    expect(client.personaCandidate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        canonicalLabel: "范进",
        mentionCount  : 3
      }),
      select: { id: true }
    });
    expect(createdId).toBe("candidate-db-1");
  });
});
```

- [ ] **Step 2: Run the repository tests to verify they fail**

Run:

```bash
pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stageB/repository.test.ts --coverage=false
```

Expected: FAIL because `repository.ts` does not exist yet.

- [ ] **Step 3: Implement the Stage B repository**

Create `src/server/modules/analysis/pipelines/evidence-review/stageB/repository.ts`:

```ts
import { prisma } from "@/server/db/prisma";
import type {
  StageBAliasClaimRow,
  StageBMentionRow
} from "@/server/modules/analysis/pipelines/evidence-review/stageB/types";

interface StageBMentionFindManyDelegate {
  findMany(args: {
    where: {
      bookId: string;
      runId : string;
      source: { in: ["AI", "RULE"] };
    };
    orderBy: Array<
      | { chapter: { no: "asc" } }
      | { createdAt: "asc" }
    >;
    select: {
      id                 : true;
      bookId             : true;
      chapterId          : true;
      runId              : true;
      surfaceText        : true;
      mentionKind        : true;
      identityClaim      : true;
      aliasTypeHint      : true;
      suspectedResolvesTo: true;
      evidenceSpanId     : true;
      confidence         : true;
      source             : true;
      chapter            : { select: { no: true } };
    };
  }): Promise<Array<Omit<StageBMentionRow, "chapterNo"> & { chapter: { no: number } }>>;
}

interface StageBAliasFindManyDelegate {
  findMany(args: {
    where: {
      bookId: string;
      runId : string;
      source: { in: ["AI", "RULE"] };
    };
    orderBy: Array<{ chapterId: "asc" } | { createdAt: "asc" }>;
    select : Record<keyof StageBAliasClaimRow, true>;
  }): Promise<StageBAliasClaimRow[]>;
}

interface StageBPersonaCandidateDeleteManyDelegate {
  deleteMany(args: {
    where: { bookId: string; runId: string };
  }): Promise<{ count: number }>;
}

interface StageBPersonaCandidateCreateDelegate {
  create(args: {
    data: {
      bookId            : string;
      canonicalLabel    : string;
      candidateStatus   : "OPEN" | "CONFIRMED" | "MERGED" | "REJECTED";
      firstSeenChapterNo: number | null;
      lastSeenChapterNo : number | null;
      mentionCount      : number;
      evidenceScore     : number;
      runId             : string;
    };
    select: { id: true };
  }): Promise<{ id: string }>;
}

export interface StageBRepositoryClient {
  entityMention    : StageBMentionFindManyDelegate;
  aliasClaim       : StageBAliasFindManyDelegate;
  personaCandidate : StageBPersonaCandidateDeleteManyDelegate & StageBPersonaCandidateCreateDelegate;
  $transaction?<T>(work: (tx: StageBRepositoryClient) => Promise<T>): Promise<T>;
}

export function createStageBRepository(
  client: StageBRepositoryClient = prisma as unknown as StageBRepositoryClient
) {
  async function listStageBMentions(input: {
    bookId: string;
    runId : string;
  }): Promise<StageBMentionRow[]> {
    const rows = await client.entityMention.findMany({
      where: {
        bookId: input.bookId,
        runId : input.runId,
        source: { in: ["AI", "RULE"] }
      },
      orderBy: [
        { chapter: { no: "asc" } },
        { createdAt: "asc" }
      ],
      select: {
        id                 : true,
        bookId             : true,
        chapterId          : true,
        runId              : true,
        surfaceText        : true,
        mentionKind        : true,
        identityClaim      : true,
        aliasTypeHint      : true,
        suspectedResolvesTo: true,
        evidenceSpanId     : true,
        confidence         : true,
        source             : true,
        chapter            : { select: { no: true } }
      }
    });

    return rows.map((row) => ({
      id                 : row.id,
      bookId             : row.bookId,
      chapterId          : row.chapterId,
      chapterNo          : row.chapter.no,
      runId              : row.runId,
      surfaceText        : row.surfaceText,
      mentionKind        : row.mentionKind,
      identityClaim      : row.identityClaim,
      aliasTypeHint      : row.aliasTypeHint,
      suspectedResolvesTo: row.suspectedResolvesTo,
      evidenceSpanId     : row.evidenceSpanId,
      confidence         : row.confidence,
      source             : row.source
    }));
  }

  async function listStageBAliasClaims(input: {
    bookId: string;
    runId : string;
  }): Promise<StageBAliasClaimRow[]> {
    return client.aliasClaim.findMany({
      where: {
        bookId: input.bookId,
        runId : input.runId,
        source: { in: ["AI", "RULE"] }
      },
      orderBy: [
        { chapterId: "asc" },
        { createdAt: "asc" }
      ],
      select: {
        id             : true,
        bookId         : true,
        chapterId      : true,
        runId          : true,
        aliasText      : true,
        aliasType      : true,
        claimKind      : true,
        evidenceSpanIds: true,
        confidence     : true,
        reviewState    : true,
        source         : true,
        reviewNote     : true
      }
    });
  }

  async function clearPersonaCandidatesForRun(input: {
    bookId: string;
    runId : string;
  }): Promise<void> {
    await client.personaCandidate.deleteMany({
      where: {
        bookId: input.bookId,
        runId : input.runId
      }
    });
  }

  async function createPersonaCandidate(data: {
    bookId            : string;
    canonicalLabel    : string;
    candidateStatus   : "OPEN" | "CONFIRMED" | "MERGED" | "REJECTED";
    firstSeenChapterNo: number | null;
    lastSeenChapterNo : number | null;
    mentionCount      : number;
    evidenceScore     : number;
    runId             : string;
  }): Promise<{ id: string }> {
    return client.personaCandidate.create({
      data,
      select: { id: true }
    });
  }

  async function transaction<T>(
    work: (repository: ReturnType<typeof createStageBRepository>) => Promise<T>
  ): Promise<T> {
    if (!client.$transaction) {
      return work(createStageBRepository(client));
    }

    return client.$transaction(async (tx) => work(createStageBRepository(tx)));
  }

  return {
    listStageBMentions,
    listStageBAliasClaims,
    clearPersonaCandidatesForRun,
    createPersonaCandidate,
    transaction
  };
}

export type StageBRepository = ReturnType<typeof createStageBRepository>;

export const stageBRepository = createStageBRepository();
```

- [ ] **Step 4: Run the repository tests again**

Run:

```bash
pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stageB/repository.test.ts --coverage=false
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/server/modules/analysis/pipelines/evidence-review/stageB/repository.ts src/server/modules/analysis/pipelines/evidence-review/stageB/repository.test.ts
git commit -m "feat: add stage-b repository"
```

## Task 3: Implement Conservative Candidate Clustering

**Files:**
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageB/candidate-clustering.test.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageB/candidate-clustering.ts`

- [ ] **Step 1: Write the failing clustering tests**

Create `src/server/modules/analysis/pipelines/evidence-review/stageB/candidate-clustering.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { buildStageBCandidateClusters } from "@/server/modules/analysis/pipelines/evidence-review/stageB/candidate-clustering";
import type { StageBAliasClaimRow, StageBMentionRow } from "@/server/modules/analysis/pipelines/evidence-review/stageB/types";

const BOOK_ID = "11111111-1111-1111-1111-111111111111";
const RUN_ID = "22222222-2222-2222-2222-222222222222";

function mention(overrides: Partial<StageBMentionRow> = {}): StageBMentionRow {
  return {
    id                 : "mention-1",
    bookId             : BOOK_ID,
    chapterId          : "chapter-1",
    chapterNo          : 1,
    runId              : RUN_ID,
    surfaceText        : "范进",
    mentionKind        : "NAMED",
    identityClaim      : "SELF",
    aliasTypeHint      : null,
    suspectedResolvesTo: null,
    evidenceSpanId     : "evidence-1",
    confidence         : 0.88,
    source             : "AI",
    ...overrides
  };
}

function aliasClaim(overrides: Partial<StageBAliasClaimRow> = {}): StageBAliasClaimRow {
  return {
    id             : "alias-1",
    bookId         : BOOK_ID,
    chapterId      : "chapter-1",
    runId          : RUN_ID,
    aliasText      : "范老爷",
    aliasType      : "TITLE",
    claimKind      : "TITLE_OF",
    evidenceSpanIds: ["alias-evidence-1"],
    confidence     : 0.9,
    reviewState    : "PENDING",
    source         : "RULE",
    reviewNote     : "KB_VERIFIED: knowledgeId=knowledge-1; aliasText=范老爷; canonicalName=范进",
    ...overrides
  };
}

describe("buildStageBCandidateClusters", () => {
  it("merges repeated named mentions by exact surface", () => {
    const clusters = buildStageBCandidateClusters({
      mentions: [
        mention({ id: "mention-1", chapterNo: 1 }),
        mention({ id: "mention-2", chapterId: "chapter-2", chapterNo: 3, confidence: 0.91 })
      ],
      aliasClaims: []
    });

    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toEqual(expect.objectContaining({
      supportReasons: ["EXACT_NAMED_SURFACE"]
    }));
    expect(clusters[0]?.mentions.map((item) => item.id)).toEqual(["mention-1", "mention-2"]);
  });

  it("uses positive alias hints to merge title-only mentions into a named candidate", () => {
    const clusters = buildStageBCandidateClusters({
      mentions: [
        mention({ id: "mention-1", surfaceText: "范进", mentionKind: "NAMED" }),
        mention({
          id         : "mention-2",
          surfaceText : "范老爷",
          mentionKind : "TITLE_ONLY",
          source      : "RULE",
          chapterId   : "chapter-2",
          chapterNo   : 4,
          evidenceSpanId: "evidence-2"
        })
      ],
      aliasClaims: [aliasClaim()]
    });

    expect(clusters).toHaveLength(1);
    expect(clusters[0]?.canonicalHints).toEqual(["范进"]);
    expect(clusters[0]?.supportReasons).toContain("KB_ALIAS_EQUIVALENCE");
  });

  it("does not auto-merge title-only mentions by bare surface text", () => {
    const clusters = buildStageBCandidateClusters({
      mentions: [
        mention({ id: "mention-1", surfaceText: "张老爷", mentionKind: "TITLE_ONLY", source: "AI" }),
        mention({
          id          : "mention-2",
          surfaceText : "张老爷",
          mentionKind : "TITLE_ONLY",
          chapterId   : "chapter-2",
          chapterNo   : 6,
          evidenceSpanId: "evidence-2"
        })
      ],
      aliasClaims: []
    });

    expect(clusters).toHaveLength(2);
    expect(clusters.every((cluster) => cluster.blockReasons.includes("TITLE_ONLY_AMBIGUITY"))).toBe(true);
  });

  it("keeps separate when a negative alias rule blocks the canonical merge", () => {
    const clusters = buildStageBCandidateClusters({
      mentions: [
        mention({ id: "mention-1", surfaceText: "牛浦", chapterNo: 1 }),
        mention({
          id         : "mention-2",
          surfaceText : "牛布衣",
          mentionKind : "NAMED",
          chapterId   : "chapter-2",
          chapterNo   : 12,
          evidenceSpanId: "evidence-2"
        })
      ],
      aliasClaims: [
        aliasClaim({
          aliasText : "牛布衣",
          reviewNote: "KB_VERIFIED: knowledgeId=knowledge-2; aliasText=牛布衣; canonicalName=牛浦"
        }),
        aliasClaim({
          id         : "alias-2",
          aliasText  : "牛布衣",
          claimKind  : "UNSURE",
          reviewState: "CONFLICTED",
          reviewNote : "KB_ALIAS_NEGATIVE: knowledgeId=knowledge-3; aliasText=牛布衣; blockedCanonicalNames=牛浦; reason=冒名链路"
        })
      ]
    });

    expect(clusters).toHaveLength(2);
    expect(clusters[1]?.blockReasons).toContain("NEGATIVE_ALIAS_RULE");
  });

  it("isolates impersonation and misidentification instead of merging them", () => {
    const clusters = buildStageBCandidateClusters({
      mentions: [
        mention({ id: "mention-1", surfaceText: "牛浦", chapterNo: 1 }),
        mention({
          id            : "mention-2",
          surfaceText   : "牛布衣",
          chapterId     : "chapter-2",
          chapterNo     : 14,
          identityClaim : "IMPERSONATING",
          evidenceSpanId: "evidence-2"
        })
      ],
      aliasClaims: [
        aliasClaim({
          aliasText : "牛布衣",
          claimKind : "IMPERSONATES",
          reviewNote: "KB_VERIFIED: knowledgeId=knowledge-4; aliasText=牛布衣; canonicalName=牛浦"
        })
      ]
    });

    expect(clusters).toHaveLength(2);
    expect(clusters[1]?.blockReasons).toContain("IMPERSONATION");
  });
});
```

- [ ] **Step 2: Run the clustering tests to verify they fail**

Run:

```bash
pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stageB/candidate-clustering.test.ts --coverage=false
```

Expected: FAIL because `candidate-clustering.ts` does not exist yet.

- [ ] **Step 3: Implement conservative clustering**

Create `src/server/modules/analysis/pipelines/evidence-review/stageB/candidate-clustering.ts`:

```ts
import { collectStageBAliasSignals } from "@/server/modules/analysis/pipelines/evidence-review/stageB/alias-conflicts";
import type {
  StageBAliasClaimRow,
  StageBCandidateCluster,
  StageBMentionRow
} from "@/server/modules/analysis/pipelines/evidence-review/stageB/types";

function normalizeSurfaceText(value: string): string {
  return value.trim().replace(/\s+/g, "");
}

function isExactNamedMergeEligible(mention: StageBMentionRow): boolean {
  return mention.mentionKind === "NAMED" || mention.mentionKind === "COURTESY_NAME";
}

function averageConfidence(mentions: StageBMentionRow[]): number {
  if (mentions.length === 0) {
    return 0;
  }

  return Number(
    (mentions.reduce((sum, mention) => sum + mention.confidence, 0) / mentions.length).toFixed(4)
  );
}

export function buildStageBCandidateClusters(input: {
  mentions   : StageBMentionRow[];
  aliasClaims: StageBAliasClaimRow[];
}): StageBCandidateCluster[] {
  const aliasSignals = collectStageBAliasSignals(input.aliasClaims);
  const positiveByAlias = new Map<string, typeof aliasSignals.positiveSignals>();
  const blockedByAlias = new Map<string, Set<string>>();

  for (const signal of aliasSignals.positiveSignals) {
    const key = normalizeSurfaceText(signal.aliasText);
    const current = positiveByAlias.get(key) ?? [];
    current.push(signal);
    positiveByAlias.set(key, current);
  }

  for (const signal of aliasSignals.negativeSignals) {
    const key = normalizeSurfaceText(signal.aliasText);
    const current = blockedByAlias.get(key) ?? new Set<string>();
    for (const blockedName of signal.blockedCanonicalNames) {
      current.add(blockedName);
    }
    blockedByAlias.set(key, current);
  }

  const preliminaryGroups = new Map<string, StageBMentionRow[]>();

  for (const mention of input.mentions) {
    const normalizedSurface = normalizeSurfaceText(mention.surfaceText);
    const positiveSignals = positiveByAlias.get(normalizedSurface) ?? [];
    const blockedCanonicalNames = blockedByAlias.get(normalizedSurface) ?? new Set<string>();
    const uniqueCanonicalHints = Array.from(new Set(
      positiveSignals
        .map((signal) => signal.canonicalName)
        .filter((canonicalName) => !blockedCanonicalNames.has(canonicalName))
    ));

    let groupKey = `mention:${mention.id}`;

    if (mention.identityClaim === "IMPERSONATING") {
      groupKey = `mention:${mention.id}`;
    } else if (mention.suspectedResolvesTo) {
      groupKey = `hint:${mention.suspectedResolvesTo}`;
    } else if (uniqueCanonicalHints.length === 1) {
      groupKey = `canonical:${normalizeSurfaceText(uniqueCanonicalHints[0])}`;
    } else if (isExactNamedMergeEligible(mention)) {
      groupKey = `surface:${normalizedSurface}`;
    }

    const current = preliminaryGroups.get(groupKey) ?? [];
    current.push(mention);
    preliminaryGroups.set(groupKey, current);
  }

  const clusters: StageBCandidateCluster[] = [];

  for (const mentions of preliminaryGroups.values()) {
    const normalizedSurfaces = mentions.map((mention) => normalizeSurfaceText(mention.surfaceText));
    const canonicalHints = Array.from(new Set(
      normalizedSurfaces.flatMap((surface) => (
        (positiveByAlias.get(surface) ?? [])
          .map((signal) => signal.canonicalName)
          .filter((canonicalName) => !(blockedByAlias.get(surface) ?? new Set()).has(canonicalName))
      ))
    ));
    const supportReasons = new Set<StageBCandidateCluster["supportReasons"][number]>();
    const blockReasons = new Set<StageBCandidateCluster["blockReasons"][number]>();
    const supportEvidenceSpanIds = new Set<string>();

    const distinctHints = new Set(
      mentions
        .map((mention) => mention.suspectedResolvesTo)
        .filter((value): value is string => value !== null)
    );
    if (distinctHints.size === 1) {
      supportReasons.add("SUSPECTED_RESOLVES_TO");
    }
    if (distinctHints.size > 1) {
      blockReasons.add("SUSPECTED_RESOLVES_TO_CONFLICT");
    }

    if (mentions.length > 1 && mentions.every(isExactNamedMergeEligible)) {
      supportReasons.add("EXACT_NAMED_SURFACE");
    }

    for (const mention of mentions) {
      const normalizedSurface = normalizeSurfaceText(mention.surfaceText);
      const positiveSignals = positiveByAlias.get(normalizedSurface) ?? [];

      for (const signal of positiveSignals) {
        supportEvidenceSpanIds.forEach(() => undefined);
        signal.evidenceSpanIds.forEach((id) => supportEvidenceSpanIds.add(id));
        supportReasons.add(
          signal.reviewStrength === "VERIFIED"
            ? "KB_ALIAS_EQUIVALENCE"
            : "KB_ALIAS_PENDING_HINT"
        );
      }

      if ((blockedByAlias.get(normalizedSurface)?.size ?? 0) > 0) {
        blockReasons.add("NEGATIVE_ALIAS_RULE");
      }

      if (aliasSignals.impersonationAliasTexts.has(mention.surfaceText) || mention.identityClaim === "IMPERSONATING") {
        blockReasons.add("IMPERSONATION");
      }

      if (aliasSignals.misidentifiedAliasTexts.has(mention.surfaceText)) {
        blockReasons.add("MISIDENTIFICATION");
      }
    }

    if (
      mentions.every((mention) => !isExactNamedMergeEligible(mention))
      && canonicalHints.length === 0
      && distinctHints.size === 0
    ) {
      for (const mention of mentions) {
        clusters.push({
          candidateRef          : "",
          mentions              : [mention],
          canonicalHints        : [],
          supportReasons        : [],
          blockReasons          : ["TITLE_ONLY_AMBIGUITY"],
          supportEvidenceSpanIds: [],
          mergeConfidence       : mention.confidence
        });
      }
      continue;
    }

    if (
      blockReasons.has("NEGATIVE_ALIAS_RULE")
      || blockReasons.has("IMPERSONATION")
      || blockReasons.has("MISIDENTIFICATION")
      || blockReasons.has("SUSPECTED_RESOLVES_TO_CONFLICT")
      || canonicalHints.length > 1
    ) {
      const expandedBlockReasons = new Set(blockReasons);
      if (canonicalHints.length > 1) {
        expandedBlockReasons.add("CONFLICTING_CANONICAL_HINTS");
      }

      for (const mention of mentions) {
        clusters.push({
          candidateRef          : "",
          mentions              : [mention],
          canonicalHints        : canonicalHints,
          supportReasons        : Array.from(supportReasons),
          blockReasons          : Array.from(expandedBlockReasons),
          supportEvidenceSpanIds: Array.from(supportEvidenceSpanIds),
          mergeConfidence       : mention.confidence
        });
      }
      continue;
    }

    clusters.push({
      candidateRef          : "",
      mentions              : [...mentions].sort((left, right) => left.chapterNo - right.chapterNo || left.id.localeCompare(right.id)),
      canonicalHints        : canonicalHints,
      supportReasons        : Array.from(supportReasons).sort(),
      blockReasons          : Array.from(blockReasons).sort(),
      supportEvidenceSpanIds: Array.from(supportEvidenceSpanIds),
      mergeConfidence       : averageConfidence(mentions)
    });
  }

  return clusters
    .sort((left, right) => {
      const leftChapter = left.mentions[0]?.chapterNo ?? Number.MAX_SAFE_INTEGER;
      const rightChapter = right.mentions[0]?.chapterNo ?? Number.MAX_SAFE_INTEGER;

      return leftChapter - rightChapter || left.mentions[0]!.id.localeCompare(right.mentions[0]!.id);
    })
    .map((cluster, index) => ({
      ...cluster,
      candidateRef: `candidate-${index + 1}`
    }));
}
```

- [ ] **Step 4: Run the clustering tests again**

Run:

```bash
pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stageB/candidate-clustering.test.ts --coverage=false
```

Expected: PASS.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/server/modules/analysis/pipelines/evidence-review/stageB/candidate-clustering.ts src/server/modules/analysis/pipelines/evidence-review/stageB/candidate-clustering.test.ts
git commit -m "feat: add stage-b candidate clustering"
```

## Task 4: Build Persona Candidate Seeds And Identity Resolution Drafts

**Files:**
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageB/resolution-drafts.test.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageB/resolution-drafts.ts`

- [ ] **Step 1: Write the failing draft-builder tests**

Create `src/server/modules/analysis/pipelines/evidence-review/stageB/resolution-drafts.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { buildStageBResolutionDraftBundle } from "@/server/modules/analysis/pipelines/evidence-review/stageB/resolution-drafts";
import type { StageBCandidateCluster, StageBMentionRow } from "@/server/modules/analysis/pipelines/evidence-review/stageB/types";

const BOOK_ID = "11111111-1111-1111-1111-111111111111";
const RUN_ID = "22222222-2222-2222-2222-222222222222";

function mention(overrides: Partial<StageBMentionRow> = {}): StageBMentionRow {
  return {
    id                 : "mention-1",
    bookId             : BOOK_ID,
    chapterId          : "chapter-1",
    chapterNo          : 1,
    runId              : RUN_ID,
    surfaceText        : "范进",
    mentionKind        : "NAMED",
    identityClaim      : "SELF",
    aliasTypeHint      : null,
    suspectedResolvesTo: null,
    evidenceSpanId     : "evidence-1",
    confidence         : 0.9,
    source             : "AI"
  };
}

function cluster(overrides: Partial<StageBCandidateCluster> = {}): StageBCandidateCluster {
  return {
    candidateRef          : "candidate-1",
    mentions              : [mention()],
    canonicalHints        : [],
    supportReasons        : ["EXACT_NAMED_SURFACE"],
    blockReasons          : [],
    supportEvidenceSpanIds: ["alias-evidence-1"],
    mergeConfidence       : 0.88,
    ...overrides
  };
}

describe("buildStageBResolutionDraftBundle", () => {
  it("uses a unique canonical hint as the candidate label and emits RESOLVES_TO", () => {
    const result = buildStageBResolutionDraftBundle({
      bookId   : BOOK_ID,
      runId    : RUN_ID,
      clusters : [
        cluster({
          canonicalHints: ["范进"],
          supportReasons: ["KB_ALIAS_EQUIVALENCE"]
        })
      ]
    });

    expect(result.personaCandidates).toEqual([
      expect.objectContaining({
        candidateRef   : "candidate-1",
        canonicalLabel : "范进",
        candidateStatus: "OPEN"
      })
    ]);
    expect(result.identityResolutionDrafts[0]?.draft).toEqual(expect.objectContaining({
      resolutionKind    : "RESOLVES_TO",
      source            : "AI",
      reviewState       : "PENDING",
      personaCandidateId: null,
      resolvedPersonaId : null
    }));
  });

  it("falls back to MERGE_INTO for repeated named-surface evidence without a canonical hint", () => {
    const result = buildStageBResolutionDraftBundle({
      bookId  : BOOK_ID,
      runId   : RUN_ID,
      clusters: [
        cluster({
          mentions: [
            mention({ id: "mention-1", chapterNo: 1 }),
            mention({ id: "mention-2", chapterId: "chapter-2", chapterNo: 4, evidenceSpanId: "evidence-2" })
          ],
          supportReasons: ["EXACT_NAMED_SURFACE"],
          mergeConfidence: 0.74
        })
      ]
    });

    expect(result.identityResolutionDrafts.every((item) => item.draft.resolutionKind === "MERGE_INTO")).toBe(true);
  });

  it("emits SPLIT_FROM for blocked merges", () => {
    const result = buildStageBResolutionDraftBundle({
      bookId  : BOOK_ID,
      runId   : RUN_ID,
      clusters: [
        cluster({
          blockReasons: ["NEGATIVE_ALIAS_RULE"],
          supportReasons: ["KB_ALIAS_EQUIVALENCE"],
          canonicalHints: ["牛浦"],
          mentions: [mention({ surfaceText: "牛布衣" })]
        })
      ]
    });

    expect(result.identityResolutionDrafts[0]?.draft).toEqual(expect.objectContaining({
      resolutionKind: "SPLIT_FROM",
      reviewState   : "PENDING"
    }));
  });

  it("emits UNSURE and CONFLICTED for impersonation or misidentification", () => {
    const result = buildStageBResolutionDraftBundle({
      bookId  : BOOK_ID,
      runId   : RUN_ID,
      clusters: [
        cluster({
          blockReasons: ["IMPERSONATION"],
          mentions: [mention({ surfaceText: "牛布衣", identityClaim: "IMPERSONATING" })]
        })
      ]
    });

    expect(result.identityResolutionDrafts[0]?.draft).toEqual(expect.objectContaining({
      resolutionKind: "UNSURE",
      reviewState   : "CONFLICTED"
    }));
  });

  it("carries mention evidence plus cluster support evidence into each claim", () => {
    const result = buildStageBResolutionDraftBundle({
      bookId  : BOOK_ID,
      runId   : RUN_ID,
      clusters: [
        cluster({
          supportReasons        : ["KB_ALIAS_EQUIVALENCE"],
          supportEvidenceSpanIds: ["alias-evidence-1", "alias-evidence-2"]
        })
      ]
    });

    expect(result.identityResolutionDrafts[0]?.draft.evidenceSpanIds).toEqual([
      "evidence-1",
      "alias-evidence-1",
      "alias-evidence-2"
    ]);
  });
});
```

- [ ] **Step 2: Run the draft-builder tests to verify they fail**

Run:

```bash
pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stageB/resolution-drafts.test.ts --coverage=false
```

Expected: FAIL because `resolution-drafts.ts` does not exist yet.

- [ ] **Step 3: Implement candidate seeds and pending claim drafts**

Create `src/server/modules/analysis/pipelines/evidence-review/stageB/resolution-drafts.ts`:

```ts
import { validateClaimDraftByFamily } from "@/server/modules/analysis/claims/claim-schemas";
import type {
  StageBCandidateCluster,
  StageBPendingIdentityResolutionDraft,
  StageBResolutionDraftBundle
} from "@/server/modules/analysis/pipelines/evidence-review/stageB/types";

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function selectCanonicalLabel(cluster: StageBCandidateCluster): string {
  if (cluster.canonicalHints.length === 1) {
    return cluster.canonicalHints[0];
  }

  const namedMention = cluster.mentions.find((mention) => (
    mention.mentionKind === "NAMED" || mention.mentionKind === "COURTESY_NAME"
  ));

  if (namedMention) {
    return namedMention.surfaceText;
  }

  return cluster.mentions[0]?.surfaceText ?? cluster.candidateRef;
}

function decideResolution(cluster: StageBCandidateCluster): {
  resolutionKind: "RESOLVES_TO" | "MERGE_INTO" | "SPLIT_FROM" | "UNSURE";
  reviewState   : "PENDING" | "CONFLICTED";
  confidence    : number;
  rationale     : string;
} {
  if (
    cluster.blockReasons.includes("IMPERSONATION")
    || cluster.blockReasons.includes("MISIDENTIFICATION")
  ) {
    return {
      resolutionKind: "UNSURE",
      reviewState   : "CONFLICTED",
      confidence    : Math.min(0.55, cluster.mergeConfidence),
      rationale     : "Identity conflict requires human review before merge."
    };
  }

  if (
    cluster.blockReasons.includes("NEGATIVE_ALIAS_RULE")
    || cluster.blockReasons.includes("CONFLICTING_CANONICAL_HINTS")
    || cluster.blockReasons.includes("SUSPECTED_RESOLVES_TO_CONFLICT")
    || cluster.blockReasons.includes("TITLE_ONLY_AMBIGUITY")
  ) {
    return {
      resolutionKind: "SPLIT_FROM",
      reviewState   : "PENDING",
      confidence    : Math.max(0.6, cluster.mergeConfidence),
      rationale     : "Keep separate because deterministic signals disagree or remain ambiguous."
    };
  }

  if (
    cluster.supportReasons.includes("SUSPECTED_RESOLVES_TO")
    || cluster.supportReasons.includes("KB_ALIAS_EQUIVALENCE")
  ) {
    return {
      resolutionKind: "RESOLVES_TO",
      reviewState   : "PENDING",
      confidence    : Math.max(0.82, cluster.mergeConfidence),
      rationale     : "Resolved by strong deterministic identity hints."
    };
  }

  if (
    cluster.supportReasons.includes("KB_ALIAS_PENDING_HINT")
    || cluster.supportReasons.includes("EXACT_NAMED_SURFACE")
  ) {
    return {
      resolutionKind: "MERGE_INTO",
      reviewState   : "PENDING",
      confidence    : Math.max(0.68, cluster.mergeConfidence),
      rationale     : "Merged conservatively from repeated named-surface or pending alias evidence."
    };
  }

  return {
    resolutionKind: "UNSURE",
    reviewState   : "CONFLICTED",
    confidence    : Math.min(0.55, cluster.mergeConfidence),
    rationale     : "Not enough stable evidence to choose a unique identity."
  };
}

function buildReviewNote(cluster: StageBCandidateCluster): string {
  const support = cluster.supportReasons.length > 0
    ? cluster.supportReasons.join("|")
    : "NONE";
  const blocks = cluster.blockReasons.length > 0
    ? cluster.blockReasons.join("|")
    : "NONE";

  return `STAGE_B: support=${support}; blocks=${blocks}`;
}

function buildPendingDraftsForCluster(input: {
  bookId : string;
  runId  : string;
  cluster: StageBCandidateCluster;
}): StageBPendingIdentityResolutionDraft[] {
  const decision = decideResolution(input.cluster);

  return input.cluster.mentions.map((mention) => ({
    candidateRef: input.cluster.candidateRef,
    draft       : validateClaimDraftByFamily("IDENTITY_RESOLUTION", {
      claimFamily       : "IDENTITY_RESOLUTION",
      bookId            : input.bookId,
      chapterId         : mention.chapterId,
      runId             : input.runId,
      source            : "AI",
      reviewState       : decision.reviewState,
      createdByUserId   : null,
      reviewedByUserId  : null,
      reviewNote        : buildReviewNote(input.cluster),
      supersedesClaimId : null,
      derivedFromClaimId: null,
      evidenceSpanIds   : unique([
        mention.evidenceSpanId,
        ...input.cluster.supportEvidenceSpanIds
      ]),
      confidence        : decision.confidence,
      mentionId         : mention.id,
      personaCandidateId: null,
      resolvedPersonaId : null,
      resolutionKind    : decision.resolutionKind,
      rationale         : decision.rationale
    })
  }));
}

export function buildStageBResolutionDraftBundle(input: {
  bookId  : string;
  runId   : string;
  clusters: StageBCandidateCluster[];
}): StageBResolutionDraftBundle {
  const personaCandidates = input.clusters.map((cluster) => ({
    candidateRef        : cluster.candidateRef,
    canonicalLabel      : selectCanonicalLabel(cluster),
    candidateStatus     : "OPEN" as const,
    firstSeenChapterNo  : cluster.mentions[0]?.chapterNo ?? null,
    lastSeenChapterNo   : cluster.mentions[cluster.mentions.length - 1]?.chapterNo ?? null,
    mentionCount        : cluster.mentions.length,
    evidenceScore       : cluster.mergeConfidence,
  }));

  const identityResolutionDrafts = input.clusters.flatMap((cluster) => buildPendingDraftsForCluster({
    bookId : input.bookId,
    runId  : input.runId,
    cluster
  }));

  return {
    personaCandidates,
    identityResolutionDrafts
  };
}
```

- [ ] **Step 4: Run the draft-builder tests again**

Run:

```bash
pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stageB/resolution-drafts.test.ts --coverage=false
```

Expected: PASS.

- [ ] **Step 5: Commit Task 4**

```bash
git add src/server/modules/analysis/pipelines/evidence-review/stageB/resolution-drafts.ts src/server/modules/analysis/pipelines/evidence-review/stageB/resolution-drafts.test.ts
git commit -m "feat: add stage-b resolution draft builder"
```

## Task 5: Persist Persona Candidates And Chapter-Scoped Identity Resolution Claims

**Files:**
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageB/persister.test.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageB/persister.ts`

- [ ] **Step 1: Write the failing persistence tests**

Create `src/server/modules/analysis/pipelines/evidence-review/stageB/persister.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { createStageBPersister } from "@/server/modules/analysis/pipelines/evidence-review/stageB/persister";
import { STAGE_B_STAGE_KEY } from "@/server/modules/analysis/pipelines/evidence-review/stageB/types";

const BOOK_ID = "11111111-1111-1111-1111-111111111111";
const RUN_ID = "22222222-2222-2222-2222-222222222222";

describe("createStageBPersister", () => {
  it("clears old run output, creates candidates, then writes chapter-grouped claim batches", async () => {
    const repository = {
      transaction: vi.fn(async (work: (tx: typeof repository) => Promise<unknown>) => await work(repository)),
      clearPersonaCandidatesForRun: vi.fn().mockResolvedValue(undefined),
      createPersonaCandidate: vi.fn()
        .mockResolvedValueOnce({ id: "candidate-db-1" })
        .mockResolvedValueOnce({ id: "candidate-db-2" })
    };
    const claimRepository = {
      replaceClaimFamilyScope: vi.fn().mockResolvedValue({ deletedCount: 2, createdCount: 0 })
    };
    const claimWriteService = {
      writeClaimBatch: vi.fn()
        .mockResolvedValueOnce({ deletedCount: 0, createdCount: 1 })
        .mockResolvedValueOnce({ deletedCount: 0, createdCount: 1 })
    };
    const persister = createStageBPersister({
      repository: repository as never,
      claimRepository: claimRepository as never,
      claimWriteService: claimWriteService as never
    });

    const result = await persister.persistResolutionBundle({
      bookId: BOOK_ID,
      runId : RUN_ID,
      bundle: {
        personaCandidates: [
          {
            candidateRef        : "candidate-1",
            canonicalLabel      : "范进",
            candidateStatus     : "OPEN",
            firstSeenChapterNo  : 1,
            lastSeenChapterNo   : 4,
            mentionCount        : 2,
            evidenceScore       : 0.88
          },
          {
            candidateRef        : "candidate-2",
            canonicalLabel      : "张静斋",
            candidateStatus     : "OPEN",
            firstSeenChapterNo  : 3,
            lastSeenChapterNo   : 3,
            mentionCount        : 1,
            evidenceScore       : 0.74
          }
        ],
        identityResolutionDrafts: [
          {
            candidateRef: "candidate-1",
            draft: {
              claimFamily       : "IDENTITY_RESOLUTION",
              bookId            : BOOK_ID,
              chapterId         : "chapter-1",
              runId             : RUN_ID,
              source            : "AI",
              reviewState       : "PENDING",
              createdByUserId   : null,
              reviewedByUserId  : null,
              reviewNote        : "STAGE_B: support=EXACT_NAMED_SURFACE; blocks=NONE",
              supersedesClaimId : null,
              derivedFromClaimId: null,
              evidenceSpanIds   : ["evidence-1"],
              confidence        : 0.74,
              mentionId         : "mention-1",
              personaCandidateId: null,
              resolvedPersonaId : null,
              resolutionKind    : "MERGE_INTO",
              rationale         : "same named surface"
            }
          },
          {
            candidateRef: "candidate-2",
            draft: {
              claimFamily       : "IDENTITY_RESOLUTION",
              bookId            : BOOK_ID,
              chapterId         : "chapter-3",
              runId             : RUN_ID,
              source            : "AI",
              reviewState       : "PENDING",
              createdByUserId   : null,
              reviewedByUserId  : null,
              reviewNote        : "STAGE_B: support=KB_ALIAS_EQUIVALENCE; blocks=NONE",
              supersedesClaimId : null,
              derivedFromClaimId: null,
              evidenceSpanIds   : ["evidence-2"],
              confidence        : 0.88,
              mentionId         : "mention-2",
              personaCandidateId: null,
              resolvedPersonaId : null,
              resolutionKind    : "RESOLVES_TO",
              rationale         : "alias canonical"
            }
          }
        ]
      }
    });

    expect(claimRepository.replaceClaimFamilyScope).toHaveBeenCalledWith({
      family: "IDENTITY_RESOLUTION",
      scope : {
        bookId  : BOOK_ID,
        runId   : RUN_ID,
        stageKey: STAGE_B_STAGE_KEY
      },
      rows: []
    });
    expect(repository.clearPersonaCandidatesForRun).toHaveBeenCalledWith({
      bookId: BOOK_ID,
      runId : RUN_ID
    });
    expect(claimWriteService.writeClaimBatch).toHaveBeenNthCalledWith(1, {
      family: "IDENTITY_RESOLUTION",
      scope : {
        bookId   : BOOK_ID,
        chapterId: "chapter-1",
        runId    : RUN_ID,
        stageKey : STAGE_B_STAGE_KEY
      },
      drafts: [
        expect.objectContaining({
          mentionId         : "mention-1",
          personaCandidateId: "candidate-db-1"
        })
      ]
    });
    expect(claimWriteService.writeClaimBatch).toHaveBeenNthCalledWith(2, {
      family: "IDENTITY_RESOLUTION",
      scope : {
        bookId   : BOOK_ID,
        chapterId: "chapter-3",
        runId    : RUN_ID,
        stageKey : STAGE_B_STAGE_KEY
      },
      drafts: [
        expect.objectContaining({
          mentionId         : "mention-2",
          personaCandidateId: "candidate-db-2"
        })
      ]
    });
    expect(result).toEqual({
      persistedCounts: {
        personaCandidates       : 2,
        identityResolutionClaims: 2
      }
    });
  });

  it("still clears stale run data when there are no new outputs", async () => {
    const repository = {
      transaction: vi.fn(async (work: (tx: typeof repository) => Promise<unknown>) => await work(repository)),
      clearPersonaCandidatesForRun: vi.fn().mockResolvedValue(undefined),
      createPersonaCandidate: vi.fn()
    };
    const claimRepository = {
      replaceClaimFamilyScope: vi.fn().mockResolvedValue({ deletedCount: 0, createdCount: 0 })
    };
    const claimWriteService = {
      writeClaimBatch: vi.fn()
    };
    const persister = createStageBPersister({
      repository: repository as never,
      claimRepository: claimRepository as never,
      claimWriteService: claimWriteService as never
    });

    const result = await persister.persistResolutionBundle({
      bookId: BOOK_ID,
      runId : RUN_ID,
      bundle: {
        personaCandidates: [],
        identityResolutionDrafts: []
      }
    });

    expect(repository.createPersonaCandidate).not.toHaveBeenCalled();
    expect(claimWriteService.writeClaimBatch).not.toHaveBeenCalled();
    expect(result.persistedCounts.identityResolutionClaims).toBe(0);
  });
});
```

- [ ] **Step 2: Run the persistence tests to verify they fail**

Run:

```bash
pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stageB/persister.test.ts --coverage=false
```

Expected: FAIL because `persister.ts` does not exist yet.

- [ ] **Step 3: Implement run-safe persistence**

Create `src/server/modules/analysis/pipelines/evidence-review/stageB/persister.ts`:

```ts
import { createClaimRepository } from "@/server/modules/analysis/claims/claim-repository";
import { createClaimWriteService } from "@/server/modules/analysis/claims/claim-write-service";
import { prisma } from "@/server/db/prisma";
import {
  createStageBRepository,
  type StageBRepository
} from "@/server/modules/analysis/pipelines/evidence-review/stageB/repository";
import {
  STAGE_B_STAGE_KEY,
  type StageBPersistedCounts,
  type StageBResolutionDraftBundle
} from "@/server/modules/analysis/pipelines/evidence-review/stageB/types";

export interface StageBClaimRepository {
  replaceClaimFamilyScope(
    input: Parameters<ReturnType<typeof createClaimRepository>["replaceClaimFamilyScope"]>[0]
  ): Promise<{ deletedCount: number; createdCount: number }>;
}

export interface StageBClaimWriteService {
  writeClaimBatch(
    input: Parameters<ReturnType<typeof createClaimWriteService>["writeClaimBatch"]>[0]
  ): Promise<{ deletedCount: number; createdCount: number }>;
}

export interface StageBPersisterDependencies {
  repository?       : StageBRepository;
  claimRepository?  : StageBClaimRepository;
  claimWriteService?: StageBClaimWriteService;
}

export interface PersistStageBResolutionBundleInput {
  bookId : string;
  runId  : string;
  bundle : StageBResolutionDraftBundle;
}

export function createStageBPersister(
  dependencies: StageBPersisterDependencies = {}
) {
  const repository = dependencies.repository ?? createStageBRepository();
  const claimRepository = dependencies.claimRepository ?? createClaimRepository(prisma);
  const claimWriteService = dependencies.claimWriteService ?? createClaimWriteService(createClaimRepository(prisma));

  async function persistResolutionBundle(
    input: PersistStageBResolutionBundleInput
  ): Promise<{ persistedCounts: StageBPersistedCounts }> {
    return repository.transaction(async (tx) => {
      await claimRepository.replaceClaimFamilyScope({
        family: "IDENTITY_RESOLUTION",
        scope : {
          bookId  : input.bookId,
          runId   : input.runId,
          stageKey: STAGE_B_STAGE_KEY
        },
        rows: []
      });

      await tx.clearPersonaCandidatesForRun({
        bookId: input.bookId,
        runId : input.runId
      });

      const candidateIdByRef = new Map<string, string>();

      for (const candidate of input.bundle.personaCandidates) {
        const created = await tx.createPersonaCandidate({
          bookId            : input.bookId,
          canonicalLabel    : candidate.canonicalLabel,
          candidateStatus   : candidate.candidateStatus,
          firstSeenChapterNo: candidate.firstSeenChapterNo,
          lastSeenChapterNo : candidate.lastSeenChapterNo,
          mentionCount      : candidate.mentionCount,
          evidenceScore     : candidate.evidenceScore,
          runId             : input.runId
        });

        candidateIdByRef.set(candidate.candidateRef, created.id);
      }

      const draftsByChapter = new Map<string, typeof input.bundle.identityResolutionDrafts>();
      for (const draftRow of input.bundle.identityResolutionDrafts) {
        const chapterId = draftRow.draft.chapterId;
        if (!chapterId) {
          throw new Error("Stage B identity resolution drafts must keep a non-null chapterId");
        }

        const current = draftsByChapter.get(chapterId) ?? [];
        current.push(draftRow);
        draftsByChapter.set(chapterId, current);
      }

      let identityResolutionClaims = 0;

      for (const [chapterId, draftRows] of Array.from(draftsByChapter.entries()).sort(([left], [right]) => left.localeCompare(right))) {
        const result = await claimWriteService.writeClaimBatch({
          family: "IDENTITY_RESOLUTION",
          scope : {
            bookId   : input.bookId,
            chapterId,
            runId    : input.runId,
            stageKey : STAGE_B_STAGE_KEY
          },
          drafts: draftRows.map((draftRow) => ({
            ...draftRow.draft,
            personaCandidateId: candidateIdByRef.get(draftRow.candidateRef) ?? null
          }))
        });

        identityResolutionClaims += result.createdCount;
      }

      return {
        persistedCounts: {
          personaCandidates       : input.bundle.personaCandidates.length,
          identityResolutionClaims
        }
      };
    });
  }

  return { persistResolutionBundle };
}

export type StageBPersister = ReturnType<typeof createStageBPersister>;

export const stageBPersister = createStageBPersister();
```

- [ ] **Step 4: Run the persistence tests again**

Run:

```bash
pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stageB/persister.test.ts --coverage=false
```

Expected: PASS.

- [ ] **Step 5: Commit Task 5**

```bash
git add src/server/modules/analysis/pipelines/evidence-review/stageB/persister.ts src/server/modules/analysis/pipelines/evidence-review/stageB/persister.test.ts
git commit -m "feat: add stage-b persister"
```

## Task 6: Orchestrate Stage B Execution, Observability, And Exports

**Files:**
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageB/IdentityResolver.test.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageB/IdentityResolver.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageB/index.ts`
- Modify: `docs/superpowers/tasks/2026-04-18-evidence-review/08-stage-b-identity-resolution.md`
- Modify: `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`

- [ ] **Step 1: Write the failing orchestrator tests**

Create `src/server/modules/analysis/pipelines/evidence-review/stageB/IdentityResolver.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { createIdentityResolver } from "@/server/modules/analysis/pipelines/evidence-review/stageB/IdentityResolver";
import { STAGE_B_RULE_MODEL, STAGE_B_RULE_PROVIDER, STAGE_B_STAGE_KEY } from "@/server/modules/analysis/pipelines/evidence-review/stageB/types";

const BOOK_ID = "11111111-1111-1111-1111-111111111111";
const RUN_ID = "22222222-2222-2222-2222-222222222222";

describe("createIdentityResolver", () => {
  it("runs the whole-book resolver and records a cost-free stage run", async () => {
    const repository = {
      listStageBMentions: vi.fn().mockResolvedValue([
        {
          id                 : "mention-1",
          bookId             : BOOK_ID,
          chapterId          : "chapter-1",
          chapterNo          : 1,
          runId              : RUN_ID,
          surfaceText        : "范进",
          mentionKind        : "NAMED",
          identityClaim      : "SELF",
          aliasTypeHint      : null,
          suspectedResolvesTo: null,
          evidenceSpanId     : "evidence-1",
          confidence         : 0.91,
          source             : "AI"
        }
      ]),
      listStageBAliasClaims: vi.fn().mockResolvedValue([]),
      transaction: vi.fn()
    };
    const persister = {
      persistResolutionBundle: vi.fn().mockResolvedValue({
        persistedCounts: {
          personaCandidates       : 1,
          identityResolutionClaims: 1
        }
      })
    };
    const stageRunService = {
      startStageRun: vi.fn().mockResolvedValue({ id: "stage-run-1" }),
      recordRawOutput: vi.fn().mockResolvedValue({ id: "raw-output-1" }),
      succeedStageRun: vi.fn().mockResolvedValue(undefined),
      failStageRun: vi.fn().mockResolvedValue(undefined)
    };

    const resolver = createIdentityResolver({
      repository: repository as never,
      persister : persister as never,
      stageRunService: stageRunService as never
    });

    const result = await resolver.runForBook({
      bookId: BOOK_ID,
      runId : RUN_ID
    });

    expect(stageRunService.startStageRun).toHaveBeenCalledWith(expect.objectContaining({
      bookId   : BOOK_ID,
      runId    : RUN_ID,
      stageKey : STAGE_B_STAGE_KEY,
      inputCount: 1
    }));
    expect(stageRunService.recordRawOutput).toHaveBeenCalledWith(expect.objectContaining({
      provider           : STAGE_B_RULE_PROVIDER,
      model              : STAGE_B_RULE_MODEL,
      promptTokens       : 0,
      completionTokens   : 0,
      estimatedCostMicros: BigInt(0)
    }));
    expect(result).toEqual(expect.objectContaining({
      bookId         : BOOK_ID,
      runId          : RUN_ID,
      stageRunId     : "stage-run-1",
      rawOutputId    : "raw-output-1",
      candidateCount : 1
    }));
  });

  it("still clears and succeeds when the run has no mentions", async () => {
    const repository = {
      listStageBMentions: vi.fn().mockResolvedValue([]),
      listStageBAliasClaims: vi.fn().mockResolvedValue([]),
      transaction: vi.fn()
    };
    const persister = {
      persistResolutionBundle: vi.fn().mockResolvedValue({
        persistedCounts: {
          personaCandidates       : 0,
          identityResolutionClaims: 0
        }
      })
    };
    const stageRunService = {
      startStageRun: vi.fn().mockResolvedValue({ id: "stage-run-1" }),
      recordRawOutput: vi.fn().mockResolvedValue({ id: "raw-output-1" }),
      succeedStageRun: vi.fn().mockResolvedValue(undefined),
      failStageRun: vi.fn().mockResolvedValue(undefined)
    };

    const resolver = createIdentityResolver({
      repository: repository as never,
      persister : persister as never,
      stageRunService: stageRunService as never
    });

    const result = await resolver.runForBook({
      bookId: BOOK_ID,
      runId : RUN_ID
    });

    expect(persister.persistResolutionBundle).toHaveBeenCalledWith({
      bookId: BOOK_ID,
      runId : RUN_ID,
      bundle: {
        personaCandidates: [],
        identityResolutionDrafts: []
      }
    });
    expect(result.outputCount).toBe(0);
  });

  it("marks the stage run failed when persistence throws", async () => {
    const repository = {
      listStageBMentions: vi.fn().mockResolvedValue([]),
      listStageBAliasClaims: vi.fn().mockResolvedValue([]),
      transaction: vi.fn()
    };
    const persister = {
      persistResolutionBundle: vi.fn().mockRejectedValue(new Error("persist failed"))
    };
    const stageRunService = {
      startStageRun: vi.fn().mockResolvedValue({ id: "stage-run-1" }),
      recordRawOutput: vi.fn(),
      succeedStageRun: vi.fn(),
      failStageRun: vi.fn().mockResolvedValue(undefined)
    };

    const resolver = createIdentityResolver({
      repository: repository as never,
      persister : persister as never,
      stageRunService: stageRunService as never
    });

    await expect(resolver.runForBook({
      bookId: BOOK_ID,
      runId : RUN_ID
    })).rejects.toThrow("persist failed");

    expect(stageRunService.failStageRun).toHaveBeenCalledWith("stage-run-1", expect.any(Error));
  });
});
```

- [ ] **Step 2: Run the orchestrator tests to verify they fail**

Run:

```bash
pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stageB/IdentityResolver.test.ts --coverage=false
```

Expected: FAIL because `IdentityResolver.ts` does not exist yet.

- [ ] **Step 3: Implement the Stage B orchestrator and exports**

Create `src/server/modules/analysis/pipelines/evidence-review/stageB/IdentityResolver.ts`:

```ts
import { createHash } from "node:crypto";

import type { Prisma } from "@/generated/prisma/client";
import {
  analysisStageRunService,
  type AnalysisStageRunService
} from "@/server/modules/analysis/runs/stage-run-service";
import {
  buildStageBCandidateClusters
} from "@/server/modules/analysis/pipelines/evidence-review/stageB/candidate-clustering";
import {
  createStageBPersister,
  type StageBPersister
} from "@/server/modules/analysis/pipelines/evidence-review/stageB/persister";
import {
  createStageBRepository,
  type StageBRepository
} from "@/server/modules/analysis/pipelines/evidence-review/stageB/repository";
import { buildStageBResolutionDraftBundle } from "@/server/modules/analysis/pipelines/evidence-review/stageB/resolution-drafts";
import {
  STAGE_B_RULE_MODEL,
  STAGE_B_RULE_PROVIDER,
  STAGE_B_RULE_VERSION,
  STAGE_B_STAGE_KEY,
  summarizeStageBDecisionCounts,
  type StageBRunInput,
  type StageBRunResult
} from "@/server/modules/analysis/pipelines/evidence-review/stageB/types";

function stableHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function toResponseJson(input: {
  candidateCount : number;
  decisionSummary: string;
  persistedCounts: StageBRunResult["persistedCounts"];
}): Prisma.InputJsonObject {
  return {
    ruleVersion: STAGE_B_RULE_VERSION,
    candidateCount: input.candidateCount,
    decisionSummary: input.decisionSummary,
    persistedCounts: {
      personaCandidates       : input.persistedCounts.personaCandidates,
      identityResolutionClaims: input.persistedCounts.identityResolutionClaims
    }
  };
}

export interface IdentityResolverDependencies {
  repository?     : Pick<StageBRepository, "listStageBMentions" | "listStageBAliasClaims">;
  persister?      : Pick<StageBPersister, "persistResolutionBundle">;
  stageRunService?: Pick<
    AnalysisStageRunService,
    "startStageRun" | "recordRawOutput" | "succeedStageRun" | "failStageRun"
  >;
}

export function createIdentityResolver(
  dependencies: IdentityResolverDependencies = {}
) {
  const repository = dependencies.repository ?? createStageBRepository();
  const persister = dependencies.persister ?? createStageBPersister();
  const stageRunService = dependencies.stageRunService ?? analysisStageRunService;

  async function runForBook(input: StageBRunInput): Promise<StageBRunResult> {
    if (input.runId === null) {
      throw new Error("Stage B persistence requires a non-null runId");
    }

    const mentions = await repository.listStageBMentions({
      bookId: input.bookId,
      runId : input.runId
    });
    const aliasClaims = await repository.listStageBAliasClaims({
      bookId: input.bookId,
      runId : input.runId
    });

    const started = await stageRunService.startStageRun({
      runId         : input.runId,
      bookId        : input.bookId,
      stageKey      : STAGE_B_STAGE_KEY,
      attempt       : input.attempt ?? 1,
      inputHash     : stableHash({
        ruleVersion : STAGE_B_RULE_VERSION,
        mentionIds  : mentions.map((item) => item.id),
        aliasClaimIds: aliasClaims.map((item) => item.id)
      }),
      inputCount    : mentions.length + aliasClaims.length,
      chapterStartNo: mentions.length > 0 ? Math.min(...mentions.map((item) => item.chapterNo)) : null,
      chapterEndNo  : mentions.length > 0 ? Math.max(...mentions.map((item) => item.chapterNo)) : null
    });

    try {
      const clusters = buildStageBCandidateClusters({
        mentions,
        aliasClaims
      });
      const bundle = buildStageBResolutionDraftBundle({
        bookId  : input.bookId,
        runId   : input.runId,
        clusters
      });
      const persisted = await persister.persistResolutionBundle({
        bookId: input.bookId,
        runId : input.runId,
        bundle
      });
      const decisionSummary = summarizeStageBDecisionCounts(
        bundle.identityResolutionDrafts.map((row) => ({
          resolutionKind: row.draft.resolutionKind,
          reviewState   : row.draft.reviewState
        }))
      );
      const responseJson = toResponseJson({
        candidateCount : bundle.personaCandidates.length,
        decisionSummary,
        persistedCounts: persisted.persistedCounts
      });
      const rawOutput = await stageRunService.recordRawOutput({
        runId               : input.runId,
        stageRunId          : started.id,
        bookId              : input.bookId,
        provider            : STAGE_B_RULE_PROVIDER,
        model               : STAGE_B_RULE_MODEL,
        requestPayload      : {
          ruleVersion  : STAGE_B_RULE_VERSION,
          mentionCount : mentions.length,
          aliasClaimCount: aliasClaims.length
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

      const outputCount =
        persisted.persistedCounts.personaCandidates
        + persisted.persistedCounts.identityResolutionClaims;
      const skippedCount = bundle.identityResolutionDrafts.filter((row) => row.draft.reviewState === "CONFLICTED").length;

      await stageRunService.succeedStageRun(started.id, {
        outputHash         : stableHash(responseJson),
        outputCount,
        skippedCount,
        promptTokens       : 0,
        completionTokens   : 0,
        estimatedCostMicros: BigInt(0)
      });

      return {
        bookId         : input.bookId,
        runId          : input.runId,
        stageRunId     : started.id,
        rawOutputId    : rawOutput.id,
        inputCount     : mentions.length + aliasClaims.length,
        outputCount,
        skippedCount,
        persistedCounts: persisted.persistedCounts,
        candidateCount : bundle.personaCandidates.length,
        decisionSummary
      };
    } catch (error) {
      await stageRunService.failStageRun(started.id, error);
      throw error;
    }
  }

  return { runForBook };
}

export type IdentityResolver = ReturnType<typeof createIdentityResolver>;

export const identityResolver = createIdentityResolver();
```

Create `src/server/modules/analysis/pipelines/evidence-review/stageB/index.ts`:

```ts
export * from "@/server/modules/analysis/pipelines/evidence-review/stageB/types";
export * from "@/server/modules/analysis/pipelines/evidence-review/stageB/alias-conflicts";
export * from "@/server/modules/analysis/pipelines/evidence-review/stageB/repository";
export * from "@/server/modules/analysis/pipelines/evidence-review/stageB/candidate-clustering";
export * from "@/server/modules/analysis/pipelines/evidence-review/stageB/resolution-drafts";
export * from "@/server/modules/analysis/pipelines/evidence-review/stageB/persister";
export * from "@/server/modules/analysis/pipelines/evidence-review/stageB/IdentityResolver";
```

- [ ] **Step 4: Run the Stage B module test suite**

Run:

```bash
pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stageB --coverage=false
```

Expected: PASS.

- [ ] **Step 5: Run shared validation**

Run:

```bash
pnpm type-check
```

Expected: PASS.

- [ ] **Step 6: Update the task doc and runbook after validation passes**

In `docs/superpowers/tasks/2026-04-18-evidence-review/08-stage-b-identity-resolution.md`:

- change every execution checkpoint checkbox from `- [ ]` to `- [x]`
- change every acceptance checkbox from `- [ ]` to `- [x]`
- append this execution record:

```md
### T08 Completion - 2026-04-20

- Changed files: `src/server/modules/analysis/pipelines/evidence-review/stageB/**`, `docs/superpowers/tasks/2026-04-18-evidence-review/08-stage-b-identity-resolution.md`, `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`
- Validation commands: `pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stageB --coverage=false`, `pnpm type-check`
- Result: Stage B now reads whole-book AI/RULE mentions plus Stage A+ alias hints, clusters them conservatively into `persona_candidates`, preserves merge denial and impersonation as explicit review-native identity outcomes, and writes chapter-traceable `IDENTITY_RESOLUTION` claims without creating final personas.
- Follow-up risks: T09 still owns explicit `conflict_flags`; T10 still needs to consume `persona_candidates` and `identity_resolution_claims` for fact attribution; Stage A+ alias canonical information still depends on parseable `reviewNote` metadata until a later schema promotion task formalizes that link.
- Next task: T09 `docs/superpowers/tasks/2026-04-18-evidence-review/09-stage-b5-conflict-detection.md`
```

In `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`:

- change `- [ ] T08: ...` to `- [x] T08: ...`
- append this completion block under the existing T18 completion:

```md
### T08 Completion - 2026-04-20

- Changed files: `src/server/modules/analysis/pipelines/evidence-review/stageB/**`, `docs/superpowers/tasks/2026-04-18-evidence-review/08-stage-b-identity-resolution.md`, `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`
- Validation commands: `pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stageB --coverage=false`, `pnpm type-check`
- Result: full-book identity resolution now clusters whole-run mentions into review-native `persona_candidates`, persists chapter-traceable `IDENTITY_RESOLUTION` outcomes, preserves explicit keep-separate and impersonation semantics, and records a cost-free T04 stage run.
- Follow-up risks: T09 still needs to elevate hard contradictions into `conflict_flags`; T10 still needs to rebind events/relations to resolved candidates; Stage B still parses T07 alias knowledge out of `reviewNote`, which remains an intentional but transitional coupling.
- Next task: T09 `docs/superpowers/tasks/2026-04-18-evidence-review/09-stage-b5-conflict-detection.md`
```

- [ ] **Step 7: Commit Task 6**

```bash
git add src/server/modules/analysis/pipelines/evidence-review/stageB/IdentityResolver.ts src/server/modules/analysis/pipelines/evidence-review/stageB/IdentityResolver.test.ts src/server/modules/analysis/pipelines/evidence-review/stageB/index.ts docs/superpowers/tasks/2026-04-18-evidence-review/08-stage-b-identity-resolution.md docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md
git commit -m "feat: implement stage-b identity resolution"
```

## Self-Review

- Spec coverage:
  - `persona_candidates` creation: Task 4 and Task 5
  - `identity_resolution_claims` creation: Task 4 and Task 5
  - merge / split / keep-separate: Task 3 and Task 4
  - impersonation / misidentification explicit modeling: Task 1, Task 3, Task 4
  - whole-book orchestration and observability: Task 6
  - Stage C and review API consumption readiness: Task 4 output contract plus Task 6 export surface
- Placeholder scan:
  - No `TBD`, `TODO`, or “similar to Task N” placeholders remain.
  - Every task includes explicit files, tests, commands, code, and commit boundaries.
- Type consistency:
  - `candidateRef`, `personaCandidates`, `identityResolutionDrafts`, `persistResolutionBundle`, and `runForBook` names are reused consistently across tasks.
  - `IDENTITY_RESOLUTION` drafts always keep `source: "AI"` and non-null `chapterId`.

## Validation Checklist For The Implementer

- Run only the task-local test file first for each task.
- Do not jump ahead to Task 6 before Tasks 1-5 pass.
- Keep `persona_candidates.candidateStatus` at `OPEN` in T08.
- Keep `resolvedPersonaId` as `null` in every T08 draft.
- Preserve `chapterId` on every `IDENTITY_RESOLUTION` draft; Stage B review pages depend on that traceability.
- Do not refactor T07 review-note format inside T08. If it is insufficient, stop and raise a follow-up task instead of changing upstream contracts mid-task.
