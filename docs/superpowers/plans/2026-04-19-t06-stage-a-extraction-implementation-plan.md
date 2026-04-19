# T06 Stage A Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement per-chapter Stage A AI extraction on top of persisted Stage 0 segments so one chapter can produce evidence-backed mention, time, event, and relation claims while retaining raw prompt/response, parse/schema failures, and discard summaries.

**Architecture:** Add a new `analysis/pipelines/evidence-review/stageA` module that keeps Stage A strictly chapter-scoped: prompt from persisted `chapter_segments`, parse raw JSON conservatively, materialize evidence spans locally from `segmentIndex + quotedText`, normalize to T03 claim drafts, and persist stage-owned claim families idempotently for a single chapter/run scope. Keep persona creation and identity resolution out of Stage A entirely; unresolved references become explicit discard records instead of speculative writes.

**Tech Stack:** TypeScript strict, Vitest, Zod, Prisma 7 generated client, existing T02 evidence helpers, existing T03 claim contracts, existing T04 stage run/raw output services, existing AI provider factory and `AiCallExecutor`

---

## Source Of Truth

- Architecture spec: `docs/superpowers/specs/2026-04-18-evidence-review-architecture-rewrite-design.md`
- Task doc: `docs/superpowers/tasks/2026-04-18-evidence-review/06-stage-a-extraction.md`
- Runbook: `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`
- Prior execution plan: `docs/superpowers/plans/2026-04-19-t05-stage-0-segmentation-implementation-plan.md`
- Upstream modules:
- `src/server/modules/analysis/pipelines/evidence-review/stage0/repository.ts`
- `src/server/modules/analysis/evidence/evidence-spans.ts`
- `src/server/modules/analysis/evidence/offset-map.ts`
- `src/server/modules/analysis/claims/claim-schemas.ts`
- `src/server/modules/analysis/claims/claim-repository.ts`
- `src/server/modules/analysis/services/AiCallExecutor.ts`
- `src/server/providers/ai/index.ts`
- `src/server/modules/analysis/services/helpers/chunk-utils.ts`
- `src/server/modules/analysis/runs/stage-run-service.ts`

## Scope Constraints

- Do not create `personas`, `persona_candidates`, alias claims, identity resolution claims, conflicts, projections, or review UI in T06.
- Do not reuse legacy `threestage/stageA` code as the new source of truth. The new runtime lives only under `src/server/modules/analysis/pipelines/evidence-review/stageA`.
- Do not ask the model to emit raw offsets. Stage A prompt must use `segmentIndex + quotedText`, and local code must convert that to original offsets.
- Do not persist any claim whose evidence quote cannot be mapped uniquely to a persisted Stage 0 segment.
- Do not silently drop parse errors, schema errors, or unresolved reference errors. They must be traceable through `llm_raw_outputs` and discard summaries.
- Do not modify the already-dirty `src/server/modules/analysis/pipelines/evidence-review/stage0/repository.test.ts`. Add a new focused test file instead.
- Stop if Stage 0 persisted segments are unavailable for the target chapter or if `runId` is null for a persistence path.

## Current Repo Facts

- `stage0/repository.ts` currently exposes `listChapterSegments()`, but it strips `chapter_segments.id`. Stage A needs the persisted segment ID for `evidence_spans.segmentId`.
- `claim-write-service.ts` only returns replacement counts and does not expose created claim IDs. Stage A must resolve mention/time IDs for downstream event/relation binding, so a stage-local persister layer is required.
- `claim-repository.ts` already supports `stage_a_extraction` replacement scopes for `ENTITY_MENTION`, `EVENT`, `RELATION`, and `TIME`.
- `AiCallExecutor.execute()` requires explicit `jobId`, `chapterId`, `PipelineStage`, and a `callFn` that returns structured `data` plus `usage`.
- `stage-run-service.ts` already supports `startStageRun`, `succeedStageRun`, `failStageRun`, and `recordRawOutput`.
- `repairJson()` already exists in `src/types/analysis.ts` and should be reused before JSON parsing.
- The architecture spec and T17 plan already fixed `relationTypeKey` as an open string, not a database enum.

## File Structure

- Modify `src/server/modules/analysis/pipelines/evidence-review/stage0/repository.ts`
  - Responsibility: expose persisted Stage 0 segments including `chapter_segments.id`.
- Create `src/server/modules/analysis/pipelines/evidence-review/stage0/persisted-reader.test.ts`
  - Responsibility: prove the new persisted reader returns `id`, preserves `rawText`, and orders by `segmentIndex`.
- Create `src/server/modules/analysis/pipelines/evidence-review/stageA/types.ts`
  - Responsibility: Stage A constants, raw envelope schema, item schemas, discard record types, normalized draft contracts, and pipeline input/output DTOs.
- Create `src/server/modules/analysis/pipelines/evidence-review/stageA/types.test.ts`
  - Responsibility: prove Stage A contracts, open-string `relationTypeKey`, and discard summary formatting.
- Create `src/server/modules/analysis/pipelines/evidence-review/stageA/prompt-contracts.ts`
  - Responsibility: build the Stage A prompt from persisted chapter segments and make the JSON contract explicit.
- Create `src/server/modules/analysis/pipelines/evidence-review/stageA/prompt-contracts.test.ts`
  - Responsibility: prove the prompt requires conservative extraction, `segmentIndex`, `quotedText`, and no persona creation.
- Create `src/server/modules/analysis/pipelines/evidence-review/stageA/claim-normalizer.ts`
  - Responsibility: item-level schema validation, quote-to-offset resolution, evidence span materialization, and conversion into validated T03 claim drafts plus discard records.
- Create `src/server/modules/analysis/pipelines/evidence-review/stageA/claim-normalizer.test.ts`
  - Responsibility: prove unique quote mapping, per-item schema discards, and open-string relation handling.
- Create `src/server/modules/analysis/pipelines/evidence-review/stageA/claim-persister.ts`
  - Responsibility: idempotent chapter-scope persistence for Stage A families, mention/time ID binding, and unresolved-ref discards.
- Create `src/server/modules/analysis/pipelines/evidence-review/stageA/claim-persister.test.ts`
  - Responsibility: prove clear-and-replace behavior, ID binding, and unresolved-ref discards.
- Create `src/server/modules/analysis/pipelines/evidence-review/stageA/StageAExtractionPipeline.ts`
  - Responsibility: orchestrate persisted-segment read, prompt build, AI call, raw output retention, normalization, persistence, and T04 stage-run lifecycle.
- Create `src/server/modules/analysis/pipelines/evidence-review/stageA/StageAExtractionPipeline.test.ts`
  - Responsibility: prove happy path, invalid JSON retention, and missing Stage 0 segment failure handling.
- Create `src/server/modules/analysis/pipelines/evidence-review/stageA/index.ts`
  - Responsibility: barrel export for T07 and later tasks.
- Modify `docs/superpowers/tasks/2026-04-18-evidence-review/06-stage-a-extraction.md`
  - Responsibility: execution record and final checklist state after validation passes.
- Modify `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`
  - Responsibility: mark T06 complete and append completion record after validation passes.

## Modeling Decisions

- Stage A prompt contract uses chapter-local JSON with four arrays: `mentions`, `times`, `events`, `relations`. Arrays default to empty; per-item validation happens inside the normalizer so one malformed item does not poison the whole chapter.
- Stage A evidence contract is `{ segmentIndex, quotedText }`. The model never emits offsets.
- `quotedText` must map uniquely within the chosen persisted segment after evidence normalization. Zero matches or multiple matches both become discard records.
- Mention and time drafts are validated and made persistence-ready during normalization.
- Event and relation drafts are also validated during normalization, but their mention/time foreign keys stay `null` until the Stage A persister resolves local refs created in the same chapter batch.
- `relationTypeSource` is set locally to `"CUSTOM"` in Stage A. T07/T18 may later normalize it to a preset or catalog-backed value, but T06 preserves what the model extracted.
- Stage A stage-run key is `stage_a_extraction`, and the AI executor stage is `PipelineStage.INDEPENDENT_EXTRACTION`.
- Prompt version is explicit and hashed into the stage input hash so T19 can later implement skip/rerun policies safely.

## Task 1: Extend Stage 0 Persisted Segment Read Contract

**Files:**
- Create: `src/server/modules/analysis/pipelines/evidence-review/stage0/persisted-reader.test.ts`
- Modify: `src/server/modules/analysis/pipelines/evidence-review/stage0/repository.ts`

- [ ] **Step 1: Write the failing persisted-reader test**

Create `src/server/modules/analysis/pipelines/evidence-review/stage0/persisted-reader.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { createStage0SegmentRepository } from "@/server/modules/analysis/pipelines/evidence-review/stage0/repository";

describe("Stage 0 persisted reader", () => {
  it("returns persisted segment ids while preserving Stage 0 draft fields", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id            : "segment-1",
        bookId        : "book-1",
        chapterId     : "chapter-1",
        runId         : "run-1",
        segmentIndex  : 0,
        segmentType   : "DIALOGUE_LEAD",
        startOffset   : 0,
        endOffset     : 4,
        text          : "王冕道：",
        normalizedText: "王冕道：",
        confidence    : 0.95,
        speakerHint   : "王冕"
      },
      {
        id            : "segment-2",
        bookId        : "book-1",
        chapterId     : "chapter-1",
        runId         : "run-1",
        segmentIndex  : 1,
        segmentType   : "DIALOGUE_CONTENT",
        startOffset   : 4,
        endOffset     : 11,
        text          : "“明日再谈。”",
        normalizedText: "“明日再谈。”",
        confidence    : 0.95,
        speakerHint   : "王冕"
      }
    ]);

    const repository = createStage0SegmentRepository({
      chapterSegment: {
        deleteMany : vi.fn(),
        createMany : vi.fn(),
        findMany
      }
    });

    await expect(repository.listPersistedChapterSegments({
      runId    : "run-1",
      chapterId: "chapter-1"
    })).resolves.toEqual([
      {
        id            : "segment-1",
        bookId        : "book-1",
        chapterId     : "chapter-1",
        runId         : "run-1",
        segmentIndex  : 0,
        segmentType   : "DIALOGUE_LEAD",
        startOffset   : 0,
        endOffset     : 4,
        rawText       : "王冕道：",
        normalizedText: "王冕道：",
        confidence    : 0.95,
        speakerHint   : "王冕"
      },
      {
        id            : "segment-2",
        bookId        : "book-1",
        chapterId     : "chapter-1",
        runId         : "run-1",
        segmentIndex  : 1,
        segmentType   : "DIALOGUE_CONTENT",
        startOffset   : 4,
        endOffset     : 11,
        rawText       : "“明日再谈。”",
        normalizedText: "“明日再谈。”",
        confidence    : 0.95,
        speakerHint   : "王冕"
      }
    ]);

    expect(findMany).toHaveBeenCalledWith({
      where: {
        runId    : "run-1",
        chapterId: "chapter-1"
      },
      orderBy: { segmentIndex: "asc" }
    });
  });
});
```

- [ ] **Step 2: Run the persisted-reader test to verify it fails**

Run:

```bash
pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stage0/persisted-reader.test.ts --coverage=false
```

Expected: FAIL because `listPersistedChapterSegments` does not exist yet and `findMany` rows do not include `id` in the repository contract.

- [ ] **Step 3: Implement the persisted reader in the Stage 0 repository**

Replace `src/server/modules/analysis/pipelines/evidence-review/stage0/repository.ts` with:

