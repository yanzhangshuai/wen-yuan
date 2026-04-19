import { describe, expect, it } from "vitest";

import { normalizeTextForEvidence } from "@/server/modules/analysis/evidence/offset-map";
import { segmentChapterText } from "@/server/modules/analysis/pipelines/evidence-review/stage0/segment-rules";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";
const CHAPTER_ID = "22222222-2222-4222-8222-222222222222";
const RUN_ID = "33333333-3333-4333-8333-333333333333";

function segment(content: string, title = "第一回 王冕读书") {
  return segmentChapterText({
    bookId: BOOK_ID,
    runId: RUN_ID,
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
    expect(result.segments[0].normalizedText).toBe(
      normalizeTextForEvidence("第一回 王冕读书")
    );
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
    expect(result.segments.some((item) => item.segmentType === "DIALOGUE_CONTENT")).toBe(
      false
    );
  });

  it("recognizes commentary line starts", () => {
    const content = "却说这几位乡绅，平日好做面子功夫，暗地里各怀心思。\n王冕只是微微一笑。";

    const result = segment(content, "不存在的标题");

    expect(result.segments.map((item) => item.segmentType)).toEqual([
      "COMMENTARY",
      "NARRATIVE"
    ]);
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
