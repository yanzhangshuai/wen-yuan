# T02 Text Evidence Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the reusable text offset, evidence span, quote reconstruction, and evidence persistence helpers required by every later claim and review workflow.

**Architecture:** Keep original `Chapter.content` offsets authoritative and treat normalized text as a secondary lookup surface. Materialize every evidence span from chapter text plus one `ChapterSegment` anchor, then expose a small server-only evidence module that later Stage A/C and review APIs can reuse without touching UI-specific code.

**Tech Stack:** TypeScript strict, Vitest, Prisma 7 generated client contracts, Zod-free pure helpers for offset validation, mocked persistence delegates for repository tests

---

## Source Of Truth

- Architecture spec: `docs/superpowers/specs/2026-04-18-evidence-review-architecture-rewrite-design.md`
- Task doc: `docs/superpowers/tasks/2026-04-18-evidence-review/02-text-evidence-layer.md`
- Runbook: `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`
- Upstream completed task: T01 schema and state foundation

## Preconditions

- `Chapter.content` is the authoritative raw text source.
- `ChapterSegment` and `EvidenceSpan` exist in `prisma/schema.prisma`.
- This task does not change Prisma schema.
- This task does not create segmentation, claim extraction, review API, or UI code.

## File Structure

- Create `src/server/modules/analysis/evidence/offset-map.ts`
  - Responsibility: normalize text for lookup while preserving exact original offset mapping.
- Create `src/server/modules/analysis/evidence/offset-map.test.ts`
  - Responsibility: prove Chinese text, punctuation, CRLF, full-width spaces, and invalid normalized range behavior.
- Create `src/server/modules/analysis/evidence/evidence-spans.ts`
  - Responsibility: validate and materialize evidence spans, then provide persistence helpers around the T01 `EvidenceSpan` table.
- Create `src/server/modules/analysis/evidence/evidence-spans.test.ts`
  - Responsibility: prove invalid, reversed, out-of-range, cross-segment, expected-text mismatch, single write, batch write, idempotent write, and lookup behavior.
- Create `src/server/modules/analysis/evidence/quote-reconstruction.ts`
  - Responsibility: reconstruct quote text and review-facing context/jump metadata from raw chapter text.
- Create `src/server/modules/analysis/evidence/quote-reconstruction.test.ts`
  - Responsibility: prove quote reconstruction, context clipping, chapter loader errors, and jump metadata.
- Create `src/server/modules/analysis/evidence/index.ts`
  - Responsibility: expose the stable evidence module API.
- Create `src/server/modules/analysis/evidence/index.test.ts`
  - Responsibility: guard public exports used by later tasks.

## Task 1: Offset Map Contract

**Files:**
- Create: `src/server/modules/analysis/evidence/offset-map.ts`
- Create: `src/server/modules/analysis/evidence/offset-map.test.ts`

- [ ] **Step 1: Write the failing offset map tests**

Create `src/server/modules/analysis/evidence/offset-map.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  buildOffsetMap,
  findOriginalRangeByNormalizedNeedle,
  mapNormalizedRangeToOriginalRange,
  normalizeTextForEvidence,
  OffsetMapError,
  sliceOriginalByNormalizedRange
} from "@/server/modules/analysis/evidence/offset-map";

describe("evidence offset map", () => {
  it("keeps original Chinese offsets authoritative while normalizing lookup text", () => {
    const raw = "王冕道：\r\n「不敢。」　范进说：好。";

    const map = buildOffsetMap(raw);

    expect(map.originalText).toBe(raw);
    expect(map.normalizedText).toBe("王冕道：\n「不敢。」 范进说：好。");

    const range = findOriginalRangeByNormalizedNeedle(map, "范进说");

    expect(raw.slice(range.startOffset, range.endOffset)).toBe("范进说");
    expect(range).toEqual({ startOffset: 12, endOffset: 15 });
  });

  it("maps normalized CRLF and full-width space hits back to original slices", () => {
    const raw = "甲曰\r\n乙曰　丙曰";
    const map = buildOffsetMap(raw);

    const newlineRange = findOriginalRangeByNormalizedNeedle(map, "\n");
    const spaceRange = findOriginalRangeByNormalizedNeedle(map, "\n乙曰 ");

    expect(raw.slice(newlineRange.startOffset, newlineRange.endOffset)).toBe("\r\n");
    expect(raw.slice(spaceRange.startOffset, spaceRange.endOffset)).toBe("\r\n乙曰　");
    expect(sliceOriginalByNormalizedRange(map, 2, 6)).toBe("\r\n乙曰　");
  });

  it("normalizes text without trimming or rewriting Chinese punctuation", () => {
    expect(normalizeTextForEvidence("  范进，道：\r\n中举！　")).toBe("  范进，道：\n中举！ ");
  });

  it("rejects invalid normalized ranges and missing needles", () => {
    const map = buildOffsetMap("范进中举");

    expect(() => mapNormalizedRangeToOriginalRange(map, 2, 2)).toThrow(OffsetMapError);
    expect(() => mapNormalizedRangeToOriginalRange(map, -1, 2)).toThrow(OffsetMapError);
    expect(() => mapNormalizedRangeToOriginalRange(map, 0, 99)).toThrow(OffsetMapError);
    expect(() => findOriginalRangeByNormalizedNeedle(map, "")).toThrow(OffsetMapError);
    expect(() => findOriginalRangeByNormalizedNeedle(map, "王冕")).toThrow(OffsetMapError);
  });
});
```

- [ ] **Step 2: Run the offset map tests and verify red**

Run:

```bash
pnpm test src/server/modules/analysis/evidence/offset-map.test.ts
```

Expected: FAIL with module resolution error for `@/server/modules/analysis/evidence/offset-map`.

- [ ] **Step 3: Implement the offset map helpers**

Create `src/server/modules/analysis/evidence/offset-map.ts`:

