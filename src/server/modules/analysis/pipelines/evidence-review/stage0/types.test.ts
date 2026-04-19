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

    expect(() =>
      assertStage0SegmentOffsets({
        chapterText,
        startOffset: 0,
        endOffset  : 4,
        rawText    : "王冕道："
      })
    ).not.toThrow();
  });

  it("rejects ranges outside the original chapter text", () => {
    const chapterText = "王冕读书。";

    expect(() =>
      assertStage0SegmentOffsets({
        chapterText,
        startOffset: 0,
        endOffset  : 999,
        rawText    : chapterText
      })
    ).toThrow(Stage0SegmentOffsetError);
  });

  it("rejects ranges whose raw text does not match the original slice", () => {
    const chapterText = "王冕读书。";

    expect(() =>
      assertStage0SegmentOffsets({
        chapterText,
        startOffset: 0,
        endOffset  : 2,
        rawText    : "秦老"
      })
    ).toThrow("does not match chapter text");
  });

  it("marks chapter confidence low when unknown ratio is above ten percent", () => {
    expect(calculateStage0ChapterConfidence({ unknownRatio: 0.10 })).toBe("HIGH");
    expect(calculateStage0ChapterConfidence({ unknownRatio: 0.10001 })).toBe("LOW");
  });
});
