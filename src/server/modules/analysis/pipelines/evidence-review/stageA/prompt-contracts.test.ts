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
