# T05 Stage 0 Segmentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement deterministic Stage 0 chapter normalization and segmentation so later extraction stages can consume persisted, offset-safe `chapter_segments`.

**Architecture:** Add a focused Stage 0 module under `analysis/pipelines/evidence-review/stage0` with pure rule segmentation, a narrow Prisma persistence adapter, and an orchestration service that records T04 stage runs. Keep raw chapter text offsets as the only source coordinate system and reject any segment that cannot slice back to the original chapter content.

**Tech Stack:** TypeScript strict, Vitest, Prisma 7 generated client, PostgreSQL additive migration, existing T02 evidence offset helpers, existing T04 `analysisStageRunService`

---

## Source Of Truth

- Architecture spec: `docs/superpowers/specs/2026-04-18-evidence-review-architecture-rewrite-design.md`
- Task doc: `docs/superpowers/tasks/2026-04-18-evidence-review/05-stage-0-segmentation.md`
- Runbook: `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`
- TDD guide: `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-tdd-guide.md`
- Upstream modules:
  - T02 evidence helpers: `src/server/modules/analysis/evidence/offset-map.ts`
  - T04 stage run service: `src/server/modules/analysis/runs/stage-run-service.ts`

## Scope Constraints

- Do not create personas, claims, projections, final graph objects, or review UI in T05.
- Do not call any model provider. Stage 0 is deterministic rules only.
- Do not accept a segment unless `chapter.content.slice(startOffset, endOffset) === rawText`.
- Do not fabricate a `TITLE` segment from `Chapter.title` when the title text is not present in `Chapter.content`.
- Do not rename the existing Prisma `ChapterSegment.text` column in this task. Code DTOs may call it `rawText`; repository maps `rawText` to `text`.
- Stop if raw imported chapter text has already lost structure needed for offset anchoring.

## Current Repo Facts

- Existing legacy preprocessor lives in `src/server/modules/analysis/preprocessor/*`; it emits old `NARRATIVE | POEM | DIALOGUE | COMMENTARY` regions and writes `ChapterPreprocessResult`. T05 must not extend it as the new evidence-review source of truth.
- `prisma/schema.prisma` already has `ChapterSegmentType` with `TITLE`, `NARRATIVE`, `DIALOGUE_LEAD`, `DIALOGUE_CONTENT`, `POEM`, `COMMENTARY`, `UNKNOWN`.
- `prisma/schema.prisma` already has `ChapterSegment`, but it lacks `confidence`. The T05 task and architecture spec require persisted confidence, so this plan includes one additive schema migration.
- `ChapterSegment.text` is the existing raw text column. The architecture spec calls the field `rawText`; keep DTO naming explicit and map to `text` only at persistence boundary.
- T04 exposes `createAnalysisStageRunService()` and `analysisStageRunService` with `startStageRun`, `succeedStageRun`, and `failStageRun`.

## File Structure

- Modify `prisma/schema.prisma`
  - Responsibility: add only `ChapterSegment.confidence`.
- Create `prisma/migrations/20260419210000_stage0_chapter_segment_confidence/migration.sql`
  - Responsibility: additive SQL migration for persisted segment confidence.
- Create `src/server/modules/analysis/pipelines/evidence-review/stage0/types.ts`
  - Responsibility: Stage 0 DTOs, constants, confidence types, and offset validation helpers. No Prisma client dependency.
- Create `src/server/modules/analysis/pipelines/evidence-review/stage0/types.test.ts`
  - Responsibility: prove DTO constants and offset validation reject invalid or unmappable ranges.
- Create `src/server/modules/analysis/pipelines/evidence-review/stage0/segment-rules.ts`
  - Responsibility: deterministic text normalization and segmentation rules. No Prisma writes and no stage-run writes.
- Create `src/server/modules/analysis/pipelines/evidence-review/stage0/segment-rules.test.ts`
  - Responsibility: prove title, narrative, dialogue lead/content, poem, commentary, unknown, low-confidence, ordering, and offset integrity.
- Create `src/server/modules/analysis/pipelines/evidence-review/stage0/repository.ts`
  - Responsibility: persist and list `chapter_segments` with idempotent replace-by-run/chapter behavior.
- Create `src/server/modules/analysis/pipelines/evidence-review/stage0/repository.test.ts`
  - Responsibility: prove repository maps DTO `rawText` to Prisma `text`, deletes then creates, and orders reads by `segmentIndex`.
- Create `src/server/modules/analysis/pipelines/evidence-review/stage0/Stage0Segmenter.ts`
  - Responsibility: run Stage 0 for one or more chapters, record T04 stage run attempts, and expose whole-book/chapter-level rerun entrypoints.
- Create `src/server/modules/analysis/pipelines/evidence-review/stage0/Stage0Segmenter.test.ts`
  - Responsibility: prove orchestration success/failure records stage runs, writes segments, supports rerun, and computes stable hashes.
- Create `src/server/modules/analysis/pipelines/evidence-review/stage0/index.ts`
  - Responsibility: barrel export for T06 and later stages.
- Modify `docs/superpowers/tasks/2026-04-18-evidence-review/05-stage-0-segmentation.md`
  - Responsibility: final execution record only after validation passes.
- Modify `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`
  - Responsibility: mark T05 complete only after validation passes.

## Modeling Decisions

- `Stage0SegmentType` should reuse generated Prisma values at persistence boundary, but `types.ts` should define local string constants so pure segmentation tests do not depend on Prisma runtime.
- Segment offsets are UTF-16 string indexes, matching `String.prototype.slice` and T02 evidence helpers.
- `normalizedText` is computed with `normalizeTextForEvidence(rawText)`, not with a separate normalization algorithm.
- `TITLE` is created only when the chapter title appears at the beginning of `chapter.content` or within the first 200 original characters.
- Dialogue is persisted as two separate segment types:
  - `DIALOGUE_LEAD`: the speaker introducer such as `王冕道：`.
  - `DIALOGUE_CONTENT`: the quoted speech including paired quote marks.
- `speakerHint` is attached to both dialogue lead and content when the lead parser can extract it.
- `UNKNOWN` segments are persisted for non-empty leftover ranges that cannot be reliably classified. This is intentional because auditability is more important than hiding uncertainty.
- Segment confidence is numeric:
  - `0.95` for deterministic known segments.
  - `0.85` for best-effort title matches.
  - `0.30` for unknown segments.
- Chapter confidence is separate from segment confidence:
  - `HIGH` when unknown character ratio is `<= 0.10` and no offset validation errors occur.
  - `LOW` when unknown character ratio is `> 0.10`.
- Stage key is exactly `STAGE_0` for `AnalysisStageRun.stageKey`.