```ts
import type { ChapterSegmentType } from "@/generated/prisma/enums";
import { prisma } from "@/server/db/prisma";
import type { Stage0SegmentDraft } from "@/server/modules/analysis/pipelines/evidence-review/stage0/types";

interface ChapterSegmentRow {
  id: string;
  bookId: string;
  chapterId: string;
  runId: string;
  segmentIndex: number;
  segmentType: ChapterSegmentType;
  startOffset: number;
  endOffset: number;
  text: string;
  normalizedText: string;
  confidence: number;
  speakerHint: string | null;
}

interface ChapterSegmentCreateManyDelegate {
  deleteMany(args: {
    where: { runId: string; chapterId: string };
  }): Promise<{ count: number }>;
  createMany(args: {
    data: Array<{
      bookId: string;
      chapterId: string;
      runId: string;
      segmentIndex: number;
      segmentType: ChapterSegmentType;
      startOffset: number;
      endOffset: number;
      text: string;
      normalizedText: string;
      confidence: number;
      speakerHint: string | null;
    }>;
    skipDuplicates: false;
  }): Promise<{ count: number }>;
  findMany(args: {
    where: { runId: string; chapterId: string };
    orderBy: { segmentIndex: "asc" };
  }): Promise<ChapterSegmentRow[]>;
}

export interface Stage0SegmentRepositoryClient {
  chapterSegment: ChapterSegmentCreateManyDelegate;
}

export interface PersistedStage0Segment extends Stage0SegmentDraft {
  id: string;
}

export interface ReplaceChapterSegmentsInput {
  runId: string;
  chapterId: string;
  segments: Stage0SegmentDraft[];
}

export interface ReplaceChapterSegmentsResult {
  deletedCount: number;
  createdCount: number;
}

export interface ListChapterSegmentsInput {
  runId: string;
  chapterId: string;
}

function toCreateRow(segment: Stage0SegmentDraft) {
  return {
    bookId        : segment.bookId,
    chapterId     : segment.chapterId,
    runId         : segment.runId,
    segmentIndex  : segment.segmentIndex,
    segmentType   : segment.segmentType as ChapterSegmentType,
    startOffset   : segment.startOffset,
    endOffset     : segment.endOffset,
    text          : segment.rawText,
    normalizedText: segment.normalizedText,
    confidence    : segment.confidence,
    speakerHint   : segment.speakerHint
  };
}

function toPersistedSegment(row: ChapterSegmentRow): PersistedStage0Segment {
  return {
    id            : row.id,
    bookId        : row.bookId,
    chapterId     : row.chapterId,
    runId         : row.runId,
    segmentIndex  : row.segmentIndex,
    segmentType   : row.segmentType,
    startOffset   : row.startOffset,
    endOffset     : row.endOffset,
    rawText       : row.text,
    normalizedText: row.normalizedText,
    confidence    : row.confidence,
    speakerHint   : row.speakerHint
  };
}

function toSegmentDraft(row: ChapterSegmentRow): Stage0SegmentDraft {
  const { id: _id, ...segment } = toPersistedSegment(row);
  return segment;
}

export function createStage0SegmentRepository(
  client: Stage0SegmentRepositoryClient = prisma
) {
  async function replaceChapterSegmentsForRun(
    input: ReplaceChapterSegmentsInput
  ): Promise<ReplaceChapterSegmentsResult> {
    const deleted = await client.chapterSegment.deleteMany({
      where: {
        runId    : input.runId,
        chapterId: input.chapterId
      }
    });

    if (input.segments.length === 0) {
      return {
        deletedCount: deleted.count,
        createdCount: 0
      };
    }

    const created = await client.chapterSegment.createMany({
      data          : input.segments.map(toCreateRow),
      skipDuplicates: false
    });

    return {
      deletedCount: deleted.count,
      createdCount: created.count
    };
  }

  async function listPersistedChapterSegments(
    input: ListChapterSegmentsInput
  ): Promise<PersistedStage0Segment[]> {
    const rows = await client.chapterSegment.findMany({
      where: {
        runId    : input.runId,
        chapterId: input.chapterId
      },
      orderBy: { segmentIndex: "asc" }
    });

    return rows.map(toPersistedSegment);
  }

  async function listChapterSegments(
    input: ListChapterSegmentsInput
  ): Promise<Stage0SegmentDraft[]> {
    const rows = await client.chapterSegment.findMany({
      where: {
        runId    : input.runId,
        chapterId: input.chapterId
      },
      orderBy: { segmentIndex: "asc" }
    });

    return rows.map(toSegmentDraft);
  }

  return {
    replaceChapterSegmentsForRun,
    listPersistedChapterSegments,
    listChapterSegments
  };
}

export type Stage0SegmentRepository = ReturnType<typeof createStage0SegmentRepository>;

export const stage0SegmentRepository = createStage0SegmentRepository();
```

- [ ] **Step 4: Run the persisted-reader test to verify it passes**

Run:

```bash
pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stage0/persisted-reader.test.ts --coverage=false
```

Expected: PASS.

- [ ] **Step 5: Commit the Stage 0 reader contract**

```bash
git add src/server/modules/analysis/pipelines/evidence-review/stage0/repository.ts src/server/modules/analysis/pipelines/evidence-review/stage0/persisted-reader.test.ts
git commit -m "feat: expose persisted stage0 segments for stage a"
```

## Task 2: Define Stage A Types And Prompt Contract

**Files:**
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageA/types.test.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageA/types.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageA/prompt-contracts.test.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageA/prompt-contracts.ts`

- [ ] **Step 1: Write the failing Stage A contract tests**

Create `src/server/modules/analysis/pipelines/evidence-review/stageA/types.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  STAGE_A_PIPELINE_STAGE,
  STAGE_A_PROMPT_VERSION,
  STAGE_A_STAGE_KEY,
  stageARawEnvelopeSchema,
  stageARelationItemSchema,
  summarizeStageADiscards
} from "@/server/modules/analysis/pipelines/evidence-review/stageA/types";
import { PipelineStage } from "@/types/pipeline";

describe("Stage A type contracts", () => {
  it("keeps the stage constants stable", () => {
    expect(STAGE_A_STAGE_KEY).toBe("stage_a_extraction");
    expect(STAGE_A_PIPELINE_STAGE).toBe(PipelineStage.INDEPENDENT_EXTRACTION);
    expect(STAGE_A_PROMPT_VERSION).toBe("2026-04-19-stage-a-v1");
  });

  it("defaults the raw envelope arrays to empty", () => {
    expect(stageARawEnvelopeSchema.parse({})).toEqual({
      mentions : [],
      times    : [],
      events   : [],
      relations: []
    });
  });

  it("keeps relationTypeKey open for custom strings", () => {
    const parsed = stageARelationItemSchema.parse({
      relationRef       : "relation-1",
      sourceMentionRef  : "mention-1",
      targetMentionRef  : "mention-2",
      relationTypeKey   : "political_patron_of",
      relationLabel     : "政治庇护",
      direction         : "FORWARD",
      effectiveChapterStart: null,
      effectiveChapterEnd  : null,
      confidence        : 0.72,
      evidence          : {
        segmentIndex: 3,
        quotedText  : "荐其为吏"
      }
    });

    expect(parsed.relationTypeKey).toBe("political_patron_of");
    expect(parsed.relationLabel).toBe("政治庇护");
  });

  it("summarizes discard codes deterministically", () => {
    expect(summarizeStageADiscards([
      { kind: "MENTION", ref: "m1", code: "QUOTE_NOT_FOUND", message: "missing" },
      { kind: "EVENT", ref: "e1", code: "UNRESOLVED_MENTION_REF", message: "missing subject" },
      { kind: "RELATION", ref: "r1", code: "QUOTE_NOT_FOUND", message: "missing relation quote" }
    ])).toBe("QUOTE_NOT_FOUND:2, UNRESOLVED_MENTION_REF:1");
  });
});
```

Create `src/server/modules/analysis/pipelines/evidence-review/stageA/prompt-contracts.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { buildStageAExtractionPrompt } from "@/server/modules/analysis/pipelines/evidence-review/stageA/prompt-contracts";

describe("Stage A prompt contracts", () => {
  it("requires conservative evidence-backed extraction from persisted segments", () => {
    const prompt = buildStageAExtractionPrompt({
      bookId      : "book-1",
      chapterId   : "chapter-1",
      chapterNo   : 1,
      chapterTitle: "第一回",
      chapterText : "王冕道：“明日再谈。”次日秦老来访。",
      segments    : [
        {
          id            : "segment-1",
          bookId        : "book-1",
          chapterId     : "chapter-1",
          runId         : "run-1",
          segmentIndex  : 0,
          segmentType   : "DIALOGUE_LEAD",
          startOffset   : 0,
          endOffset     : 4,
          rawText       : "王冕道：",
          normalizedText: "王冕道：",
          confidence    : 0.95,
          speakerHint   : "王冕"
        },
        {
          id            : "segment-2",
          bookId        : "book-1",
          chapterId     : "chapter-1",
          runId         : "run-1",
          segmentIndex  : 1,
          segmentType   : "DIALOGUE_CONTENT",
          startOffset   : 4,
          endOffset     : 11,
          rawText       : "“明日再谈。”",
          normalizedText: "“明日再谈。”",
          confidence    : 0.95,
          speakerHint   : "王冕"
        }
      ]
    });

    expect(prompt.system).toContain("不要创建正式 persona");
    expect(prompt.system).toContain("\"segmentIndex\"");
    expect(prompt.system).toContain("\"quotedText\"");
    expect(prompt.system).toContain("如果证据无法唯一定位，就不要输出该条");
    expect(prompt.user).toContain("PromptVersion: 2026-04-19-stage-a-v1");
    expect(prompt.user).toContain("[0] DIALOGUE_LEAD");
    expect(prompt.user).toContain("王冕道：");
    expect(prompt.user).toContain("relationTypeKey");
  });
});
```

- [ ] **Step 2: Run the Stage A contract tests to verify they fail**

Run:

```bash
pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stageA/types.test.ts src/server/modules/analysis/pipelines/evidence-review/stageA/prompt-contracts.test.ts --coverage=false
```

Expected: FAIL because the `stageA` module does not exist yet.

- [ ] **Step 3: Implement Stage A types and schemas**

Create `src/server/modules/analysis/pipelines/evidence-review/stageA/types.ts`:

```ts
import { z } from "zod";

import {
  AliasType,
  BioCategory,
  IdentityClaim,
  MentionKind,
  NarrativeLens,
  TimeType
} from "@/generated/prisma/enums";
import { relationDirectionSchema } from "@/server/modules/analysis/claims/base-types";
import type { ClaimDraftByFamily } from "@/server/modules/analysis/claims/claim-schemas";
import type { PersistedStage0Segment } from "@/server/modules/analysis/pipelines/evidence-review/stage0/repository";
import { PipelineStage } from "@/types/pipeline";

export const STAGE_A_STAGE_KEY = "stage_a_extraction";
export const STAGE_A_PIPELINE_STAGE = PipelineStage.INDEPENDENT_EXTRACTION;
export const STAGE_A_PROMPT_VERSION = "2026-04-19-stage-a-v1";

const confidenceSchema = z.number().finite().min(0).max(1);
const localRefSchema = z.string().trim().min(1);
const nullableRefSchema = localRefSchema.nullable().default(null);
const nullableTrimmedTextSchema = z.string().trim().min(1).nullable().default(null);
const nullablePositiveIntSchema = z.number().int().positive().nullable().default(null);

export const stageAEvidenceReferenceSchema = z.object({
  segmentIndex: z.number().int().nonnegative(),
  quotedText  : z.string().trim().min(1)
});

export const stageAMentionItemSchema = z.object({
  mentionRef   : localRefSchema,
  surfaceText  : z.string().trim().min(1),
  mentionKind  : z.nativeEnum(MentionKind),
  identityClaim: z.nativeEnum(IdentityClaim).nullable().default(null),
  aliasTypeHint: z.nativeEnum(AliasType).nullable().default(null),
  confidence   : confidenceSchema,
  evidence     : stageAEvidenceReferenceSchema
});

