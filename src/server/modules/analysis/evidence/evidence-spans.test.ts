/**
 * 被测对象：evidence/evidence-spans.ts。
 * 测试目标：
 *   - 从 chapter 原文 + segment anchor 物化可入库的 EvidenceSpan payload
 *   - 拒绝 reversed / 越界 / 跨 segment / expectedText 不一致的 span
 * 覆盖范围：success / failure / boundary。
 */

import { describe, expect, it, vi } from "vitest";

import {
  EvidenceSpanValidationError,
  findOrCreateEvidenceSpan,
  listEvidenceSpans,
  validateEvidenceSpanDraft,
  writeEvidenceSpan,
  writeEvidenceSpans
} from "@/server/modules/analysis/evidence/evidence-spans";
import {
  buildOffsetMap,
  findOriginalRangeByNormalizedNeedle,
  mapNormalizedRangeToOriginalRange,
  OffsetMapError,
  sliceOriginalByNormalizedRange
} from "@/server/modules/analysis/evidence/offset-map";

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

describe("evidence span validation", () => {
  it("materializes a valid span from authoritative chapter text", () => {
    const startOffset = chapterText.indexOf("范进");
    const endOffset = startOffset + "范进说".length;

    const result = validateEvidenceSpanDraft({
      chapterText,
      segment,
      draft: {
        bookId        : BOOK_ID,
        chapterId     : CHAPTER_ID,
        segmentId     : SEGMENT_ID,
        startOffset,
        endOffset,
        expectedText  : "范进说",
        speakerHint   : "范进",
        createdByRunId: RUN_ID
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

  it("rejects book, chapter, and segment identity mismatches", () => {
    expect(() => validateEvidenceSpanDraft({
      chapterText,
      segment,
      draft: {
        bookId        : "55555555-5555-4555-8555-555555555555",
        chapterId     : CHAPTER_ID,
        segmentId     : SEGMENT_ID,
        startOffset   : chapterText.indexOf("王冕"),
        endOffset     : chapterText.indexOf("王冕") + 2,
        createdByRunId: RUN_ID
      }
    })).toThrow(EvidenceSpanValidationError);

    expect(() => validateEvidenceSpanDraft({
      chapterText,
      segment,
      draft: {
        bookId        : BOOK_ID,
        chapterId     : "66666666-6666-4666-8666-666666666666",
        segmentId     : SEGMENT_ID,
        startOffset   : chapterText.indexOf("王冕"),
        endOffset     : chapterText.indexOf("王冕") + 2,
        createdByRunId: RUN_ID
      }
    })).toThrow(EvidenceSpanValidationError);

    expect(() => validateEvidenceSpanDraft({
      chapterText,
      segment,
      draft: {
        bookId        : BOOK_ID,
        chapterId     : CHAPTER_ID,
        segmentId     : "77777777-7777-4777-8777-777777777777",
        startOffset   : chapterText.indexOf("王冕"),
        endOffset     : chapterText.indexOf("王冕") + 2,
        createdByRunId: RUN_ID
      }
    })).toThrow(EvidenceSpanValidationError);
  });

  it("rejects segment anchors whose text no longer matches chapter content", () => {
    expect(() => validateEvidenceSpanDraft({
      chapterText,
      segment: {
        ...segment,
        text: "损坏的 segment 文本"
      },
      draft: {
        bookId        : BOOK_ID,
        chapterId     : CHAPTER_ID,
        segmentId     : SEGMENT_ID,
        startOffset   : chapterText.indexOf("王冕"),
        endOffset     : chapterText.indexOf("王冕") + 2,
        createdByRunId: RUN_ID
      }
    })).toThrow(EvidenceSpanValidationError);
  });
});

describe("offset map coverage through evidence span workflows", () => {
  it("covers normalized CRLF, lone CR, full-width space, and tab mapping", () => {
    const raw = "甲曰\r\n乙曰\r丙曰　丁曰\t戊曰";
    const map = buildOffsetMap(raw);

    expect(map.normalizedText).toBe("甲曰\n乙曰\n丙曰 丁曰 戊曰");
    expect(raw.slice(findOriginalRangeByNormalizedNeedle(map, "\n乙曰").startOffset, findOriginalRangeByNormalizedNeedle(map, "\n乙曰").endOffset)).toBe("\r\n乙曰");
    expect(raw.slice(findOriginalRangeByNormalizedNeedle(map, "\n丙曰 ").startOffset, findOriginalRangeByNormalizedNeedle(map, "\n丙曰 ").endOffset)).toBe("\r丙曰　");
    expect(sliceOriginalByNormalizedRange(map, 8, 11)).toBe("　丁曰");
  });

  it("rejects invalid normalized offset-map lookups", () => {
    const map = buildOffsetMap("范进中举");

    expect(() => mapNormalizedRangeToOriginalRange(map, 2, 2)).toThrow(OffsetMapError);
    expect(() => mapNormalizedRangeToOriginalRange(map, -1, 2)).toThrow(OffsetMapError);
    expect(() => mapNormalizedRangeToOriginalRange(map, 0, 99)).toThrow(OffsetMapError);
    expect(() => findOriginalRangeByNormalizedNeedle(map, "")).toThrow(OffsetMapError);
    expect(() => findOriginalRangeByNormalizedNeedle(map, "王冕")).toThrow(OffsetMapError);
  });
});

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
      data: [
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
        { endOffset: "asc" }
      ]
    });
  });
});