```ts
export interface OriginalOffsetRange {
  startOffset: number;
  endOffset  : number;
}

export interface OffsetMapEntry {
  normalizedStart: number;
  normalizedEnd  : number;
  originalStart  : number;
  originalEnd    : number;
  normalizedValue: string;
  originalValue  : string;
}

export interface TextOffsetMap {
  originalText  : string;
  normalizedText: string;
  entries       : OffsetMapEntry[];
}

export type OffsetMapErrorCode =
  | "EMPTY_NEEDLE"
  | "INVALID_NORMALIZED_RANGE"
  | "NEEDLE_NOT_FOUND"
  | "NORMALIZED_RANGE_OUT_OF_BOUNDS";

export class OffsetMapError extends Error {
  readonly code: OffsetMapErrorCode;

  constructor(code: OffsetMapErrorCode, message: string) {
    super(message);
    this.name = "OffsetMapError";
    this.code = code;
  }
}

const FULL_WIDTH_SPACE = "　";

function readNormalizedUnit(text: string, originalStart: number): {
  normalizedValue: string;
  originalValue  : string;
  originalEnd    : number;
} {
  const current = text.charAt(originalStart);
  const next = text.charAt(originalStart + 1);

  if (current === "\r" && next === "\n") {
    return {
      normalizedValue: "\n",
      originalValue  : "\r\n",
      originalEnd    : originalStart + 2
    };
  }

  if (current === "\r") {
    return {
      normalizedValue: "\n",
      originalValue  : current,
      originalEnd    : originalStart + 1
    };
  }

  if (current === FULL_WIDTH_SPACE || current === "\t") {
    return {
      normalizedValue: " ",
      originalValue  : current,
      originalEnd    : originalStart + 1
    };
  }

  return {
    normalizedValue: current,
    originalValue  : current,
    originalEnd    : originalStart + 1
  };
}

export function buildOffsetMap(originalText: string): TextOffsetMap {
  const entries: OffsetMapEntry[] = [];
  let normalizedText = "";
  let originalStart = 0;

  while (originalStart < originalText.length) {
    const unit = readNormalizedUnit(originalText, originalStart);
    const normalizedStart = normalizedText.length;

    normalizedText += unit.normalizedValue;
    entries.push({
      normalizedStart,
      normalizedEnd  : normalizedText.length,
      originalStart,
      originalEnd    : unit.originalEnd,
      normalizedValue: unit.normalizedValue,
      originalValue  : unit.originalValue
    });

    originalStart = unit.originalEnd;
  }

  return {
    originalText,
    normalizedText,
    entries
  };
}

export function normalizeTextForEvidence(text: string): string {
  return buildOffsetMap(text).normalizedText;
}

export function mapNormalizedRangeToOriginalRange(
  map: TextOffsetMap,
  normalizedStart: number,
  normalizedEnd: number
): OriginalOffsetRange {
  if (
    !Number.isInteger(normalizedStart) ||
    !Number.isInteger(normalizedEnd) ||
    normalizedStart >= normalizedEnd
  ) {
    throw new OffsetMapError(
      "INVALID_NORMALIZED_RANGE",
      `Invalid normalized range: ${normalizedStart}-${normalizedEnd}`
    );
  }

  if (normalizedStart < 0 || normalizedEnd > map.normalizedText.length) {
    throw new OffsetMapError(
      "NORMALIZED_RANGE_OUT_OF_BOUNDS",
      `Normalized range is outside text bounds: ${normalizedStart}-${normalizedEnd}`
    );
  }

  const startEntry = map.entries[normalizedStart];
  const endEntry = map.entries[normalizedEnd - 1];

  if (!startEntry || !endEntry) {
    throw new OffsetMapError(
      "NORMALIZED_RANGE_OUT_OF_BOUNDS",
      `Normalized range does not map to original text: ${normalizedStart}-${normalizedEnd}`
    );
  }

  return {
    startOffset: startEntry.originalStart,
    endOffset  : endEntry.originalEnd
  };
}

export function findOriginalRangeByNormalizedNeedle(
  map: TextOffsetMap,
  needle: string
): OriginalOffsetRange {
  const normalizedNeedle = normalizeTextForEvidence(needle);

  if (normalizedNeedle.length === 0) {
    throw new OffsetMapError("EMPTY_NEEDLE", "Evidence lookup needle cannot be empty");
  }

  const normalizedStart = map.normalizedText.indexOf(normalizedNeedle);

  if (normalizedStart < 0) {
    throw new OffsetMapError("NEEDLE_NOT_FOUND", `Evidence lookup needle not found: ${needle}`);
  }

  return mapNormalizedRangeToOriginalRange(
    map,
    normalizedStart,
    normalizedStart + normalizedNeedle.length
  );
}

export function sliceOriginalByNormalizedRange(
  map: TextOffsetMap,
  normalizedStart: number,
  normalizedEnd: number
): string {
  const range = mapNormalizedRangeToOriginalRange(map, normalizedStart, normalizedEnd);

  return map.originalText.slice(range.startOffset, range.endOffset);
}
```

- [ ] **Step 4: Run the offset map tests and verify green**

Run:

```bash
pnpm test src/server/modules/analysis/evidence/offset-map.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/server/modules/analysis/evidence/offset-map.ts src/server/modules/analysis/evidence/offset-map.test.ts
git commit -m "feat: add evidence offset map helpers"
```

## Task 2: Evidence Span Validation

**Files:**
- Create: `src/server/modules/analysis/evidence/evidence-spans.ts`
- Create: `src/server/modules/analysis/evidence/evidence-spans.test.ts`

- [ ] **Step 1: Write the failing evidence span validation tests**