## Task 1: Add Persisted Segment Confidence

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260419210000_stage0_chapter_segment_confidence/migration.sql`
- Regenerate: `src/generated/prisma/**`

- [ ] **Step 1: Patch the Prisma schema**

In `prisma/schema.prisma`, update `model ChapterSegment` by adding `confidence Float @default(1)` immediately after `normalizedText`:

```prisma
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
  confidence     Float              @default(1)
  speakerHint    String?            @map("speaker_hint")
  createdAt      DateTime           @default(now()) @map("created_at") @db.Timestamptz(6)

  @@unique([runId, chapterId, segmentIndex], map: "chapter_segments_run_chapter_index_key")
  @@index([chapterId, segmentType], map: "chapter_segments_chapter_type_idx")
  @@map("chapter_segments")
}
```

- [ ] **Step 2: Create the additive SQL migration**

Create `prisma/migrations/20260419210000_stage0_chapter_segment_confidence/migration.sql`:

```sql
ALTER TABLE "chapter_segments"
ADD COLUMN "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1;
```

- [ ] **Step 3: Format and validate schema**

Run:

```bash
pnpm prisma format --schema prisma/schema.prisma
pnpm prisma validate --schema prisma/schema.prisma
```

Expected: both commands pass.

- [ ] **Step 4: Guard against destructive SQL**

Run:

```bash
rg -n "DROP TABLE|DROP COLUMN|ALTER COLUMN .* TYPE|TRUNCATE|DELETE FROM" prisma/migrations/20260419210000_stage0_chapter_segment_confidence/migration.sql
```

Expected: no matches.

- [ ] **Step 5: Regenerate Prisma client**

Run:

```bash
pnpm prisma:generate
```

Expected: generated Prisma client exposes `ChapterSegment.confidence`.

- [ ] **Step 6: Commit schema confidence field**

```bash
git add prisma/schema.prisma prisma/migrations/20260419210000_stage0_chapter_segment_confidence/migration.sql src/generated/prisma
git commit -m "feat: add chapter segment confidence"
```

## Task 2: Define Stage 0 Types And Offset Validation

**Files:**
- Create: `src/server/modules/analysis/pipelines/evidence-review/stage0/types.test.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stage0/types.ts`

- [ ] **Step 1: Write the failing type contract tests**

Create `src/server/modules/analysis/pipelines/evidence-review/stage0/types.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  STAGE0_SEGMENT_TYPE_VALUES,
  Stage0SegmentOffsetError,
  assertStage0SegmentOffsets,
  calculateStage0ChapterConfidence
} from "@/server/modules/analysis/pipelines/evidence-review/stage0/types";

describe("Stage 0 type contracts", () => {
  it("keeps the exact segment type contract required by chapter_segments", () => {
    expect(STAGE0_SEGMENT_TYPE_VALUES).toEqual([
      "TITLE",
      "NARRATIVE",
      "DIALOGUE_LEAD",
      "DIALOGUE_CONTENT",
      "POEM",
      "COMMENTARY",
      "UNKNOWN"
    ]);
  });

  it("accepts offsets only when they slice back to the declared raw text", () => {
    const chapterText = "王冕道：“明日再谈。”后来回家读书。";

    expect(() => assertStage0SegmentOffsets({
      chapterText,
      startOffset: 0,
      endOffset  : 4,
      rawText    : "王冕道："
    })).not.toThrow();
  });

  it("rejects ranges outside the original chapter text", () => {
    const chapterText = "王冕读书。";

    expect(() => assertStage0SegmentOffsets({
      chapterText,
      startOffset: 0,
      endOffset  : 999,
      rawText    : chapterText
    })).toThrow(Stage0SegmentOffsetError);
  });

  it("rejects ranges whose raw text does not match the original slice", () => {
    const chapterText = "王冕读书。";

    expect(() => assertStage0SegmentOffsets({
      chapterText,
      startOffset: 0,
      endOffset  : 2,
      rawText    : "秦老"
    })).toThrow("does not match chapter text");
  });

  it("marks chapter confidence low when unknown ratio is above ten percent", () => {
    expect(calculateStage0ChapterConfidence({ unknownRatio: 0.10 })).toBe("HIGH");
    expect(calculateStage0ChapterConfidence({ unknownRatio: 0.10001 })).toBe("LOW");
  });
});
```

- [ ] **Step 2: Run the failing type tests**

Run:

```bash
pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stage0/types.test.ts --coverage=false
```

Expected: fail because `types.ts` does not exist.

- [ ] **Step 3: Implement the Stage 0 types**

Create `src/server/modules/analysis/pipelines/evidence-review/stage0/types.ts`:

```ts
export const STAGE0_SEGMENT_TYPE_VALUES = [
  "TITLE",
  "NARRATIVE",
  "DIALOGUE_LEAD",
  "DIALOGUE_CONTENT",
  "POEM",
  "COMMENTARY",
  "UNKNOWN"
] as const;

export type Stage0SegmentType = (typeof STAGE0_SEGMENT_TYPE_VALUES)[number];

export type Stage0ChapterConfidence = "HIGH" | "LOW";

export interface Stage0ChapterInput {
  bookId : string;
  runId  : string;
  chapter: {
    id     : string;
    no     : number;
    title  : string;
    content: string;
  };
}

export interface Stage0SegmentDraft {
  bookId        : string;
  chapterId     : string;
  runId         : string;
  segmentIndex  : number;
  segmentType   : Stage0SegmentType;
  startOffset   : number;
  endOffset     : number;
  rawText       : string;
  normalizedText: string;
  confidence    : number;
  speakerHint   : string | null;
}

export interface Stage0LowConfidenceReason {
  code   : "UNKNOWN_RATIO_HIGH" | "OFFSET_VALIDATION_FAILED";
  message: string;
}

export interface Stage0ChapterSegmentationResult {
  bookId              : string;
  chapterId           : string;
  runId               : string;
  chapterNo           : number;
  segments            : Stage0SegmentDraft[];
  confidence          : Stage0ChapterConfidence;
  unknownRatio        : number;
  lowConfidenceReasons: Stage0LowConfidenceReason[];
}

export interface Stage0SegmentRunInput {
  bookId : string;
  runId  : string | null;
  attempt?: number;
  chapters: Array<{
    id     : string;
    no     : number;
    title  : string;
    content: string;
  }>;
}

export interface Stage0SegmentRunResult {
  bookId       : string;
  runId        : string | null;
  stageRunId   : string | null;
  inputCount   : number;
  outputCount  : number;
  skippedCount : number;
  chapterResults: Stage0ChapterSegmentationResult[];
}

export class Stage0SegmentOffsetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Stage0SegmentOffsetError";
  }
}

export function assertStage0SegmentOffsets(input: {
  chapterText : string;
  startOffset : number;
  endOffset   : number;
  rawText     : string;
}): void {
  if (
    !Number.isInteger(input.startOffset)
    || !Number.isInteger(input.endOffset)
    || input.startOffset < 0
    || input.endOffset <= input.startOffset
    || input.endOffset > input.chapterText.length
  ) {
    throw new Stage0SegmentOffsetError(
      `Invalid Stage 0 segment offsets: ${input.startOffset}-${input.endOffset}`
    );
  }

  const actual = input.chapterText.slice(input.startOffset, input.endOffset);
  if (actual !== input.rawText) {
    throw new Stage0SegmentOffsetError(
      `Stage 0 segment ${input.startOffset}-${input.endOffset} does not match chapter text`
    );
  }
}

export function calculateStage0ChapterConfidence(input: {
  unknownRatio: number;
}): Stage0ChapterConfidence {
  return input.unknownRatio > 0.10 ? "LOW" : "HIGH";
}
```

- [ ] **Step 4: Run the type tests again**

Run:

```bash
pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stage0/types.test.ts --coverage=false
```

Expected: pass.

- [ ] **Step 5: Commit type contracts**

```bash
git add src/server/modules/analysis/pipelines/evidence-review/stage0/types.ts src/server/modules/analysis/pipelines/evidence-review/stage0/types.test.ts
git commit -m "feat: define stage 0 segmentation contracts"
```

## Task 3: Implement Pure Deterministic Segment Rules

**Files:**
- Create: `src/server/modules/analysis/pipelines/evidence-review/stage0/segment-rules.test.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stage0/segment-rules.ts`

- [ ] **Step 1: Write failing segmentation rule tests**

Create `src/server/modules/analysis/pipelines/evidence-review/stage0/segment-rules.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { normalizeTextForEvidence } from "@/server/modules/analysis/evidence/offset-map";
import { segmentChapterText } from "@/server/modules/analysis/pipelines/evidence-review/stage0/segment-rules";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";
const CHAPTER_ID = "22222222-2222-4222-8222-222222222222";
const RUN_ID = "33333333-3333-4333-8333-333333333333";

function segment(content: string, title = "第一回 王冕读书") {
  return segmentChapterText({
    bookId : BOOK_ID,
    runId  : RUN_ID,
    chapter: {
      id: CHAPTER_ID,
      no: 1,
      title,
      content
    }
  });
}

describe("segmentChapterText", () => {
  it("creates a TITLE segment only when the title is present in the raw content", () => {
    const content = "第一回 王冕读书\n王冕在村中读书，日日用功，乡人都称赞他。";

    const result = segment(content);

    expect(result.segments[0]).toMatchObject({
      segmentType: "TITLE",
      startOffset: 0,
      rawText: "第一回 王冕读书",
      confidence: 0.85
    });
    expect(result.segments[0].normalizedText).toBe(normalizeTextForEvidence("第一回 王冕读书"));
  });

  it("does not fabricate TITLE from Chapter.title when raw content does not contain it", () => {
    const result = segment("王冕在村中读书，日日用功，乡人都称赞他。");

    expect(result.segments.some((item) => item.segmentType === "TITLE")).toBe(false);
  });

  it("splits dialogue into DIALOGUE_LEAD and DIALOGUE_CONTENT with speaker hints", () => {
    const content = "王冕道：“秦老深夜来此，必有要事相商。”后来两人坐下细谈。";

    const result = segment(content, "不存在的标题");

    expect(result.segments.map((item) => item.segmentType)).toEqual([
      "DIALOGUE_LEAD",
      "DIALOGUE_CONTENT",
      "NARRATIVE"
    ]);
    expect(result.segments[0]).toMatchObject({
      segmentType: "DIALOGUE_LEAD",
      rawText: "王冕道：",
      speakerHint: "王冕"
    });
    expect(result.segments[1]).toMatchObject({
      segmentType: "DIALOGUE_CONTENT",
      rawText: "“秦老深夜来此，必有要事相商。”",
      speakerHint: "王冕"
    });
  });

  it("recognizes poem regions before narrative and dialogue", () => {
    const content = "王冕看罢，心中感叹。\n诗曰：天行健，君子以自强不息。此诗甚妙。\n王冕掩卷长思。";

    const result = segment(content, "不存在的标题");

    const poem = result.segments.find((item) => item.segmentType === "POEM");
    expect(poem).toBeDefined();
    expect(poem!.rawText).toContain("诗曰");
    expect(poem!.rawText).toContain("此诗");
    expect(result.segments.some((item) => item.segmentType === "DIALOGUE_CONTENT")).toBe(false);
  });

  it("recognizes commentary line starts", () => {
    const content = "却说这几位乡绅，平日好做面子功夫，暗地里各怀心思。\n王冕只是微微一笑。";

    const result = segment(content, "不存在的标题");

    expect(result.segments.map((item) => item.segmentType)).toEqual(["COMMENTARY", "NARRATIVE"]);
    expect(result.segments[0].rawText.startsWith("却说")).toBe(true);
  });

  it("persists UNKNOWN for non-empty unclassified leftovers and marks chapter low confidence", () => {
    const content = "!!! ### @@@\nabc 123 xyz\n王冕读书";

    const result = segment(content, "不存在的标题");

    expect(result.segments.some((item) => item.segmentType === "UNKNOWN")).toBe(true);
    expect(result.confidence).toBe("LOW");
    expect(result.unknownRatio).toBeGreaterThan(0.10);
    expect(result.lowConfidenceReasons).toEqual([
      expect.objectContaining({ code: "UNKNOWN_RATIO_HIGH" })
    ]);
  });

  it("keeps all segment offsets mapped to original raw content", () => {
    const content = "第一回 王冕读书\r\n王冕道：“明日再谈。”\r\n且说他后来回家读书。";

    const result = segment(content);

    for (const item of result.segments) {
      expect(content.slice(item.startOffset, item.endOffset)).toBe(item.rawText);
      expect(item.normalizedText).toBe(normalizeTextForEvidence(item.rawText));
    }
    expect(result.segments.map((item) => item.segmentIndex)).toEqual([0, 1, 2, 3]);
  });
});
```

- [ ] **Step 2: Run the failing segmentation tests**

Run:

```bash
pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stage0/segment-rules.test.ts --coverage=false
```

Expected: fail because `segment-rules.ts` does not exist.

- [ ] **Step 3: Implement deterministic segmentation rules**

Create `src/server/modules/analysis/pipelines/evidence-review/stage0/segment-rules.ts`.

Use this exact exported API:

```ts
import { normalizeTextForEvidence } from "@/server/modules/analysis/evidence/offset-map";
import {
  assertStage0SegmentOffsets,
  calculateStage0ChapterConfidence,
  type Stage0ChapterInput,
  type Stage0ChapterSegmentationResult,
  type Stage0LowConfidenceReason,
  type Stage0SegmentDraft,
  type Stage0SegmentType
} from "@/server/modules/analysis/pipelines/evidence-review/stage0/types";

const KNOWN_CONFIDENCE = 0.95;
const TITLE_CONFIDENCE = 0.85;
const UNKNOWN_CONFIDENCE = 0.30;
const TITLE_SEARCH_LIMIT = 200;
const POEM_TRIGGER_REGEX = /有诗为证|有词为证|诗曰|词曰/g;
const POEM_CLOSER_REGEX = /此诗|此词/;
const POEM_MAX_LENGTH = 500;
const BLANK_LINE_REGEX = /\n\s*\n/;
const QUOTE_PATTERN_REGEX = /[\u201c\u300c\u300e][^\u201d\u300d\u300f]*[\u201d\u300d\u300f]/g;
const INTRODUCER_REGEX = /([\u4e00-\u9fff]{2,4}?)(?:笑|怒|答|问|叹|喝|唤|吩|咐|回|又|便|忙|复|大){0,3}(?:道|说|言|曰)[：:]?\s*$/;
const INTRODUCER_LOOKBACK = 20;
const COMMENTARY_TRIGGERS = ["却说", "话说", "看官听说", "且说", "按", "诸君试看", "原来"] as const;
const PARAGRAPH_MIN_CJK = 5;
const PARAGRAPH_MIN_CJK_DENSITY = 0.4;
const CJK_CHAR_REGEX = /[\u4e00-\u9fff]/g;

interface ClaimedRange {
  startOffset: number;
  endOffset  : number;
  segmentType: Stage0SegmentType;
  confidence : number;
  speakerHint: string | null;
}
```

Implement these internal helpers in the same file:

```ts
function createSegment(input: {
  source       : Stage0ChapterInput;
  range        : ClaimedRange;
  segmentIndex : number;
}): Stage0SegmentDraft {
  const rawText = input.source.chapter.content.slice(
    input.range.startOffset,
    input.range.endOffset
  );

  const segment: Stage0SegmentDraft = {
    bookId        : input.source.bookId,
    chapterId     : input.source.chapter.id,
    runId         : input.source.runId,
    segmentIndex  : input.segmentIndex,
    segmentType   : input.range.segmentType,
    startOffset   : input.range.startOffset,
    endOffset     : input.range.endOffset,
    rawText,
    normalizedText: normalizeTextForEvidence(rawText),
    confidence    : input.range.confidence,
    speakerHint   : input.range.speakerHint
  };

  assertStage0SegmentOffsets({
    chapterText: input.source.chapter.content,
    startOffset: segment.startOffset,
    endOffset  : segment.endOffset,
    rawText    : segment.rawText
  });

  return segment;
}

function countCjk(text: string): number {
  return (text.match(CJK_CHAR_REGEX) ?? []).length;
}

function hasMeaningfulCjk(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return false;
  }

  const cjk = countCjk(trimmed);
  return cjk >= PARAGRAPH_MIN_CJK && cjk / trimmed.length >= PARAGRAPH_MIN_CJK_DENSITY;
}

function classifyText(text: string): Stage0SegmentType {
  const trimmed = text.trim();
  for (const trigger of COMMENTARY_TRIGGERS) {
    if (trimmed.startsWith(trigger)) {
      return "COMMENTARY";
    }
  }

  return hasMeaningfulCjk(trimmed) ? "NARRATIVE" : "UNKNOWN";
}

function overlaps(startOffset: number, endOffset: number, ranges: ClaimedRange[]): boolean {
  return ranges.some((range) => startOffset < range.endOffset && endOffset > range.startOffset);
}
```

Implement `findTitleRange`, `findPoemRanges`, `findDialogueRanges`, line splitting, subtracting claimed ranges, and final composition with these contracts:

```ts
function findTitleRange(source: Stage0ChapterInput): ClaimedRange | null {
  const title = source.chapter.title.trim();
  if (title.length === 0) {
    return null;
  }

  const searchSurface = source.chapter.content.slice(0, TITLE_SEARCH_LIMIT);
  const startOffset = searchSurface.indexOf(title);
  if (startOffset < 0) {
    return null;
  }

  return {
    startOffset,
    endOffset  : startOffset + title.length,
    segmentType: "TITLE",
    confidence : TITLE_CONFIDENCE,
    speakerHint: null
  };
}

function findPoemRanges(chapterText: string, protectedRanges: ClaimedRange[]): ClaimedRange[] {
  const ranges: ClaimedRange[] = [];
  let lastEnd = -1;

  for (const match of chapterText.matchAll(POEM_TRIGGER_REGEX)) {
    const startOffset = match.index;
    if (startOffset < lastEnd || overlaps(startOffset, startOffset + match[0].length, protectedRanges)) {
      continue;
    }

    const triggerEnd = startOffset + match[0].length;
    const tail = chapterText.slice(triggerEnd);
    const candidates: number[] = [];
    const closer = tail.match(POEM_CLOSER_REGEX);
    const blankLineIndex = tail.search(BLANK_LINE_REGEX);

    if (closer && closer.index !== undefined) {
      const afterCloser = closer.index + closer[0].length;
      const tailAfterCloser = tail.slice(afterCloser);
      const sentenceEnd = tailAfterCloser.search(/[\n。]/);
      candidates.push(sentenceEnd >= 0 ? afterCloser + sentenceEnd + 1 : afterCloser);
    }
    if (blankLineIndex >= 0) {
      candidates.push(blankLineIndex);
    }
    candidates.push(POEM_MAX_LENGTH);

    const relativeEnd = Math.min(...candidates, tail.length);
    const endOffset = triggerEnd + relativeEnd;
    ranges.push({
      startOffset,
      endOffset,
      segmentType: "POEM",
      confidence : KNOWN_CONFIDENCE,
      speakerHint: null
    });
    lastEnd = endOffset;
  }

  return ranges;
}
```

For dialogue, produce two ranges per quote when a lead exists and one `DIALOGUE_CONTENT` range when no lead exists:

```ts
function findDialogueRanges(chapterText: string, protectedRanges: ClaimedRange[]): ClaimedRange[] {
  const ranges: ClaimedRange[] = [];

  for (const match of chapterText.matchAll(QUOTE_PATTERN_REGEX)) {
    const quoteStart = match.index;
    const quoteEnd = quoteStart + match[0].length;
    if (overlaps(quoteStart, quoteEnd, protectedRanges)) {
      continue;
    }

    const lookbackFrom = Math.max(0, quoteStart - INTRODUCER_LOOKBACK);
    const lookback = chapterText.slice(lookbackFrom, quoteStart);
    const intro = lookback.match(INTRODUCER_REGEX);
    let speakerHint: string | null = null;

    if (intro && intro.index !== undefined) {
      const leadStart = lookbackFrom + intro.index;
      if (!overlaps(leadStart, quoteStart, protectedRanges)) {
        speakerHint = intro[1];
        ranges.push({
          startOffset: leadStart,
          endOffset  : quoteStart,
          segmentType: "DIALOGUE_LEAD",
          confidence : KNOWN_CONFIDENCE,
          speakerHint
        });
      }
    }

    ranges.push({
      startOffset: quoteStart,
      endOffset  : quoteEnd,
      segmentType: "DIALOGUE_CONTENT",
      confidence : KNOWN_CONFIDENCE,
      speakerHint
    });
  }

  return ranges;
}
```

For remaining ranges, split by newline-preserving lines, subtract claimed ranges, and classify non-empty leftovers as `NARRATIVE`, `COMMENTARY`, or `UNKNOWN`.

Export the public function:

```ts
export function segmentChapterText(input: Stage0ChapterInput): Stage0ChapterSegmentationResult {
  const ranges: ClaimedRange[] = [];
  const titleRange = findTitleRange(input);
  if (titleRange) {
    ranges.push(titleRange);
  }

  const poemRanges = findPoemRanges(input.chapter.content, ranges);
  ranges.push(...poemRanges);

  const dialogueRanges = findDialogueRanges(input.chapter.content, ranges);
  ranges.push(...dialogueRanges);

  ranges.sort((a, b) => a.startOffset - b.startOffset || a.endOffset - b.endOffset);

  const leftoverRanges = findLeftoverRanges(input.chapter.content, ranges).map((range) => {
    const text = input.chapter.content.slice(range.startOffset, range.endOffset);
    const segmentType = classifyText(text);

    return {
      ...range,
      segmentType,
      confidence : segmentType === "UNKNOWN" ? UNKNOWN_CONFIDENCE : KNOWN_CONFIDENCE,
      speakerHint: null
    } satisfies ClaimedRange;
  }).filter((range) => input.chapter.content.slice(range.startOffset, range.endOffset).trim().length > 0);

  const allRanges = [...ranges, ...leftoverRanges]
    .filter((range) => range.endOffset > range.startOffset)
    .sort((a, b) => a.startOffset - b.startOffset || a.endOffset - b.endOffset);

  const segments = allRanges.map((range, index) => createSegment({
    source      : input,
    range,
    segmentIndex: index
  }));

  const unknownChars = segments
    .filter((segment) => segment.segmentType === "UNKNOWN")
    .reduce((sum, segment) => sum + segment.rawText.length, 0);
  const unknownRatio = input.chapter.content.length === 0 ? 0 : unknownChars / input.chapter.content.length;
  const confidence = calculateStage0ChapterConfidence({ unknownRatio });
  const lowConfidenceReasons: Stage0LowConfidenceReason[] = confidence === "LOW"
    ? [{
        code   : "UNKNOWN_RATIO_HIGH",
        message: `UNKNOWN segment ratio ${unknownRatio.toFixed(4)} exceeds 0.10`
      }]
    : [];

  return {
    bookId: input.bookId,
    chapterId: input.chapter.id,
    runId: input.runId,
    chapterNo: input.chapter.no,
    segments,
    confidence,
    unknownRatio,
    lowConfidenceReasons
  };
}
```

The omitted helper `findLeftoverRanges()` must be implemented in the same file with newline-preserving line slices and a subtract operation. It must not merge across existing claimed ranges.

- [ ] **Step 4: Run segmentation tests until green**

Run:

```bash
pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stage0/segment-rules.test.ts --coverage=false
```

Expected: pass.

- [ ] **Step 5: Run type and segmentation tests together**

Run:

```bash
pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stage0/types.test.ts src/server/modules/analysis/pipelines/evidence-review/stage0/segment-rules.test.ts --coverage=false
```

Expected: pass.

- [ ] **Step 6: Commit pure segmentation rules**

```bash
git add src/server/modules/analysis/pipelines/evidence-review/stage0/types.ts src/server/modules/analysis/pipelines/evidence-review/stage0/types.test.ts src/server/modules/analysis/pipelines/evidence-review/stage0/segment-rules.ts src/server/modules/analysis/pipelines/evidence-review/stage0/segment-rules.test.ts
git commit -m "feat: add deterministic stage 0 segmentation rules"
```

## Task 4: Add Chapter Segment Repository

**Files:**
- Create: `src/server/modules/analysis/pipelines/evidence-review/stage0/repository.test.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stage0/repository.ts`

- [ ] **Step 1: Write failing repository tests**

Create `src/server/modules/analysis/pipelines/evidence-review/stage0/repository.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import type { Stage0SegmentDraft } from "@/server/modules/analysis/pipelines/evidence-review/stage0/types";
import {
  createStage0SegmentRepository,
  type Stage0SegmentRepositoryClient
} from "@/server/modules/analysis/pipelines/evidence-review/stage0/repository";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";
const CHAPTER_ID = "22222222-2222-4222-8222-222222222222";
const RUN_ID = "33333333-3333-4333-8333-333333333333";

function draft(overrides: Partial<Stage0SegmentDraft> = {}): Stage0SegmentDraft {
  return {
    bookId        : BOOK_ID,
    chapterId     : CHAPTER_ID,
    runId         : RUN_ID,
    segmentIndex  : 0,
    segmentType   : "NARRATIVE",
    startOffset   : 0,
    endOffset     : 5,
    rawText       : "王冕读书。",
    normalizedText: "王冕读书。",
    confidence    : 0.95,
    speakerHint   : null,
    ...overrides
  };
}

function createClient() {
  const chapterSegment = {
    deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    createMany: vi.fn().mockResolvedValue({ count: 2 }),
    findMany  : vi.fn().mockResolvedValue([])
  };

  const client: Stage0SegmentRepositoryClient = { chapterSegment };
  return { client, chapterSegment };
}

describe("Stage0SegmentRepository", () => {
  it("replaces chapter segments by run and chapter before creating new rows", async () => {
    const { client, chapterSegment } = createClient();
    const repository = createStage0SegmentRepository(client);

    await expect(repository.replaceChapterSegmentsForRun({
      runId    : RUN_ID,
      chapterId: CHAPTER_ID,
      segments : [
        draft(),
        draft({
          segmentIndex: 1,
          segmentType : "DIALOGUE_CONTENT",
          startOffset : 5,
          endOffset   : 12,
          rawText     : "“明日再谈。”",
          normalizedText: "“明日再谈。”",
          speakerHint : "王冕"
        })
      ]
    })).resolves.toEqual({ deletedCount: 1, createdCount: 2 });

    expect(chapterSegment.deleteMany).toHaveBeenCalledWith({
      where: {
        runId: RUN_ID,
        chapterId: CHAPTER_ID
      }
    });
    expect(chapterSegment.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          text: "王冕读书。",
          confidence: 0.95,
          speakerHint: null
        }),
        expect.objectContaining({
          text: "“明日再谈。”",
          segmentType: "DIALOGUE_CONTENT",
          speakerHint: "王冕"
        })
      ],
      skipDuplicates: false
    });
  });

  it("does not call createMany when replacement has no segments", async () => {
    const { client, chapterSegment } = createClient();
    const repository = createStage0SegmentRepository(client);

    await expect(repository.replaceChapterSegmentsForRun({
      runId    : RUN_ID,
      chapterId: CHAPTER_ID,
      segments : []
    })).resolves.toEqual({ deletedCount: 1, createdCount: 0 });

    expect(chapterSegment.createMany).not.toHaveBeenCalled();
  });

  it("lists segments ordered by segment index and maps Prisma text back to rawText", async () => {
    const { client, chapterSegment } = createClient();
    chapterSegment.findMany.mockResolvedValueOnce([
      {
        bookId: BOOK_ID,
        chapterId: CHAPTER_ID,
        runId: RUN_ID,
        segmentIndex: 0,
        segmentType: "NARRATIVE",
        startOffset: 0,
        endOffset: 5,
        text: "王冕读书。",
        normalizedText: "王冕读书。",
        confidence: 0.95,
        speakerHint: null
      }
    ]);
    const repository = createStage0SegmentRepository(client);

    await expect(repository.listChapterSegments({
      runId    : RUN_ID,
      chapterId: CHAPTER_ID
    })).resolves.toEqual([
      expect.objectContaining({
        rawText: "王冕读书。",
        segmentIndex: 0
      })
    ]);

    expect(chapterSegment.findMany).toHaveBeenCalledWith({
      where: {
        runId: RUN_ID,
        chapterId: CHAPTER_ID
      },
      orderBy: { segmentIndex: "asc" }
    });
  });
});
```

- [ ] **Step 2: Run the failing repository tests**

Run:

```bash
pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stage0/repository.test.ts --coverage=false
```

Expected: fail because `repository.ts` does not exist.

- [ ] **Step 3: Implement the repository**

Create `src/server/modules/analysis/pipelines/evidence-review/stage0/repository.ts`:

```ts
import type { ChapterSegmentType } from "@/generated/prisma/enums";
import { prisma } from "@/server/db/prisma";
import type { Stage0SegmentDraft } from "@/server/modules/analysis/pipelines/evidence-review/stage0/types";

interface ChapterSegmentCreateManyDelegate {
  deleteMany(args: { where: { runId: string; chapterId: string } }): Promise<{ count: number }>;
  createMany(args: {
    data: Array<{
      bookId        : string;
      chapterId     : string;
      runId         : string;
      segmentIndex  : number;
      segmentType   : ChapterSegmentType;
      startOffset   : number;
      endOffset     : number;
      text          : string;
      normalizedText: string;
      confidence    : number;
      speakerHint   : string | null;
    }>;
    skipDuplicates: false;
  }): Promise<{ count: number }>;
  findMany(args: {
    where: { runId: string; chapterId: string };
    orderBy: { segmentIndex: "asc" };
  }): Promise<Array<{
    bookId        : string;
    chapterId     : string;
    runId         : string;
    segmentIndex  : number;
    segmentType   : ChapterSegmentType;
    startOffset   : number;
    endOffset     : number;
    text          : string;
    normalizedText: string;
    confidence    : number;
    speakerHint   : string | null;
  }>>;
}

export interface Stage0SegmentRepositoryClient {
  chapterSegment: ChapterSegmentCreateManyDelegate;
}

export interface ReplaceChapterSegmentsInput {
  runId    : string;
  chapterId: string;
  segments : Stage0SegmentDraft[];
}

export interface ReplaceChapterSegmentsResult {
  deletedCount: number;
  createdCount: number;
}

export interface ListChapterSegmentsInput {
  runId    : string;
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

function toSegmentDraft(row: Awaited<ReturnType<ChapterSegmentCreateManyDelegate["findMany"]>>[number]): Stage0SegmentDraft {
  return {
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

export function createStage0SegmentRepository(
  client: Stage0SegmentRepositoryClient = prisma
) {
  async function replaceChapterSegmentsForRun(
    input: ReplaceChapterSegmentsInput
  ): Promise<ReplaceChapterSegmentsResult> {
    const deleted = await client.chapterSegment.deleteMany({
      where: {
        runId: input.runId,
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
      data: input.segments.map(toCreateRow),
      skipDuplicates: false
    });

    return {
      deletedCount: deleted.count,
      createdCount: created.count
    };
  }

  async function listChapterSegments(input: ListChapterSegmentsInput): Promise<Stage0SegmentDraft[]> {
    const rows = await client.chapterSegment.findMany({
      where: {
        runId: input.runId,
        chapterId: input.chapterId
      },
      orderBy: { segmentIndex: "asc" }
    });

    return rows.map(toSegmentDraft);
  }

  return {
    replaceChapterSegmentsForRun,
    listChapterSegments
  };
}

export type Stage0SegmentRepository = ReturnType<typeof createStage0SegmentRepository>;

export const stage0SegmentRepository = createStage0SegmentRepository();
```

- [ ] **Step 4: Run repository tests again**

Run:

```bash
pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stage0/repository.test.ts --coverage=false
```

Expected: pass.

- [ ] **Step 5: Run Stage 0 tests accumulated so far**

Run:

```bash
pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stage0/types.test.ts src/server/modules/analysis/pipelines/evidence-review/stage0/segment-rules.test.ts src/server/modules/analysis/pipelines/evidence-review/stage0/repository.test.ts --coverage=false
```

Expected: pass.

- [ ] **Step 6: Commit repository**

```bash
git add src/server/modules/analysis/pipelines/evidence-review/stage0/repository.ts src/server/modules/analysis/pipelines/evidence-review/stage0/repository.test.ts
git commit -m "feat: persist stage 0 chapter segments"
```

## Task 5: Add Stage 0 Orchestrator With Run Observability

**Files:**
- Create: `src/server/modules/analysis/pipelines/evidence-review/stage0/Stage0Segmenter.test.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stage0/Stage0Segmenter.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stage0/index.ts`

- [ ] **Step 1: Write failing orchestrator tests**

Create `src/server/modules/analysis/pipelines/evidence-review/stage0/Stage0Segmenter.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { createStage0Segmenter } from "@/server/modules/analysis/pipelines/evidence-review/stage0/Stage0Segmenter";
import type { Stage0SegmentRepository } from "@/server/modules/analysis/pipelines/evidence-review/stage0/repository";
import type { AnalysisStageRunService } from "@/server/modules/analysis/runs/stage-run-service";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";
const CHAPTER_ID = "22222222-2222-4222-8222-222222222222";
const RUN_ID = "33333333-3333-4333-8333-333333333333";

function createDeps() {
  const repository: Stage0SegmentRepository = {
    replaceChapterSegmentsForRun: vi.fn().mockResolvedValue({ deletedCount: 0, createdCount: 0 }),
    listChapterSegments: vi.fn()
  };

  const stageRunService: AnalysisStageRunService = {
    startStageRun: vi.fn().mockResolvedValue({ id: "stage-run-1" }),
    succeedStageRun: vi.fn().mockResolvedValue(undefined),
    failStageRun: vi.fn().mockResolvedValue(undefined),
    skipStageRun: vi.fn().mockResolvedValue(undefined),
    recordRawOutput: vi.fn().mockResolvedValue({ id: null })
  };

  return { repository, stageRunService };
}

describe("Stage0Segmenter", () => {
  it("segments chapters, persists by chapter, and records a successful stage run", async () => {
    const { repository, stageRunService } = createDeps();
    const segmenter = createStage0Segmenter({ repository, stageRunService });

    const result = await segmenter.runStage0ForChapters({
      bookId: BOOK_ID,
      runId : RUN_ID,
      chapters: [
        {
          id: CHAPTER_ID,
          no: 1,
          title: "第一回 王冕读书",
          content: "第一回 王冕读书\n王冕道：“明日再谈。”"
        }
      ]
    });

    expect(result.stageRunId).toBe("stage-run-1");
    expect(result.inputCount).toBe(1);
    expect(result.outputCount).toBeGreaterThan(0);
    expect(repository.replaceChapterSegmentsForRun).toHaveBeenCalledWith({
      runId: RUN_ID,
      chapterId: CHAPTER_ID,
      segments: expect.arrayContaining([
        expect.objectContaining({ segmentType: "TITLE" }),
        expect.objectContaining({ segmentType: "DIALOGUE_LEAD" }),
        expect.objectContaining({ segmentType: "DIALOGUE_CONTENT" })
      ])
    });
    expect(stageRunService.startStageRun).toHaveBeenCalledWith(expect.objectContaining({
      runId: RUN_ID,
      bookId: BOOK_ID,
      stageKey: "STAGE_0",
      inputCount: 1,
      chapterStartNo: 1,
      chapterEndNo: 1
    }));
    expect(stageRunService.succeedStageRun).toHaveBeenCalledWith("stage-run-1", expect.objectContaining({
      outputCount: result.outputCount,
      skippedCount: 0
    }));
  });

  it("supports chapter-level rerun with a single chapter input", async () => {
    const { repository, stageRunService } = createDeps();
    const segmenter = createStage0Segmenter({ repository, stageRunService });

    await segmenter.runStage0ForChapter({
      bookId: BOOK_ID,
      runId : RUN_ID,
      chapter: {
        id: CHAPTER_ID,
        no: 7,
        title: "第七回",
        content: "第七回\n却说王冕后来回家读书。"
      }
    });

    expect(stageRunService.startStageRun).toHaveBeenCalledWith(expect.objectContaining({
      chapterId: CHAPTER_ID,
      chapterStartNo: 7,
      chapterEndNo: 7
    }));
    expect(repository.replaceChapterSegmentsForRun).toHaveBeenCalledTimes(1);
  });

  it("records failed stage runs and rethrows when persistence fails", async () => {
    const { repository, stageRunService } = createDeps();
    vi.mocked(repository.replaceChapterSegmentsForRun).mockRejectedValueOnce(new Error("db down"));
    const segmenter = createStage0Segmenter({ repository, stageRunService });

    await expect(segmenter.runStage0ForChapters({
      bookId: BOOK_ID,
      runId : RUN_ID,
      chapters: [
        {
          id: CHAPTER_ID,
          no: 1,
          title: "第一回",
          content: "第一回\n王冕读书。"
        }
      ]
    })).rejects.toThrow("db down");

    expect(stageRunService.failStageRun).toHaveBeenCalledWith("stage-run-1", expect.any(Error));
    expect(stageRunService.succeedStageRun).not.toHaveBeenCalled();
  });

  it("skips empty chapter arrays without writing segments", async () => {
    const { repository, stageRunService } = createDeps();
    const segmenter = createStage0Segmenter({ repository, stageRunService });

    const result = await segmenter.runStage0ForChapters({
      bookId: BOOK_ID,
      runId : RUN_ID,
      chapters: []
    });

    expect(result).toMatchObject({
      inputCount: 0,
      outputCount: 0,
      skippedCount: 0,
      chapterResults: []
    });
    expect(repository.replaceChapterSegmentsForRun).not.toHaveBeenCalled();
    expect(stageRunService.startStageRun).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the failing orchestrator tests**

Run:

```bash
pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stage0/Stage0Segmenter.test.ts --coverage=false
```

Expected: fail because `Stage0Segmenter.ts` does not exist.

- [ ] **Step 3: Implement Stage0Segmenter**

Create `src/server/modules/analysis/pipelines/evidence-review/stage0/Stage0Segmenter.ts`:

```ts
import { createHash } from "node:crypto";

import {
  createStage0SegmentRepository,
  type Stage0SegmentRepository
} from "@/server/modules/analysis/pipelines/evidence-review/stage0/repository";
import { segmentChapterText } from "@/server/modules/analysis/pipelines/evidence-review/stage0/segment-rules";
import type {
  Stage0SegmentRunInput,
  Stage0SegmentRunResult
} from "@/server/modules/analysis/pipelines/evidence-review/stage0/types";
import {
  analysisStageRunService,
  type AnalysisStageRunService
} from "@/server/modules/analysis/runs/stage-run-service";

export const STAGE0_STAGE_KEY = "STAGE_0";

export interface Stage0SegmenterDependencies {
  repository?     : Stage0SegmentRepository;
  stageRunService?: AnalysisStageRunService;
}

function stableHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function chapterBounds(input: Stage0SegmentRunInput): {
  chapterId: string | null;
  chapterStartNo: number | null;
  chapterEndNo: number | null;
} {
  if (input.chapters.length === 1) {
    return {
      chapterId: input.chapters[0].id,
      chapterStartNo: input.chapters[0].no,
      chapterEndNo: input.chapters[0].no
    };
  }

  if (input.chapters.length === 0) {
    return {
      chapterId: null,
      chapterStartNo: null,
      chapterEndNo: null
    };
  }

  return {
    chapterId: null,
    chapterStartNo: Math.min(...input.chapters.map((chapter) => chapter.no)),
    chapterEndNo: Math.max(...input.chapters.map((chapter) => chapter.no))
  };
}

export function createStage0Segmenter(dependencies: Stage0SegmenterDependencies = {}) {
  const repository = dependencies.repository ?? createStage0SegmentRepository();
  const stageRunService = dependencies.stageRunService ?? analysisStageRunService;

  async function runStage0ForChapters(input: Stage0SegmentRunInput): Promise<Stage0SegmentRunResult> {
    if (input.chapters.length === 0) {
      return {
        bookId: input.bookId,
        runId: input.runId,
        stageRunId: null,
        inputCount: 0,
        outputCount: 0,
        skippedCount: 0,
        chapterResults: []
      };
    }

    const bounds = chapterBounds(input);
    const inputHash = stableHash(input.chapters.map((chapter) => ({
      id: chapter.id,
      no: chapter.no,
      title: chapter.title,
      content: chapter.content
    })));
    const started = await stageRunService.startStageRun({
      runId: input.runId,
      bookId: input.bookId,
      chapterId: bounds.chapterId,
      stageKey: STAGE0_STAGE_KEY,
      attempt: input.attempt ?? 1,
      inputHash,
      inputCount: input.chapters.length,
      chapterStartNo: bounds.chapterStartNo,
      chapterEndNo: bounds.chapterEndNo
    });

    try {
      const chapterResults = [];
      for (const chapter of input.chapters) {
        if (input.runId === null) {
          throw new Error("Stage 0 persistence requires a non-null runId");
        }

        const result = segmentChapterText({
          bookId: input.bookId,
          runId: input.runId,
          chapter
        });

        await repository.replaceChapterSegmentsForRun({
          runId: input.runId,
          chapterId: chapter.id,
          segments: result.segments
        });

        chapterResults.push(result);
      }

      const outputCount = chapterResults.reduce(
        (sum, result) => sum + result.segments.length,
        0
      );
      await stageRunService.succeedStageRun(started.id, {
        outputHash: stableHash(chapterResults.map((result) => ({
          chapterId: result.chapterId,
          segmentCount: result.segments.length,
          confidence: result.confidence,
          unknownRatio: result.unknownRatio
        }))),
        outputCount,
        skippedCount: 0
      });

      return {
        bookId: input.bookId,
        runId: input.runId,
        stageRunId: started.id,
        inputCount: input.chapters.length,
        outputCount,
        skippedCount: 0,
        chapterResults
      };
    } catch (error) {
      await stageRunService.failStageRun(started.id, error);
      throw error;
    }
  }

  async function runStage0ForChapter(input: {
    bookId : string;
    runId  : string | null;
    attempt?: number;
    chapter: Stage0SegmentRunInput["chapters"][number];
  }): Promise<Stage0SegmentRunResult> {
    return runStage0ForChapters({
      bookId: input.bookId,
      runId: input.runId,
      attempt: input.attempt,
      chapters: [input.chapter]
    });
  }

  return {
    runStage0ForChapters,
    runStage0ForChapter
  };
}

export type Stage0Segmenter = ReturnType<typeof createStage0Segmenter>;

export const stage0Segmenter = createStage0Segmenter();
```

- [ ] **Step 4: Add barrel exports**

Create `src/server/modules/analysis/pipelines/evidence-review/stage0/index.ts`:

```ts
export * from "@/server/modules/analysis/pipelines/evidence-review/stage0/Stage0Segmenter";
export * from "@/server/modules/analysis/pipelines/evidence-review/stage0/repository";
export * from "@/server/modules/analysis/pipelines/evidence-review/stage0/segment-rules";
export * from "@/server/modules/analysis/pipelines/evidence-review/stage0/types";
```

- [ ] **Step 5: Run orchestrator tests again**

Run:

```bash
pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stage0/Stage0Segmenter.test.ts --coverage=false
```

Expected: pass.

- [ ] **Step 6: Run all Stage 0 tests without coverage**

Run:

```bash
pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stage0 --coverage=false
```

Expected: pass.

- [ ] **Step 7: Commit orchestrator**

```bash
git add src/server/modules/analysis/pipelines/evidence-review/stage0/Stage0Segmenter.ts src/server/modules/analysis/pipelines/evidence-review/stage0/Stage0Segmenter.test.ts src/server/modules/analysis/pipelines/evidence-review/stage0/index.ts
git commit -m "feat: orchestrate stage 0 segmentation runs"
```

## Task 6: Final Validation And Task Closure

**Files:**
- Modify: `docs/superpowers/tasks/2026-04-18-evidence-review/05-stage-0-segmentation.md`
- Modify: `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`

- [ ] **Step 1: Run Prisma validation**

Run:

```bash
pnpm prisma format --schema prisma/schema.prisma
pnpm prisma validate --schema prisma/schema.prisma
pnpm prisma:generate
```

Expected: all commands pass.

- [ ] **Step 2: Run task-scoped validation**

Run:

```bash
pnpm test src/server/modules/analysis/pipelines/evidence-review/stage0
```

Expected: Stage 0 tests pass. If repository-level coverage threshold causes a command failure despite all Stage 0 assertions passing, immediately run:

```bash
pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stage0 --coverage=false
```

Record both command outcomes in the T05 execution record.

- [ ] **Step 3: Run type check**

Run:

```bash
pnpm type-check
```

Expected: pass.

- [ ] **Step 4: Update T05 task execution record**

Modify `docs/superpowers/tasks/2026-04-18-evidence-review/05-stage-0-segmentation.md`.

Change all execution checkpoint checkboxes to checked and replace:

```markdown
No execution recorded yet.
```

with:

```markdown
### T05 Completion - 2026-04-19

- Changed files: `prisma/schema.prisma`, `prisma/migrations/20260419210000_stage0_chapter_segment_confidence/migration.sql`, `src/generated/prisma/**`, `src/server/modules/analysis/pipelines/evidence-review/stage0/types.ts`, `src/server/modules/analysis/pipelines/evidence-review/stage0/types.test.ts`, `src/server/modules/analysis/pipelines/evidence-review/stage0/segment-rules.ts`, `src/server/modules/analysis/pipelines/evidence-review/stage0/segment-rules.test.ts`, `src/server/modules/analysis/pipelines/evidence-review/stage0/repository.ts`, `src/server/modules/analysis/pipelines/evidence-review/stage0/repository.test.ts`, `src/server/modules/analysis/pipelines/evidence-review/stage0/Stage0Segmenter.ts`, `src/server/modules/analysis/pipelines/evidence-review/stage0/Stage0Segmenter.test.ts`, `src/server/modules/analysis/pipelines/evidence-review/stage0/index.ts`
- Validation commands: `pnpm prisma format --schema prisma/schema.prisma`, `pnpm prisma validate --schema prisma/schema.prisma`, `pnpm prisma:generate`, `pnpm test src/server/modules/analysis/pipelines/evidence-review/stage0`, `pnpm type-check`
- Result: Stage 0 writes deterministic, offset-safe chapter segments with numeric confidence and T04 stage-run observability.
- Follow-up risks: rules are deliberately conservative; T06 must treat `UNKNOWN` and low chapter confidence as extraction risk signals rather than trying to repair segmentation silently.
- Next task: T06 `docs/superpowers/tasks/2026-04-18-evidence-review/06-stage-a-extraction.md`
```

If any validation command has a known coverage-threshold caveat, record the exact command and fallback command outcome in the `Validation commands` bullet.

- [ ] **Step 5: Mark T05 complete in the runbook**

Modify `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`:

```markdown
- [x] T05: `docs/superpowers/tasks/2026-04-18-evidence-review/05-stage-0-segmentation.md`
```

Append this completion block under `## Completion Record`:

```markdown
### T05 Completion - 2026-04-19

- Changed files: `prisma/schema.prisma`, `prisma/migrations/20260419210000_stage0_chapter_segment_confidence/migration.sql`, `src/generated/prisma/**`, `src/server/modules/analysis/pipelines/evidence-review/stage0/**`, `docs/superpowers/tasks/2026-04-18-evidence-review/05-stage-0-segmentation.md`, `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`
- Validation commands: `pnpm prisma format --schema prisma/schema.prisma`, `pnpm prisma validate --schema prisma/schema.prisma`, `pnpm prisma:generate`, `pnpm test src/server/modules/analysis/pipelines/evidence-review/stage0`, `pnpm type-check`
- Result: Stage 0 deterministic segmentation is available as the persisted evidence-review input layer for Stage A.
- Follow-up risks: Stage A must consume `chapter_segments` directly and preserve evidence offsets; relation/persona extraction remains out of scope until T06+.
- Next task: T06 `docs/superpowers/tasks/2026-04-18-evidence-review/06-stage-a-extraction.md`
```

- [ ] **Step 6: Run final git status**

Run:

```bash
git status --short
```

Expected: only intentional T05 files are modified or newly created. Pre-existing unrelated untracked plan files may remain untracked and must not be included unless the user explicitly asks.

- [ ] **Step 7: Commit task closure**

```bash
git add docs/superpowers/tasks/2026-04-18-evidence-review/05-stage-0-segmentation.md docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md
git commit -m "docs: mark T05 segmentation complete"
```

## Final Verification Matrix

- [ ] `pnpm prisma format --schema prisma/schema.prisma`
- [ ] `pnpm prisma validate --schema prisma/schema.prisma`
- [ ] `pnpm prisma:generate`
- [ ] `pnpm test src/server/modules/analysis/pipelines/evidence-review/stage0`
- [ ] `pnpm type-check`

## Self-Review Checklist

- [ ] Spec §5.1 is covered: `chapter_segments` stores type, offsets, raw text, normalized text, and confidence.
- [ ] Spec §7.1 is covered: Stage 0 normalizes text, establishes offsets, identifies region types, and emits a highlighting coordinate system.
- [ ] T05 stop conditions are respected: no model calls, no personas, no projection writes, no unmappable offsets.
- [ ] T02 contract is reused through `normalizeTextForEvidence` and original-text offsets.
- [ ] T04 contract is reused through `analysisStageRunService`.
- [ ] Stage A can consume `stage0/index.ts`, `Stage0Segmenter`, and `repository.listChapterSegments()` without reading legacy preprocessor output.
- [ ] No `.trellis/tasks/**` files are modified.
