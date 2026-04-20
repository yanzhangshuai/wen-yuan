# T07 Stage A+ Knowledge Recall Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Stage A+ rule and KB v2 recall so each chapter can receive evidence-backed `RULE` claims, relation normalization suggestions, and explicit negative-knowledge conflict hints without writing final projections.

**Architecture:** Add a focused `analysis/pipelines/evidence-review/stageAPlus` module between Stage A extraction and Stage B identity resolution. Stage A+ loads persisted Stage 0 segments, Stage A relation claims, and scoped KB v2 runtime knowledge, then emits only claim-contract rows through the T03 write gateway while recording a cost-free T04 stage run.

**Tech Stack:** TypeScript strict, Vitest, Zod, Prisma 7 generated client, existing Stage 0 persisted segment reader, T03 claim contracts, T04 stage-run/raw-output service, T17 KB v2 runtime loader

---

## Source Of Truth

- Architecture spec: `docs/superpowers/specs/2026-04-18-evidence-review-architecture-rewrite-design.md` §7.3, §9, §9.4, §9.5, §10, §11
- Task doc: `docs/superpowers/tasks/2026-04-18-evidence-review/07-stage-a-plus-knowledge-recall.md`
- PRD: `.trellis/tasks/04-18-evidence-review-07-stage-a-plus-knowledge-recall/prd.md`
- Runbook: `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`
- Upstream completed plans:
- `docs/superpowers/plans/2026-04-19-t17-kb-v2-foundation-implementation-plan.md`
- `docs/superpowers/plans/2026-04-19-t05-stage-0-segmentation-implementation-plan.md`
- `docs/superpowers/plans/2026-04-19-t06-stage-a-extraction-implementation-plan.md`
- Key upstream modules:
- `src/server/modules/analysis/claims/claim-schemas.ts`
- `src/server/modules/analysis/claims/claim-repository.ts`
- `src/server/modules/analysis/claims/claim-write-service.ts`
- `src/server/modules/analysis/pipelines/evidence-review/stage0/repository.ts`
- `src/server/modules/analysis/pipelines/evidence-review/stageA/types.ts`
- `src/server/modules/analysis/runs/stage-run-service.ts`
- `src/server/modules/knowledge-v2/runtime-loader.ts`
- `src/server/modules/knowledge-v2/payload-schemas.ts`

## Scope Constraints

- Do not write `personas`, `persona_candidates`, `persona_aliases`, `persona_chapter_facts`, `persona_time_facts`, `relationship_edges`, timeline projections, or review UI rows.
- Do not silently overwrite Stage A relation labels. Stage A+ relation normalization must create a derived `RELATION` claim with `source: "RULE"` and `derivedFromClaimId` pointing to the Stage A relation claim.
- Do not treat `PENDING` KB as a hard constraint. It may create low-confidence hints with an explicit `KB_PENDING_HINT` review note.
- Do not introduce a database enum for `relationTypeKey`; it remains an open string.
- Do not implement T18 relation type catalog CRUD. T07 can consume KB v2 `relation taxonomy rule` and `relation label mapping rule` only.
- Do not integrate the whole-book orchestrator or skip/rerun policy. T07 exposes a chapter-level Stage A+ runner; T19 handles broader cost-control policies.
- Stop if KB v2 runtime loader is missing, Stage 0 persisted segments are unavailable, or T06 Stage A claim contracts cannot be read.

## Current Repo Facts

- `claim-repository.ts` already contains stage key `stage_a_plus_knowledge_recall`.
- `claim-repository.ts` currently allows Stage A+ replacement for `ALIAS`, `EVENT`, `RELATION`, and `TIME`, but rejects Stage A+ replacement for `ENTITY_MENTION`.
- `claim-write-service.ts` validates drafts and calls `replaceClaimFamilyScope`; it can write `ENTITY_MENTION` once the repository stage/family matrix allows it.
- `entityMentionDraftSchema` rejects `MANUAL` but accepts `RULE`.
- `relationTypeSelectionSchema` keeps `relationTypeKey` as a free string and `relationTypeSource` as `PRESET | CUSTOM | NORMALIZED_FROM_CUSTOM`.
- `createRuntimeKnowledgeLoader()` returns `verifiedItems`, `pendingItems`, `byType`, and `scopeChain`, and can load `INCLUDE_PENDING`.
- KB v2 payload schemas already cover alias equivalence, alias negative, surname, title, kinship, official position, relation taxonomy, relation label mapping, and relation negative rules.
- `stage0/repository.ts` already exposes `listPersistedChapterSegments()` with persisted segment IDs for evidence materialization.
- `stage-run-service.ts` supports rule-only stage observability by accepting zero tokens and zero `estimatedCostMicros`.

## File Structure

- Modify `src/server/modules/analysis/claims/claim-repository.ts`
  - Responsibility: allow Stage A+ to clear/replace `ENTITY_MENTION` rows with `source: "RULE"` only.
- Modify `src/server/modules/analysis/claims/claim-repository.test.ts`
  - Responsibility: lock the stage/family matrix for Stage A+ mention writes and remove the old rejection expectation.
- Modify `src/server/modules/analysis/claims/claim-write-service.test.ts`
  - Responsibility: prove the existing write service accepts Stage A+ `RULE` mention drafts.
- Create `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/types.ts`
  - Responsibility: constants, confidence policy, DTOs, compiled-rule types, recall output types, metrics, and discard summarization.
- Create `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/types.test.ts`
  - Responsibility: prove constants, confidence policy, open relation keys, and discard summary formatting.
- Create `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/knowledge-adapter.ts`
  - Responsibility: compile KB v2 runtime bundles into Stage A+ typed rule groups while preserving review state and weight.
- Create `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/knowledge-adapter.test.ts`
  - Responsibility: prove verified-vs-pending weights, negative knowledge retention, and relation mapping compilation.
- Create `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/rule-recall.ts`
  - Responsibility: exact evidence-backed mention and alias recall from Stage 0 segments and compiled knowledge.
- Create `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/rule-recall.test.ts`
  - Responsibility: prove verified alias recall, pending hint confidence, negative alias conflict hints, surname-title mention recall, and ambiguous evidence discard.
- Create `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/relation-normalization.ts`
  - Responsibility: create derived relation suggestions from Stage A relation claims and compiled relation knowledge.
- Create `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/relation-normalization.test.ts`
  - Responsibility: prove raw label preservation, `relationTypeKey` suggestion, `derivedFromClaimId`, pending mapping hints, and relation negative conflicts.
- Create `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/repository.ts`
  - Responsibility: read Stage A relation claims needed by Stage A+ without expanding the generic claim repository read surface.
- Create `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/repository.test.ts`
  - Responsibility: prove Stage A relation reads are scoped to `bookId + chapterId + runId + source AI + derivedFromClaimId null`.
- Create `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/claim-persister.ts`
  - Responsibility: idempotently write Stage A+ `ENTITY_MENTION`, `ALIAS`, and `RELATION` claim batches through the T03 claim write service.
- Create `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/claim-persister.test.ts`
  - Responsibility: prove replace-by-scope calls, empty batch clearing, and no projection delegates.
- Create `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/KnowledgeRecallStage.ts`
  - Responsibility: orchestrate Stage 0 segment read, KB v2 load, Stage A relation read, rule recall, relation normalization, claim persistence, raw-output summary, and T04 stage-run lifecycle.
- Create `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/KnowledgeRecallStage.test.ts`
  - Responsibility: prove happy path, missing segments failure, pending KB low-confidence behavior, and cost-free metrics.
- Create `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/index.ts`
  - Responsibility: stable barrel export for Stage B/T18/T19 integration.
- Modify `docs/superpowers/tasks/2026-04-18-evidence-review/07-stage-a-plus-knowledge-recall.md`
  - Responsibility: execution record and checklist state after validation passes.
- Modify `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`
  - Responsibility: mark T07 complete and append validation notes after validation passes.

## Modeling Decisions

- Stage A+ is chapter-scoped. It receives one chapter and one run, matching Stage A persistence boundaries and keeping retry behavior simple.
- Stage A+ uses `visibility: "INCLUDE_PENDING"` when loading KB v2, but the adapter assigns lower weights to `PENDING` items and marks resulting claims with `reviewNote` prefixes instead of treating them as verified truth.
- `VERIFIED` KB produces normal `PENDING` review claims with higher confidence. `PENDING` KB produces normal `PENDING` review claims with lower confidence and `KB_PENDING_HINT`.
- Negative alias and negative relation knowledge produce explicit `CONFLICTED` claims with machine-readable `reviewNote` prefixes, not silent blocking.
- Rule recall is exact-match only in T07. No fuzzy matching and no cross-chapter identity merge inference belongs in this task.
- Surname recall is conservative: surname rules only participate in composed surface forms such as `surname + title`, `surname + kinship term`, or `surname + official position title`.
- Mention recall writes `ENTITY_MENTION` with `source: "RULE"`, evidence span, and no persona candidate links.
- Alias recall writes `ALIAS` with `source: "RULE"`, `personaCandidateId: null`, and `targetPersonaCandidateId: null`; Stage B performs identity resolution later.
- Relation normalization writes derived `RELATION` claims with `source: "RULE"`, `derivedFromClaimId` set, original `relationLabel` preserved, and suggested `relationTypeKey`/`relationTypeSource`.
- Stage A+ raw output is a rule execution summary, not an LLM response. Use provider `rule-engine`, model `stage-a-plus-knowledge-recall-v1`, prompt/completion tokens `0`, and cost `0`.

## Task 1: Allow Stage A+ RULE Mentions In Claim Contract

**Files:**
- Modify: `src/server/modules/analysis/claims/claim-repository.test.ts`
- Modify: `src/server/modules/analysis/claims/claim-write-service.test.ts`
- Modify: `src/server/modules/analysis/claims/claim-repository.ts`

- [ ] **Step 1: Write the failing repository matrix test**

In `src/server/modules/analysis/claims/claim-repository.test.ts`, add this case to the existing `"builds the correct delete scope"` table:

```ts
{
  family        : "ENTITY_MENTION" as const,
  scope         : { bookId: BOOK_ID, chapterId: CHAPTER_ID, runId: RUN_ID, stageKey: "stage_a_plus_knowledge_recall" as const },
  expectedWhere : { bookId: BOOK_ID, chapterId: CHAPTER_ID, runId: RUN_ID, source: "RULE" },
  expectedResult: { deletedCount: 0, createdCount: 0 },
  deleteSpyKey  : "entityMention" as const
}
```

Remove this old unsupported-combination case from the `"rejects unsupported $family replacement"` table:

```ts
{ family: "ENTITY_MENTION" as const, stageKey: "stage_a_plus_knowledge_recall" as const }
```

- [ ] **Step 2: Add a write-service regression test for Stage A+ mentions**

Append this test to `src/server/modules/analysis/claims/claim-write-service.test.ts`:

```ts
it("accepts stage-a-plus rule entity mention batches", async () => {
  const repository = {
    replaceClaimFamilyScope: vi.fn().mockResolvedValue({ deletedCount: 0, createdCount: 1 })
  };
  const service = createClaimWriteService(repository);

  await service.writeClaimBatch({
    family: "ENTITY_MENTION",
    scope : {
      bookId   : BOOK_ID,
      chapterId: CHAPTER_ID,
      runId    : RUN_ID,
      stageKey : "stage_a_plus_knowledge_recall"
    },
    drafts: [
      {
        claimFamily              : "ENTITY_MENTION",
        bookId                   : BOOK_ID,
        chapterId                : CHAPTER_ID,
        runId                    : RUN_ID,
        source                   : "RULE",
        confidence               : 0.88,
        surfaceText              : "范老爷",
        mentionKind              : "TITLE_ONLY",
        identityClaim            : null,
        aliasTypeHint            : "TITLE",
        speakerPersonaCandidateId: null,
        suspectedResolvesTo      : null,
        evidenceSpanId           : EVIDENCE_ID
      }
    ]
  });

  expect(repository.replaceClaimFamilyScope).toHaveBeenCalledWith({
    family: "ENTITY_MENTION",
    scope : {
      bookId   : BOOK_ID,
      chapterId: CHAPTER_ID,
      runId    : RUN_ID,
      stageKey : "stage_a_plus_knowledge_recall"
    },
    rows: [
      expect.objectContaining({
        surfaceText: "范老爷",
        source     : "RULE"
      })
    ]
  });
});
```

- [ ] **Step 3: Run the claim contract tests to verify they fail**

Run:

```bash
pnpm exec vitest run src/server/modules/analysis/claims/claim-repository.test.ts src/server/modules/analysis/claims/claim-write-service.test.ts --coverage=false
```

Expected: `claim-repository.test.ts` fails because `stage_a_plus_knowledge_recall` still cannot replace `ENTITY_MENTION`.

