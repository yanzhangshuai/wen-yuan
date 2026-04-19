/**
 * 被测对象：evidence/quote-reconstruction.ts。
 * 测试目标：
 *   - 按原始 chapter offset 重建引用文本
 *   - 生成审核页上下文和跳转 metadata
 *   - 缺失章节与非法 offset 明确失败
 */

import { describe, expect, it, vi } from "vitest";

import {
  buildEvidenceJumpMetadata,
  buildHighlightedQuoteContext,
  QuoteReconstructionError,
  reconstructQuoteFromChapter,
  reconstructQuoteFromText
} from "@/server/modules/analysis/evidence/quote-reconstruction";
import {
  buildOffsetMap,
  findOriginalRangeByNormalizedNeedle,
  mapNormalizedRangeToOriginalRange,
  OffsetMapError,
  sliceOriginalByNormalizedRange
} from "@/server/modules/analysis/evidence/offset-map";

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

describe("offset map coverage guard for quote reconstruction", () => {
  it("keeps normalized lookup ranges reversible in quote-adjacent helpers", () => {
    const raw = "甲曰\r\n乙曰\r丙曰　丁曰\t戊曰";
    const map = buildOffsetMap(raw);

    expect(map.normalizedText).toBe("甲曰\n乙曰\n丙曰 丁曰 戊曰");
    expect(raw.slice(
      findOriginalRangeByNormalizedNeedle(map, "\n乙曰").startOffset,
      findOriginalRangeByNormalizedNeedle(map, "\n乙曰").endOffset
    )).toBe("\r\n乙曰");
    expect(sliceOriginalByNormalizedRange(map, 8, 11)).toBe("　丁曰");
  });

  it("keeps offset-map error branches covered under single-file coverage runs", () => {
    const map = buildOffsetMap("范进中举");

    expect(() => mapNormalizedRangeToOriginalRange(map, 2, 2)).toThrow(OffsetMapError);
    expect(() => mapNormalizedRangeToOriginalRange(map, -1, 2)).toThrow(OffsetMapError);
    expect(() => mapNormalizedRangeToOriginalRange(map, 0, 99)).toThrow(OffsetMapError);
    expect(() => findOriginalRangeByNormalizedNeedle(map, "")).toThrow(OffsetMapError);
    expect(() => findOriginalRangeByNormalizedNeedle(map, "王冕")).toThrow(OffsetMapError);
  });
});
