import { describe, expect, it } from "vitest";
import { buildSlices, isOversizedChapter, splitOversizedChapter } from "./slices.ts";
import type { ChapterRef } from "./slices.ts";

function ch(no: number, content = "正文"): ChapterRef {
  return { id: `ch-${no}`, no, title: `第${no}回`, content };
}

describe("buildSlices", () => {
  it("空章节 → 空分片", () => {
    expect(buildSlices([], "b")).toHaveLength(0);
  });

  it("12 章按 6 章/片 → 2 片", () => {
    const slices = buildSlices(Array.from({ length: 12 }, (_, i) => ch(i + 1)), "b");
    expect(slices).toHaveLength(2);
    expect(slices[0].chapterNos).toEqual([1, 2, 3, 4, 5, 6]);
    expect(slices[1].chapterNos).toEqual([7, 8, 9, 10, 11, 12]);
  });

  it("不足一片 → 单片", () => {
    const slices = buildSlices([ch(1), ch(2)], "b");
    expect(slices).toHaveLength(1);
  });
});

describe("超长章", () => {
  it("isOversizedChapter 判定", () => {
    expect(isOversizedChapter(ch(1, "x".repeat(13_000)), 12_000)).toBe(true);
    expect(isOversizedChapter(ch(1, "短"), 12_000)).toBe(false);
  });

  it("splitOversizedChapter 按段落拆段", () => {
    const content = Array.from({ length: 30 }, (_, i) => `段落${i}${"字".repeat(500)}`).join("\n");
    const segs = splitOversizedChapter(ch(1, content), 12_000);
    expect(segs.length).toBeGreaterThan(1);
    expect(segs.every((s) => s.length <= 12_000)).toBe(true);
  });

  it("不超长 → 原样返回单段", () => {
    expect(splitOversizedChapter(ch(1, "短"))).toEqual(["短"]);
  });
});