- [ ] **Step 4: Implement Stage A+ entity mention replacement ownership**

In `src/server/modules/analysis/claims/claim-repository.ts`, replace the `ENTITY_MENTION` branch in `buildReplacementWhere()` with this logic:

```ts
case "ENTITY_MENTION":
  if (scope.stageKey === "stage_a_extraction") {
    return {
      ...buildBaseScopeWhere(scope, true),
      source: "AI"
    };
  }

  if (scope.stageKey === "stage_a_plus_knowledge_recall") {
    return {
      ...buildBaseScopeWhere(scope, true),
      source: "RULE"
    };
  }

  throw new ClaimRepositoryError(
    `Stage ${scope.stageKey} cannot replace claim family ${family}`
  );
```

- [ ] **Step 5: Run the claim contract tests again**

Run:

```bash
pnpm exec vitest run src/server/modules/analysis/claims/claim-repository.test.ts src/server/modules/analysis/claims/claim-write-service.test.ts --coverage=false
```

Expected: PASS.

- [ ] **Step 6: Commit Task 1**

```bash
git add src/server/modules/analysis/claims/claim-repository.ts src/server/modules/analysis/claims/claim-repository.test.ts src/server/modules/analysis/claims/claim-write-service.test.ts
git commit -m "feat: allow stage-a-plus rule mention claims"
```

## Task 2: Define Stage A+ Runtime Types

**Files:**
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/types.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/types.test.ts`

- [ ] **Step 1: Write failing type contract tests**

Create `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/types.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  STAGE_A_PLUS_CONFIDENCE,
  STAGE_A_PLUS_RULE_VERSION,
  STAGE_A_PLUS_STAGE_KEY,
  summarizeStageAPlusDiscards
} from "@/server/modules/analysis/pipelines/evidence-review/stageAPlus/types";

describe("Stage A+ type contracts", () => {
  it("uses the canonical stage key and rule version", () => {
    expect(STAGE_A_PLUS_STAGE_KEY).toBe("stage_a_plus_knowledge_recall");
    expect(STAGE_A_PLUS_RULE_VERSION).toBe("2026-04-19-stage-a-plus-v1");
  });

  it("keeps pending knowledge weaker than verified knowledge", () => {
    expect(STAGE_A_PLUS_CONFIDENCE.VERIFIED_KB).toBeGreaterThan(
      STAGE_A_PLUS_CONFIDENCE.PENDING_KB
    );
    expect(STAGE_A_PLUS_CONFIDENCE.NEGATIVE_KB).toBeGreaterThanOrEqual(
      STAGE_A_PLUS_CONFIDENCE.VERIFIED_KB
    );
  });

  it("summarizes discard codes deterministically", () => {
    expect(summarizeStageAPlusDiscards([
      { kind: "MENTION", ref: "m2", code: "QUOTE_NOT_FOUND", message: "missing" },
      { kind: "RELATION", ref: "r1", code: "SCHEMA_VALIDATION", message: "bad" },
      { kind: "MENTION", ref: "m1", code: "QUOTE_NOT_FOUND", message: "missing" }
    ])).toBe("QUOTE_NOT_FOUND:2, SCHEMA_VALIDATION:1");
  });
});
```

- [ ] **Step 2: Run the type tests to verify they fail**

Run:

```bash
pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stageAPlus/types.test.ts --coverage=false
```

Expected: FAIL because `stageAPlus/types.ts` does not exist.

- [ ] **Step 3: Create the Stage A+ type module**

Create `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/types.ts` with these exported contracts:

```ts
import type { ClaimDraftByFamily } from "@/server/modules/analysis/claims/claim-schemas";
import type { ClaimReviewState, RelationDirection, RelationTypeSource } from "@/server/modules/analysis/claims/base-types";
import type { RuntimeKnowledgeItem } from "@/server/modules/knowledge-v2/runtime-loader";

export const STAGE_A_PLUS_STAGE_KEY = "stage_a_plus_knowledge_recall";
export const STAGE_A_PLUS_RULE_VERSION = "2026-04-19-stage-a-plus-v1";
export const STAGE_A_PLUS_RULE_PROVIDER = "rule-engine";
export const STAGE_A_PLUS_RULE_MODEL = "stage-a-plus-knowledge-recall-v1";

export const STAGE_A_PLUS_CONFIDENCE = Object.freeze({
  VERIFIED_KB   : 0.9,
  PENDING_KB    : 0.55,
  LOCAL_RULE    : 0.68,
  NEGATIVE_KB   : 0.92,
  RELATION_BOOST: 0.12
} as const);

export type StageAPlusKnowledgeReviewState = "VERIFIED" | "PENDING";
export type StageAPlusRecallKind = "MENTION" | "ALIAS" | "RELATION";
export type StageAPlusDiscardCode =
  | "SCHEMA_VALIDATION"
  | "SEGMENT_INDEX_OUT_OF_RANGE"
  | "QUOTE_NOT_FOUND"
  | "QUOTE_NOT_UNIQUE"
  | "EVIDENCE_VALIDATION_FAILED";

export interface StageAPlusDiscardRecord {
  kind   : StageAPlusRecallKind;
  ref    : string;
  code   : StageAPlusDiscardCode;
  message: string;
}

export interface StageAPlusCompiledKnowledgeBase {
  id         : string;
  reviewState: StageAPlusKnowledgeReviewState;
  confidence: number;
  item       : RuntimeKnowledgeItem;
}

export interface StageAPlusCompiledAliasEquivalenceRule extends StageAPlusCompiledKnowledgeBase {
  canonicalName : string;
  aliasTexts    : string[];
  aliasTypeHints: string[];
  note          : string | null;
}

export interface StageAPlusCompiledAliasNegativeRule extends StageAPlusCompiledKnowledgeBase {
  aliasText            : string;
  blockedCanonicalNames: string[];
  reason               : string;
}

export interface StageAPlusCompiledTermRule extends StageAPlusCompiledKnowledgeBase {
  term           : string;
  normalizedLabel: string | null;
  aliasTypeHint  : "TITLE" | "POSITION" | "KINSHIP" | "NAMED" | "UNSURE";
  mentionKind    : "TITLE_ONLY" | "KINSHIP" | "NAMED" | "UNKNOWN";
}

export interface StageAPlusCompiledRelationMappingRule extends StageAPlusCompiledKnowledgeBase {
  relationTypeKey   : string;
  observedLabel     : string;
  normalizedLabel   : string;
  relationTypeSource: RelationTypeSource;
}

export interface StageAPlusCompiledRelationTaxonomyRule extends StageAPlusCompiledKnowledgeBase {
  relationTypeKey   : string;
  displayLabel      : string;
  direction         : RelationDirection;
  relationTypeSource: RelationTypeSource;
  aliasLabels       : string[];
}

export interface StageAPlusCompiledRelationNegativeRule extends StageAPlusCompiledKnowledgeBase {
  relationTypeKey: string | null;
  blockedLabels  : string[];
  denyDirection  : RelationDirection | null;
  reason         : string;
}

export interface StageAPlusCompiledKnowledge {
  aliasEquivalenceRules: StageAPlusCompiledAliasEquivalenceRule[];
  aliasNegativeRules   : StageAPlusCompiledAliasNegativeRule[];
  termRules            : StageAPlusCompiledTermRule[];
  surnameRules         : StageAPlusCompiledTermRule[];
  relationMappings     : StageAPlusCompiledRelationMappingRule[];
  relationTaxonomyRules: StageAPlusCompiledRelationTaxonomyRule[];
  relationNegativeRules: StageAPlusCompiledRelationNegativeRule[];
}

export interface StageAPlusRelationClaimRow {
  id                       : string;
  bookId                   : string;
  chapterId                : string;
  sourceMentionId          : string | null;
  targetMentionId          : string | null;
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
}

export interface StageAPlusRecallOutput {
  mentionDrafts  : Array<ClaimDraftByFamily["ENTITY_MENTION"]>;
  aliasDrafts    : Array<ClaimDraftByFamily["ALIAS"]>;
  relationDrafts : Array<ClaimDraftByFamily["RELATION"]>;
  discardRecords : StageAPlusDiscardRecord[];
  knowledgeItemIds: string[];
}

export interface StageAPlusPersistedCounts {
  mentions : number;
  aliases  : number;
  relations: number;
}

export interface StageAPlusRunInput {
  bookId     : string;
  bookTypeKey: string | null;
  runId      : string | null;
  attempt?   : number;
  chapter    : {
    id     : string;
    no     : number;
    title  : string;
    content: string;
  };
}

export interface StageAPlusRunResult {
  bookId          : string;
  chapterId       : string;
  runId           : string | null;
  stageRunId      : string | null;
  rawOutputId     : string | null;
  inputCount      : number;
  outputCount     : number;
  skippedCount    : number;
  persistedCounts : StageAPlusPersistedCounts;
  knowledgeItemIds: string[];
  discardRecords  : StageAPlusDiscardRecord[];
}

export function reviewNoteForKnowledge(
  prefix: "KB_VERIFIED" | "KB_PENDING_HINT" | "KB_ALIAS_NEGATIVE" | "KB_RELATION_NEGATIVE",
  knowledgeId: string,
  detail: string
): string {
  return `${prefix}: knowledgeId=${knowledgeId}; ${detail}`;
}

export function reviewStateForKnowledge(
  reviewState: StageAPlusKnowledgeReviewState
): ClaimReviewState {
  return reviewState === "VERIFIED" ? "PENDING" : "PENDING";
}