export const stageATimeItemSchema = z.object({
  timeRef             : localRefSchema,
  rawTimeText         : z.string().trim().min(1),
  timeType            : z.nativeEnum(TimeType),
  normalizedLabel     : z.string().trim().min(1),
  relativeOrderWeight : z.number().finite().nullable().default(null),
  chapterRangeStart   : nullablePositiveIntSchema,
  chapterRangeEnd     : nullablePositiveIntSchema,
  confidence          : confidenceSchema,
  evidence            : stageAEvidenceReferenceSchema
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

export const stageAEventItemSchema = z.object({
  eventRef          : localRefSchema,
  subjectMentionRef : nullableRefSchema,
  predicate         : z.string().trim().min(1).max(120),
  objectText        : nullableTrimmedTextSchema,
  locationText      : nullableTrimmedTextSchema,
  timeRef           : nullableRefSchema,
  eventCategory     : z.nativeEnum(BioCategory),
  narrativeLens     : z.nativeEnum(NarrativeLens),
  confidence        : confidenceSchema,
  evidence          : stageAEvidenceReferenceSchema
});

export const stageARelationItemSchema = z.object({
  relationRef          : localRefSchema,
  sourceMentionRef     : nullableRefSchema,
  targetMentionRef     : nullableRefSchema,
  relationTypeKey      : z.string().trim().min(1),
  relationLabel        : z.string().trim().min(1),
  direction            : relationDirectionSchema,
  effectiveChapterStart: nullablePositiveIntSchema,
  effectiveChapterEnd  : nullablePositiveIntSchema,
  timeRef              : nullableRefSchema,
  confidence           : confidenceSchema,
  evidence             : stageAEvidenceReferenceSchema
}).superRefine((value, ctx) => {
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

export const stageARawEnvelopeSchema = z.object({
  mentions : z.array(z.unknown()).default([]),
  times    : z.array(z.unknown()).default([]),
  events   : z.array(z.unknown()).default([]),
  relations: z.array(z.unknown()).default([])
});

export type StageARawEnvelope = z.infer<typeof stageARawEnvelopeSchema>;
export type StageAMentionItem = z.infer<typeof stageAMentionItemSchema>;
export type StageATimeItem = z.infer<typeof stageATimeItemSchema>;
export type StageAEventItem = z.infer<typeof stageAEventItemSchema>;
export type StageARelationItem = z.infer<typeof stageARelationItemSchema>;

export type StageAClaimKind = "MENTION" | "TIME" | "EVENT" | "RELATION";

export type StageADiscardCode =
  | "SCHEMA_VALIDATION"
  | "SEGMENT_INDEX_OUT_OF_RANGE"
  | "QUOTE_NOT_FOUND"
  | "QUOTE_NOT_UNIQUE"
  | "EVIDENCE_VALIDATION_FAILED"
  | "UNRESOLVED_MENTION_REF"
  | "UNRESOLVED_TIME_REF";

export interface StageADiscardRecord {
  kind: StageAClaimKind;
  ref: string;
  code: StageADiscardCode;
  message: string;
}

export interface StageANormalizedClaim<TFamily extends "ENTITY_MENTION" | "TIME"> {
  ref: string;
  draft: ClaimDraftByFamily[TFamily];
}

export interface StageAPendingEventClaim {
  ref: string;
  subjectMentionRef: string | null;
  timeRef: string | null;
  draft: ClaimDraftByFamily["EVENT"];
}

export interface StageAPendingRelationClaim {
  ref: string;
  sourceMentionRef: string | null;
  targetMentionRef: string | null;
  timeRef: string | null;
  draft: ClaimDraftByFamily["RELATION"];
}

export interface StageANormalizedExtraction {
  mentionClaims: Array<StageANormalizedClaim<"ENTITY_MENTION">>;
  timeClaims: Array<StageANormalizedClaim<"TIME">>;
  pendingEventClaims: StageAPendingEventClaim[];
  pendingRelationClaims: StageAPendingRelationClaim[];
  discardRecords: StageADiscardRecord[];
}

export interface StageAPersistResult {
  mentionIdsByRef: Record<string, string>;
  timeIdsByRef: Record<string, string>;
  persistedCounts: {
    mentions: number;
    times: number;
    events: number;
    relations: number;
  };
  discardRecords: StageADiscardRecord[];
}

export interface StageAChapterPromptInput {
  bookId: string;
  chapterId: string;
  chapterNo: number;
  chapterTitle: string;
  chapterText: string;
  segments: PersistedStage0Segment[];
}

export interface StageAExtractionRunInput {
  bookId: string;
  runId: string | null;
  jobId: string;
  attempt?: number;
  chapter: {
    id: string;
    no: number;
    title: string;
    content: string;
  };
}

export interface StageAExtractionRunResult {
  bookId: string;
  chapterId: string;
  runId: string | null;
  stageRunId: string | null;
  rawOutputId: string | null;
  modelId: string | null;
  isFallback: boolean;
  inputCount: number;
  outputCount: number;
  skippedCount: number;
  persistedCounts: {
    mentions: number;
    times: number;
    events: number;
    relations: number;
  };
  discardRecords: StageADiscardRecord[];
}

export function summarizeStageADiscards(
  discards: StageADiscardRecord[]
): string | null {
  if (discards.length === 0) {
    return null;
  }

  const counts = new Map<StageADiscardCode, number>();
  for (const discard of discards) {
    counts.set(discard.code, (counts.get(discard.code) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([code, count]) => `${code}:${count}`)
    .join(", ");
}
```

- [ ] **Step 4: Implement the Stage A prompt builder**

Create `src/server/modules/analysis/pipelines/evidence-review/stageA/prompt-contracts.ts`:

```ts
import type { PromptMessageInput } from "@/types/pipeline";

import {
  STAGE_A_PROMPT_VERSION,
  type StageAChapterPromptInput
} from "@/server/modules/analysis/pipelines/evidence-review/stageA/types";

function renderSegmentLine(input: StageAChapterPromptInput["segments"][number]): string {
  const speakerSuffix = input.speakerHint ? ` speakerHint=${input.speakerHint}` : "";
  return [
    `[${input.segmentIndex}] ${input.segmentType}${speakerSuffix}`,
    input.rawText
  ].join("\n");
}

export function buildStageAExtractionPrompt(
  input: StageAChapterPromptInput
): PromptMessageInput {
  const system = [
    "你是中国古典文学角色图谱项目的逐章证据抽取器。",
    "只依据当前章节和给定 segment 列表抽取结构化结果。",
    "不要创建正式 persona，不要跨章节强行归并身份，不要脑补未被当前章节支持的关系。",
    "如果证据无法唯一定位，就不要输出该条。",
    "输出必须是 JSON，不能带 Markdown 代码块，不能附加解释。",
    "每一条 mention/time/event/relation 都必须携带 evidence，格式固定为 {\"segmentIndex\": number, \"quotedText\": string}。",
    "quotedText 必须是所选 segment 内的原文连续片段。",
    "relationTypeKey 使用开放字符串，推荐 snake_case；relationLabel 保存可读中文标签。",
    "如果某条关系或事件的主语不明确，可以把 subjectMentionRef/sourceMentionRef/targetMentionRef 设为 null，而不是猜测。"
  ].join("\n");

  const user = [
    `PromptVersion: ${STAGE_A_PROMPT_VERSION}`,
    `BookId: ${input.bookId}`,
    `ChapterId: ${input.chapterId}`,
    `ChapterNo: ${input.chapterNo}`,
    `ChapterTitle: ${input.chapterTitle}`,
    "ChapterText:",
    input.chapterText,
    "PersistedSegments:",
    input.segments.map(renderSegmentLine).join("\n\n"),
    "Return JSON shape:",
    [
      "{",
      "  \"mentions\": [",
      "    {",
      "      \"mentionRef\": \"m1\",",
      "      \"surfaceText\": \"王冕\",",
      "      \"mentionKind\": \"NAMED\",",
      "      \"identityClaim\": \"SELF\",",
      "      \"aliasTypeHint\": null,",
      "      \"confidence\": 0.9,",
      "      \"evidence\": { \"segmentIndex\": 0, \"quotedText\": \"王冕\" }",
      "    }",
      "  ],",
      "  \"times\": [",
      "    {",
      "      \"timeRef\": \"t1\",",
      "      \"rawTimeText\": \"次日\",",
      "      \"timeType\": \"RELATIVE_PHASE\",",
      "      \"normalizedLabel\": \"次日\",",
      "      \"relativeOrderWeight\": null,",
      "      \"chapterRangeStart\": null,",
      "      \"chapterRangeEnd\": null,",
      "      \"confidence\": 0.7,",
      "      \"evidence\": { \"segmentIndex\": 2, \"quotedText\": \"次日\" }",
      "    }",
      "  ],",
      "  \"events\": [",
      "    {",
      "      \"eventRef\": \"e1\",",
      "      \"subjectMentionRef\": \"m1\",",
      "      \"predicate\": \"发言\",",
      "      \"objectText\": \"明日再谈\",",
      "      \"locationText\": null,",
      "      \"timeRef\": null,",
      "      \"eventCategory\": \"EVENT\",",
      "      \"narrativeLens\": \"QUOTED\",",
      "      \"confidence\": 0.8,",
      "      \"evidence\": { \"segmentIndex\": 1, \"quotedText\": \"明日再谈\" }",
      "    }",
      "  ],",
      "  \"relations\": [",
      "    {",
      "      \"relationRef\": \"r1\",",
      "      \"sourceMentionRef\": \"m1\",",
      "      \"targetMentionRef\": \"m2\",",
      "      \"relationTypeKey\": \"host_of\",",
      "      \"relationLabel\": \"接待\",",
      "      \"direction\": \"FORWARD\",",
      "      \"effectiveChapterStart\": null,",
      "      \"effectiveChapterEnd\": null,",
      "      \"timeRef\": null,",
      "      \"confidence\": 0.65,",
      "      \"evidence\": { \"segmentIndex\": 2, \"quotedText\": \"秦老来访\" }",
      "    }",
      "  ]",
      "}"
    ].join("\n"),
    "如果没有某类结果，请返回空数组，而不是省略字段。"
  ].join("\n\n");

  return { system, user };
}
```

- [ ] **Step 5: Run the Stage A contract tests to verify they pass**

Run:

```bash
pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stageA/types.test.ts src/server/modules/analysis/pipelines/evidence-review/stageA/prompt-contracts.test.ts --coverage=false
```

Expected: PASS.

- [ ] **Step 6: Commit the Stage A contract layer**

```bash
git add src/server/modules/analysis/pipelines/evidence-review/stageA/types.ts src/server/modules/analysis/pipelines/evidence-review/stageA/types.test.ts src/server/modules/analysis/pipelines/evidence-review/stageA/prompt-contracts.ts src/server/modules/analysis/pipelines/evidence-review/stageA/prompt-contracts.test.ts
git commit -m "feat: define stage a extraction contracts"
```

## Task 3: Implement Stage A Claim Normalizer

**Files:**
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageA/claim-normalizer.test.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageA/claim-normalizer.ts`

- [ ] **Step 1: Write the failing normalizer tests**

Create `src/server/modules/analysis/pipelines/evidence-review/stageA/claim-normalizer.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { createStageAClaimNormalizer } from "@/server/modules/analysis/pipelines/evidence-review/stageA/claim-normalizer";
import type { StageARawEnvelope } from "@/server/modules/analysis/pipelines/evidence-review/stageA/types";

function createEvidenceResolver() {
  const rows: Array<Record<string, unknown>> = [];

  return {
    rows,
    resolver: {
      async findOrCreate(data: {
        bookId: string;
        chapterId: string;
        segmentId: string;
        startOffset: number;
        endOffset: number;
        quotedText: string;
        normalizedText: string;
        speakerHint: string | null;
        narrativeRegionType: string;
        createdByRunId: string;
      }) {
        const existing = rows.find((row) =>
          row.segmentId === data.segmentId
          && row.startOffset === data.startOffset
          && row.endOffset === data.endOffset
          && row.createdByRunId === data.createdByRunId
        );

        if (existing) {
          return existing as {
            id: string;
            bookId: string;
            chapterId: string;
            segmentId: string;
            startOffset: number;
            endOffset: number;
            quotedText: string;
            normalizedText: string;
            speakerHint: string | null;
            narrativeRegionType: string;
            createdByRunId: string;
          };
        }

        const created = {
          id: `evidence-${rows.length + 1}`,
          ...data
        };
        rows.push(created);
        return created;
      }
    }
  };
}

describe("Stage A claim normalizer", () => {
  it("materializes unique evidence and produces validated drafts", async () => {
    const evidenceStore = createEvidenceResolver();
    const normalizer = createStageAClaimNormalizer({
      evidenceResolver: evidenceStore.resolver
    });

    const result = await normalizer.normalizeChapterExtraction({
      bookId    : "book-1",
      chapterId : "chapter-1",
      chapterNo : 1,
      runId     : "run-1",
      chapterText: "王冕道：“明日再谈。”次日秦老来访。",
      segments  : [
        {
          id            : "segment-1",
          bookId        : "book-1",
          chapterId     : "chapter-1",
          runId         : "run-1",
          segmentIndex  : 0,
          segmentType   : "DIALOGUE_LEAD",
          startOffset   : 0,
          endOffset     : 4,
          rawText       : "王冕道：",
          normalizedText: "王冕道：",
          confidence    : 0.95,
          speakerHint   : "王冕"
        },
        {
          id            : "segment-2",
          bookId        : "book-1",
          chapterId     : "chapter-1",
          runId         : "run-1",
          segmentIndex  : 1,
          segmentType   : "DIALOGUE_CONTENT",
          startOffset   : 4,
          endOffset     : 11,
          rawText       : "“明日再谈。”",
          normalizedText: "“明日再谈。”",
          confidence    : 0.95,
          speakerHint   : "王冕"
        },
        {
          id            : "segment-3",
          bookId        : "book-1",
          chapterId     : "chapter-1",
          runId         : "run-1",
          segmentIndex  : 2,
          segmentType   : "NARRATIVE",
          startOffset   : 11,
          endOffset     : 18,
          rawText       : "次日秦老来访。",
          normalizedText: "次日秦老来访。",
          confidence    : 0.95,
          speakerHint   : null
        }
      ],
      envelope: {
        mentions: [
          {
            mentionRef : "m1",
            surfaceText: "王冕",
            mentionKind: "NAMED",
            confidence : 0.9,
            evidence   : { segmentIndex: 0, quotedText: "王冕" }
          },
          {
            mentionRef : "m2",
            surfaceText: "秦老",
            mentionKind: "NAMED",
            confidence : 0.85,
            evidence   : { segmentIndex: 2, quotedText: "秦老" }
          }
        ],
        times: [
          {
            timeRef         : "t1",
            rawTimeText     : "次日",
            timeType        : "RELATIVE_PHASE",
            normalizedLabel : "次日",
            confidence      : 0.7,
            evidence        : { segmentIndex: 2, quotedText: "次日" }
          }
        ],
        events: [
          {
            eventRef         : "e1",
            subjectMentionRef: "m1",
            predicate        : "发言",
            objectText       : "明日再谈",
            narrativeLens    : "QUOTED",
            eventCategory    : "EVENT",
            confidence       : 0.8,
            evidence         : { segmentIndex: 1, quotedText: "明日再谈" }
          }
        ],
        relations: [
          {
            relationRef         : "r1",
            sourceMentionRef    : "m1",
            targetMentionRef    : "m2",
            relationTypeKey     : "host_of",
            relationLabel       : "接待",
            direction           : "FORWARD",
            confidence          : 0.65,
            evidence            : { segmentIndex: 2, quotedText: "秦老来访" }
          }
        ]
      } satisfies StageARawEnvelope
    });

    expect(result.mentionClaims).toHaveLength(2);
    expect(result.timeClaims).toHaveLength(1);
    expect(result.pendingEventClaims).toHaveLength(1);
    expect(result.pendingRelationClaims).toHaveLength(1);
    expect(result.pendingEventClaims[0].subjectMentionRef).toBe("m1");
    expect(result.pendingRelationClaims[0].draft.relationTypeSource).toBe("CUSTOM");
    expect(result.discardRecords).toEqual([]);
    expect(evidenceStore.rows).toHaveLength(5);
  });

  it("discards items when quotedText is not unique inside the selected segment", async () => {
    const normalizer = createStageAClaimNormalizer({
      evidenceResolver: createEvidenceResolver().resolver
    });

    const result = await normalizer.normalizeChapterExtraction({
      bookId    : "book-1",
      chapterId : "chapter-1",
      chapterNo : 1,
      runId     : "run-1",
      chapterText: "众人皆道：“好。”又道：“好。”",
      segments  : [
        {
          id            : "segment-1",
          bookId        : "book-1",
          chapterId     : "chapter-1",
          runId         : "run-1",
          segmentIndex  : 0,
          segmentType   : "DIALOGUE_CONTENT",
          startOffset   : 0,
          endOffset     : 16,
          rawText       : "众人皆道：“好。”又道：“好。”",
          normalizedText: "众人皆道：“好。”又道：“好。”",
          confidence    : 0.95,
          speakerHint   : null
        }
      ],
      envelope: {
        mentions: [
          {
            mentionRef : "m1",
            surfaceText: "好",
            mentionKind: "UNKNOWN",
            confidence : 0.2,
            evidence   : { segmentIndex: 0, quotedText: "好" }
          }
        ],
        times    : [],
        events   : [],
        relations: []
      }
    });

    expect(result.mentionClaims).toEqual([]);
    expect(result.discardRecords).toEqual([
      {
        kind   : "MENTION",
        ref    : "m1",
        code   : "QUOTE_NOT_UNIQUE",
        message: expect.stringContaining("quotedText is not unique")
      }
    ]);
  });

  it("performs item-level schema validation without dropping the whole chapter", async () => {
    const normalizer = createStageAClaimNormalizer({
      evidenceResolver: createEvidenceResolver().resolver
    });

    const result = await normalizer.normalizeChapterExtraction({
      bookId    : "book-1",
      chapterId : "chapter-1",
      chapterNo : 1,
      runId     : "run-1",
      chapterText: "王冕道：“明日再谈。”",
      segments  : [
        {
          id            : "segment-1",
          bookId        : "book-1",
          chapterId     : "chapter-1",
          runId         : "run-1",
          segmentIndex  : 0,
          segmentType   : "DIALOGUE_LEAD",
          startOffset   : 0,
          endOffset     : 4,
          rawText       : "王冕道：",
          normalizedText: "王冕道：",
          confidence    : 0.95,
          speakerHint   : "王冕"
        },
        {
          id            : "segment-2",
          bookId        : "book-1",
          chapterId     : "chapter-1",
          runId         : "run-1",
          segmentIndex  : 1,
          segmentType   : "DIALOGUE_CONTENT",
          startOffset   : 4,
          endOffset     : 11,
          rawText       : "“明日再谈。”",
          normalizedText: "“明日再谈。”",
          confidence    : 0.95,
          speakerHint   : "王冕"
        }
      ],
      envelope: {
        mentions: [
          {
            mentionRef : "m1",
            surfaceText: "王冕",
            mentionKind: "NAMED",
            confidence : 0.9,
            evidence   : { segmentIndex: 0, quotedText: "王冕" }
          }
        ],
        times : [],
        events: [],
        relations: [
          {
            relationRef      : "r1",
            sourceMentionRef : "m1",
            targetMentionRef : "m2",
            relationTypeKey  : "friend_of",
            direction        : "FORWARD",
            confidence       : 0.5,
            evidence         : { segmentIndex: 1, quotedText: "明日再谈" }
          }
        ]
      }
    });

    expect(result.mentionClaims).toHaveLength(1);
    expect(result.pendingRelationClaims).toEqual([]);
    expect(result.discardRecords).toEqual([
      {
        kind   : "RELATION",
        ref    : "r1",
        code   : "SCHEMA_VALIDATION",
        message: expect.stringContaining("relationLabel")
      }
    ]);
  });
});
```

- [ ] **Step 2: Run the normalizer tests to verify they fail**

Run:

```bash
pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stageA/claim-normalizer.test.ts --coverage=false
```

Expected: FAIL because `claim-normalizer.ts` does not exist yet.

- [ ] **Step 3: Implement the normalizer**

Create `src/server/modules/analysis/pipelines/evidence-review/stageA/claim-normalizer.ts`:

```ts
import { ZodError } from "zod";

import { prisma } from "@/server/db/prisma";
import type {
  EvidenceSpanFindOrCreateClient,
  EvidenceSpanRow,
  MaterializedEvidenceSpanData
} from "@/server/modules/analysis/evidence/evidence-spans";
import {
  findOrCreateEvidenceSpan,
  validateEvidenceSpanDraft
} from "@/server/modules/analysis/evidence/evidence-spans";
import {
  buildOffsetMap,
  mapNormalizedRangeToOriginalRange,
  normalizeTextForEvidence
} from "@/server/modules/analysis/evidence/offset-map";
import { validateClaimDraftByFamily } from "@/server/modules/analysis/claims/claim-schemas";
import type { PersistedStage0Segment } from "@/server/modules/analysis/pipelines/evidence-review/stage0/repository";
import {
  stageAEventItemSchema,
  stageAMentionItemSchema,
  stageARelationItemSchema,
  stageATimeItemSchema,
  type StageAClaimKind,
  type StageADiscardCode,
  type StageADiscardRecord,
  type StageANormalizedExtraction,
  type StageARawEnvelope
} from "@/server/modules/analysis/pipelines/evidence-review/stageA/types";

export interface StageAEvidenceResolver {
  findOrCreate(data: MaterializedEvidenceSpanData): Promise<EvidenceSpanRow>;
}

export interface NormalizeStageAChapterExtractionInput {
  bookId: string;
  chapterId: string;
  chapterNo: number;
  runId: string;
  chapterText: string;
  segments: PersistedStage0Segment[];
  envelope: StageARawEnvelope;
}

export function createStageAEvidenceResolver(
  client: EvidenceSpanFindOrCreateClient = prisma
): StageAEvidenceResolver {
  return {
    findOrCreate: async (data) => findOrCreateEvidenceSpan(client, data)
  };
}

function buildDiscard(
  kind: StageAClaimKind,
  ref: string,
  code: StageADiscardCode,
  message: string
): StageADiscardRecord {
  return { kind, ref, code, message };
}

function readLocalRef(
  kind: StageAClaimKind,
  index: number,
  raw: unknown,
  field: string
): string {
  if (
    typeof raw === "object"
    && raw !== null
    && field in raw
    && typeof (raw as Record<string, unknown>)[field] === "string"
    && (raw as Record<string, string>)[field].trim().length > 0
  ) {
    return (raw as Record<string, string>)[field].trim();
  }

  return `${kind.toLowerCase()}-${index + 1}`;
}

function formatZodError(error: ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
    .join("; ");
}

function findSegmentByIndex(
  segments: PersistedStage0Segment[],
  segmentIndex: number
): PersistedStage0Segment | null {
  return segments.find((segment) => segment.segmentIndex === segmentIndex) ?? null;
}

function findUniqueQuoteRangeInSegment(
  segmentText: string,
  quotedText: string
): { startOffset: number; endOffset: number } | "NOT_FOUND" | "NOT_UNIQUE" {
  const map = buildOffsetMap(segmentText);
  const normalizedNeedle = normalizeTextForEvidence(quotedText);

  if (normalizedNeedle.length === 0) {
    return "NOT_FOUND";
  }

  const matches: Array<{ startOffset: number; endOffset: number }> = [];
  let fromIndex = 0;

  while (fromIndex <= map.normalizedText.length - normalizedNeedle.length) {
    const normalizedStart = map.normalizedText.indexOf(normalizedNeedle, fromIndex);
    if (normalizedStart < 0) {
      break;
    }

    matches.push(
      mapNormalizedRangeToOriginalRange(
        map,
        normalizedStart,
        normalizedStart + normalizedNeedle.length
      )
    );

    fromIndex = normalizedStart + 1;
  }

  if (matches.length === 0) {
    return "NOT_FOUND";
  }

  if (matches.length > 1) {
    return "NOT_UNIQUE";
  }

  return matches[0];
}

function createEvidenceAnchor(segment: PersistedStage0Segment) {
  return {
    id            : segment.id,
    bookId        : segment.bookId,
    chapterId     : segment.chapterId,
    segmentType   : segment.segmentType,
    startOffset   : segment.startOffset,
    endOffset     : segment.endOffset,
    text          : segment.rawText,
    normalizedText: segment.normalizedText,
    speakerHint   : segment.speakerHint
  };
}

async function materializeEvidence(input: {
  resolver: StageAEvidenceResolver;
  kind: StageAClaimKind;
  ref: string;
  bookId: string;
  chapterId: string;
  runId: string;
  chapterText: string;
  segments: PersistedStage0Segment[];
  evidence: {
    segmentIndex: number;
    quotedText: string;
  };
}): Promise<{ evidenceSpanId: string } | StageADiscardRecord> {
  const segment = findSegmentByIndex(input.segments, input.evidence.segmentIndex);
  if (!segment) {
    return buildDiscard(
      input.kind,
      input.ref,
      "SEGMENT_INDEX_OUT_OF_RANGE",
      `segmentIndex ${input.evidence.segmentIndex} does not exist in persisted Stage 0 output`
    );
  }

  const localRange = findUniqueQuoteRangeInSegment(segment.rawText, input.evidence.quotedText);
  if (localRange === "NOT_FOUND") {
    return buildDiscard(
      input.kind,
      input.ref,
      "QUOTE_NOT_FOUND",
      `quotedText not found inside segment ${segment.segmentIndex}: ${input.evidence.quotedText}`
    );
  }

  if (localRange === "NOT_UNIQUE") {
    return buildDiscard(
      input.kind,
      input.ref,
      "QUOTE_NOT_UNIQUE",
      `quotedText is not unique inside segment ${segment.segmentIndex}: ${input.evidence.quotedText}`
    );
  }

  try {
    const materialized = validateEvidenceSpanDraft({
      chapterText: input.chapterText,
      segment    : createEvidenceAnchor(segment),
      draft      : {
        bookId         : input.bookId,
        chapterId      : input.chapterId,
        segmentId      : segment.id,
        startOffset    : segment.startOffset + localRange.startOffset,
        endOffset      : segment.startOffset + localRange.endOffset,
        expectedText   : segment.rawText.slice(localRange.startOffset, localRange.endOffset),
        speakerHint    : segment.speakerHint,
        narrativeRegionType: segment.segmentType,
        createdByRunId : input.runId
      }
    });

    const evidenceSpan = await input.resolver.findOrCreate(materialized);
    return { evidenceSpanId: evidenceSpan.id };
  } catch (error) {
    return buildDiscard(
      input.kind,
      input.ref,
      "EVIDENCE_VALIDATION_FAILED",
      error instanceof Error ? error.message : String(error)
    );
  }
}

export interface StageAClaimNormalizerDependencies {
  evidenceResolver?: StageAEvidenceResolver;
}

export function createStageAClaimNormalizer(
  dependencies: StageAClaimNormalizerDependencies = {}
) {
  const evidenceResolver =
    dependencies.evidenceResolver ?? createStageAEvidenceResolver();

  async function normalizeChapterExtraction(
    input: NormalizeStageAChapterExtractionInput
  ): Promise<StageANormalizedExtraction> {
    const result: StageANormalizedExtraction = {
      mentionClaims       : [],
      timeClaims          : [],
      pendingEventClaims  : [],
      pendingRelationClaims: [],
      discardRecords      : []
    };

    for (const [index, rawMention] of input.envelope.mentions.entries()) {
      const ref = readLocalRef("MENTION", index, rawMention, "mentionRef");
      const parsed = stageAMentionItemSchema.safeParse(rawMention);
      if (!parsed.success) {
        result.discardRecords.push(
          buildDiscard("MENTION", ref, "SCHEMA_VALIDATION", formatZodError(parsed.error))
        );
        continue;
      }

      const evidence = await materializeEvidence({
        resolver   : evidenceResolver,
        kind       : "MENTION",
        ref,
        bookId     : input.bookId,
        chapterId  : input.chapterId,
        runId      : input.runId,
        chapterText: input.chapterText,
        segments   : input.segments,
        evidence   : parsed.data.evidence
      });

      if ("code" in evidence) {
        result.discardRecords.push(evidence);
        continue;
      }

      result.mentionClaims.push({
        ref,
        draft: validateClaimDraftByFamily("ENTITY_MENTION", {
          claimFamily              : "ENTITY_MENTION",
          bookId                   : input.bookId,
          chapterId                : input.chapterId,
          runId                    : input.runId,
          source                   : "AI",
          confidence               : parsed.data.confidence,
          surfaceText              : parsed.data.surfaceText,
          mentionKind              : parsed.data.mentionKind,
          identityClaim            : parsed.data.identityClaim,
          aliasTypeHint            : parsed.data.aliasTypeHint,
          speakerPersonaCandidateId: null,
          suspectedResolvesTo      : null,
          evidenceSpanId           : evidence.evidenceSpanId
        })
      });
    }

    for (const [index, rawTime] of input.envelope.times.entries()) {
      const ref = readLocalRef("TIME", index, rawTime, "timeRef");
      const parsed = stageATimeItemSchema.safeParse(rawTime);
      if (!parsed.success) {
        result.discardRecords.push(
          buildDiscard("TIME", ref, "SCHEMA_VALIDATION", formatZodError(parsed.error))
        );
        continue;
      }

      const evidence = await materializeEvidence({
        resolver   : evidenceResolver,
        kind       : "TIME",
        ref,
        bookId     : input.bookId,
        chapterId  : input.chapterId,
        runId      : input.runId,
        chapterText: input.chapterText,
        segments   : input.segments,
        evidence   : parsed.data.evidence
      });

      if ("code" in evidence) {
        result.discardRecords.push(evidence);
        continue;
      }

      result.timeClaims.push({
        ref,
        draft: validateClaimDraftByFamily("TIME", {
          claimFamily        : "TIME",
          bookId             : input.bookId,
          chapterId          : input.chapterId,
          runId              : input.runId,
          source             : "AI",
          reviewState        : "PENDING",
          createdByUserId    : null,
          reviewedByUserId   : null,
          reviewNote         : null,
          supersedesClaimId  : null,
          derivedFromClaimId : null,
          evidenceSpanIds    : [evidence.evidenceSpanId],
          confidence         : parsed.data.confidence,
          rawTimeText        : parsed.data.rawTimeText,
          timeType           : parsed.data.timeType,
          normalizedLabel    : parsed.data.normalizedLabel,
          relativeOrderWeight: parsed.data.relativeOrderWeight,
          chapterRangeStart  : parsed.data.chapterRangeStart,
          chapterRangeEnd    : parsed.data.chapterRangeEnd
        })
      });
    }

    for (const [index, rawEvent] of input.envelope.events.entries()) {
      const ref = readLocalRef("EVENT", index, rawEvent, "eventRef");
      const parsed = stageAEventItemSchema.safeParse(rawEvent);
      if (!parsed.success) {
        result.discardRecords.push(
          buildDiscard("EVENT", ref, "SCHEMA_VALIDATION", formatZodError(parsed.error))
        );
        continue;
      }

      const evidence = await materializeEvidence({
        resolver   : evidenceResolver,
        kind       : "EVENT",
        ref,
        bookId     : input.bookId,
        chapterId  : input.chapterId,
        runId      : input.runId,
        chapterText: input.chapterText,
        segments   : input.segments,
        evidence   : parsed.data.evidence
      });

      if ("code" in evidence) {
        result.discardRecords.push(evidence);
        continue;
      }

      result.pendingEventClaims.push({
        ref,
        subjectMentionRef: parsed.data.subjectMentionRef,
        timeRef          : parsed.data.timeRef,
        draft: validateClaimDraftByFamily("EVENT", {
          claimFamily              : "EVENT",
          bookId                   : input.bookId,
          chapterId                : input.chapterId,
          runId                    : input.runId,
          source                   : "AI",
          reviewState              : "PENDING",
          createdByUserId          : null,
          reviewedByUserId         : null,
          reviewNote               : null,
          supersedesClaimId        : null,
          derivedFromClaimId       : null,
          evidenceSpanIds          : [evidence.evidenceSpanId],
          confidence               : parsed.data.confidence,
          subjectMentionId         : null,
          subjectPersonaCandidateId: null,
          predicate                : parsed.data.predicate,
          objectText               : parsed.data.objectText,
          objectPersonaCandidateId : null,
          locationText             : parsed.data.locationText,
          timeHintId               : null,
          eventCategory            : parsed.data.eventCategory,
          narrativeLens            : parsed.data.narrativeLens
        })
      });
    }

    for (const [index, rawRelation] of input.envelope.relations.entries()) {
      const ref = readLocalRef("RELATION", index, rawRelation, "relationRef");
      const parsed = stageARelationItemSchema.safeParse(rawRelation);
      if (!parsed.success) {
        result.discardRecords.push(
          buildDiscard("RELATION", ref, "SCHEMA_VALIDATION", formatZodError(parsed.error))
        );
        continue;
      }

      const evidence = await materializeEvidence({
        resolver   : evidenceResolver,
        kind       : "RELATION",
        ref,
        bookId     : input.bookId,
        chapterId  : input.chapterId,
        runId      : input.runId,
        chapterText: input.chapterText,
        segments   : input.segments,
        evidence   : parsed.data.evidence
      });

      if ("code" in evidence) {
        result.discardRecords.push(evidence);
        continue;
      }

      result.pendingRelationClaims.push({
        ref,
        sourceMentionRef: parsed.data.sourceMentionRef,
        targetMentionRef: parsed.data.targetMentionRef,
        timeRef         : parsed.data.timeRef,
        draft: validateClaimDraftByFamily("RELATION", {
          claimFamily              : "RELATION",
          bookId                   : input.bookId,
          chapterId                : input.chapterId,
          runId                    : input.runId,
          source                   : "AI",
          reviewState              : "PENDING",
          createdByUserId          : null,
          reviewedByUserId         : null,
          reviewNote               : null,
          supersedesClaimId        : null,
          derivedFromClaimId       : null,
          evidenceSpanIds          : [evidence.evidenceSpanId],
          confidence               : parsed.data.confidence,
          sourceMentionId          : null,
          targetMentionId          : null,
          sourcePersonaCandidateId : null,
          targetPersonaCandidateId : null,
          relationTypeKey          : parsed.data.relationTypeKey,
          relationLabel            : parsed.data.relationLabel,
          relationTypeSource       : "CUSTOM",
          direction                : parsed.data.direction,
          effectiveChapterStart    : parsed.data.effectiveChapterStart,
          effectiveChapterEnd      : parsed.data.effectiveChapterEnd,
          timeHintId               : null
        })
      });
    }

    return result;
  }

  return {
    normalizeChapterExtraction
  };
}

export type StageAClaimNormalizer = ReturnType<typeof createStageAClaimNormalizer>;
```

- [ ] **Step 4: Run the normalizer tests to verify they pass**

Run:

```bash
pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stageA/claim-normalizer.test.ts --coverage=false
```

Expected: PASS.

- [ ] **Step 5: Commit the normalizer**

```bash
git add src/server/modules/analysis/pipelines/evidence-review/stageA/claim-normalizer.ts src/server/modules/analysis/pipelines/evidence-review/stageA/claim-normalizer.test.ts
git commit -m "feat: normalize stage a extraction claims"
```

## Task 4: Implement Stage A Claim Persister

**Files:**
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageA/claim-persister.test.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageA/claim-persister.ts`

- [ ] **Step 1: Write the failing Stage A persister tests**

Create `src/server/modules/analysis/pipelines/evidence-review/stageA/claim-persister.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  createStageAClaimPersister,
  type StageAClaimPersisterRepository
} from "@/server/modules/analysis/pipelines/evidence-review/stageA/claim-persister";
import type { StageANormalizedExtraction } from "@/server/modules/analysis/pipelines/evidence-review/stageA/types";

function createRepository(): {
  repository: StageAClaimPersisterRepository;
  stored: {
    mentions: Array<Record<string, unknown>>;
    times: Array<Record<string, unknown>>;
    events: Array<Record<string, unknown>>;
    relations: Array<Record<string, unknown>>;
  };
} {
  const stored = {
    mentions : [] as Array<Record<string, unknown>>,
    times    : [] as Array<Record<string, unknown>>,
    events   : [] as Array<Record<string, unknown>>,
    relations: [] as Array<Record<string, unknown>>
  };

  let nextId = 1;

  const repository: StageAClaimPersisterRepository = {
    async transaction<T>(work: (tx: StageAClaimPersisterRepository) => Promise<T>): Promise<T> {
      return work(repository);
    },
    async clearFamilyScope(family) {
      if (family === "ENTITY_MENTION") stored.mentions = [];
      if (family === "TIME") stored.times = [];
      if (family === "EVENT") stored.events = [];
      if (family === "RELATION") stored.relations = [];
    },
    async createEntityMention(data) {
      const created = { id: `mention-${nextId++}`, ...data };
      stored.mentions.push(created);
      return created;
    },
    async createReviewableClaim(family, data) {
      const created = { id: `${family.toLowerCase()}-${nextId++}`, ...data };
      if (family === "TIME") stored.times.push(created);
      if (family === "EVENT") stored.events.push(created);
      if (family === "RELATION") stored.relations.push(created);
      return created;
    }
  };

  return { repository, stored };
}

function buildNormalized(): StageANormalizedExtraction {
  return {
    mentionClaims: [
      {
        ref  : "m1",
        draft: {
          claimFamily              : "ENTITY_MENTION",
          bookId                   : "book-1",
          chapterId                : "chapter-1",
          runId                    : "run-1",
          source                   : "AI",
          confidence               : 0.9,
          surfaceText              : "王冕",
          mentionKind              : "NAMED",
          identityClaim            : null,
          aliasTypeHint            : null,
          speakerPersonaCandidateId: null,
          suspectedResolvesTo      : null,
          evidenceSpanId           : "evidence-1"
        }
      },
      {
        ref  : "m2",
        draft: {
          claimFamily              : "ENTITY_MENTION",
          bookId                   : "book-1",
          chapterId                : "chapter-1",
          runId                    : "run-1",
          source                   : "AI",
          confidence               : 0.8,
          surfaceText              : "秦老",
          mentionKind              : "NAMED",
          identityClaim            : null,
          aliasTypeHint            : null,
          speakerPersonaCandidateId: null,
          suspectedResolvesTo      : null,
          evidenceSpanId           : "evidence-2"
        }
      }
    ],
    timeClaims: [
      {
        ref  : "t1",
        draft: {
          claimFamily        : "TIME",
          bookId             : "book-1",
          chapterId          : "chapter-1",
          runId              : "run-1",
          source             : "AI",
          reviewState        : "PENDING",
          createdByUserId    : null,
          reviewedByUserId   : null,
          reviewNote         : null,
          supersedesClaimId  : null,
          derivedFromClaimId : null,
          evidenceSpanIds    : ["evidence-3"],
          confidence         : 0.7,
          rawTimeText        : "次日",
          timeType           : "RELATIVE_PHASE",
          normalizedLabel    : "次日",
          relativeOrderWeight: null,
          chapterRangeStart  : null,
          chapterRangeEnd    : null
        }
      }
    ],
    pendingEventClaims: [
      {
        ref              : "e1",
        subjectMentionRef: "m1",
        timeRef          : "t1",
        draft            : {
          claimFamily              : "EVENT",
          bookId                   : "book-1",
          chapterId                : "chapter-1",
          runId                    : "run-1",
          source                   : "AI",
          reviewState              : "PENDING",
          createdByUserId          : null,
          reviewedByUserId         : null,
          reviewNote               : null,
          supersedesClaimId        : null,
          derivedFromClaimId       : null,
          evidenceSpanIds          : ["evidence-4"],
          confidence               : 0.8,
          subjectMentionId         : null,
          subjectPersonaCandidateId: null,
          predicate                : "发言",
          objectText               : "明日再谈",
          objectPersonaCandidateId : null,
          locationText             : null,
          timeHintId               : null,
          eventCategory            : "EVENT",
          narrativeLens            : "QUOTED"
        }
      }
    ],
    pendingRelationClaims: [
      {
        ref             : "r1",
        sourceMentionRef: "m1",
        targetMentionRef: "m2",
        timeRef         : null,
        draft           : {
          claimFamily              : "RELATION",
          bookId                   : "book-1",
          chapterId                : "chapter-1",
          runId                    : "run-1",
          source                   : "AI",
          reviewState              : "PENDING",
          createdByUserId          : null,
          reviewedByUserId         : null,
          reviewNote               : null,
          supersedesClaimId        : null,
          derivedFromClaimId       : null,
          evidenceSpanIds          : ["evidence-5"],
          confidence               : 0.65,
          sourceMentionId          : null,
          targetMentionId          : null,
          sourcePersonaCandidateId : null,
          targetPersonaCandidateId : null,
          relationTypeKey          : "host_of",
          relationLabel            : "接待",
          relationTypeSource       : "CUSTOM",
          direction                : "FORWARD",
          effectiveChapterStart    : null,
          effectiveChapterEnd      : null,
          timeHintId               : null
        }
      }
    ],
    discardRecords: []
  };
}

describe("Stage A claim persister", () => {
  it("creates mention/time ids first and then binds them into event/relation claims", async () => {
    const fixture = createRepository();
    const persister = createStageAClaimPersister({
      repository: fixture.repository
    });

    const result = await persister.persistChapterClaims({
      scope: {
        bookId   : "book-1",
        chapterId: "chapter-1",
        runId    : "run-1",
        stageKey : "stage_a_extraction"
      },
      normalized: buildNormalized()
    });

    expect(result.persistedCounts).toEqual({
      mentions : 2,
      times    : 1,
      events   : 1,
      relations: 1
    });
    expect(result.mentionIdsByRef).toMatchObject({
      m1: "mention-1",
      m2: "mention-2"
    });
    expect(result.timeIdsByRef).toMatchObject({
      t1: "time-3"
    });
    expect(fixture.stored.events[0]).toMatchObject({
      subjectMentionId: "mention-1",
      timeHintId      : "time-3"
    });
    expect(fixture.stored.relations[0]).toMatchObject({
      sourceMentionId: "mention-1",
      targetMentionId: "mention-2"
    });
  });

  it("turns unresolved refs into discard records instead of partial writes", async () => {
    const fixture = createRepository();
    const persister = createStageAClaimPersister({
      repository: fixture.repository
    });
    const normalized = buildNormalized();
    normalized.pendingEventClaims[0].subjectMentionRef = "missing";
    normalized.pendingRelationClaims[0].targetMentionRef = "missing";

    const result = await persister.persistChapterClaims({
      scope: {
        bookId   : "book-1",
        chapterId: "chapter-1",
        runId    : "run-1",
        stageKey : "stage_a_extraction"
      },
      normalized
    });

    expect(result.persistedCounts).toEqual({
      mentions : 2,
      times    : 1,
      events   : 0,
      relations: 0
    });
    expect(result.discardRecords).toEqual([
      {
        kind   : "EVENT",
        ref    : "e1",
        code   : "UNRESOLVED_MENTION_REF",
        message: expect.stringContaining("subjectMentionRef")
      },
      {
        kind   : "RELATION",
        ref    : "r1",
        code   : "UNRESOLVED_MENTION_REF",
        message: expect.stringContaining("targetMentionRef")
      }
    ]);
  });

  it("replaces the chapter scope on rerun instead of duplicating rows", async () => {
    const fixture = createRepository();
    const persister = createStageAClaimPersister({
      repository: fixture.repository
    });

    await persister.persistChapterClaims({
      scope: {
        bookId   : "book-1",
        chapterId: "chapter-1",
        runId    : "run-1",
        stageKey : "stage_a_extraction"
      },
      normalized: buildNormalized()
    });

    await persister.persistChapterClaims({
      scope: {
        bookId   : "book-1",
        chapterId: "chapter-1",
        runId    : "run-1",
        stageKey : "stage_a_extraction"
      },
      normalized: buildNormalized()
    });

    expect(fixture.stored.mentions).toHaveLength(2);
    expect(fixture.stored.times).toHaveLength(1);
    expect(fixture.stored.events).toHaveLength(1);
    expect(fixture.stored.relations).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the Stage A persister tests to verify they fail**

Run:

```bash
pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stageA/claim-persister.test.ts --coverage=false
```

Expected: FAIL because `claim-persister.ts` does not exist yet.

- [ ] **Step 3: Implement the Stage A persister**

Create `src/server/modules/analysis/pipelines/evidence-review/stageA/claim-persister.ts`:

```ts
import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import {
  createClaimRepository,
  type ClaimWriteScope
} from "@/server/modules/analysis/claims/claim-repository";
import {
  toClaimCreateData,
  validateClaimDraftByFamily,
  type ClaimCreateDataByFamily
} from "@/server/modules/analysis/claims/claim-schemas";
import type {
  StageADiscardRecord,
  StageANormalizedExtraction,
  StageAPersistResult
} from "@/server/modules/analysis/pipelines/evidence-review/stageA/types";

type StageAFamily = "ENTITY_MENTION" | "TIME" | "EVENT" | "RELATION";
type StageAReviewableFamily = Exclude<StageAFamily, "ENTITY_MENTION">;

interface StageAEntityMentionCreateDelegate {
  create(args: {
    data: ClaimCreateDataByFamily["ENTITY_MENTION"];
  }): Promise<{ id: string } & ClaimCreateDataByFamily["ENTITY_MENTION"]>;
}

interface StageAReviewableCreateDelegate<TFamily extends StageAReviewableFamily> {
  create(args: {
    data: ClaimCreateDataByFamily[TFamily];
  }): Promise<{ id: string } & ClaimCreateDataByFamily[TFamily]>;
}

export interface StageAClaimPersisterRepository {
  transaction<T>(work: (repository: StageAClaimPersisterRepository) => Promise<T>): Promise<T>;
  clearFamilyScope(family: StageAFamily, scope: ClaimWriteScope): Promise<void>;
  createEntityMention(
    data: ClaimCreateDataByFamily["ENTITY_MENTION"]
  ): Promise<{ id: string } & ClaimCreateDataByFamily["ENTITY_MENTION"]>;
  createReviewableClaim<TFamily extends StageAReviewableFamily>(
    family: TFamily,
    data: ClaimCreateDataByFamily[TFamily]
  ): Promise<{ id: string } & ClaimCreateDataByFamily[TFamily]>;
}

interface StageAClaimPersisterClient {
  entityMention: StageAEntityMentionCreateDelegate;
  eventClaim: StageAReviewableCreateDelegate<"EVENT">;
  relationClaim: StageAReviewableCreateDelegate<"RELATION">;
  timeClaim: StageAReviewableCreateDelegate<"TIME">;
  $transaction<T>(work: (tx: StageAClaimPersisterClient) => Promise<T>): Promise<T>;
}

function createRepositoryFromClient(
  client: StageAClaimPersisterClient
): StageAClaimPersisterRepository {
  const claimRepository = createClaimRepository(client as unknown as PrismaClient);

  return {
    async transaction<T>(work: (repository: StageAClaimPersisterRepository) => Promise<T>): Promise<T> {
      return work(createRepositoryFromClient(client));
    },
    async clearFamilyScope(family, scope) {
      switch (family) {
        case "ENTITY_MENTION":
          await claimRepository.replaceClaimFamilyScope({
            family,
            scope,
            rows: []
          });
          return;
        case "TIME":
          await claimRepository.replaceClaimFamilyScope({
            family,
            scope,
            rows: []
          });
          return;
        case "EVENT":
          await claimRepository.replaceClaimFamilyScope({
            family,
            scope,
            rows: []
          });
          return;
        case "RELATION":
          await claimRepository.replaceClaimFamilyScope({
            family,
            scope,
            rows: []
          });
      }
    },
    async createEntityMention(data) {
      return client.entityMention.create({ data });
    },
    async createReviewableClaim(family, data) {
      switch (family) {
        case "TIME":
          return client.timeClaim.create({ data });
        case "EVENT":
          return client.eventClaim.create({ data });
        case "RELATION":
          return client.relationClaim.create({ data });
      }
    }
  };
}

export function createStageAClaimPersisterRepository(
  client: StageAClaimPersisterClient = prisma as unknown as StageAClaimPersisterClient
): StageAClaimPersisterRepository {
  return {
    ...createRepositoryFromClient(client),
    async transaction<T>(work: (repository: StageAClaimPersisterRepository) => Promise<T>): Promise<T> {
      return client.$transaction(async (tx) => work(createRepositoryFromClient(tx)));
    }
  };
}

function buildDiscard(
  kind: StageADiscardRecord["kind"],
  ref: string,
  code: StageADiscardRecord["code"],
  message: string
): StageADiscardRecord {
  return { kind, ref, code, message };
}

export interface PersistStageAChapterClaimsInput {
  scope: ClaimWriteScope;
  normalized: StageANormalizedExtraction;
}

export interface StageAClaimPersisterDependencies {
  repository?: StageAClaimPersisterRepository;
}

export function createStageAClaimPersister(
  dependencies: StageAClaimPersisterDependencies = {}
) {
  const repository =
    dependencies.repository ?? createStageAClaimPersisterRepository();

  async function persistChapterClaims(
    input: PersistStageAChapterClaimsInput
  ): Promise<StageAPersistResult> {
    return repository.transaction(async (tx) => {
      await tx.clearFamilyScope("ENTITY_MENTION", input.scope);
      await tx.clearFamilyScope("TIME", input.scope);
      await tx.clearFamilyScope("EVENT", input.scope);
      await tx.clearFamilyScope("RELATION", input.scope);

      const mentionIdsByRef: Record<string, string> = {};
      const timeIdsByRef: Record<string, string> = {};
      const discardRecords = [...input.normalized.discardRecords];

      let mentionCount = 0;
      let timeCount = 0;
      let eventCount = 0;
      let relationCount = 0;

      for (const mention of input.normalized.mentionClaims) {
        const validated = validateClaimDraftByFamily("ENTITY_MENTION", mention.draft);
        const created = await tx.createEntityMention(toClaimCreateData(validated));
        mentionIdsByRef[mention.ref] = created.id;
        mentionCount += 1;
      }

      for (const time of input.normalized.timeClaims) {
        const validated = validateClaimDraftByFamily("TIME", time.draft);
        const created = await tx.createReviewableClaim("TIME", toClaimCreateData(validated));
        timeIdsByRef[time.ref] = created.id;
        timeCount += 1;
      }

      for (const event of input.normalized.pendingEventClaims) {
        if (event.subjectMentionRef && !mentionIdsByRef[event.subjectMentionRef]) {
          discardRecords.push(
            buildDiscard(
              "EVENT",
              event.ref,
              "UNRESOLVED_MENTION_REF",
              `subjectMentionRef could not be resolved: ${event.subjectMentionRef}`
            )
          );
          continue;
        }

        if (event.timeRef && !timeIdsByRef[event.timeRef]) {
          discardRecords.push(
            buildDiscard(
              "EVENT",
              event.ref,
              "UNRESOLVED_TIME_REF",
              `timeRef could not be resolved: ${event.timeRef}`
            )
          );
          continue;
        }

        const validated = validateClaimDraftByFamily("EVENT", {
          ...event.draft,
          subjectMentionId: event.subjectMentionRef
            ? mentionIdsByRef[event.subjectMentionRef]
            : null,
          timeHintId: event.timeRef ? timeIdsByRef[event.timeRef] : null
        });

        await tx.createReviewableClaim("EVENT", toClaimCreateData(validated));
        eventCount += 1;
      }

      for (const relation of input.normalized.pendingRelationClaims) {
        if (relation.sourceMentionRef && !mentionIdsByRef[relation.sourceMentionRef]) {
          discardRecords.push(
            buildDiscard(
              "RELATION",
              relation.ref,
              "UNRESOLVED_MENTION_REF",
              `sourceMentionRef could not be resolved: ${relation.sourceMentionRef}`
            )
          );
          continue;
        }

        if (relation.targetMentionRef && !mentionIdsByRef[relation.targetMentionRef]) {
          discardRecords.push(
            buildDiscard(
              "RELATION",
              relation.ref,
              "UNRESOLVED_MENTION_REF",
              `targetMentionRef could not be resolved: ${relation.targetMentionRef}`
            )
          );
          continue;
        }

        if (relation.timeRef && !timeIdsByRef[relation.timeRef]) {
          discardRecords.push(
            buildDiscard(
              "RELATION",
              relation.ref,
              "UNRESOLVED_TIME_REF",
              `timeRef could not be resolved: ${relation.timeRef}`
            )
          );
          continue;
        }

        const validated = validateClaimDraftByFamily("RELATION", {
          ...relation.draft,
          sourceMentionId: relation.sourceMentionRef
            ? mentionIdsByRef[relation.sourceMentionRef]
            : null,
          targetMentionId: relation.targetMentionRef
            ? mentionIdsByRef[relation.targetMentionRef]
            : null,
          timeHintId: relation.timeRef ? timeIdsByRef[relation.timeRef] : null
        });

        await tx.createReviewableClaim("RELATION", toClaimCreateData(validated));
        relationCount += 1;
      }

      return {
        mentionIdsByRef,
        timeIdsByRef,
        persistedCounts: {
          mentions : mentionCount,
          times    : timeCount,
          events   : eventCount,
          relations: relationCount
        },
        discardRecords
      };
    });
  }

  return {
    persistChapterClaims
  };
}

export type StageAClaimPersister = ReturnType<typeof createStageAClaimPersister>;
```

- [ ] **Step 4: Run the Stage A persister tests to verify they pass**

Run:

```bash
pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stageA/claim-persister.test.ts --coverage=false
```

Expected: PASS.

- [ ] **Step 5: Commit the persister**

```bash
git add src/server/modules/analysis/pipelines/evidence-review/stageA/claim-persister.ts src/server/modules/analysis/pipelines/evidence-review/stageA/claim-persister.test.ts
git commit -m "feat: persist stage a extraction claims"
```

## Task 5: Implement The Stage A Extraction Pipeline

**Files:**
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageA/StageAExtractionPipeline.test.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageA/StageAExtractionPipeline.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageA/index.ts`

- [ ] **Step 1: Write the failing pipeline tests**

Create `src/server/modules/analysis/pipelines/evidence-review/stageA/StageAExtractionPipeline.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { PipelineStage } from "@/types/pipeline";
import { createStageAExtractionPipeline } from "@/server/modules/analysis/pipelines/evidence-review/stageA/StageAExtractionPipeline";

const chapter = {
  id     : "chapter-1",
  no     : 1,
  title  : "第一回",
  content: "王冕道：“明日再谈。”次日秦老来访。"
};

const persistedSegments = [
  {
    id            : "segment-1",
    bookId        : "book-1",
    chapterId     : "chapter-1",
    runId         : "run-1",
    segmentIndex  : 0,
    segmentType   : "DIALOGUE_LEAD",
    startOffset   : 0,
    endOffset     : 4,
    rawText       : "王冕道：",
    normalizedText: "王冕道：",
    confidence    : 0.95,
    speakerHint   : "王冕"
  },
  {
    id            : "segment-2",
    bookId        : "book-1",
    chapterId     : "chapter-1",
    runId         : "run-1",
    segmentIndex  : 1,
    segmentType   : "DIALOGUE_CONTENT",
    startOffset   : 4,
    endOffset     : 11,
    rawText       : "“明日再谈。”",
    normalizedText: "“明日再谈。”",
    confidence    : 0.95,
    speakerHint   : "王冕"
  }
];

function createStageRunService() {
  return {
    startStageRun: vi.fn().mockResolvedValue({ id: "stage-run-1" }),
    succeedStageRun: vi.fn().mockResolvedValue(undefined),
    failStageRun: vi.fn().mockResolvedValue(undefined),
    recordRawOutput: vi.fn().mockResolvedValue({ id: "raw-1" })
  };
}

describe("Stage A extraction pipeline", () => {
  it("runs the full chapter extraction path and records raw output", async () => {
    const stageRunService = createStageRunService();
    const normalizer = {
      normalizeChapterExtraction: vi.fn().mockResolvedValue({
        mentionClaims       : [],
        timeClaims          : [],
        pendingEventClaims  : [],
        pendingRelationClaims: [],
        discardRecords      : []
      })
    };
    const persister = {
      persistChapterClaims: vi.fn().mockResolvedValue({
        mentionIdsByRef: {},
        timeIdsByRef   : {},
        persistedCounts: {
          mentions : 1,
          times    : 1,
          events   : 1,
          relations: 1
        },
        discardRecords: []
      })
    };
    const provider = {
      generateJson: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          mentions : [],
          times    : [],
          events   : [],
          relations: []
        }),
        usage: {
          promptTokens    : 11,
          completionTokens: 17,
          totalTokens     : 28
        }
      })
    };
    const aiExecutor = {
      execute: vi.fn(async (input: {
        stage: PipelineStage;
        prompt: { system: string; user: string };
        jobId: string;
        chapterId?: string | null;
        context: { bookId?: string | null; jobId?: string | null };
        callFn: (params: {
          model: {
            modelId: string;
            modelName: string;
            provider: "gemini";
            apiKey: string;
            baseUrl: string;
            displayName: string;
            source: "BOOK";
            params: {
              temperature: number;
              maxOutputTokens: number;
              topP: number;
              maxRetries: number;
              retryBaseMs: number;
              enableThinking?: boolean;
              reasoningEffort?: "low" | "medium" | "high";
            };
          };
          prompt: { system: string; user: string };
        }) => Promise<{ data: string; usage: { promptTokens: number; completionTokens: number; totalTokens: number } }>;
      }) => {
        const model = {
          modelId    : "model-1",
          modelName  : "gemini-2.5-flash",
          provider   : "gemini" as const,
          apiKey     : "secret",
          baseUrl    : "https://generativelanguage.googleapis.com",
          displayName: "Gemini Flash",
          source     : "BOOK" as const,
          params     : {
            temperature    : 0.15,
            maxOutputTokens: 4096,
            topP           : 1,
            maxRetries     : 1,
            retryBaseMs    : 200
          }
        };

        const response = await input.callFn({
          model,
          prompt: input.prompt
        });

        return {
          ...response,
          modelId   : model.modelId,
          isFallback: false
        };
      })
    };

    const pipeline = createStageAExtractionPipeline({
      stage0Repository: {
        listPersistedChapterSegments: vi.fn().mockResolvedValue(persistedSegments)
      },
      stageRunService,
      normalizer,
      persister,
      aiExecutor,
      providerFactory: vi.fn(() => provider)
    });

    const result = await pipeline.runStageAForChapter({
      bookId: "book-1",
      runId : "run-1",
      jobId : "job-1",
      chapter
    });

    expect(aiExecutor.execute).toHaveBeenCalledWith(expect.objectContaining({
      stage    : PipelineStage.INDEPENDENT_EXTRACTION,
      jobId    : "job-1",
      chapterId: "chapter-1",
      context  : { bookId: "book-1", jobId: "job-1" }
    }));
    expect(stageRunService.recordRawOutput).toHaveBeenCalledWith(expect.objectContaining({
      runId     : "run-1",
      stageRunId: "stage-run-1",
      chapterId : "chapter-1",
      provider  : "gemini",
      model     : "model-1",
      parseError: null,
      schemaError: null
    }));
    expect(stageRunService.succeedStageRun).toHaveBeenCalledWith("stage-run-1", expect.objectContaining({
      outputCount : 4,
      skippedCount: 0
    }));
    expect(result.outputCount).toBe(4);
    expect(result.rawOutputId).toBe("raw-1");
    expect(provider.generateJson).toHaveBeenCalledTimes(1);
  });

  it("records parse errors when the model returns invalid json", async () => {
    const stageRunService = createStageRunService();
    const provider = {
      generateJson: vi.fn().mockResolvedValue({
        content: "{not-json",
        usage  : {
          promptTokens    : 5,
          completionTokens: 7,
          totalTokens     : 12
        }
      })
    };
    const aiExecutor = {
      execute: vi.fn(async (input: {
        callFn: (params: {
          model: {
            modelId: string;
            modelName: string;
            provider: "gemini";
            apiKey: string;
            baseUrl: string;
            displayName: string;
            source: "BOOK";
            params: {
              temperature: number;
              maxOutputTokens: number;
              topP: number;
              maxRetries: number;
              retryBaseMs: number;
            };
          };
          prompt: { system: string; user: string };
        }) => Promise<{ data: string; usage: { promptTokens: number; completionTokens: number; totalTokens: number } }>;
      }) => {
        const model = {
          modelId    : "model-1",
          modelName  : "gemini-2.5-flash",
          provider   : "gemini" as const,
          apiKey     : "secret",
          baseUrl    : "https://generativelanguage.googleapis.com",
          displayName: "Gemini Flash",
          source     : "BOOK" as const,
          params     : {
            temperature    : 0.15,
            maxOutputTokens: 4096,
            topP           : 1,
            maxRetries     : 1,
            retryBaseMs    : 200
          }
        };

        const response = await input.callFn({
          model,
          prompt: { system: "", user: "" }
        });

        return {
          ...response,
          modelId   : model.modelId,
          isFallback: false
        };
      })
    };

    const pipeline = createStageAExtractionPipeline({
      stage0Repository: {
        listPersistedChapterSegments: vi.fn().mockResolvedValue(persistedSegments)
      },
      stageRunService,
      aiExecutor,
      providerFactory: vi.fn(() => provider)
    });

    await expect(pipeline.runStageAForChapter({
      bookId: "book-1",
      runId : "run-1",
      jobId : "job-1",
      chapter
    })).rejects.toThrow();

    expect(stageRunService.recordRawOutput).toHaveBeenCalledWith(expect.objectContaining({
      parseError: expect.stringContaining("Expected")
    }));
    expect(stageRunService.failStageRun).toHaveBeenCalledTimes(1);
  });

  it("fails early when Stage 0 persisted segments are missing", async () => {
    const stageRunService = createStageRunService();
    const pipeline = createStageAExtractionPipeline({
      stage0Repository: {
        listPersistedChapterSegments: vi.fn().mockResolvedValue([])
      },
      stageRunService,
      aiExecutor: {
        execute: vi.fn()
      }
    });

    await expect(pipeline.runStageAForChapter({
      bookId: "book-1",
      runId : "run-1",
      jobId : "job-1",
      chapter
    })).rejects.toThrow("Stage A requires persisted Stage 0 segments");

    expect(stageRunService.failStageRun).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the pipeline tests to verify they fail**

Run:

```bash
pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stageA/StageAExtractionPipeline.test.ts --coverage=false
```

Expected: FAIL because `StageAExtractionPipeline.ts` does not exist yet.

- [ ] **Step 3: Implement the Stage A extraction pipeline and barrel export**

Create `src/server/modules/analysis/pipelines/evidence-review/stageA/StageAExtractionPipeline.ts`:

```ts
import { createHash } from "node:crypto";

import { Prisma } from "@/generated/prisma/client";
import {
  createAiProviderClient,
  type AiProviderClient,
  type CreateAiProviderInput
} from "@/server/providers/ai";
import {
  createStage0SegmentRepository,
  type PersistedStage0Segment,
  type Stage0SegmentRepository
} from "@/server/modules/analysis/pipelines/evidence-review/stage0/repository";
import {
  analysisStageRunService,
  type AnalysisStageRunService,
  type StageRunErrorClass
} from "@/server/modules/analysis/runs/stage-run-service";
import { aiCallExecutor, type AiCallExecutor } from "@/server/modules/analysis/services/AiCallExecutor";
import { toGenerateOptions } from "@/server/modules/analysis/services/helpers/chunk-utils";
import { repairJson } from "@/types/analysis";
import {
  createStageAClaimNormalizer,
  type StageAClaimNormalizer
} from "@/server/modules/analysis/pipelines/evidence-review/stageA/claim-normalizer";
import {
  createStageAClaimPersister,
  type StageAClaimPersister
} from "@/server/modules/analysis/pipelines/evidence-review/stageA/claim-persister";
import { buildStageAExtractionPrompt } from "@/server/modules/analysis/pipelines/evidence-review/stageA/prompt-contracts";
import {
  STAGE_A_PIPELINE_STAGE,
  STAGE_A_PROMPT_VERSION,
  STAGE_A_STAGE_KEY,
  stageARawEnvelopeSchema,
  summarizeStageADiscards,
  type StageAExtractionRunInput,
  type StageAExtractionRunResult
} from "@/server/modules/analysis/pipelines/evidence-review/stageA/types";

function stableHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function toRequestPayload(input: {
  chapter: StageAExtractionRunInput["chapter"];
  prompt: { system: string; user: string };
  segments: PersistedStage0Segment[];
  modelInfo: {
    modelId: string;
    modelName: string;
    provider: string;
  } | null;
}): Prisma.InputJsonValue {
  return {
    promptVersion: STAGE_A_PROMPT_VERSION,
    chapterId    : input.chapter.id,
    chapterNo    : input.chapter.no,
    chapterTitle : input.chapter.title,
    segmentCount : input.segments.length,
    modelId      : input.modelInfo?.modelId ?? null,
    modelName    : input.modelInfo?.modelName ?? null,
    provider     : input.modelInfo?.provider ?? null,
    prompt       : input.prompt
  };
}

export interface StageAExtractionPipelineDependencies {
  stage0Repository?: Pick<Stage0SegmentRepository, "listPersistedChapterSegments">;
  stageRunService?: Pick<
    AnalysisStageRunService,
    "startStageRun" | "succeedStageRun" | "failStageRun" | "recordRawOutput"
  >;
  aiExecutor?: Pick<AiCallExecutor, "execute">;
  normalizer?: Pick<StageAClaimNormalizer, "normalizeChapterExtraction">;
  persister?: Pick<StageAClaimPersister, "persistChapterClaims">;
  providerFactory?: (input: CreateAiProviderInput) => AiProviderClient;
}

export function createStageAExtractionPipeline(
  dependencies: StageAExtractionPipelineDependencies = {}
) {
  const stage0Repository =
    dependencies.stage0Repository ?? createStage0SegmentRepository();
  const stageRunService =
    dependencies.stageRunService ?? analysisStageRunService;
  const aiExecutor =
    dependencies.aiExecutor ?? aiCallExecutor;
  const normalizer =
    dependencies.normalizer ?? createStageAClaimNormalizer();
  const persister =
    dependencies.persister ?? createStageAClaimPersister();
  const providerFactory =
    dependencies.providerFactory ?? createAiProviderClient;

  async function runStageAForChapter(
    input: StageAExtractionRunInput
  ): Promise<StageAExtractionRunResult> {
    if (input.runId === null) {
      throw new Error("Stage A persistence requires a non-null runId");
    }

    const segments = await stage0Repository.listPersistedChapterSegments({
      runId    : input.runId,
      chapterId: input.chapter.id
    });

    const started = await stageRunService.startStageRun({
      runId         : input.runId,
      bookId        : input.bookId,
      chapterId     : input.chapter.id,
      stageKey      : STAGE_A_STAGE_KEY,
      attempt       : input.attempt ?? 1,
      inputHash     : stableHash({
        promptVersion: STAGE_A_PROMPT_VERSION,
        chapterId    : input.chapter.id,
        chapterNo    : input.chapter.no,
        chapterTitle : input.chapter.title,
        chapterText  : input.chapter.content,
        segments     : segments.map((segment) => ({
          id          : segment.id,
          segmentIndex: segment.segmentIndex,
          segmentType : segment.segmentType,
          rawText     : segment.rawText
        }))
      }),
      inputCount    : segments.length,
      chapterStartNo: input.chapter.no,
      chapterEndNo  : input.chapter.no
    });

    let failureClass: StageRunErrorClass | undefined;

    try {
      if (segments.length === 0) {
        throw new Error(
          `Stage A requires persisted Stage 0 segments for chapter ${input.chapter.id}`
        );
      }

      const prompt = buildStageAExtractionPrompt({
        bookId      : input.bookId,
        chapterId   : input.chapter.id,
        chapterNo   : input.chapter.no,
        chapterTitle: input.chapter.title,
        chapterText : input.chapter.content,
        segments
      });

      let modelInfo: {
        modelId: string;
        modelName: string;
        provider: string;
      } | null = null;

      const aiResult = await aiExecutor.execute<string>({
        stage    : STAGE_A_PIPELINE_STAGE,
        prompt,
        jobId    : input.jobId,
        chapterId: input.chapter.id,
        context  : {
          bookId: input.bookId,
          jobId : input.jobId
        },
        callFn: async ({ model, prompt: runtimePrompt }) => {
          modelInfo = {
            modelId  : model.modelId,
            modelName: model.modelName,
            provider : model.provider
          };

          const provider = providerFactory({
            provider : model.provider,
            apiKey   : model.apiKey,
            baseUrl  : model.baseUrl,
            modelName: model.modelName
          });

          const generated = await provider.generateJson(
            runtimePrompt,
            toGenerateOptions(model)
          );

          return {
            data : generated.content,
            usage: generated.usage
          };
        }
      });

      const repaired = repairJson(aiResult.data);

      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(repaired);
      } catch (error) {
        failureClass = "PARSE_ERROR";
        await stageRunService.recordRawOutput({
          runId             : input.runId,
          stageRunId        : started.id,
          bookId            : input.bookId,
          chapterId         : input.chapter.id,
          provider          : modelInfo?.provider ?? "unknown",
          model             : modelInfo?.modelId ?? aiResult.modelId,
          requestPayload    : toRequestPayload({
            chapter : input.chapter,
            prompt,
            segments,
            modelInfo
          }),
          responseText      : aiResult.data,
          responseJson      : null,
          parseError        : error instanceof Error ? error.message : String(error),
          schemaError       : null,
          discardReason     : null,
          promptTokens      : aiResult.usage?.promptTokens ?? null,
          completionTokens  : aiResult.usage?.completionTokens ?? null
        });
        throw error;
      }

      let envelope;
      try {
        envelope = stageARawEnvelopeSchema.parse(parsedJson);
      } catch (error) {
        failureClass = "SCHEMA_VALIDATION";
        await stageRunService.recordRawOutput({
          runId             : input.runId,
          stageRunId        : started.id,
          bookId            : input.bookId,
          chapterId         : input.chapter.id,
          provider          : modelInfo?.provider ?? "unknown",
          model             : modelInfo?.modelId ?? aiResult.modelId,
          requestPayload    : toRequestPayload({
            chapter : input.chapter,
            prompt,
            segments,
            modelInfo
          }),
          responseText      : aiResult.data,
          responseJson      : parsedJson as Prisma.InputJsonValue,
          parseError        : null,
          schemaError       : error instanceof Error ? error.message : String(error),
          discardReason     : null,
          promptTokens      : aiResult.usage?.promptTokens ?? null,
          completionTokens  : aiResult.usage?.completionTokens ?? null
        });
        throw error;
      }

      const normalized = await normalizer.normalizeChapterExtraction({
        bookId     : input.bookId,
        chapterId  : input.chapter.id,
        chapterNo  : input.chapter.no,
        runId      : input.runId,
        chapterText: input.chapter.content,
        segments,
        envelope
      });

      const persisted = await persister.persistChapterClaims({
        scope: {
          bookId   : input.bookId,
          chapterId: input.chapter.id,
          runId    : input.runId,
          stageKey : STAGE_A_STAGE_KEY
        },
        normalized
      });

      const rawOutput = await stageRunService.recordRawOutput({
        runId             : input.runId,
        stageRunId        : started.id,
        bookId            : input.bookId,
        chapterId         : input.chapter.id,
        provider          : modelInfo?.provider ?? "unknown",
        model             : modelInfo?.modelId ?? aiResult.modelId,
        requestPayload    : toRequestPayload({
          chapter : input.chapter,
          prompt,
          segments,
          modelInfo
        }),
        responseText      : aiResult.data,
        responseJson      : parsedJson as Prisma.InputJsonValue,
        parseError        : null,
        schemaError       : null,
        discardReason     : summarizeStageADiscards(persisted.discardRecords),
        promptTokens      : aiResult.usage?.promptTokens ?? null,
        completionTokens  : aiResult.usage?.completionTokens ?? null
      });

      const outputCount =
        persisted.persistedCounts.mentions
        + persisted.persistedCounts.times
        + persisted.persistedCounts.events
        + persisted.persistedCounts.relations;

      await stageRunService.succeedStageRun(started.id, {
        outputHash: stableHash({
          persistedCounts: persisted.persistedCounts,
          discards       : persisted.discardRecords
        }),
        outputCount,
        skippedCount     : persisted.discardRecords.length,
        promptTokens     : aiResult.usage?.promptTokens ?? null,
        completionTokens : aiResult.usage?.completionTokens ?? null
      });

      return {
        bookId        : input.bookId,
        chapterId     : input.chapter.id,
        runId         : input.runId,
        stageRunId    : started.id,
        rawOutputId   : rawOutput.id,
        modelId       : modelInfo?.modelId ?? aiResult.modelId,
        isFallback    : aiResult.isFallback,
        inputCount    : segments.length,
        outputCount,
        skippedCount  : persisted.discardRecords.length,
        persistedCounts: persisted.persistedCounts,
        discardRecords: persisted.discardRecords
      };
    } catch (error) {
      await stageRunService.failStageRun(started.id, error, failureClass
        ? { errorClass: failureClass }
        : {});
      throw error;
    }
  }

  return {
    runStageAForChapter
  };
}

export type StageAExtractionPipeline = ReturnType<typeof createStageAExtractionPipeline>;
export const stageAExtractionPipeline = createStageAExtractionPipeline();
```

Create `src/server/modules/analysis/pipelines/evidence-review/stageA/index.ts`:

```ts
export * from "@/server/modules/analysis/pipelines/evidence-review/stageA/types";
export * from "@/server/modules/analysis/pipelines/evidence-review/stageA/prompt-contracts";
export * from "@/server/modules/analysis/pipelines/evidence-review/stageA/claim-normalizer";
export * from "@/server/modules/analysis/pipelines/evidence-review/stageA/claim-persister";
export * from "@/server/modules/analysis/pipelines/evidence-review/stageA/StageAExtractionPipeline";
```

- [ ] **Step 4: Run the pipeline tests to verify they pass**

Run:

```bash
pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stageA/StageAExtractionPipeline.test.ts --coverage=false
```

Expected: PASS.

- [ ] **Step 5: Run the full focused Stage A suite**

Run:

```bash
pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stage0/persisted-reader.test.ts src/server/modules/analysis/pipelines/evidence-review/stageA/types.test.ts src/server/modules/analysis/pipelines/evidence-review/stageA/prompt-contracts.test.ts src/server/modules/analysis/pipelines/evidence-review/stageA/claim-normalizer.test.ts src/server/modules/analysis/pipelines/evidence-review/stageA/claim-persister.test.ts src/server/modules/analysis/pipelines/evidence-review/stageA/StageAExtractionPipeline.test.ts --coverage=false
```

Expected: PASS.

- [ ] **Step 6: Commit the Stage A pipeline**

```bash
git add src/server/modules/analysis/pipelines/evidence-review/stageA/StageAExtractionPipeline.ts src/server/modules/analysis/pipelines/evidence-review/stageA/StageAExtractionPipeline.test.ts src/server/modules/analysis/pipelines/evidence-review/stageA/index.ts
git commit -m "feat: implement stage a extraction pipeline"
```

## Task 6: Validate And Update Task Tracking Docs

**Files:**
- Modify: `docs/superpowers/tasks/2026-04-18-evidence-review/06-stage-a-extraction.md`
- Modify: `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`

- [ ] **Step 1: Run the final validation commands**

Run:

```bash
pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stage0/persisted-reader.test.ts src/server/modules/analysis/pipelines/evidence-review/stageA/types.test.ts src/server/modules/analysis/pipelines/evidence-review/stageA/prompt-contracts.test.ts src/server/modules/analysis/pipelines/evidence-review/stageA/claim-normalizer.test.ts src/server/modules/analysis/pipelines/evidence-review/stageA/claim-persister.test.ts src/server/modules/analysis/pipelines/evidence-review/stageA/StageAExtractionPipeline.test.ts --coverage=false
pnpm type-check
```

Expected: both commands pass.

- [ ] **Step 2: Update the T06 task doc execution record**

Edit `docs/superpowers/tasks/2026-04-18-evidence-review/06-stage-a-extraction.md` so the execution checklist is fully checked and the execution record becomes:

```md
## Execution Checkpoints

- [x] Define Stage A prompt and JSON response contract for mentions, events, relations, and time hints.
- [x] Ensure the prompt explicitly requires evidence text and conservative uncertainty handling.
- [x] Implement response parsing and schema validation.
- [x] Convert valid model outputs into T03 claim DTOs.
- [x] Reject or discard outputs that lack valid evidence spans and record discard reasons.
- [x] Persist raw prompts, raw responses, parse errors, and schema errors through T04 raw output retention.
- [x] Implement chapter-level idempotent rerun.
- [x] Add tests for normal extraction, empty extraction, invalid JSON, missing evidence, custom relation label, and rerun idempotency.
- [x] Add an execution record and mark T06 complete in the runbook only after validation passes.

## Execution Record

- 2026-04-19: Implemented Stage A chapter extraction on top of persisted `chapter_segments`, using local `segmentIndex + quotedText` evidence mapping, explicit discard records, and raw prompt/response retention.
- Validation:
  - `pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stage0/persisted-reader.test.ts src/server/modules/analysis/pipelines/evidence-review/stageA/types.test.ts src/server/modules/analysis/pipelines/evidence-review/stageA/prompt-contracts.test.ts src/server/modules/analysis/pipelines/evidence-review/stageA/claim-normalizer.test.ts src/server/modules/analysis/pipelines/evidence-review/stageA/claim-persister.test.ts src/server/modules/analysis/pipelines/evidence-review/stageA/StageAExtractionPipeline.test.ts --coverage=false`
  - `pnpm type-check`
- Result: a single chapter can now produce evidence-backed mention, time, event, and relation claims without creating personas, and all parse/schema/discard failures remain traceable.
```

- [ ] **Step 3: Update the runbook task status and completion record**

Edit `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md` in two places.

First, change the task status line:

```md
- [x] T06: `docs/superpowers/tasks/2026-04-18-evidence-review/06-stage-a-extraction.md`
```

Then append the completion block:

```md
### T06 Completion - 2026-04-19

- Changed files: `src/server/modules/analysis/pipelines/evidence-review/stage0/repository.ts`, `src/server/modules/analysis/pipelines/evidence-review/stage0/persisted-reader.test.ts`, `src/server/modules/analysis/pipelines/evidence-review/stageA/types.ts`, `src/server/modules/analysis/pipelines/evidence-review/stageA/types.test.ts`, `src/server/modules/analysis/pipelines/evidence-review/stageA/prompt-contracts.ts`, `src/server/modules/analysis/pipelines/evidence-review/stageA/prompt-contracts.test.ts`, `src/server/modules/analysis/pipelines/evidence-review/stageA/claim-normalizer.ts`, `src/server/modules/analysis/pipelines/evidence-review/stageA/claim-normalizer.test.ts`, `src/server/modules/analysis/pipelines/evidence-review/stageA/claim-persister.ts`, `src/server/modules/analysis/pipelines/evidence-review/stageA/claim-persister.test.ts`, `src/server/modules/analysis/pipelines/evidence-review/stageA/StageAExtractionPipeline.ts`, `src/server/modules/analysis/pipelines/evidence-review/stageA/StageAExtractionPipeline.test.ts`, `src/server/modules/analysis/pipelines/evidence-review/stageA/index.ts`, `docs/superpowers/tasks/2026-04-18-evidence-review/06-stage-a-extraction.md`, `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`
- Validation commands: `pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stage0/persisted-reader.test.ts src/server/modules/analysis/pipelines/evidence-review/stageA/types.test.ts src/server/modules/analysis/pipelines/evidence-review/stageA/prompt-contracts.test.ts src/server/modules/analysis/pipelines/evidence-review/stageA/claim-normalizer.test.ts src/server/modules/analysis/pipelines/evidence-review/stageA/claim-persister.test.ts src/server/modules/analysis/pipelines/evidence-review/stageA/StageAExtractionPipeline.test.ts --coverage=false`, `pnpm type-check`
- Result: Stage A extraction now consumes persisted Stage 0 segments, keeps raw output observability, materializes evidence-backed claims conservatively, and supports chapter-level rerun-safe persistence.
- Follow-up risks: Stage A+ recall and relation catalog governance are still pending T07/T18; long-chapter token pressure is still managed only by one-chapter prompts until T19 cost-control work lands.
- Next task: T07 `docs/superpowers/tasks/2026-04-18-evidence-review/07-stage-a-plus-knowledge-recall.md`
```

- [ ] **Step 4: Verify the doc state**

Run:

```bash
rg -n "T06:|T06 Completion|Execution Record" docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md docs/superpowers/tasks/2026-04-18-evidence-review/06-stage-a-extraction.md
```

Expected: the runbook shows `- [x] T06`, the completion block exists, and the task doc has the updated execution record.

- [ ] **Step 5: Commit the validation record**

```bash
git add docs/superpowers/tasks/2026-04-18-evidence-review/06-stage-a-extraction.md docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md
git commit -m "docs: record stage a extraction completion"
```

## Self-Review

### Spec Coverage Check

- §5.1 `chapter_segments` / `evidence_spans` as Stage A input and evidence anchor: Task 1, Task 3, Task 5
- §5.2 `entity_mentions`, `event_claims`, `relation_claims`, `time_claims`: Task 2, Task 3, Task 4
- §7.2 Stage A prompt/output/raw retention requirements: Task 2, Task 5
- T06 task doc acceptance around invalid JSON, missing evidence, custom relation label, rerun idempotency: Task 3, Task 4, Task 5
- `relationTypeKey` open-string requirement and `relationTypeSource` behavior: Task 2, Task 3

No scope gaps remain inside T06. Intentional deferrals are Stage A+ knowledge recall in T07, relation catalog governance in T18, and rerun skip logic in T19.

### Placeholder Scan

Run after saving the plan:

```bash
rg -n "TO(DO)|TB(D)|implement[[:space:]]later|similar[[:space:]]to[[:space:]]Task" docs/superpowers/plans/2026-04-19-t06-stage-a-extraction-implementation-plan.md
```

Expected: no matches.

### Type Consistency Check

- `STAGE_A_STAGE_KEY` stays `stage_a_extraction` across persister, pipeline, and runbook text.
- Event/relation pending drafts keep database foreign keys nullable until the persister resolves local refs.
- `segmentIndex + quotedText` is the only model-visible evidence locator in prompt, schema, normalizer, and tests.
- `relationTypeKey` remains a string from prompt contract through persisted relation claim creation.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-19-t06-stage-a-extraction-implementation-plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