Create `src/server/modules/analysis/evidence/evidence-spans.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  EvidenceSpanValidationError,
  validateEvidenceSpanDraft
} from "@/server/modules/analysis/evidence/evidence-spans";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";
const CHAPTER_ID = "22222222-2222-4222-8222-222222222222";
const SEGMENT_ID = "33333333-3333-4333-8333-333333333333";
const RUN_ID = "44444444-4444-4444-8444-444444444444";

const chapterText = "第一回\n王冕道：不敢。\n范进说：中了。";

const segment = {
  id            : SEGMENT_ID,
  bookId        : BOOK_ID,
  chapterId     : CHAPTER_ID,
  segmentType   : "NARRATIVE",
  startOffset   : 4,
  endOffset     : chapterText.length,
  text          : chapterText.slice(4),
  normalizedText: chapterText.slice(4),
  speakerHint   : null
};

describe("evidence span validation", () => {
  it("materializes a valid span from authoritative chapter text", () => {
    const startOffset = chapterText.indexOf("范进");
    const endOffset = startOffset + "范进说".length;

    const result = validateEvidenceSpanDraft({
      chapterText,
      segment,
      draft: {
        bookId         : BOOK_ID,
        chapterId      : CHAPTER_ID,
        segmentId      : SEGMENT_ID,
        startOffset,
        endOffset,
        expectedText   : "范进说",
        speakerHint    : "范进",
        createdByRunId : RUN_ID
      }
    });

    expect(result).toEqual({
      bookId             : BOOK_ID,
      chapterId          : CHAPTER_ID,
      segmentId          : SEGMENT_ID,
      startOffset,
      endOffset,
      quotedText         : "范进说",
      normalizedText     : "范进说",
      speakerHint        : "范进",
      narrativeRegionType: "NARRATIVE",
      createdByRunId     : RUN_ID
    });
  });

  it("rejects reversed, empty, and out-of-range spans", () => {
    const baseDraft = {
      bookId        : BOOK_ID,
      chapterId     : CHAPTER_ID,
      segmentId     : SEGMENT_ID,
      startOffset   : 8,
      endOffset     : 10,
      createdByRunId: RUN_ID
    };

    expect(() => validateEvidenceSpanDraft({
      chapterText,
      segment,
      draft: { ...baseDraft, startOffset: 10, endOffset: 10 }
    })).toThrow(EvidenceSpanValidationError);

    expect(() => validateEvidenceSpanDraft({
      chapterText,
      segment,
      draft: { ...baseDraft, startOffset: -1, endOffset: 10 }
    })).toThrow(EvidenceSpanValidationError);

    expect(() => validateEvidenceSpanDraft({
      chapterText,
      segment,
      draft: { ...baseDraft, startOffset: 8, endOffset: 999 }
    })).toThrow(EvidenceSpanValidationError);
  });

  it("rejects cross-segment spans and mismatched expected text", () => {
    expect(() => validateEvidenceSpanDraft({
      chapterText,
      segment,
      draft: {
        bookId        : BOOK_ID,
        chapterId     : CHAPTER_ID,
        segmentId     : SEGMENT_ID,
        startOffset   : 0,
        endOffset     : 6,
        createdByRunId: RUN_ID
      }
    })).toThrow(EvidenceSpanValidationError);

    expect(() => validateEvidenceSpanDraft({
      chapterText,
      segment,
      draft: {
        bookId        : BOOK_ID,
        chapterId     : CHAPTER_ID,
        segmentId     : SEGMENT_ID,
        startOffset   : chapterText.indexOf("王冕"),
        endOffset     : chapterText.indexOf("王冕") + 2,
        expectedText  : "范进",
        createdByRunId: RUN_ID
      }
    })).toThrow(EvidenceSpanValidationError);
  });
});
```

- [ ] **Step 2: Run the evidence span tests and verify red**

Run:

```bash
pnpm test src/server/modules/analysis/evidence/evidence-spans.test.ts
```

Expected: FAIL with module resolution error for `@/server/modules/analysis/evidence/evidence-spans`.

- [ ] **Step 3: Implement evidence span validation**

Create `src/server/modules/analysis/evidence/evidence-spans.ts`:

```ts
import { normalizeTextForEvidence } from "@/server/modules/analysis/evidence/offset-map";

export type EvidenceSpanValidationErrorCode =
  | "BOOK_MISMATCH"
  | "CHAPTER_MISMATCH"
  | "EXPECTED_TEXT_MISMATCH"
  | "INVALID_OFFSET_RANGE"
  | "SEGMENT_MISMATCH"
  | "SEGMENT_TEXT_MISMATCH"
  | "SPAN_OUT_OF_CHAPTER"
  | "SPAN_OUT_OF_SEGMENT";

export class EvidenceSpanValidationError extends Error {
  readonly code: EvidenceSpanValidationErrorCode;

  constructor(code: EvidenceSpanValidationErrorCode, message: string) {
    super(message);
    this.name = "EvidenceSpanValidationError";
    this.code = code;
  }
}

export interface EvidenceSegmentAnchor {
  id            : string;
  bookId        : string;
  chapterId     : string;
  segmentType   : string;
  startOffset   : number;
  endOffset     : number;
  text          : string;
  normalizedText: string;
  speakerHint?  : string | null;
}

export interface EvidenceSpanDraft {
  bookId              : string;
  chapterId           : string;
  segmentId           : string;
  startOffset         : number;
  endOffset           : number;
  expectedText?       : string;
  speakerHint?        : string | null;
  narrativeRegionType?: string;
  createdByRunId      : string;
}

export interface MaterializedEvidenceSpanData {
  bookId             : string;
  chapterId          : string;
  segmentId          : string;
  startOffset        : number;
  endOffset          : number;
  quotedText         : string;
  normalizedText     : string;
  speakerHint        : string | null;
  narrativeRegionType: string;
  createdByRunId     : string;
}

export interface ValidateEvidenceSpanInput {
  chapterText: string;
  segment    : EvidenceSegmentAnchor;
  draft      : EvidenceSpanDraft;
}

function assertIntegerOffsetRange(startOffset: number, endOffset: number): void {
  if (
    !Number.isInteger(startOffset) ||
    !Number.isInteger(endOffset) ||
    startOffset < 0 ||
    startOffset >= endOffset
  ) {
    throw new EvidenceSpanValidationError(
      "INVALID_OFFSET_RANGE",
      `Invalid evidence offset range: ${startOffset}-${endOffset}`
    );
  }
}

export function validateEvidenceSpanDraft(
  input: ValidateEvidenceSpanInput
): MaterializedEvidenceSpanData {
  const { chapterText, draft, segment } = input;

  assertIntegerOffsetRange(draft.startOffset, draft.endOffset);

  if (draft.bookId !== segment.bookId) {
    throw new EvidenceSpanValidationError(
      "BOOK_MISMATCH",
      `Evidence span book does not match segment book: ${draft.bookId}`
    );
  }

  if (draft.chapterId !== segment.chapterId) {
    throw new EvidenceSpanValidationError(
      "CHAPTER_MISMATCH",
      `Evidence span chapter does not match segment chapter: ${draft.chapterId}`
    );
  }

  if (draft.segmentId !== segment.id) {
    throw new EvidenceSpanValidationError(
      "SEGMENT_MISMATCH",
      `Evidence span segment does not match anchor segment: ${draft.segmentId}`
    );
  }

  if (draft.endOffset > chapterText.length) {
    throw new EvidenceSpanValidationError(
      "SPAN_OUT_OF_CHAPTER",
      `Evidence span exceeds chapter text length: ${draft.endOffset} > ${chapterText.length}`
    );
  }

  const segmentText = chapterText.slice(segment.startOffset, segment.endOffset);

  if (segmentText !== segment.text) {
    throw new EvidenceSpanValidationError(
      "SEGMENT_TEXT_MISMATCH",
      "Segment text does not match chapter text at segment offsets"
    );
  }

  if (draft.startOffset < segment.startOffset || draft.endOffset > segment.endOffset) {
    throw new EvidenceSpanValidationError(
      "SPAN_OUT_OF_SEGMENT",
      `Evidence span crosses segment bounds: ${draft.startOffset}-${draft.endOffset}`
    );
  }

  const quotedText = chapterText.slice(draft.startOffset, draft.endOffset);

  if (draft.expectedText !== undefined && quotedText !== draft.expectedText) {
    throw new EvidenceSpanValidationError(
      "EXPECTED_TEXT_MISMATCH",
      `Evidence span quote mismatch: expected ${draft.expectedText}, got ${quotedText}`
    );
  }

  return {
    bookId             : draft.bookId,
    chapterId          : draft.chapterId,
    segmentId          : draft.segmentId,
    startOffset        : draft.startOffset,
    endOffset          : draft.endOffset,
    quotedText,
    normalizedText     : normalizeTextForEvidence(quotedText),
    speakerHint        : draft.speakerHint ?? segment.speakerHint ?? null,
    narrativeRegionType: draft.narrativeRegionType ?? segment.segmentType,
    createdByRunId     : draft.createdByRunId
  };
}
```

- [ ] **Step 4: Run the evidence span validation tests and verify green**

Run:

```bash
pnpm test src/server/modules/analysis/evidence/evidence-spans.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/server/modules/analysis/evidence/evidence-spans.ts src/server/modules/analysis/evidence/evidence-spans.test.ts
git commit -m "feat: validate evidence spans"
```

## Task 3: Quote Reconstruction And Review Context

**Files:**
- Create: `src/server/modules/analysis/evidence/quote-reconstruction.ts`
- Create: `src/server/modules/analysis/evidence/quote-reconstruction.test.ts`

- [ ] **Step 1: Write the failing quote reconstruction tests**

Create `src/server/modules/analysis/evidence/quote-reconstruction.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import {
  buildEvidenceJumpMetadata,
  buildHighlightedQuoteContext,
  QuoteReconstructionError,
  reconstructQuoteFromChapter,
  reconstructQuoteFromText
} from "@/server/modules/analysis/evidence/quote-reconstruction";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";
const CHAPTER_ID = "22222222-2222-4222-8222-222222222222";
const EVIDENCE_ID = "33333333-3333-4333-8333-333333333333";

describe("quote reconstruction", () => {
  it("reconstructs an exact quote from raw chapter text", () => {
    const chapterText = "王冕道：不敢。\n范进说：中了。";
    const startOffset = chapterText.indexOf("范进");
    const endOffset = startOffset + "范进说".length;

    expect(reconstructQuoteFromText({
      chapterText,
      startOffset,
      endOffset
    })).toEqual({
      startOffset,
      endOffset,
      quotedText    : "范进说",
      normalizedText: "范进说"
    });
  });

  it("loads chapter content and reconstructs quote by chapter id", async () => {
    const chapterText = "王冕道：不敢。\n范进说：中了。";
    const loadChapter = vi.fn().mockResolvedValue({
      id     : CHAPTER_ID,
      bookId : BOOK_ID,
      content: chapterText
    });

    const result = await reconstructQuoteFromChapter({
      chapterId  : CHAPTER_ID,
      startOffset: chapterText.indexOf("王冕"),
      endOffset  : chapterText.indexOf("王冕") + 2
    }, loadChapter);

    expect(result).toEqual({
      bookId        : BOOK_ID,
      chapterId     : CHAPTER_ID,
      startOffset   : 0,
      endOffset     : 2,
      quotedText    : "王冕",
      normalizedText: "王冕"
    });
    expect(loadChapter).toHaveBeenCalledWith(CHAPTER_ID);
  });

  it("builds clipped review context around the quote", () => {
    const chapterText = "甲乙丙丁戊己庚辛壬癸";

    expect(buildHighlightedQuoteContext({
      chapterText,
      startOffset  : 4,
      endOffset    : 6,
      contextRadius: 3
    })).toEqual({
      before            : "乙丙丁",
      quote             : "戊己",
      after             : "庚辛壬",
      contextText       : "乙丙丁戊己庚辛壬",
      contextStartOffset: 1,
      contextEndOffset  : 9,
      highlightStart    : 3,
      highlightEnd      : 5,
      clippedBefore     : true,
      clippedAfter      : true
    });
  });

  it("builds stable evidence jump metadata for review pages", () => {
    expect(buildEvidenceJumpMetadata({
      bookId        : BOOK_ID,
      chapterId     : CHAPTER_ID,
      evidenceSpanId: EVIDENCE_ID,
      startOffset   : 8,
      endOffset     : 11,
      quotedText    : "范进说"
    })).toEqual({
      bookId        : BOOK_ID,
      chapterId     : CHAPTER_ID,
      evidenceSpanId: EVIDENCE_ID,
      anchor        : `evidence-${EVIDENCE_ID}`,
      startOffset   : 8,
      endOffset     : 11,
      highlightText : "范进说"
    });
  });

  it("throws explicit errors for missing chapters and invalid ranges", async () => {
    await expect(reconstructQuoteFromChapter({
      chapterId  : CHAPTER_ID,
      startOffset: 0,
      endOffset  : 1
    }, vi.fn().mockResolvedValue(null))).rejects.toBeInstanceOf(QuoteReconstructionError);

    expect(() => reconstructQuoteFromText({
      chapterText : "范进",
      startOffset : 2,
      endOffset   : 1
    })).toThrow(QuoteReconstructionError);
  });
});
```