export function summarizeStageAPlusDiscards(
  discards: StageAPlusDiscardRecord[]
): string | null {
  if (discards.length === 0) {
    return null;
  }

  const counts = new Map<StageAPlusDiscardCode, number>();
  for (const discard of discards) {
    counts.set(discard.code, (counts.get(discard.code) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([code, count]) => `${code}:${count}`)
    .join(", ");
}
```

- [ ] **Step 4: Run the type tests again**

Run:

```bash
pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stageAPlus/types.test.ts --coverage=false
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/server/modules/analysis/pipelines/evidence-review/stageAPlus/types.ts src/server/modules/analysis/pipelines/evidence-review/stageAPlus/types.test.ts
git commit -m "feat: define stage-a-plus recall contracts"
```

## Task 3: Compile KB v2 Runtime Knowledge For Stage A+

**Files:**
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/knowledge-adapter.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/knowledge-adapter.test.ts`

- [ ] **Step 1: Write failing adapter tests**

Create `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/knowledge-adapter.test.ts` with tests that assert:

```ts
import { describe, expect, it } from "vitest";

import { compileStageAPlusKnowledge } from "@/server/modules/analysis/pipelines/evidence-review/stageAPlus/knowledge-adapter";

function buildItem(overrides: Record<string, unknown>) {
  return {
    id           : "knowledge-1",
    scopeType    : "GLOBAL",
    scopeId      : null,
    knowledgeType: "alias equivalence rule",
    payload      : {
      canonicalName : "范进",
      aliasTexts    : ["范老爷"],
      aliasTypeHints: ["TITLE"],
      note          : null
    },
    source                 : "SYSTEM_PRESET",
    reviewState            : "VERIFIED",
    confidence             : null,
    effectiveFrom          : null,
    effectiveTo            : null,
    promotedFromClaimId    : null,
    promotedFromClaimFamily: null,
    supersedesKnowledgeId  : null,
    version                : 1,
    createdByUserId        : null,
    reviewedByUserId       : null,
    reviewedAt             : null,
    createdAt              : new Date("2026-04-19T00:00:00.000Z"),
    updatedAt              : new Date("2026-04-19T00:00:00.000Z"),
    ...overrides
  };
}

describe("Stage A+ knowledge adapter", () => {
  it("compiles verified and pending alias rules with different weights", () => {
    const compiled = compileStageAPlusKnowledge({
      scopeChain: [{ scopeType: "GLOBAL", scopeId: null }],
      verifiedItems: [buildItem({ id: "verified-alias", reviewState: "VERIFIED" })],
      pendingItems : [buildItem({ id: "pending-alias", reviewState: "PENDING", confidence: 0.8 })],
      byType       : {} as never
    });

    expect(compiled.aliasEquivalenceRules).toHaveLength(2);
    expect(compiled.aliasEquivalenceRules.find((rule) => rule.id === "verified-alias")?.confidence)
      .toBeGreaterThan(compiled.aliasEquivalenceRules.find((rule) => rule.id === "pending-alias")?.confidence ?? 1);
    expect(compiled.aliasEquivalenceRules.find((rule) => rule.id === "pending-alias")?.reviewState)
      .toBe("PENDING");
  });

  it("retains negative alias and relation rules as first-class compiled rules", () => {
    const compiled = compileStageAPlusKnowledge({
      scopeChain: [{ scopeType: "GLOBAL", scopeId: null }],
      verifiedItems: [
        buildItem({
          id           : "alias-negative",
          knowledgeType: "alias negative rule",
          payload      : {
            aliasText            : "牛布衣",
            blockedCanonicalNames: ["牛浦郎"],
            reason               : "冒名不是同人别名"
          }
        }),
        buildItem({
          id           : "relation-negative",
          knowledgeType: "relation negative rule",
          payload      : {
            relationTypeKey: "sworn_brother",
            blockedLabels  : ["结义兄弟"],
            denyDirection  : "BIDIRECTIONAL",
            reason         : "本书中该称谓为夸饰"
          }
        })
      ],
      pendingItems: [],
      byType      : {} as never
    });

    expect(compiled.aliasNegativeRules[0]).toMatchObject({
      id       : "alias-negative",
      aliasText: "牛布衣"
    });
    expect(compiled.relationNegativeRules[0]).toMatchObject({
      id             : "relation-negative",
      relationTypeKey: "sworn_brother"
    });
  });

  it("compiles relation taxonomy aliases and observed-label mappings", () => {
    const compiled = compileStageAPlusKnowledge({
      scopeChain: [{ scopeType: "GLOBAL", scopeId: null }],
      verifiedItems: [
        buildItem({
          id           : "taxonomy",
          knowledgeType: "relation taxonomy rule",
          payload      : {
            relationTypeKey   : "teacher_of",
            displayLabel      : "师生",
            direction         : "FORWARD",
            relationTypeSource: "PRESET",
            aliasLabels       : ["门生", "老师"]
          }
        }),
        buildItem({
          id           : "mapping",
          knowledgeType: "relation label mapping rule",
          payload      : {
            relationTypeKey   : "political_patron_of",
            observedLabel     : "提携",
            normalizedLabel   : "政治庇护",
            relationTypeSource: "NORMALIZED_FROM_CUSTOM"
          }
        })
      ],
      pendingItems: [],
      byType      : {} as never
    });

    expect(compiled.relationTaxonomyRules[0].aliasLabels).toContain("门生");
    expect(compiled.relationMappings[0].relationTypeKey).toBe("political_patron_of");
  });
});
```

- [ ] **Step 2: Run adapter tests to verify they fail**

Run:

```bash
pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stageAPlus/knowledge-adapter.test.ts --coverage=false
```

Expected: FAIL because `knowledge-adapter.ts` does not exist.

- [ ] **Step 3: Implement the KB v2 adapter**

Create `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/knowledge-adapter.ts` with:

```ts
import type { RuntimeKnowledgeBundle, RuntimeKnowledgeItem } from "@/server/modules/knowledge-v2/runtime-loader";
import type {
  StageAPlusCompiledAliasEquivalenceRule,
  StageAPlusCompiledAliasNegativeRule,
  StageAPlusCompiledKnowledge,
  StageAPlusCompiledKnowledgeBase,
  StageAPlusCompiledRelationMappingRule,
  StageAPlusCompiledRelationNegativeRule,
  StageAPlusCompiledRelationTaxonomyRule,
  StageAPlusCompiledTermRule,
  StageAPlusKnowledgeReviewState
} from "@/server/modules/analysis/pipelines/evidence-review/stageAPlus/types";
import { STAGE_A_PLUS_CONFIDENCE } from "@/server/modules/analysis/pipelines/evidence-review/stageAPlus/types";

function allRuntimeItems(bundle: RuntimeKnowledgeBundle): RuntimeKnowledgeItem[] {
  return [...bundle.verifiedItems, ...bundle.pendingItems];
}

function toReviewState(item: RuntimeKnowledgeItem): StageAPlusKnowledgeReviewState | null {
  if (item.reviewState === "VERIFIED" || item.reviewState === "PENDING") {
    return item.reviewState;
  }
  return null;
}

function cappedConfidence(item: RuntimeKnowledgeItem): number {
  const reviewState = toReviewState(item);
  const base = item.confidence ?? (
    reviewState === "PENDING"
      ? STAGE_A_PLUS_CONFIDENCE.PENDING_KB
      : STAGE_A_PLUS_CONFIDENCE.VERIFIED_KB
  );

  if (reviewState === "PENDING") {
    return Math.min(base, STAGE_A_PLUS_CONFIDENCE.PENDING_KB);
  }

  return Math.max(base, STAGE_A_PLUS_CONFIDENCE.VERIFIED_KB);
}

function base(item: RuntimeKnowledgeItem): StageAPlusCompiledKnowledgeBase | null {
  const reviewState = toReviewState(item);
  if (!reviewState) {
    return null;
  }

  return {
    id        : item.id,
    reviewState,
    confidence: cappedConfidence(item),
    item
  };
}

function compileTermRule(item: RuntimeKnowledgeItem): StageAPlusCompiledTermRule | null {
  const baseRule = base(item);
  if (!baseRule) {
    return null;
  }

  if (item.knowledgeType === "surname rule") {
    const payload = item.payload as { surname: string; isCompound: boolean };
    return {
      ...baseRule,
      term           : payload.surname,
      normalizedLabel: payload.surname,
      aliasTypeHint  : "NAMED",
      mentionKind    : "NAMED"
    };
  }

  if (item.knowledgeType === "title rule") {
    const payload = item.payload as { title: string; tier: string };
    return {
      ...baseRule,
      term           : payload.title,
      normalizedLabel: payload.title,
      aliasTypeHint  : "TITLE",
      mentionKind    : "TITLE_ONLY"
    };
  }

  if (item.knowledgeType === "kinship term rule") {
    const payload = item.payload as { term: string; normalizedLabel: string };
    return {
      ...baseRule,
      term           : payload.term,
      normalizedLabel: payload.normalizedLabel,
      aliasTypeHint  : "KINSHIP",
      mentionKind    : "KINSHIP"
    };
  }

  if (item.knowledgeType === "official position rule") {
    const payload = item.payload as { title: string; normalizedLabel: string };
    return {
      ...baseRule,
      term           : payload.title,
      normalizedLabel: payload.normalizedLabel,
      aliasTypeHint  : "POSITION",
      mentionKind    : "TITLE_ONLY"
    };
  }

  return null;
}

export function compileStageAPlusKnowledge(
  bundle: RuntimeKnowledgeBundle
): StageAPlusCompiledKnowledge {
  const compiled: StageAPlusCompiledKnowledge = {
    aliasEquivalenceRules: [],
    aliasNegativeRules   : [],
    termRules            : [],
    surnameRules         : [],
    relationMappings     : [],
    relationTaxonomyRules: [],
    relationNegativeRules: []
  };

  for (const item of allRuntimeItems(bundle)) {
    const baseRule = base(item);
    if (!baseRule) {
      continue;
    }

    if (item.knowledgeType === "alias equivalence rule") {
      const payload = item.payload as {
        canonicalName: string;
        aliasTexts: string[];
        aliasTypeHints: string[];
        note: string | null;
      };
      compiled.aliasEquivalenceRules.push({
        ...baseRule,
        canonicalName : payload.canonicalName,
        aliasTexts    : payload.aliasTexts,
        aliasTypeHints: payload.aliasTypeHints,
        note          : payload.note
      } satisfies StageAPlusCompiledAliasEquivalenceRule);
      continue;
    }

    if (item.knowledgeType === "alias negative rule") {
      const payload = item.payload as {
        aliasText: string;
        blockedCanonicalNames: string[];
        reason: string;
      };
      compiled.aliasNegativeRules.push({
        ...baseRule,
        aliasText            : payload.aliasText,
        blockedCanonicalNames: payload.blockedCanonicalNames,
        reason               : payload.reason
      } satisfies StageAPlusCompiledAliasNegativeRule);
      continue;
    }

    const termRule = compileTermRule(item);
    if (termRule) {
      if (item.knowledgeType === "surname rule") {
        compiled.surnameRules.push(termRule);
      } else {
        compiled.termRules.push(termRule);
      }
      continue;
    }

    if (item.knowledgeType === "relation label mapping rule") {
      const payload = item.payload as {
        relationTypeKey: string;
        observedLabel: string;
        normalizedLabel: string;
        relationTypeSource: "PRESET" | "CUSTOM" | "NORMALIZED_FROM_CUSTOM";
      };
      compiled.relationMappings.push({
        ...baseRule,
        relationTypeKey   : payload.relationTypeKey,
        observedLabel     : payload.observedLabel,
        normalizedLabel   : payload.normalizedLabel,
        relationTypeSource: payload.relationTypeSource
      } satisfies StageAPlusCompiledRelationMappingRule);
      continue;
    }

    if (item.knowledgeType === "relation taxonomy rule") {
      const payload = item.payload as {
        relationTypeKey: string;
        displayLabel: string;
        direction: "FORWARD" | "REVERSE" | "BIDIRECTIONAL" | "UNDIRECTED";
        relationTypeSource: "PRESET" | "CUSTOM" | "NORMALIZED_FROM_CUSTOM";
        aliasLabels: string[];
      };
      compiled.relationTaxonomyRules.push({
        ...baseRule,
        relationTypeKey   : payload.relationTypeKey,
        displayLabel      : payload.displayLabel,
        direction         : payload.direction,
        relationTypeSource: payload.relationTypeSource,
        aliasLabels       : payload.aliasLabels
      } satisfies StageAPlusCompiledRelationTaxonomyRule);
      continue;
    }

    if (item.knowledgeType === "relation negative rule") {
      const payload = item.payload as {
        relationTypeKey: string | null;
        blockedLabels: string[];
        denyDirection: "FORWARD" | "REVERSE" | "BIDIRECTIONAL" | "UNDIRECTED" | null;
        reason: string;
      };
      compiled.relationNegativeRules.push({
        ...baseRule,
        relationTypeKey: payload.relationTypeKey,
        blockedLabels  : payload.blockedLabels,
        denyDirection  : payload.denyDirection,
        reason         : payload.reason
      } satisfies StageAPlusCompiledRelationNegativeRule);
    }
  }

  return compiled;
}
```

- [ ] **Step 4: Run adapter tests again**

Run:

```bash
pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stageAPlus/knowledge-adapter.test.ts --coverage=false
```

Expected: PASS.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/server/modules/analysis/pipelines/evidence-review/stageAPlus/knowledge-adapter.ts src/server/modules/analysis/pipelines/evidence-review/stageAPlus/knowledge-adapter.test.ts
git commit -m "feat: compile kb v2 knowledge for stage-a-plus"
```

## Task 4: Implement Evidence-Backed Rule Recall

**Files:**
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/rule-recall.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/rule-recall.test.ts`

- [ ] **Step 1: Write failing rule recall tests**

Create `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/rule-recall.test.ts` with tests for:

```ts
import { describe, expect, it, vi } from "vitest";

import { createStageAPlusRuleRecall } from "@/server/modules/analysis/pipelines/evidence-review/stageAPlus/rule-recall";
import type { StageAPlusCompiledKnowledge } from "@/server/modules/analysis/pipelines/evidence-review/stageAPlus/types";
import type { PersistedStage0Segment } from "@/server/modules/analysis/pipelines/evidence-review/stage0/repository";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";
const CHAPTER_ID = "22222222-2222-4222-8222-222222222222";
const RUN_ID = "33333333-3333-4333-8333-333333333333";

function buildSegment(rawText: string): PersistedStage0Segment {
  return {
    id            : "44444444-4444-4444-8444-444444444444",
    bookId        : BOOK_ID,
    chapterId     : CHAPTER_ID,
    runId         : RUN_ID,
    segmentIndex  : 0,
    segmentType   : "NARRATIVE",
    startOffset   : 0,
    endOffset     : rawText.length,
    rawText,
    normalizedText: rawText,
    confidence    : 0.95,
    speakerHint   : null
  };
}

function baseKnowledge(overrides: Partial<StageAPlusCompiledKnowledge>): StageAPlusCompiledKnowledge {
  return {
    aliasEquivalenceRules: [],
    aliasNegativeRules   : [],
    termRules            : [],
    surnameRules         : [],
    relationMappings     : [],
    relationTaxonomyRules: [],
    relationNegativeRules: [],
    ...overrides
  };
}

describe("Stage A+ rule recall", () => {
  it("creates verified alias mention and alias claims with evidence", async () => {
    const evidenceResolver = {
      findOrCreate: vi.fn().mockResolvedValue({
        id: "55555555-5555-4555-8555-555555555555"
      })
    };
    const recall = createStageAPlusRuleRecall({ evidenceResolver });

    const result = await recall.recallChapterClaims({
      bookId     : BOOK_ID,
      chapterId  : CHAPTER_ID,
      chapterNo  : 1,
      runId      : RUN_ID,
      chapterText: "范老爷进了学。",
      segments   : [buildSegment("范老爷进了学。")],
      knowledge  : baseKnowledge({
        aliasEquivalenceRules: [
          {
            id            : "alias-kb-1",
            reviewState   : "VERIFIED",
            confidence    : 0.91,
            canonicalName : "范进",
            aliasTexts    : ["范老爷"],
            aliasTypeHints: ["TITLE"],
            note          : null,
            item          : {} as never
          }
        ]
      })
    });

    expect(result.mentionDrafts[0]).toMatchObject({
      claimFamily : "ENTITY_MENTION",
      surfaceText : "范老爷",
      mentionKind : "TITLE_ONLY",
      aliasTypeHint: "TITLE",
      source      : "RULE"
    });
    expect(result.aliasDrafts[0]).toMatchObject({
      claimFamily: "ALIAS",
      aliasText  : "范老爷",
      aliasType  : "TITLE",
      claimKind  : "TITLE_OF",
      source     : "RULE",
      reviewState: "PENDING"
    });
    expect(evidenceResolver.findOrCreate).toHaveBeenCalled();
  });

  it("turns pending alias knowledge into low-confidence hints", async () => {
    const recall = createStageAPlusRuleRecall({
      evidenceResolver: {
        findOrCreate: vi.fn().mockResolvedValue({ id: "55555555-5555-4555-8555-555555555555" })
      }
    });

    const result = await recall.recallChapterClaims({
      bookId     : BOOK_ID,
      chapterId  : CHAPTER_ID,
      chapterNo  : 1,
      runId      : RUN_ID,
      chapterText: "范贤婿来了。",
      segments   : [buildSegment("范贤婿来了。")],
      knowledge  : baseKnowledge({
        aliasEquivalenceRules: [
          {
            id            : "pending-alias",
            reviewState   : "PENDING",
            confidence    : 0.55,
            canonicalName : "范进",
            aliasTexts    : ["范贤婿"],
            aliasTypeHints: ["NICKNAME"],
            note          : null,
            item          : {} as never
          }
        ]
      })
    });

    expect(result.aliasDrafts[0]).toMatchObject({
      confidence: 0.55,
      reviewNote: expect.stringContaining("KB_PENDING_HINT")
    });
  });

  it("emits negative alias knowledge as a conflicted alias claim", async () => {
    const recall = createStageAPlusRuleRecall({
      evidenceResolver: {
        findOrCreate: vi.fn().mockResolvedValue({ id: "55555555-5555-4555-8555-555555555555" })
      }
    });

    const result = await recall.recallChapterClaims({
      bookId     : BOOK_ID,
      chapterId  : CHAPTER_ID,
      chapterNo  : 1,
      runId      : RUN_ID,
      chapterText: "牛布衣在庵中。",
      segments   : [buildSegment("牛布衣在庵中。")],
      knowledge  : baseKnowledge({
        aliasNegativeRules: [
          {
            id                   : "deny-alias",
            reviewState          : "VERIFIED",
            confidence           : 0.92,
            aliasText            : "牛布衣",
            blockedCanonicalNames: ["牛浦郎"],
            reason               : "冒名不是同人别名",
            item                 : {} as never
          }
        ]
      })
    });

    expect(result.aliasDrafts[0]).toMatchObject({
      aliasText  : "牛布衣",
      aliasType  : "UNSURE",
      claimKind  : "UNSURE",
      reviewState: "CONFLICTED",
      reviewNote : expect.stringContaining("KB_ALIAS_NEGATIVE")
    });
  });

  it("recalls conservative surname-title composed mentions", async () => {
    const recall = createStageAPlusRuleRecall({
      evidenceResolver: {
        findOrCreate: vi.fn().mockResolvedValue({ id: "55555555-5555-4555-8555-555555555555" })
      }
    });

    const result = await recall.recallChapterClaims({
      bookId     : BOOK_ID,
      chapterId  : CHAPTER_ID,
      chapterNo  : 1,
      runId      : RUN_ID,
      chapterText: "王老爷说道。",
      segments   : [buildSegment("王老爷说道。")],
      knowledge  : baseKnowledge({
        surnameRules: [
          {
            id            : "surname-wang",
            reviewState   : "VERIFIED",
            confidence    : 0.9,
            term          : "王",
            normalizedLabel: "王",
            aliasTypeHint : "NAMED",
            mentionKind   : "NAMED",
            item          : {} as never
          }
        ],
        termRules: [
          {
            id            : "title-laoye",
            reviewState   : "VERIFIED",
            confidence    : 0.9,
            term          : "老爷",
            normalizedLabel: "老爷",
            aliasTypeHint : "TITLE",
            mentionKind   : "TITLE_ONLY",
            item          : {} as never
          }
        ]
      })
    });

    expect(result.mentionDrafts[0]).toMatchObject({
      surfaceText : "王老爷",
      mentionKind : "TITLE_ONLY",
      aliasTypeHint: "TITLE"
    });
  });

  it("discards ambiguous exact evidence instead of creating unsupported claims", async () => {
    const recall = createStageAPlusRuleRecall({
      evidenceResolver: {
        findOrCreate: vi.fn()
      }
    });

    const result = await recall.recallChapterClaims({
      bookId     : BOOK_ID,
      chapterId  : CHAPTER_ID,
      chapterNo  : 1,
      runId      : RUN_ID,
      chapterText: "范老爷见范老爷。",
      segments   : [buildSegment("范老爷见范老爷。")],
      knowledge  : baseKnowledge({
        aliasEquivalenceRules: [
          {
            id            : "alias-kb-1",
            reviewState   : "VERIFIED",
            confidence    : 0.91,
            canonicalName : "范进",
            aliasTexts    : ["范老爷"],
            aliasTypeHints: ["TITLE"],
            note          : null,
            item          : {} as never
          }
        ]
      })
    });

    expect(result.mentionDrafts).toHaveLength(0);
    expect(result.discardRecords[0]).toMatchObject({
      code: "QUOTE_NOT_UNIQUE"
    });
  });
});
```

- [ ] **Step 2: Run rule recall tests to verify they fail**

Run:

```bash
pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stageAPlus/rule-recall.test.ts --coverage=false
```

Expected: FAIL because `rule-recall.ts` does not exist.

- [ ] **Step 3: Implement exact evidence-backed recall**

Create `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/rule-recall.ts` with these implementation points:

```ts
import { AliasType } from "@/generated/prisma/enums";
import { prisma } from "@/server/db/prisma";
import {
  findOrCreateEvidenceSpan,
  validateEvidenceSpanDraft,
  type EvidenceSpanFindOrCreateClient,
  type EvidenceSpanRow,
  type MaterializedEvidenceSpanData
} from "@/server/modules/analysis/evidence/evidence-spans";
import {
  buildOffsetMap,
  mapNormalizedRangeToOriginalRange,
  normalizeTextForEvidence
} from "@/server/modules/analysis/evidence/offset-map";
import { validateClaimDraftByFamily } from "@/server/modules/analysis/claims/claim-schemas";
import type { PersistedStage0Segment } from "@/server/modules/analysis/pipelines/evidence-review/stage0/repository";
import {
  reviewNoteForKnowledge,
  STAGE_A_PLUS_CONFIDENCE,
  type StageAPlusCompiledAliasEquivalenceRule,
  type StageAPlusCompiledKnowledge,
  type StageAPlusCompiledTermRule,
  type StageAPlusDiscardRecord,
  type StageAPlusRecallOutput
} from "@/server/modules/analysis/pipelines/evidence-review/stageAPlus/types";
```

Use helper functions with these exact responsibilities:

```ts
function aliasTypeToClaimKind(aliasType: string): "ALIAS_OF" | "COURTESY_NAME_OF" | "TITLE_OF" | "KINSHIP_REFERENCE_TO" | "IMPERSONATES" | "MISIDENTIFIED_AS" | "UNSURE" {
  if (aliasType === "COURTESY_NAME") return "COURTESY_NAME_OF";
  if (aliasType === "TITLE" || aliasType === "POSITION") return "TITLE_OF";
  if (aliasType === "KINSHIP") return "KINSHIP_REFERENCE_TO";
  if (aliasType === "IMPERSONATED_IDENTITY") return "IMPERSONATES";
  if (aliasType === "MISIDENTIFIED_AS") return "MISIDENTIFIED_AS";
  if (aliasType === "UNSURE") return "UNSURE";
  return "ALIAS_OF";
}

function aliasTypeToMentionKind(aliasType: string): "NAMED" | "TITLE_ONLY" | "COURTESY_NAME" | "KINSHIP" | "UNKNOWN" {
  if (aliasType === "TITLE" || aliasType === "POSITION") return "TITLE_ONLY";
  if (aliasType === "COURTESY_NAME") return "COURTESY_NAME";
  if (aliasType === "KINSHIP") return "KINSHIP";
  if (aliasType === "UNSURE") return "UNKNOWN";
  return "NAMED";
}

function primaryAliasType(rule: StageAPlusCompiledAliasEquivalenceRule): AliasType {
  const [hint] = rule.aliasTypeHints;
  return AliasType[hint as keyof typeof AliasType] ?? AliasType.UNSURE;
}
```

Implement evidence materialization by reusing the Stage A quote matching pattern:

```ts
function findUniqueQuoteRangeInSegment(
  segmentText: string,
  quotedText: string
): { startOffset: number; endOffset: number } | "NOT_FOUND" | "NOT_UNIQUE" {
  const map = buildOffsetMap(segmentText);
  const normalizedNeedle = normalizeTextForEvidence(quotedText);
  const matches: Array<{ startOffset: number; endOffset: number }> = [];
  let fromIndex = 0;

  while (fromIndex <= map.normalizedText.length - normalizedNeedle.length) {
    const normalizedStart = map.normalizedText.indexOf(normalizedNeedle, fromIndex);
    if (normalizedStart < 0) break;
    matches.push(mapNormalizedRangeToOriginalRange(map, normalizedStart, normalizedStart + normalizedNeedle.length));
    fromIndex = normalizedStart + 1;
  }

  if (matches.length === 0) return "NOT_FOUND";
  if (matches.length > 1) return "NOT_UNIQUE";
  return matches[0];
}
```

Implement the exported factory:

```ts
export interface StageAPlusEvidenceResolver {
  findOrCreate(data: MaterializedEvidenceSpanData): Promise<EvidenceSpanRow>;
}

export interface StageAPlusRuleRecallDependencies {
  evidenceResolver?: StageAPlusEvidenceResolver;
}

export function createStageAPlusEvidenceResolver(
  client: EvidenceSpanFindOrCreateClient = prisma
): StageAPlusEvidenceResolver {
  return {
    findOrCreate: async (data) => findOrCreateEvidenceSpan(client, data)
  };
}

export function createStageAPlusRuleRecall(
  dependencies: StageAPlusRuleRecallDependencies = {}
) {
  const evidenceResolver = dependencies.evidenceResolver ?? createStageAPlusEvidenceResolver();

  async function recallChapterClaims(input: {
    bookId     : string;
    chapterId  : string;
    chapterNo  : number;
    runId      : string;
    chapterText: string;
    segments   : PersistedStage0Segment[];
    knowledge  : StageAPlusCompiledKnowledge;
  }): Promise<StageAPlusRecallOutput> {
    const output: StageAPlusRecallOutput = {
      mentionDrafts  : [],
      aliasDrafts    : [],
      relationDrafts : [],
      discardRecords : [],
      knowledgeItemIds: []
    };
    const seen = new Set<string>();

    async function evidenceForTerm(term: string, ref: string): Promise<string | null> {
      const segment = input.segments.find((candidate) => candidate.rawText.includes(term));
      if (!segment) {
        output.discardRecords.push({ kind: "MENTION", ref, code: "QUOTE_NOT_FOUND", message: `term not found: ${term}` });
        return null;
      }

      const range = findUniqueQuoteRangeInSegment(segment.rawText, term);
      if (range === "NOT_FOUND" || range === "NOT_UNIQUE") {
        output.discardRecords.push({
          kind   : "MENTION",
          ref,
          code   : range === "NOT_UNIQUE" ? "QUOTE_NOT_UNIQUE" : "QUOTE_NOT_FOUND",
          message: `term evidence is not unique or missing in segment ${segment.segmentIndex}: ${term}`
        });
        return null;
      }

      const materialized = validateEvidenceSpanDraft({
        chapterText: input.chapterText,
        segment    : {
          id            : segment.id,
          bookId        : segment.bookId,
          chapterId     : segment.chapterId,
          segmentType   : segment.segmentType,
          startOffset   : segment.startOffset,
          endOffset     : segment.endOffset,
          text          : segment.rawText,
          normalizedText: segment.normalizedText,
          speakerHint   : segment.speakerHint
        },
        draft: {
          bookId             : input.bookId,
          chapterId          : input.chapterId,
          segmentId          : segment.id,
          startOffset        : segment.startOffset + range.startOffset,
          endOffset          : segment.startOffset + range.endOffset,
          expectedText       : term,
          speakerHint        : segment.speakerHint,
          narrativeRegionType: segment.segmentType,
          createdByRunId     : input.runId
        }
      });
      const evidence = await evidenceResolver.findOrCreate(materialized);
      return evidence.id;
    }
```

Inside `recallChapterClaims`, implement:

```ts
    async function addMention(term: string, rule: { id: string; reviewState: "VERIFIED" | "PENDING"; confidence: number }, aliasType: AliasType): Promise<void> {
      const key = `mention:${term}`;
      if (seen.has(key)) return;
      seen.add(key);

      const evidenceSpanId = await evidenceForTerm(term, `mention:${term}`);
      if (!evidenceSpanId) return;

      output.mentionDrafts.push(validateClaimDraftByFamily("ENTITY_MENTION", {
        claimFamily              : "ENTITY_MENTION",
        bookId                   : input.bookId,
        chapterId                : input.chapterId,
        runId                    : input.runId,
        source                   : "RULE",
        confidence               : rule.confidence,
        surfaceText              : term,
        mentionKind              : aliasTypeToMentionKind(aliasType),
        identityClaim            : null,
        aliasTypeHint            : aliasType,
        speakerPersonaCandidateId: null,
        suspectedResolvesTo      : null,
        evidenceSpanId
      }));
      output.knowledgeItemIds.push(rule.id);
    }

    async function addAlias(term: string, rule: StageAPlusCompiledAliasEquivalenceRule): Promise<void> {
      const key = `alias:${rule.id}:${term}`;
      if (seen.has(key)) return;
      seen.add(key);

      const evidenceSpanId = await evidenceForTerm(term, `alias:${rule.id}:${term}`);
      if (!evidenceSpanId) return;

      const aliasType = primaryAliasType(rule);
      output.aliasDrafts.push(validateClaimDraftByFamily("ALIAS", {
        claimFamily             : "ALIAS",
        bookId                  : input.bookId,
        chapterId               : input.chapterId,
        runId                   : input.runId,
        source                  : "RULE",
        reviewState             : "PENDING",
        createdByUserId         : null,
        reviewedByUserId        : null,
        reviewNote              : rule.reviewState === "PENDING"
          ? reviewNoteForKnowledge("KB_PENDING_HINT", rule.id, `aliasText=${term}; canonicalName=${rule.canonicalName}`)
          : reviewNoteForKnowledge("KB_VERIFIED", rule.id, `aliasText=${term}; canonicalName=${rule.canonicalName}`),
        supersedesClaimId       : null,
        derivedFromClaimId      : null,
        evidenceSpanIds         : [evidenceSpanId],
        confidence              : rule.confidence,
        aliasText               : term,
        aliasType,
        personaCandidateId      : null,
        targetPersonaCandidateId: null,
        claimKind               : aliasTypeToClaimKind(aliasType)
      }));
      output.knowledgeItemIds.push(rule.id);
    }
```

Also implement:

```ts
    for (const rule of input.knowledge.aliasEquivalenceRules) {
      const aliasType = primaryAliasType(rule);
      for (const term of [rule.canonicalName, ...rule.aliasTexts]) {
        await addMention(term, rule, aliasType);
        await addAlias(term, rule);
      }
    }

    for (const rule of input.knowledge.termRules) {
      await addMention(rule.term, rule, AliasType[rule.aliasTypeHint] ?? AliasType.UNSURE);
    }

    for (const surname of input.knowledge.surnameRules) {
      for (const termRule of input.knowledge.termRules) {
        const surfaceText = `${surname.term}${termRule.term}`;
        await addMention(surfaceText, termRule, AliasType[termRule.aliasTypeHint] ?? AliasType.UNSURE);
      }
    }

    for (const rule of input.knowledge.aliasNegativeRules) {
      const evidenceSpanId = await evidenceForTerm(rule.aliasText, `alias-negative:${rule.id}`);
      if (!evidenceSpanId) continue;

      output.aliasDrafts.push(validateClaimDraftByFamily("ALIAS", {
        claimFamily             : "ALIAS",
        bookId                  : input.bookId,
        chapterId               : input.chapterId,
        runId                   : input.runId,
        source                  : "RULE",
        reviewState             : "CONFLICTED",
        createdByUserId         : null,
        reviewedByUserId        : null,
        reviewNote              : reviewNoteForKnowledge("KB_ALIAS_NEGATIVE", rule.id, `aliasText=${rule.aliasText}; blockedCanonicalNames=${rule.blockedCanonicalNames.join("|")}; reason=${rule.reason}`),
        supersedesClaimId       : null,
        derivedFromClaimId      : null,
        evidenceSpanIds         : [evidenceSpanId],
        confidence              : Math.max(rule.confidence, STAGE_A_PLUS_CONFIDENCE.NEGATIVE_KB),
        aliasText               : rule.aliasText,
        aliasType               : "UNSURE",
        personaCandidateId      : null,
        targetPersonaCandidateId: null,
        claimKind               : "UNSURE"
      }));
      output.knowledgeItemIds.push(rule.id);
    }

    return output;
  }

  return { recallChapterClaims };
}

export type StageAPlusRuleRecall = ReturnType<typeof createStageAPlusRuleRecall>;
```

- [ ] **Step 4: Run rule recall tests again**

Run:

```bash
pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stageAPlus/rule-recall.test.ts --coverage=false
```

Expected: PASS.

- [ ] **Step 5: Commit Task 4**

```bash
git add src/server/modules/analysis/pipelines/evidence-review/stageAPlus/rule-recall.ts src/server/modules/analysis/pipelines/evidence-review/stageAPlus/rule-recall.test.ts
git commit -m "feat: add stage-a-plus rule recall"
```

## Task 5: Implement Relation Normalization Suggestions

**Files:**
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/relation-normalization.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/relation-normalization.test.ts`

- [ ] **Step 1: Write failing relation normalization tests**

Create `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/relation-normalization.test.ts` with tests that assert:

```ts
import { describe, expect, it } from "vitest";

import { normalizeStageAPlusRelations } from "@/server/modules/analysis/pipelines/evidence-review/stageAPlus/relation-normalization";
import type { StageAPlusCompiledKnowledge, StageAPlusRelationClaimRow } from "@/server/modules/analysis/pipelines/evidence-review/stageAPlus/types";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";
const CHAPTER_ID = "22222222-2222-4222-8222-222222222222";
const RUN_ID = "33333333-3333-4333-8333-333333333333";
const RELATION_ID = "44444444-4444-4444-8444-444444444444";
const EVIDENCE_ID = "55555555-5555-4555-8555-555555555555";

function baseRelation(overrides: Partial<StageAPlusRelationClaimRow> = {}): StageAPlusRelationClaimRow {
  return {
    id                       : RELATION_ID,
    bookId                   : BOOK_ID,
    chapterId                : CHAPTER_ID,
    sourceMentionId          : "66666666-6666-4666-8666-666666666661",
    targetMentionId          : "66666666-6666-4666-8666-666666666662",
    sourcePersonaCandidateId : null,
    targetPersonaCandidateId : null,
    relationTypeKey          : "custom_relation",
    relationLabel            : "提携",
    relationTypeSource       : "CUSTOM",
    direction                : "FORWARD",
    effectiveChapterStart    : null,
    effectiveChapterEnd      : null,
    timeHintId               : null,
    evidenceSpanIds          : [EVIDENCE_ID],
    confidence               : 0.66,
    ...overrides
  };
}

function baseKnowledge(overrides: Partial<StageAPlusCompiledKnowledge>): StageAPlusCompiledKnowledge {
  return {
    aliasEquivalenceRules: [],
    aliasNegativeRules   : [],
    termRules            : [],
    surnameRules         : [],
    relationMappings     : [],
    relationTaxonomyRules: [],
    relationNegativeRules: [],
    ...overrides
  };
}

describe("Stage A+ relation normalization", () => {
  it("creates a derived relation suggestion while preserving the raw observed label", () => {
    const result = normalizeStageAPlusRelations({
      bookId   : BOOK_ID,
      chapterId: CHAPTER_ID,
      runId    : RUN_ID,
      relations: [baseRelation()],
      knowledge: baseKnowledge({
        relationMappings: [
          {
            id                : "mapping-1",
            reviewState       : "VERIFIED",
            confidence        : 0.9,
            relationTypeKey   : "political_patron_of",
            observedLabel     : "提携",
            normalizedLabel   : "政治庇护",
            relationTypeSource: "NORMALIZED_FROM_CUSTOM",
            item              : {} as never
          }
        ]
      })
    });

    expect(result.relationDrafts[0]).toMatchObject({
      relationLabel     : "提携",
      relationTypeKey   : "political_patron_of",
      relationTypeSource: "NORMALIZED_FROM_CUSTOM",
      derivedFromClaimId: RELATION_ID,
      source            : "RULE",
      reviewState       : "PENDING"
    });
  });

  it("uses taxonomy aliases as normalization candidates", () => {
    const result = normalizeStageAPlusRelations({
      bookId   : BOOK_ID,
      chapterId: CHAPTER_ID,
      runId    : RUN_ID,
      relations: [baseRelation({ relationLabel: "门生" })],
      knowledge: baseKnowledge({
        relationTaxonomyRules: [
          {
            id                : "taxonomy-1",
            reviewState       : "VERIFIED",
            confidence        : 0.9,
            relationTypeKey   : "teacher_of",
            displayLabel      : "师生",
            direction         : "FORWARD",
            relationTypeSource: "PRESET",
            aliasLabels       : ["门生"],
            item              : {} as never
          }
        ]
      })
    });

    expect(result.relationDrafts[0]).toMatchObject({
      relationLabel     : "门生",
      relationTypeKey   : "teacher_of",
      relationTypeSource: "PRESET"
    });
  });

  it("marks pending mapping suggestions with low-confidence review notes", () => {
    const result = normalizeStageAPlusRelations({
      bookId   : BOOK_ID,
      chapterId: CHAPTER_ID,
      runId    : RUN_ID,
      relations: [baseRelation()],
      knowledge: baseKnowledge({
        relationMappings: [
          {
            id                : "pending-mapping",
            reviewState       : "PENDING",
            confidence        : 0.55,
            relationTypeKey   : "political_patron_of",
            observedLabel     : "提携",
            normalizedLabel   : "政治庇护",
            relationTypeSource: "NORMALIZED_FROM_CUSTOM",
            item              : {} as never
          }
        ]
      })
    });

    expect(result.relationDrafts[0]).toMatchObject({
      confidence: 0.55,
      reviewNote: expect.stringContaining("KB_PENDING_HINT")
    });
  });

  it("turns negative relation knowledge into a conflicted derived relation claim", () => {
    const result = normalizeStageAPlusRelations({
      bookId   : BOOK_ID,
      chapterId: CHAPTER_ID,
      runId    : RUN_ID,
      relations: [baseRelation({ relationLabel: "结义兄弟", direction: "BIDIRECTIONAL" })],
      knowledge: baseKnowledge({
        relationNegativeRules: [
          {
            id             : "relation-negative",
            reviewState    : "VERIFIED",
            confidence     : 0.92,
            relationTypeKey: "sworn_brother",
            blockedLabels  : ["结义兄弟"],
            denyDirection  : "BIDIRECTIONAL",
            reason         : "夸饰称谓",
            item           : {} as never
          }
        ]
      })
    });

    expect(result.relationDrafts[0]).toMatchObject({
      relationLabel     : "结义兄弟",
      relationTypeKey   : "sworn_brother",
      reviewState       : "CONFLICTED",
      reviewNote        : expect.stringContaining("KB_RELATION_NEGATIVE"),
      derivedFromClaimId: RELATION_ID
    });
  });
});
```

- [ ] **Step 2: Run relation normalization tests to verify they fail**

Run:

```bash
pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stageAPlus/relation-normalization.test.ts --coverage=false
```

Expected: FAIL because `relation-normalization.ts` does not exist.

- [ ] **Step 3: Implement relation normalization**

Create `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/relation-normalization.ts`:

```ts
import { validateClaimDraftByFamily } from "@/server/modules/analysis/claims/claim-schemas";
import {
  reviewNoteForKnowledge,
  STAGE_A_PLUS_CONFIDENCE,
  type StageAPlusCompiledKnowledge,
  type StageAPlusRelationClaimRow,
  type StageAPlusRecallOutput
} from "@/server/modules/analysis/pipelines/evidence-review/stageAPlus/types";

function labelsEqual(left: string, right: string): boolean {
  return left.trim() === right.trim();
}

function appliesNegativeDirection(
  relation: StageAPlusRelationClaimRow,
  denyDirection: StageAPlusRelationClaimRow["direction"] | null
): boolean {
  return denyDirection === null || denyDirection === relation.direction;
}

function relationConfidence(baseConfidence: number, ruleConfidence: number): number {
  return Math.min(1, Math.max(ruleConfidence, baseConfidence + STAGE_A_PLUS_CONFIDENCE.RELATION_BOOST));
}

export function normalizeStageAPlusRelations(input: {
  bookId   : string;
  chapterId: string;
  runId    : string;
  relations: StageAPlusRelationClaimRow[];
  knowledge: StageAPlusCompiledKnowledge;
}): Pick<StageAPlusRecallOutput, "relationDrafts" | "discardRecords" | "knowledgeItemIds"> {
  const relationDrafts: StageAPlusRecallOutput["relationDrafts"] = [];
  const knowledgeItemIds: string[] = [];

  for (const relation of input.relations) {
    const negativeRule = input.knowledge.relationNegativeRules.find((rule) =>
      rule.blockedLabels.some((label) => labelsEqual(label, relation.relationLabel))
      && appliesNegativeDirection(relation, rule.denyDirection)
    );

    if (negativeRule) {
      relationDrafts.push(validateClaimDraftByFamily("RELATION", {
        claimFamily             : "RELATION",
        bookId                  : input.bookId,
        chapterId               : input.chapterId,
        runId                   : input.runId,
        source                  : "RULE",
        reviewState             : "CONFLICTED",
        createdByUserId         : null,
        reviewedByUserId        : null,
        reviewNote              : reviewNoteForKnowledge("KB_RELATION_NEGATIVE", negativeRule.id, `relationLabel=${relation.relationLabel}; reason=${negativeRule.reason}`),
        supersedesClaimId       : null,
        derivedFromClaimId      : relation.id,
        evidenceSpanIds         : relation.evidenceSpanIds,
        confidence              : Math.max(negativeRule.confidence, STAGE_A_PLUS_CONFIDENCE.NEGATIVE_KB),
        sourceMentionId         : relation.sourceMentionId,
        targetMentionId         : relation.targetMentionId,
        sourcePersonaCandidateId: relation.sourcePersonaCandidateId,
        targetPersonaCandidateId: relation.targetPersonaCandidateId,
        relationTypeKey         : negativeRule.relationTypeKey ?? relation.relationTypeKey,
        relationLabel           : relation.relationLabel,
        relationTypeSource      : relation.relationTypeSource,
        direction               : relation.direction,
        effectiveChapterStart   : relation.effectiveChapterStart,
        effectiveChapterEnd     : relation.effectiveChapterEnd,
        timeHintId              : relation.timeHintId
      }));
      knowledgeItemIds.push(negativeRule.id);
      continue;
    }

    const mapping = input.knowledge.relationMappings.find((rule) =>
      labelsEqual(rule.observedLabel, relation.relationLabel)
    );
    const taxonomy = mapping ? null : input.knowledge.relationTaxonomyRules.find((rule) =>
      labelsEqual(rule.displayLabel, relation.relationLabel)
      || rule.aliasLabels.some((label) => labelsEqual(label, relation.relationLabel))
    );

    const rule = mapping ?? taxonomy;
    if (!rule) {
      continue;
    }

    relationDrafts.push(validateClaimDraftByFamily("RELATION", {
      claimFamily             : "RELATION",
      bookId                  : input.bookId,
      chapterId               : input.chapterId,
      runId                   : input.runId,
      source                  : "RULE",
      reviewState             : "PENDING",
      createdByUserId         : null,
      reviewedByUserId        : null,
      reviewNote              : rule.reviewState === "PENDING"
        ? reviewNoteForKnowledge("KB_PENDING_HINT", rule.id, `relationLabel=${relation.relationLabel}; relationTypeKey=${rule.relationTypeKey}`)
        : reviewNoteForKnowledge("KB_VERIFIED", rule.id, `relationLabel=${relation.relationLabel}; relationTypeKey=${rule.relationTypeKey}`),
      supersedesClaimId       : null,
      derivedFromClaimId      : relation.id,
      evidenceSpanIds         : relation.evidenceSpanIds,
      confidence              : rule.reviewState === "PENDING"
        ? rule.confidence
        : relationConfidence(relation.confidence, rule.confidence),
      sourceMentionId         : relation.sourceMentionId,
      targetMentionId         : relation.targetMentionId,
      sourcePersonaCandidateId: relation.sourcePersonaCandidateId,
      targetPersonaCandidateId: relation.targetPersonaCandidateId,
      relationTypeKey         : rule.relationTypeKey,
      relationLabel           : relation.relationLabel,
      relationTypeSource      : rule.relationTypeSource === "PRESET" ? "PRESET" : "NORMALIZED_FROM_CUSTOM",
      direction               : relation.direction,
      effectiveChapterStart   : relation.effectiveChapterStart,
      effectiveChapterEnd     : relation.effectiveChapterEnd,
      timeHintId              : relation.timeHintId
    }));
    knowledgeItemIds.push(rule.id);
  }

  return {
    relationDrafts,
    discardRecords: [],
    knowledgeItemIds
  };
}
```

- [ ] **Step 4: Run relation normalization tests again**

Run:

```bash
pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stageAPlus/relation-normalization.test.ts --coverage=false
```

Expected: PASS.

- [ ] **Step 5: Commit Task 5**

```bash
git add src/server/modules/analysis/pipelines/evidence-review/stageAPlus/relation-normalization.ts src/server/modules/analysis/pipelines/evidence-review/stageAPlus/relation-normalization.test.ts
git commit -m "feat: add stage-a-plus relation normalization"
```

## Task 6: Add Stage A+ Read Repository And Claim Persister

**Files:**
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/repository.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/repository.test.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/claim-persister.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/claim-persister.test.ts`

- [ ] **Step 1: Write failing repository tests**

Create `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/repository.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { createStageAPlusRepository } from "@/server/modules/analysis/pipelines/evidence-review/stageAPlus/repository";

describe("Stage A+ repository", () => {
  it("reads only root Stage A AI relation claims for a chapter", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const repository = createStageAPlusRepository({
      relationClaim: { findMany }
    });

    await repository.listStageARelationClaims({
      bookId   : "11111111-1111-4111-8111-111111111111",
      chapterId: "22222222-2222-4222-8222-222222222222",
      runId    : "33333333-3333-4333-8333-333333333333"
    });

    expect(findMany).toHaveBeenCalledWith({
      where: {
        bookId            : "11111111-1111-4111-8111-111111111111",
        chapterId         : "22222222-2222-4222-8222-222222222222",
        runId             : "33333333-3333-4333-8333-333333333333",
        source            : "AI",
        derivedFromClaimId: null
      },
      orderBy: { createdAt: "asc" },
      select : {
        id                       : true,
        bookId                   : true,
        chapterId                : true,
        sourceMentionId          : true,
        targetMentionId          : true,
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
        confidence               : true
      }
    });
  });
});
```

- [ ] **Step 2: Write failing persister tests**

Create `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/claim-persister.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { createStageAPlusClaimPersister } from "@/server/modules/analysis/pipelines/evidence-review/stageAPlus/claim-persister";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";
const CHAPTER_ID = "22222222-2222-4222-8222-222222222222";
const RUN_ID = "33333333-3333-4333-8333-333333333333";
const EVIDENCE_ID = "44444444-4444-4444-8444-444444444444";

describe("Stage A+ claim persister", () => {
  it("writes mention, alias, and relation batches through the claim write service", async () => {
    const writeClaimBatch = vi.fn()
      .mockResolvedValueOnce({ deletedCount: 0, createdCount: 1 })
      .mockResolvedValueOnce({ deletedCount: 0, createdCount: 1 })
      .mockResolvedValueOnce({ deletedCount: 0, createdCount: 1 });
    const persister = createStageAPlusClaimPersister({
      claimWriteService: { writeClaimBatch }
    });

    const result = await persister.persistStageAPlusClaims({
      scope: {
        bookId   : BOOK_ID,
        chapterId: CHAPTER_ID,
        runId    : RUN_ID,
        stageKey : "stage_a_plus_knowledge_recall"
      },
      recallOutput: {
        mentionDrafts: [
          {
            claimFamily              : "ENTITY_MENTION",
            bookId                   : BOOK_ID,
            chapterId                : CHAPTER_ID,
            runId                    : RUN_ID,
            source                   : "RULE",
            confidence               : 0.9,
            surfaceText              : "范老爷",
            mentionKind              : "TITLE_ONLY",
            identityClaim            : null,
            aliasTypeHint            : "TITLE",
            speakerPersonaCandidateId: null,
            suspectedResolvesTo      : null,
            evidenceSpanId           : EVIDENCE_ID
          }
        ],
        aliasDrafts: [
          {
            claimFamily             : "ALIAS",
            bookId                  : BOOK_ID,
            chapterId               : CHAPTER_ID,
            runId                   : RUN_ID,
            source                  : "RULE",
            reviewState             : "PENDING",
            createdByUserId         : null,
            reviewedByUserId        : null,
            reviewNote              : null,
            supersedesClaimId       : null,
            derivedFromClaimId      : null,
            evidenceSpanIds         : [EVIDENCE_ID],
            confidence              : 0.9,
            aliasText               : "范老爷",
            aliasType               : "TITLE",
            personaCandidateId      : null,
            targetPersonaCandidateId: null,
            claimKind               : "TITLE_OF"
          }
        ],
        relationDrafts: [
          {
            claimFamily             : "RELATION",
            bookId                  : BOOK_ID,
            chapterId               : CHAPTER_ID,
            runId                   : RUN_ID,
            source                  : "RULE",
            reviewState             : "PENDING",
            createdByUserId         : null,
            reviewedByUserId        : null,
            reviewNote              : null,
            supersedesClaimId       : null,
            derivedFromClaimId      : "55555555-5555-4555-8555-555555555555",
            evidenceSpanIds         : [EVIDENCE_ID],
            confidence              : 0.9,
            sourceMentionId         : null,
            targetMentionId         : null,
            sourcePersonaCandidateId: null,
            targetPersonaCandidateId: null,
            relationTypeKey         : "teacher_of",
            relationLabel           : "门生",
            relationTypeSource      : "PRESET",
            direction               : "FORWARD",
            effectiveChapterStart   : null,
            effectiveChapterEnd     : null,
            timeHintId              : null
          }
        ],
        discardRecords : [],
        knowledgeItemIds: ["kb-1"]
      }
    });

    expect(result.persistedCounts).toEqual({ mentions: 1, aliases: 1, relations: 1 });
    expect(writeClaimBatch).toHaveBeenCalledTimes(3);
    expect(writeClaimBatch).toHaveBeenNthCalledWith(1, expect.objectContaining({ family: "ENTITY_MENTION" }));
    expect(writeClaimBatch).toHaveBeenNthCalledWith(2, expect.objectContaining({ family: "ALIAS" }));
    expect(writeClaimBatch).toHaveBeenNthCalledWith(3, expect.objectContaining({ family: "RELATION" }));
  });

  it("clears stale Stage A+ rows with empty batches", async () => {
    const writeClaimBatch = vi.fn().mockResolvedValue({ deletedCount: 2, createdCount: 0 });
    const persister = createStageAPlusClaimPersister({
      claimWriteService: { writeClaimBatch }
    });

    await persister.persistStageAPlusClaims({
      scope: {
        bookId   : BOOK_ID,
        chapterId: CHAPTER_ID,
        runId    : RUN_ID,
        stageKey : "stage_a_plus_knowledge_recall"
      },
      recallOutput: {
        mentionDrafts  : [],
        aliasDrafts    : [],
        relationDrafts : [],
        discardRecords : [],
        knowledgeItemIds: []
      }
    });

    expect(writeClaimBatch).toHaveBeenCalledTimes(3);
  });
});
```

- [ ] **Step 3: Run repository and persister tests to verify they fail**

Run:

```bash
pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stageAPlus/repository.test.ts src/server/modules/analysis/pipelines/evidence-review/stageAPlus/claim-persister.test.ts --coverage=false
```

Expected: FAIL because the files do not exist.

- [ ] **Step 4: Implement the Stage A+ repository**

Create `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/repository.ts`:

```ts
import { prisma } from "@/server/db/prisma";
import type { StageAPlusRelationClaimRow } from "@/server/modules/analysis/pipelines/evidence-review/stageAPlus/types";

interface StageAPlusRelationClaimDelegate {
  findMany(args: {
    where: {
      bookId: string;
      chapterId: string;
      runId: string;
      source: "AI";
      derivedFromClaimId: null;
    };
    orderBy: { createdAt: "asc" };
    select: Record<keyof StageAPlusRelationClaimRow, true>;
  }): Promise<StageAPlusRelationClaimRow[]>;
}

export interface StageAPlusRepositoryClient {
  relationClaim: StageAPlusRelationClaimDelegate;
}

export function createStageAPlusRepository(
  client: StageAPlusRepositoryClient = prisma
) {
  async function listStageARelationClaims(input: {
    bookId   : string;
    chapterId: string;
    runId    : string;
  }): Promise<StageAPlusRelationClaimRow[]> {
    return client.relationClaim.findMany({
      where: {
        bookId            : input.bookId,
        chapterId         : input.chapterId,
        runId             : input.runId,
        source            : "AI",
        derivedFromClaimId: null
      },
      orderBy: { createdAt: "asc" },
      select : {
        id                       : true,
        bookId                   : true,
        chapterId                : true,
        sourceMentionId          : true,
        targetMentionId          : true,
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
        confidence               : true
      }
    });
  }

  return { listStageARelationClaims };
}

export type StageAPlusRepository = ReturnType<typeof createStageAPlusRepository>;
export const stageAPlusRepository = createStageAPlusRepository();
```

- [ ] **Step 5: Implement the Stage A+ persister**

Create `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/claim-persister.ts`:

```ts
import {
  createClaimRepository,
  type ClaimWriteScope
} from "@/server/modules/analysis/claims/claim-repository";
import { createClaimWriteService } from "@/server/modules/analysis/claims/claim-write-service";
import { prisma } from "@/server/db/prisma";
import type { StageAPlusPersistedCounts, StageAPlusRecallOutput } from "@/server/modules/analysis/pipelines/evidence-review/stageAPlus/types";

export interface StageAPlusClaimWriteService {
  writeClaimBatch(input: Parameters<ReturnType<typeof createClaimWriteService>["writeClaimBatch"]>[0]): Promise<{
    deletedCount: number;
    createdCount: number;
  }>;
}

export interface PersistStageAPlusClaimsInput {
  scope       : ClaimWriteScope;
  recallOutput: StageAPlusRecallOutput;
}

export interface PersistStageAPlusClaimsResult {
  persistedCounts : StageAPlusPersistedCounts;
  knowledgeItemIds: string[];
}

export interface StageAPlusClaimPersisterDependencies {
  claimWriteService?: StageAPlusClaimWriteService;
}

export function createStageAPlusClaimPersister(
  dependencies: StageAPlusClaimPersisterDependencies = {}
) {
  const claimWriteService = dependencies.claimWriteService
    ?? createClaimWriteService(createClaimRepository(prisma));

  async function persistStageAPlusClaims(
    input: PersistStageAPlusClaimsInput
  ): Promise<PersistStageAPlusClaimsResult> {
    const mentionResult = await claimWriteService.writeClaimBatch({
      family: "ENTITY_MENTION",
      scope : input.scope,
      drafts: input.recallOutput.mentionDrafts
    });
    const aliasResult = await claimWriteService.writeClaimBatch({
      family: "ALIAS",
      scope : input.scope,
      drafts: input.recallOutput.aliasDrafts
    });
    const relationResult = await claimWriteService.writeClaimBatch({
      family: "RELATION",
      scope : input.scope,
      drafts: input.recallOutput.relationDrafts
    });

    return {
      persistedCounts: {
        mentions : mentionResult.createdCount,
        aliases  : aliasResult.createdCount,
        relations: relationResult.createdCount
      },
      knowledgeItemIds: Array.from(new Set(input.recallOutput.knowledgeItemIds))
    };
  }

  return { persistStageAPlusClaims };
}

export type StageAPlusClaimPersister = ReturnType<typeof createStageAPlusClaimPersister>;
export const stageAPlusClaimPersister = createStageAPlusClaimPersister();
```

- [ ] **Step 6: Run repository and persister tests again**

Run:

```bash
pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stageAPlus/repository.test.ts src/server/modules/analysis/pipelines/evidence-review/stageAPlus/claim-persister.test.ts --coverage=false
```

Expected: PASS.

- [ ] **Step 7: Commit Task 6**

```bash
git add src/server/modules/analysis/pipelines/evidence-review/stageAPlus/repository.ts src/server/modules/analysis/pipelines/evidence-review/stageAPlus/repository.test.ts src/server/modules/analysis/pipelines/evidence-review/stageAPlus/claim-persister.ts src/server/modules/analysis/pipelines/evidence-review/stageAPlus/claim-persister.test.ts
git commit -m "feat: persist stage-a-plus recall claims"
```

## Task 7: Orchestrate KnowledgeRecallStage

**Files:**
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/KnowledgeRecallStage.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/KnowledgeRecallStage.test.ts`

- [ ] **Step 1: Write failing orchestration tests**

Create `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/KnowledgeRecallStage.test.ts` with tests that assert:

```ts
import { describe, expect, it, vi } from "vitest";

import { createKnowledgeRecallStage } from "@/server/modules/analysis/pipelines/evidence-review/stageAPlus/KnowledgeRecallStage";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";
const CHAPTER_ID = "22222222-2222-4222-8222-222222222222";
const RUN_ID = "33333333-3333-4333-8333-333333333333";

describe("KnowledgeRecallStage", () => {
  it("runs Stage A+ end to end with cost-free stage metrics", async () => {
    const stageRunService = {
      startStageRun : vi.fn().mockResolvedValue({ id: "stage-run-1" }),
      succeedStageRun: vi.fn().mockResolvedValue(undefined),
      failStageRun   : vi.fn().mockResolvedValue(undefined),
      recordRawOutput: vi.fn().mockResolvedValue({ id: "raw-output-1" })
    };
    const stage = createKnowledgeRecallStage({
      stage0Repository: {
        listPersistedChapterSegments: vi.fn().mockResolvedValue([
          {
            id            : "segment-1",
            bookId        : BOOK_ID,
            chapterId     : CHAPTER_ID,
            runId         : RUN_ID,
            segmentIndex  : 0,
            segmentType   : "NARRATIVE",
            startOffset   : 0,
            endOffset     : 4,
            rawText       : "范老爷",
            normalizedText: "范老爷",
            confidence    : 0.95,
            speakerHint   : null
          }
        ])
      },
      knowledgeLoader: {
        load: vi.fn().mockResolvedValue({
          scopeChain    : [{ scopeType: "GLOBAL", scopeId: null }],
          verifiedItems : [],
          pendingItems  : [],
          byType        : {}
        })
      },
      stageAPlusRepository: {
        listStageARelationClaims: vi.fn().mockResolvedValue([])
      },
      ruleRecall: {
        recallChapterClaims: vi.fn().mockResolvedValue({
          mentionDrafts  : [],
          aliasDrafts    : [],
          relationDrafts : [],
          discardRecords : [],
          knowledgeItemIds: []
        })
      },
      relationNormalizer: vi.fn().mockReturnValue({
        relationDrafts : [],
        discardRecords: [],
        knowledgeItemIds: []
      }),
      persister: {
        persistStageAPlusClaims: vi.fn().mockResolvedValue({
          persistedCounts : { mentions: 0, aliases: 0, relations: 0 },
          knowledgeItemIds: []
        })
      },
      stageRunService
    });

    const result = await stage.runForChapter({
      bookId     : BOOK_ID,
      bookTypeKey: "CLASSICAL_NOVEL",
      runId      : RUN_ID,
      chapter    : {
        id     : CHAPTER_ID,
        no     : 1,
        title  : "第一回",
        content: "范老爷"
      }
    });

    expect(result.stageRunId).toBe("stage-run-1");
    expect(stageRunService.succeedStageRun).toHaveBeenCalledWith("stage-run-1", expect.objectContaining({
      promptTokens       : 0,
      completionTokens   : 0,
      estimatedCostMicros: BigInt(0)
    }));
    expect(stageRunService.recordRawOutput).toHaveBeenCalledWith(expect.objectContaining({
      provider        : "rule-engine",
      model           : "stage-a-plus-knowledge-recall-v1",
      promptTokens    : 0,
      completionTokens: 0
    }));
  });

  it("fails the stage run when Stage 0 persisted segments are missing", async () => {
    const stageRunService = {
      startStageRun : vi.fn().mockResolvedValue({ id: "stage-run-1" }),
      succeedStageRun: vi.fn(),
      failStageRun   : vi.fn().mockResolvedValue(undefined),
      recordRawOutput: vi.fn()
    };
    const stage = createKnowledgeRecallStage({
      stage0Repository: {
        listPersistedChapterSegments: vi.fn().mockResolvedValue([])
      },
      knowledgeLoader: {
        load: vi.fn()
      },
      stageAPlusRepository: {
        listStageARelationClaims: vi.fn()
      },
      ruleRecall: {
        recallChapterClaims: vi.fn()
      },
      relationNormalizer: vi.fn(),
      persister: {
        persistStageAPlusClaims: vi.fn()
      },
      stageRunService
    });

    await expect(stage.runForChapter({
      bookId     : BOOK_ID,
      bookTypeKey: null,
      runId      : RUN_ID,
      chapter    : {
        id     : CHAPTER_ID,
        no     : 1,
        title  : "第一回",
        content: ""
      }
    })).rejects.toThrowError("Stage A+ requires persisted Stage 0 segments");

    expect(stageRunService.failStageRun).toHaveBeenCalledWith("stage-run-1", expect.any(Error));
  });
});
```

- [ ] **Step 2: Run orchestration tests to verify they fail**

Run:

```bash
pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stageAPlus/KnowledgeRecallStage.test.ts --coverage=false
```

Expected: FAIL because `KnowledgeRecallStage.ts` does not exist.

- [ ] **Step 3: Implement KnowledgeRecallStage**

Create `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/KnowledgeRecallStage.ts` with:

```ts
import { createHash } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { createClaimRepository } from "@/server/modules/analysis/claims/claim-repository";
import { createRuntimeKnowledgeLoader } from "@/server/modules/knowledge-v2/runtime-loader";
import { createKnowledgeRepository } from "@/server/modules/knowledge-v2/repository";
import { createStage0SegmentRepository, type Stage0SegmentRepository } from "@/server/modules/analysis/pipelines/evidence-review/stage0/repository";
import { analysisStageRunService, type AnalysisStageRunService } from "@/server/modules/analysis/runs/stage-run-service";
import { compileStageAPlusKnowledge } from "@/server/modules/analysis/pipelines/evidence-review/stageAPlus/knowledge-adapter";
import { normalizeStageAPlusRelations } from "@/server/modules/analysis/pipelines/evidence-review/stageAPlus/relation-normalization";
import { createStageAPlusRuleRecall, type StageAPlusRuleRecall } from "@/server/modules/analysis/pipelines/evidence-review/stageAPlus/rule-recall";
import { createStageAPlusClaimPersister, type StageAPlusClaimPersister } from "@/server/modules/analysis/pipelines/evidence-review/stageAPlus/claim-persister";
import { createStageAPlusRepository, type StageAPlusRepository } from "@/server/modules/analysis/pipelines/evidence-review/stageAPlus/repository";
import {
  STAGE_A_PLUS_RULE_MODEL,
  STAGE_A_PLUS_RULE_PROVIDER,
  STAGE_A_PLUS_RULE_VERSION,
  STAGE_A_PLUS_STAGE_KEY,
  summarizeStageAPlusDiscards,
  type StageAPlusRunInput,
  type StageAPlusRunResult
} from "@/server/modules/analysis/pipelines/evidence-review/stageAPlus/types";
```

Use these helpers:

```ts
function stableHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function mergeUnique(left: string[], right: string[]): string[] {
  return Array.from(new Set([...left, ...right]));
}
```

Define dependencies and factory:

```ts
export interface StageAPlusKnowledgeLoader {
  load(input: {
    bookId     : string;
    bookTypeKey: string | null;
    runId      : string | null;
    visibility : "INCLUDE_PENDING";
  }): Promise<ReturnType<typeof createRuntimeKnowledgeLoader> extends { load: (...args: never[]) => Promise<infer T> } ? T : never>;
}

export interface KnowledgeRecallStageDependencies {
  stage0Repository?     : Pick<Stage0SegmentRepository, "listPersistedChapterSegments">;
  knowledgeLoader?      : StageAPlusKnowledgeLoader;
  stageAPlusRepository? : Pick<StageAPlusRepository, "listStageARelationClaims">;
  ruleRecall?           : Pick<StageAPlusRuleRecall, "recallChapterClaims">;
  relationNormalizer?   : typeof normalizeStageAPlusRelations;
  persister?            : Pick<StageAPlusClaimPersister, "persistStageAPlusClaims">;
  stageRunService?      : Pick<AnalysisStageRunService, "startStageRun" | "succeedStageRun" | "failStageRun" | "recordRawOutput">;
}

export function createKnowledgeRecallStage(
  dependencies: KnowledgeRecallStageDependencies = {}
) {
  const stage0Repository = dependencies.stage0Repository ?? createStage0SegmentRepository();
  const knowledgeLoader = dependencies.knowledgeLoader
    ?? createRuntimeKnowledgeLoader(createKnowledgeRepository(prisma));
  const stageAPlusRepository = dependencies.stageAPlusRepository ?? createStageAPlusRepository();
  const ruleRecall = dependencies.ruleRecall ?? createStageAPlusRuleRecall();
  const relationNormalizer = dependencies.relationNormalizer ?? normalizeStageAPlusRelations;
  const persister = dependencies.persister
    ?? createStageAPlusClaimPersister({
      claimWriteService: undefined
    });
  const stageRunService = dependencies.stageRunService ?? analysisStageRunService;
```

Implement `runForChapter()`:

```ts
  async function runForChapter(input: StageAPlusRunInput): Promise<StageAPlusRunResult> {
    if (input.runId === null) {
      throw new Error("Stage A+ persistence requires a non-null runId");
    }

    const segments = await stage0Repository.listPersistedChapterSegments({
      runId    : input.runId,
      chapterId: input.chapter.id
    });

    const started = await stageRunService.startStageRun({
      runId         : input.runId,
      bookId        : input.bookId,
      chapterId     : input.chapter.id,
      stageKey      : STAGE_A_PLUS_STAGE_KEY,
      attempt       : input.attempt ?? 1,
      inputHash     : stableHash({
        ruleVersion: STAGE_A_PLUS_RULE_VERSION,
        chapterId  : input.chapter.id,
        chapterNo  : input.chapter.no,
        segmentIds : segments.map((segment) => segment.id)
      }),
      inputCount    : segments.length,
      chapterStartNo: input.chapter.no,
      chapterEndNo  : input.chapter.no
    });

    try {
      if (segments.length === 0) {
        throw new Error(`Stage A+ requires persisted Stage 0 segments for chapter ${input.chapter.id}`);
      }

      const bundle = await knowledgeLoader.load({
        bookId     : input.bookId,
        bookTypeKey: input.bookTypeKey,
        runId      : input.runId,
        visibility : "INCLUDE_PENDING"
      });
      const knowledge = compileStageAPlusKnowledge(bundle);
      const stageARelations = await stageAPlusRepository.listStageARelationClaims({
        bookId   : input.bookId,
        chapterId: input.chapter.id,
        runId    : input.runId
      });
      const ruleOutput = await ruleRecall.recallChapterClaims({
        bookId     : input.bookId,
        chapterId  : input.chapter.id,
        chapterNo  : input.chapter.no,
        runId      : input.runId,
        chapterText: input.chapter.content,
        segments,
        knowledge
      });
      const relationOutput = relationNormalizer({
        bookId   : input.bookId,
        chapterId: input.chapter.id,
        runId    : input.runId,
        relations: stageARelations,
        knowledge
      });
      const recallOutput = {
        mentionDrafts  : ruleOutput.mentionDrafts,
        aliasDrafts    : ruleOutput.aliasDrafts,
        relationDrafts : relationOutput.relationDrafts,
        discardRecords : [...ruleOutput.discardRecords, ...relationOutput.discardRecords],
        knowledgeItemIds: mergeUnique(ruleOutput.knowledgeItemIds, relationOutput.knowledgeItemIds)
      };
      const persisted = await persister.persistStageAPlusClaims({
        scope: {
          bookId   : input.bookId,
          chapterId: input.chapter.id,
          runId    : input.runId,
          stageKey : STAGE_A_PLUS_STAGE_KEY
        },
        recallOutput
      });
      const outputCount =
        persisted.persistedCounts.mentions
        + persisted.persistedCounts.aliases
        + persisted.persistedCounts.relations;
      const discardSummary = summarizeStageAPlusDiscards(recallOutput.discardRecords);
      const responseJson = {
        ruleVersion     : STAGE_A_PLUS_RULE_VERSION,
        persistedCounts : persisted.persistedCounts,
        knowledgeItemIds: persisted.knowledgeItemIds,
        discardSummary,
        discardRecords  : recallOutput.discardRecords
      };
      const rawOutput = await stageRunService.recordRawOutput({
        runId           : input.runId,
        stageRunId      : started.id,
        bookId          : input.bookId,
        chapterId       : input.chapter.id,
        provider        : STAGE_A_PLUS_RULE_PROVIDER,
        model           : STAGE_A_PLUS_RULE_MODEL,
        requestPayload  : {
          ruleVersion     : STAGE_A_PLUS_RULE_VERSION,
          chapterId       : input.chapter.id,
          segmentCount    : segments.length,
          stageARelations : stageARelations.length,
          knowledgeItemIds: bundle.verifiedItems.concat(bundle.pendingItems).map((item) => item.id)
        } as Prisma.InputJsonValue,
        responseText     : JSON.stringify(responseJson),
        responseJson     : responseJson as Prisma.InputJsonValue,
        parseError       : null,
        schemaError      : null,
        discardReason    : discardSummary,
        promptTokens     : 0,
        completionTokens : 0,
        estimatedCostMicros: BigInt(0)
      });

      await stageRunService.succeedStageRun(started.id, {
        outputHash         : stableHash(responseJson),
        outputCount,
        skippedCount       : recallOutput.discardRecords.length,
        promptTokens       : 0,
        completionTokens   : 0,
        estimatedCostMicros: BigInt(0)
      });

      return {
        bookId          : input.bookId,
        chapterId       : input.chapter.id,
        runId           : input.runId,
        stageRunId      : started.id,
        rawOutputId     : rawOutput.id,
        inputCount      : segments.length,
        outputCount,
        skippedCount    : recallOutput.discardRecords.length,
        persistedCounts : persisted.persistedCounts,
        knowledgeItemIds: persisted.knowledgeItemIds,
        discardRecords  : recallOutput.discardRecords
      };
    } catch (error) {
      await stageRunService.failStageRun(started.id, error);
      throw error;
    }
  }

  return { runForChapter };
}

export type KnowledgeRecallStage = ReturnType<typeof createKnowledgeRecallStage>;
export const knowledgeRecallStage = createKnowledgeRecallStage();
```

- [ ] **Step 4: Run orchestration tests again**

Run:

```bash
pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stageAPlus/KnowledgeRecallStage.test.ts --coverage=false
```

Expected: PASS.

- [ ] **Step 5: Commit Task 7**

```bash
git add src/server/modules/analysis/pipelines/evidence-review/stageAPlus/KnowledgeRecallStage.ts src/server/modules/analysis/pipelines/evidence-review/stageAPlus/KnowledgeRecallStage.test.ts
git commit -m "feat: orchestrate stage-a-plus knowledge recall"
```

## Task 8: Export Module, Validate T07, And Record Completion

**Files:**
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/index.ts`
- Modify: `docs/superpowers/tasks/2026-04-18-evidence-review/07-stage-a-plus-knowledge-recall.md`
- Modify: `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`

- [ ] **Step 1: Create the Stage A+ barrel export**

Create `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/index.ts`:

```ts
export * from "@/server/modules/analysis/pipelines/evidence-review/stageAPlus/types";
export * from "@/server/modules/analysis/pipelines/evidence-review/stageAPlus/knowledge-adapter";
export * from "@/server/modules/analysis/pipelines/evidence-review/stageAPlus/rule-recall";
export * from "@/server/modules/analysis/pipelines/evidence-review/stageAPlus/relation-normalization";
export * from "@/server/modules/analysis/pipelines/evidence-review/stageAPlus/repository";
export * from "@/server/modules/analysis/pipelines/evidence-review/stageAPlus/claim-persister";
export * from "@/server/modules/analysis/pipelines/evidence-review/stageAPlus/KnowledgeRecallStage";
```

- [ ] **Step 2: Run the focused T07 test suite**

Run:

```bash
pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stageAPlus --coverage=false
```

Expected: PASS.

- [ ] **Step 3: Run related claim contract tests**

Run:

```bash
pnpm exec vitest run src/server/modules/analysis/claims/claim-repository.test.ts src/server/modules/analysis/claims/claim-write-service.test.ts --coverage=false
```

Expected: PASS.

- [ ] **Step 4: Run type check**

Run:

```bash
pnpm type-check
```

Expected: PASS.

- [ ] **Step 5: Run focused lint**

Run:

```bash
pnpm exec eslint src/server/modules/analysis/pipelines/evidence-review/stageAPlus src/server/modules/analysis/claims/claim-repository.ts
```

Expected: PASS or no lint errors. If the project does not expose ESLint in this way, record the exact command failure and rely on `pnpm type-check` plus Vitest.

- [ ] **Step 6: Update the T07 task execution record**

After validation passes, update `docs/superpowers/tasks/2026-04-18-evidence-review/07-stage-a-plus-knowledge-recall.md`:

```md
## Execution Record

- Completed on 2026-04-19.
- Implemented `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/**`.
- Stage A+ loads scoped KB v2 with pending hints, writes `RULE` mention/alias/relation claims through T03 contracts, records rule-only T04 stage metrics, and does not write final projections.
- Validation:
  - `pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stageAPlus --coverage=false`
  - `pnpm exec vitest run src/server/modules/analysis/claims/claim-repository.test.ts src/server/modules/analysis/claims/claim-write-service.test.ts --coverage=false`
  - `pnpm type-check`
```

Change all T07 execution checkpoints and acceptance criteria to checked boxes only after the commands above pass.

- [ ] **Step 7: Update the superpowers-only runbook**

In `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`, change the T07 checklist item from:

```md
- [ ] T07: `docs/superpowers/tasks/2026-04-18-evidence-review/07-stage-a-plus-knowledge-recall.md`
```

to:

```md
- [x] T07: `docs/superpowers/tasks/2026-04-18-evidence-review/07-stage-a-plus-knowledge-recall.md`
```

Append a completion record:

```md
### T07 Stage A+ Knowledge Recall Completion - 2026-04-19

- Implemented Stage A+ rule and KB v2 recall under `src/server/modules/analysis/pipelines/evidence-review/stageAPlus`.
- Outputs remain review-native claims only: `ENTITY_MENTION`, `ALIAS`, and derived `RELATION` claims with `source: "RULE"`.
- Negative alias and relation knowledge are explicit `CONFLICTED` review objects.
- `PENDING` KB is surfaced only as low-confidence hints with `KB_PENDING_HINT` notes.
- Stage A+ records cost-free rule metrics through `analysis_stage_runs` and `llm_raw_outputs`.
- Validation commands:
  - `pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stageAPlus --coverage=false`
  - `pnpm exec vitest run src/server/modules/analysis/claims/claim-repository.test.ts src/server/modules/analysis/claims/claim-write-service.test.ts --coverage=false`
  - `pnpm type-check`
- Follow-up risks: T18 still owns relation catalog governance and review UI relation type management; T19 still owns skip/rerun policies; T08 must consume Stage A+ alias and mention hints during identity resolution.
- Next task: T18 `docs/superpowers/tasks/2026-04-18-evidence-review/18-relation-types-catalog.md`
```

- [ ] **Step 8: Commit Task 8**

```bash
git add src/server/modules/analysis/pipelines/evidence-review/stageAPlus/index.ts docs/superpowers/tasks/2026-04-18-evidence-review/07-stage-a-plus-knowledge-recall.md docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md
git commit -m "docs: record t07 stage-a-plus completion"
```

## Full Validation Matrix

- Claim stage/family ownership:

```bash
pnpm exec vitest run src/server/modules/analysis/claims/claim-repository.test.ts src/server/modules/analysis/claims/claim-write-service.test.ts --coverage=false
```

- Stage A+ focused tests:

```bash
pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stageAPlus --coverage=false
```

- T05/T06 regression guard:

```bash
pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stage0 src/server/modules/analysis/pipelines/evidence-review/stageA --coverage=false
```

- Type check:

```bash
pnpm type-check
```

- Focused lint:

```bash
pnpm exec eslint src/server/modules/analysis/pipelines/evidence-review/stageAPlus src/server/modules/analysis/claims/claim-repository.ts
```

## Self-Review

- Spec coverage: §7.3 is covered by Tasks 3-7; §9/§9.4/§9.5 are covered by KB v2 loading, pending/verified handling, and negative knowledge claims; §10 is covered by T04 stage-run integration; §11 cost control is covered by rule-only zero-token execution.
- Output discipline: all writes go through claim contracts; no projection tables are touched; negative knowledge is explicit; relation labels are preserved.
- Type consistency: `relationTypeKey` remains string; `relationTypeSource` remains enum-backed; `Stage A+` stage key matches existing `CLAIM_STAGE_KEYS`.
- Intentional deferrals: relation catalog CRUD belongs to T18; Stage B consumption belongs to T08; rerun skip policies belong to T19; review UI consumption belongs to T12/T14.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-19-t07-stage-a-plus-knowledge-recall-implementation-plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** - Dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
