import { describe, expect, it } from "vitest";

import { buildChapterAnalysisPrompt } from "./prompts";

const baseInput = {
  bookTitle   : "儒林外史",
  chapterNo   : 1,
  chapterTitle: "说楔子敷陈大义 借名流隐括全文",
  content     : "范进见中举，众人态度大变。",
  chunkIndex  : 0,
  chunkCount  : 3
};

describe("buildChapterAnalysisPrompt", () => {
  it("injects known entity context when profiles are provided", () => {
    const prompt = buildChapterAnalysisPrompt({
      ...baseInput,
      profiles: [
        {
          personaId    : "p1",
          canonicalName: "范进",
          aliases      : ["范老爷", "范相公"],
          localSummary : "晚年中举"
        }
      ]
    });

    expect(prompt).toContain("## Known Entities (Context)");
    expect(prompt).toContain("[1] 范进 | 别名: 范老爷, 范相公 | 小传: 晚年中举");
    expect(prompt).toContain("第 1/3 段");
    expect(prompt).toContain("范进见中举，众人态度大变。");
  });

  it("uses fallback context text when there are no known profiles", () => {
    const prompt = buildChapterAnalysisPrompt({
      ...baseInput,
      profiles: []
    });

    expect(prompt).toContain("No existing entities found in this book yet.");
  });
});