- [ ] **Step 2: Run the quote reconstruction tests and verify red**

Run:

```bash
pnpm test src/server/modules/analysis/evidence/quote-reconstruction.test.ts
```

Expected: FAIL with module resolution error for `@/server/modules/analysis/evidence/quote-reconstruction`.

- [ ] **Step 3: Implement quote reconstruction helpers**

Create `src/server/modules/analysis/evidence/quote-reconstruction.ts`:

```ts
import { normalizeTextForEvidence } from "@/server/modules/analysis/evidence/offset-map";

export type QuoteReconstructionErrorCode =
  | "CHAPTER_NOT_FOUND"
  | "INVALID_QUOTE_RANGE"
  | "QUOTE_OUT_OF_CHAPTER";

export class QuoteReconstructionError extends Error {
  readonly code: QuoteReconstructionErrorCode;

  constructor(code: QuoteReconstructionErrorCode, message: string) {
    super(message);
    this.name = "QuoteReconstructionError";
    this.code = code;
  }
}

export interface ReconstructQuoteFromTextInput {
  chapterText : string;
  startOffset : number;
  endOffset   : number;
}

export interface ReconstructedQuote {
  startOffset   : number;
  endOffset     : number;
  quotedText    : string;
  normalizedText: string;
}

export interface ChapterTextRow {
  id     : string;
  bookId : string;
  content: string;
}

export type ChapterTextLoader = (chapterId: string) => Promise<ChapterTextRow | null>;

export interface ReconstructQuoteFromChapterInput {
  chapterId  : string;
  startOffset: number;
  endOffset  : number;
}

export interface ReconstructedChapterQuote extends ReconstructedQuote {
  bookId   : string;
  chapterId: string;
}

export interface HighlightedQuoteContextInput extends ReconstructQuoteFromTextInput {
  contextRadius?: number;
}

export interface HighlightedQuoteContext {
  before            : string;
  quote             : string;
  after             : string;
  contextText       : string;
  contextStartOffset: number;
  contextEndOffset  : number;
  highlightStart    : number;
  highlightEnd      : number;
  clippedBefore     : boolean;
  clippedAfter      : boolean;
}

export interface EvidenceJumpMetadataInput {
  bookId        : string;
  chapterId     : string;
  evidenceSpanId: string;
  startOffset   : number;
  endOffset     : number;
  quotedText    : string;
}

export interface EvidenceJumpMetadata {
  bookId        : string;
  chapterId     : string;
  evidenceSpanId: string;
  anchor        : string;
  startOffset   : number;
  endOffset     : number;
  highlightText : string;
}

function assertQuoteRange(chapterText: string, startOffset: number, endOffset: number): void {
  if (
    !Number.isInteger(startOffset) ||
    !Number.isInteger(endOffset) ||
    startOffset < 0 ||
    startOffset >= endOffset
  ) {
    throw new QuoteReconstructionError(
      "INVALID_QUOTE_RANGE",
      `Invalid quote range: ${startOffset}-${endOffset}`
    );
  }

  if (endOffset > chapterText.length) {
    throw new QuoteReconstructionError(
      "QUOTE_OUT_OF_CHAPTER",
      `Quote range exceeds chapter text length: ${endOffset} > ${chapterText.length}`
    );
  }
}

export function reconstructQuoteFromText(input: ReconstructQuoteFromTextInput): ReconstructedQuote {
  assertQuoteRange(input.chapterText, input.startOffset, input.endOffset);

  const quotedText = input.chapterText.slice(input.startOffset, input.endOffset);

  return {
    startOffset   : input.startOffset,
    endOffset     : input.endOffset,
    quotedText,
    normalizedText: normalizeTextForEvidence(quotedText)
  };
}

export async function reconstructQuoteFromChapter(
  input: ReconstructQuoteFromChapterInput,
  loadChapter: ChapterTextLoader
): Promise<ReconstructedChapterQuote> {
  const chapter = await loadChapter(input.chapterId);

  if (!chapter) {
    throw new QuoteReconstructionError(
      "CHAPTER_NOT_FOUND",
      `Chapter not found while reconstructing evidence quote: ${input.chapterId}`
    );
  }

  const quote = reconstructQuoteFromText({
    chapterText : chapter.content,
    startOffset : input.startOffset,
    endOffset   : input.endOffset
  });

  return {
    bookId   : chapter.bookId,
    chapterId: chapter.id,
    ...quote
  };
}

export function buildHighlightedQuoteContext(
  input: HighlightedQuoteContextInput
): HighlightedQuoteContext {
  assertQuoteRange(input.chapterText, input.startOffset, input.endOffset);

  const contextRadius = input.contextRadius ?? 24;
  const contextStartOffset = Math.max(0, input.startOffset - contextRadius);
  const contextEndOffset = Math.min(input.chapterText.length, input.endOffset + contextRadius);
  const before = input.chapterText.slice(contextStartOffset, input.startOffset);
  const quote = input.chapterText.slice(input.startOffset, input.endOffset);
  const after = input.chapterText.slice(input.endOffset, contextEndOffset);

  return {
    before,
    quote,
    after,
    contextText       : `${before}${quote}${after}`,
    contextStartOffset,
    contextEndOffset,
    highlightStart    : input.startOffset - contextStartOffset,
    highlightEnd      : input.endOffset - contextStartOffset,
    clippedBefore     : contextStartOffset > 0,
    clippedAfter      : contextEndOffset < input.chapterText.length
  };
}

export function buildEvidenceJumpMetadata(
  input: EvidenceJumpMetadataInput
): EvidenceJumpMetadata {
  return {
    bookId        : input.bookId,
    chapterId     : input.chapterId,
    evidenceSpanId: input.evidenceSpanId,
    anchor        : `evidence-${input.evidenceSpanId}`,
    startOffset   : input.startOffset,
    endOffset     : input.endOffset,
    highlightText : input.quotedText
  };
}
```

