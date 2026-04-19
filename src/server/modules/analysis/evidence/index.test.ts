import { describe, expect, it, vi } from "vitest";

import {
  buildEvidenceJumpMetadata,
  buildHighlightedQuoteContext,
  buildOffsetMap,
  findOrCreateEvidenceSpan,
  findOriginalRangeByNormalizedNeedle,
  listEvidenceSpans,
  mapNormalizedRangeToOriginalRange,
  OffsetMapError,
  reconstructQuoteFromChapter,
  reconstructQuoteFromText,
  sliceOriginalByNormalizedRange,
  toEvidenceSpanNaturalKey,
  validateEvidenceSpanDraft,
  writeEvidenceSpan,
  writeEvidenceSpans
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

describe("analysis evidence public API coverage guard", () => {
  it("covers offset mapping helpers through the barrel export", () => {
    const raw = "甲曰\r\n乙曰\r丙曰　丁曰\t戊曰";
    const map = buildOffsetMap(raw);

    expect(map.normalizedText).toBe("甲曰\n乙曰\n丙曰 丁曰 戊曰");
    expect(findOriginalRangeByNormalizedNeedle(map, "\n乙曰")).toEqual({
      startOffset: 2,
      endOffset  : 6
    });
    expect(mapNormalizedRangeToOriginalRange(map, 2, 6)).toEqual({
      startOffset: 2,
      endOffset  : 7
    });
    expect(sliceOriginalByNormalizedRange(map, 8, 11)).toBe("　丁曰");
    expect(() => mapNormalizedRangeToOriginalRange(map, 2, 2)).toThrow(OffsetMapError);
    expect(() => mapNormalizedRangeToOriginalRange(map, -1, 2)).toThrow(OffsetMapError);
    expect(() => mapNormalizedRangeToOriginalRange({ ...map, entries: [] }, 0, 1)).toThrow(OffsetMapError);
    expect(() => findOriginalRangeByNormalizedNeedle(map, "")).toThrow(OffsetMapError);
    expect(() => findOriginalRangeByNormalizedNeedle(map, "赵氏")).toThrow(OffsetMapError);
  });

  it("covers evidence span validation and persistence helpers through the barrel export", async () => {
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
      speakerHint   : "旁白"
    };
    const startOffset = chapterText.indexOf("范进");
    const endOffset = startOffset + "范进说".length;
    const materialized = validateEvidenceSpanDraft({
      chapterText,
      segment,
      draft: {
        bookId        : BOOK_ID,
        chapterId     : CHAPTER_ID,
        segmentId     : SEGMENT_ID,
        startOffset,
        endOffset,
        expectedText  : "范进说",
        createdByRunId: RUN_ID
      }
    });
    const created = { id: "span-1", ...materialized };
    const prisma = {
      evidenceSpan: {
        create    : vi.fn().mockResolvedValue(created),
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
        findFirst : vi.fn().mockResolvedValueOnce(created).mockResolvedValueOnce(null),
        findMany  : vi.fn().mockResolvedValue([created])
      }
    };

    expect(materialized.speakerHint).toBe("旁白");
    expect(toEvidenceSpanNaturalKey(materialized)).toEqual({
      bookId        : BOOK_ID,
      chapterId     : CHAPTER_ID,
      segmentId     : SEGMENT_ID,
      startOffset,
      endOffset,
      createdByRunId: RUN_ID
    });
    await expect(writeEvidenceSpan(prisma, materialized)).resolves.toEqual(created);
    await expect(writeEvidenceSpans(prisma, [materialized])).resolves.toEqual({ count: 1 });
    await expect(writeEvidenceSpans(prisma, [])).resolves.toEqual({ count: 0 });
    await expect(findOrCreateEvidenceSpan(prisma, materialized)).resolves.toEqual(created);
    await expect(findOrCreateEvidenceSpan(prisma, materialized)).resolves.toEqual(created);
    await expect(listEvidenceSpans(prisma, { chapterId: CHAPTER_ID })).resolves.toEqual([created]);
    expect(() => validateEvidenceSpanDraft({
      chapterText,
      segment,
      draft: {
        bookId        : BOOK_ID,
        chapterId     : "99999999-9999-4999-8999-999999999999",
        segmentId     : SEGMENT_ID,
        startOffset,
        endOffset,
        createdByRunId: RUN_ID
      }
    })).toThrowError();
    expect(() => validateEvidenceSpanDraft({
      chapterText,
      segment,
      draft: {
        bookId        : BOOK_ID,
        chapterId     : CHAPTER_ID,
        segmentId     : "99999999-9999-4999-8999-999999999999",
        startOffset,
        endOffset,
        createdByRunId: RUN_ID
      }
    })).toThrowError();
    expect(() => validateEvidenceSpanDraft({
      chapterText,
      segment,
      draft: {
        bookId        : BOOK_ID,
        chapterId     : CHAPTER_ID,
        segmentId     : SEGMENT_ID,
        startOffset,
        endOffset     : chapterText.length + 1,
        createdByRunId: RUN_ID
      }
    })).toThrowError();
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
        startOffset,
        endOffset,
        createdByRunId: RUN_ID
      }
    })).toThrowError();
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
    })).toThrowError();
    expect(() => validateEvidenceSpanDraft({
      chapterText,
      segment,
      draft: {
        bookId        : BOOK_ID,
        chapterId     : CHAPTER_ID,
        segmentId     : SEGMENT_ID,
        startOffset,
        endOffset,
        expectedText  : "王冕道",
        createdByRunId: RUN_ID
      }
    })).toThrowError();
  });

  it("covers quote reconstruction helpers through the barrel export", async () => {
    const chapterText = "前文。范进说：中了。后文。";
    const quote = reconstructQuoteFromText({
      chapterText,
      startOffset: 3,
      endOffset  : 6
    });
    const loader = vi.fn().mockResolvedValue({
      id     : CHAPTER_ID,
      bookId : BOOK_ID,
      content: chapterText
    });

    expect(quote.quotedText).toBe("范进说");
    expect(buildHighlightedQuoteContext({
      chapterText,
      startOffset  : 3,
      endOffset    : 6,
      contextRadius: 2
    })).toEqual({
      before            : "文。",
      quote             : "范进说",
      after             : "：中",
      contextText       : "文。范进说：中",
      contextStartOffset: 1,
      contextEndOffset  : 8,
      highlightStart    : 2,
      highlightEnd      : 5,
      clippedBefore     : true,
      clippedAfter      : true
    });
    await expect(reconstructQuoteFromChapter({
      chapterId  : CHAPTER_ID,
      startOffset: 3,
      endOffset  : 6
    }, loader)).resolves.toEqual({
      bookId        : BOOK_ID,
      chapterId     : CHAPTER_ID,
      startOffset   : 3,
      endOffset     : 6,
      quotedText    : "范进说",
      normalizedText: "范进说"
    });
    await expect(reconstructQuoteFromChapter({
      chapterId  : CHAPTER_ID,
      startOffset: 3,
      endOffset  : 6
    }, vi.fn().mockResolvedValue(null))).rejects.toThrowError();
    expect(() => reconstructQuoteFromText({
      chapterText,
      startOffset: 3,
      endOffset  : chapterText.length + 1
    })).toThrowError();
    expect(() => reconstructQuoteFromText({
      chapterText,
      startOffset: 6,
      endOffset  : 6
    })).toThrowError();
  });
});
