/**
 * 被测对象：evidence/offset-map.ts。
 * 测试目标：
 *   - 原始文本 offset 作为唯一权威来源
 *   - CRLF / 全角空格归一化后仍可精确映射回原文
 *   - 中文标点不被改写
 *   - 非法 normalized range 与缺失 needle 被显式拒绝
 */

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