- [ ] **Step 4: Run the quote reconstruction tests and verify green**

Run:

```bash
pnpm test src/server/modules/analysis/evidence/quote-reconstruction.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/server/modules/analysis/evidence/quote-reconstruction.ts src/server/modules/analysis/evidence/quote-reconstruction.test.ts
git commit -m "feat: reconstruct evidence quotes"
```

## Task 4: Evidence Span Persistence Helpers

**Files:**
- Modify: `src/server/modules/analysis/evidence/evidence-spans.ts`
- Modify: `src/server/modules/analysis/evidence/evidence-spans.test.ts`

- [ ] **Step 1: Extend evidence span tests for persistence helpers**

Replace the existing Vitest import in `src/server/modules/analysis/evidence/evidence-spans.test.ts` with:

```ts
import { describe, expect, it, vi } from "vitest";
```

Replace the existing evidence-span import in the same file with:

```ts
import {
  EvidenceSpanValidationError,
  findOrCreateEvidenceSpan,
  listEvidenceSpans,
  validateEvidenceSpanDraft,
  writeEvidenceSpan,
  writeEvidenceSpans
} from "@/server/modules/analysis/evidence/evidence-spans";
```

Then append this block beneath the existing `segment` constant:

```ts
const materializedSpan = {
  bookId             : BOOK_ID,
  chapterId          : CHAPTER_ID,
  segmentId          : SEGMENT_ID,
  startOffset        : chapterText.indexOf("范进"),
  endOffset          : chapterText.indexOf("范进") + 3,
  quotedText         : "范进说",
  normalizedText     : "范进说",
  speakerHint        : "范进",
  narrativeRegionType: "NARRATIVE",
  createdByRunId     : RUN_ID
};

describe("evidence span persistence helpers", () => {
  it("writes a single evidence span", async () => {
    const created = { id: "span-1", ...materializedSpan };
    const prisma = {
      evidenceSpan: {
        create: vi.fn().mockResolvedValue(created)
      }
    };

    await expect(writeEvidenceSpan(prisma, materializedSpan)).resolves.toEqual(created);
    expect(prisma.evidenceSpan.create).toHaveBeenCalledWith({ data: materializedSpan });
  });

  it("writes evidence spans in a batch and returns the created count", async () => {
    const prisma = {
      evidenceSpan: {
        createMany: vi.fn().mockResolvedValue({ count: 2 })
      }
    };

    await expect(writeEvidenceSpans(prisma, [
      materializedSpan,
      { ...materializedSpan, startOffset: 10, endOffset: 12, quotedText: "中了", normalizedText: "中了" }
    ])).resolves.toEqual({ count: 2 });

    expect(prisma.evidenceSpan.createMany).toHaveBeenCalledWith({
      data          : [
        materializedSpan,
        { ...materializedSpan, startOffset: 10, endOffset: 12, quotedText: "中了", normalizedText: "中了" }
      ],
      skipDuplicates: true
    });
  });

  it("finds an existing natural-key span before creating a duplicate", async () => {
    const existing = { id: "span-existing", ...materializedSpan };
    const prisma = {
      evidenceSpan: {
        findFirst: vi.fn().mockResolvedValue(existing),
        create   : vi.fn()
      }
    };

    await expect(findOrCreateEvidenceSpan(prisma, materializedSpan)).resolves.toEqual(existing);
    expect(prisma.evidenceSpan.findFirst).toHaveBeenCalledWith({
      where: {
        bookId        : BOOK_ID,
        chapterId     : CHAPTER_ID,
        segmentId     : SEGMENT_ID,
        startOffset   : materializedSpan.startOffset,
        endOffset     : materializedSpan.endOffset,
        createdByRunId: RUN_ID
      }
    });
    expect(prisma.evidenceSpan.create).not.toHaveBeenCalled();
  });

  it("creates a natural-key span when no matching span exists", async () => {
    const created = { id: "span-created", ...materializedSpan };
    const prisma = {
      evidenceSpan: {
        findFirst: vi.fn().mockResolvedValue(null),
        create   : vi.fn().mockResolvedValue(created)
      }
    };

    await expect(findOrCreateEvidenceSpan(prisma, materializedSpan)).resolves.toEqual(created);
    expect(prisma.evidenceSpan.create).toHaveBeenCalledWith({ data: materializedSpan });
  });

  it("lists spans by chapter, segment, and run for review jumps", async () => {
    const rows = [{ id: "span-1", ...materializedSpan }];
    const prisma = {
      evidenceSpan: {
        findMany: vi.fn().mockResolvedValue(rows)
      }
    };

    await expect(listEvidenceSpans(prisma, {
      chapterId     : CHAPTER_ID,
      segmentId     : SEGMENT_ID,
      createdByRunId: RUN_ID
    })).resolves.toEqual(rows);

    expect(prisma.evidenceSpan.findMany).toHaveBeenCalledWith({
      where: {
        chapterId     : CHAPTER_ID,
        segmentId     : SEGMENT_ID,
        createdByRunId: RUN_ID
      },
      orderBy: [
        { startOffset: "asc" },
        { endOffset  : "asc" }
      ]
    });
  });
});
```

- [ ] **Step 2: Run the extended evidence span tests and verify red**

Run:

```bash
pnpm test src/server/modules/analysis/evidence/evidence-spans.test.ts
```

Expected: FAIL because `findOrCreateEvidenceSpan`, `listEvidenceSpans`, `writeEvidenceSpan`, and `writeEvidenceSpans` are not exported.

- [ ] **Step 3: Implement persistence helpers**

Append this code to `src/server/modules/analysis/evidence/evidence-spans.ts`:

```ts
export interface EvidenceSpanRow extends MaterializedEvidenceSpanData {
  id       : string;
  createdAt?: Date;
}

export interface EvidenceSpanNaturalKeyWhere {
  bookId        : string;
  chapterId     : string;
  segmentId     : string;
  startOffset   : number;
  endOffset     : number;
  createdByRunId: string;
}

export interface EvidenceSpanLookupInput {
  chapterId?     : string;
  segmentId?     : string;
  createdByRunId?: string;
}

export interface EvidenceSpanPersistenceClient {
  evidenceSpan: {
    create(args: { data: MaterializedEvidenceSpanData }): Promise<EvidenceSpanRow>;
    createMany(args: {
      data: MaterializedEvidenceSpanData[];
      skipDuplicates: boolean;
    }): Promise<{ count: number }>;
    findFirst(args: { where: EvidenceSpanNaturalKeyWhere }): Promise<EvidenceSpanRow | null>;
    findMany(args: {
      where: EvidenceSpanLookupInput;
      orderBy: Array<{ startOffset: "asc" } | { endOffset: "asc" }>;
    }): Promise<EvidenceSpanRow[]>;
  };
}

export function toEvidenceSpanNaturalKey(
  data: MaterializedEvidenceSpanData
): EvidenceSpanNaturalKeyWhere {
  return {
    bookId        : data.bookId,
    chapterId     : data.chapterId,
    segmentId     : data.segmentId,
    startOffset   : data.startOffset,
    endOffset     : data.endOffset,
    createdByRunId: data.createdByRunId
  };
}

export async function writeEvidenceSpan(
  prisma: Pick<EvidenceSpanPersistenceClient, "evidenceSpan">,
  data: MaterializedEvidenceSpanData
): Promise<EvidenceSpanRow> {
  return prisma.evidenceSpan.create({ data });
}

export async function writeEvidenceSpans(
  prisma: Pick<EvidenceSpanPersistenceClient, "evidenceSpan">,
  data: MaterializedEvidenceSpanData[]
): Promise<{ count: number }> {
  if (data.length === 0) {
    return { count: 0 };
  }

  return prisma.evidenceSpan.createMany({
    data,
    skipDuplicates: true
  });
}

export async function findOrCreateEvidenceSpan(
  prisma: Pick<EvidenceSpanPersistenceClient, "evidenceSpan">,
  data: MaterializedEvidenceSpanData
): Promise<EvidenceSpanRow> {
  const existing = await prisma.evidenceSpan.findFirst({
    where: toEvidenceSpanNaturalKey(data)
  });

  if (existing) {
    return existing;
  }

  return prisma.evidenceSpan.create({ data });
}

export async function listEvidenceSpans(
  prisma: Pick<EvidenceSpanPersistenceClient, "evidenceSpan">,
  input: EvidenceSpanLookupInput
): Promise<EvidenceSpanRow[]> {
  return prisma.evidenceSpan.findMany({
    where  : input,
    orderBy: [
      { startOffset: "asc" },
      { endOffset  : "asc" }
    ]
  });
}
```

- [ ] **Step 4: Run the evidence span tests and verify green**

Run:

```bash
pnpm test src/server/modules/analysis/evidence/evidence-spans.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 4**

```bash
git add src/server/modules/analysis/evidence/evidence-spans.ts src/server/modules/analysis/evidence/evidence-spans.test.ts
git commit -m "feat: add evidence span persistence helpers"
```

## Task 5: Stable Evidence Module API

**Files:**
- Create: `src/server/modules/analysis/evidence/index.ts`
- Create: `src/server/modules/analysis/evidence/index.test.ts`

- [ ] **Step 1: Write the failing public API test**

Create `src/server/modules/analysis/evidence/index.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  buildEvidenceJumpMetadata,
  buildOffsetMap,
  reconstructQuoteFromText,
  validateEvidenceSpanDraft
} from "@/server/modules/analysis/evidence";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";
const CHAPTER_ID = "22222222-2222-4222-8222-222222222222";
const SEGMENT_ID = "33333333-3333-4333-8333-333333333333";
const RUN_ID = "44444444-4444-4444-8444-444444444444";

describe("analysis evidence public API", () => {
  it("exports offset, span, quote, and jump helpers from one module", () => {
    const chapterText = "范进说：中了。";
    const startOffset = 0;
    const endOffset = 3;
    const segment = {
      id            : SEGMENT_ID,
      bookId        : BOOK_ID,
      chapterId     : CHAPTER_ID,
      segmentType   : "NARRATIVE",
      startOffset   : 0,
      endOffset     : chapterText.length,
      text          : chapterText,
      normalizedText: chapterText,
      speakerHint   : null
    };

    expect(buildOffsetMap(chapterText).normalizedText).toBe(chapterText);
    expect(reconstructQuoteFromText({ chapterText, startOffset, endOffset }).quotedText).toBe("范进说");
    expect(validateEvidenceSpanDraft({
      chapterText,
      segment,
      draft: {
        bookId        : BOOK_ID,
        chapterId     : CHAPTER_ID,
        segmentId     : SEGMENT_ID,
        startOffset,
        endOffset,
        createdByRunId: RUN_ID
      }
    }).quotedText).toBe("范进说");
    expect(buildEvidenceJumpMetadata({
      bookId        : BOOK_ID,
      chapterId     : CHAPTER_ID,
      evidenceSpanId: SEGMENT_ID,
      startOffset,
      endOffset,
      quotedText    : "范进说"
    }).anchor).toBe(`evidence-${SEGMENT_ID}`);
  });
});
```

- [ ] **Step 2: Run the public API test and verify red**

Run:

```bash
pnpm test src/server/modules/analysis/evidence/index.test.ts
```

Expected: FAIL with module resolution error for `@/server/modules/analysis/evidence`.

- [ ] **Step 3: Implement the stable module export**

Create `src/server/modules/analysis/evidence/index.ts`:

```ts
export * from "@/server/modules/analysis/evidence/evidence-spans";
export * from "@/server/modules/analysis/evidence/offset-map";
export * from "@/server/modules/analysis/evidence/quote-reconstruction";
```

- [ ] **Step 4: Run the public API test and verify green**

Run:

```bash
pnpm test src/server/modules/analysis/evidence/index.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 5**

```bash
git add src/server/modules/analysis/evidence/index.ts src/server/modules/analysis/evidence/index.test.ts
git commit -m "feat: expose evidence module api"
```

## Task 6: Task-Level Validation And Documentation Closure

**Files:**
- Modify: `docs/superpowers/tasks/2026-04-18-evidence-review/02-text-evidence-layer.md`
- Modify: `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`

- [ ] **Step 1: Run task-scoped tests**

Run:

```bash
pnpm test src/server/modules/analysis/evidence
```

Expected: PASS.

- [ ] **Step 2: Run type check**

Run:

```bash
pnpm type-check
```

Expected: PASS.

- [ ] **Step 3: Update the T02 task execution record**

Modify `docs/superpowers/tasks/2026-04-18-evidence-review/02-text-evidence-layer.md` by replacing:

```markdown
## Execution Record

No execution recorded yet.
```

with this completed record, filling the commit list with the actual short commit hashes created during this task:

```markdown
## Execution Record

- Status: Completed
- Branch: `dev_2`
- Completed after T01 schema and state foundation.
- Implemented original-text-first offset maps, evidence span validation, quote reconstruction, evidence jump metadata, and evidence span persistence helpers.
- Validation:
  - `pnpm test src/server/modules/analysis/evidence`
  - `pnpm type-check`
- Commits:
  - `feat: add evidence offset map helpers`
  - `feat: validate evidence spans`
  - `feat: reconstruct evidence quotes`
  - `feat: add evidence span persistence helpers`
  - `feat: expose evidence module api`
- Follow-up risks: idempotent single-span writes use a natural-key read-before-create because T01 did not add a unique constraint for evidence spans. Keep later claim writes tolerant of duplicate historical spans until a schema-level unique key is explicitly approved.
```

- [ ] **Step 4: Mark T02 complete in the runbook**

Modify `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md` by changing the T02 checklist line from:

```markdown
- [ ] T02: `docs/superpowers/tasks/2026-04-18-evidence-review/02-text-evidence-layer.md`
```

to:

```markdown
- [x] T02: `docs/superpowers/tasks/2026-04-18-evidence-review/02-text-evidence-layer.md`
```

Append this note under the current task log section:

```markdown
### T02 Text And Evidence Layer

- Status: Completed
- Output: original-text-first evidence helpers under `src/server/modules/analysis/evidence`.
- Validation:
  - `pnpm test src/server/modules/analysis/evidence`
  - `pnpm type-check`
- Next task: T03 `docs/superpowers/tasks/2026-04-18-evidence-review/03-claim-storage-contracts.md`
```

- [ ] **Step 5: Commit documentation closure**

```bash
git add docs/superpowers/tasks/2026-04-18-evidence-review/02-text-evidence-layer.md docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md
git commit -m "docs: record t02 evidence layer completion"
```

## Final Validation

- [ ] **Step 1: Confirm working tree is clean**

Run:

```bash
git status --short
```

Expected: no output.

- [ ] **Step 2: Confirm T02 validation remains green**

Run:

```bash
pnpm test src/server/modules/analysis/evidence
pnpm type-check
```

Expected: both commands PASS.

## Self-Review

- Spec coverage:
  - `Text & Evidence Layer`: Tasks 1 through 5 create offset, span, quote, and evidence module contracts.
  - `chapter_segments`: Task 2 validates spans against one segment anchor without implementing segmentation.
  - `evidence_spans`: Tasks 2 and 4 materialize and persist the exact fields T01 schema introduced.
  - `Stage 0 offset requirements`: Task 1 defines original-text authoritative offsets and normalized lookup mapping.
  - `review workbench evidence jumps`: Task 3 returns context and jump metadata.
  - `acceptance evidence closure`: Final validation proves any helper-created span can reconstruct original quoted text.
- Placeholder scan:
  - No placeholder task remains.
  - No code step references undefined functions after the task that creates them.
- Type consistency:
  - `MaterializedEvidenceSpanData` is the single write payload for validation and persistence.
  - `OriginalOffsetRange` uses `startOffset` and `endOffset`, matching T01 schema fields.
  - Public exports are guarded by `index.test.ts`.
