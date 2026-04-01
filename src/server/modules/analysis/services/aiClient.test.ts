import { describe, expect, it, vi } from "vitest";

import type { AiProviderClient } from "@/server/providers/ai";
import { createChapterAnalysisAiClient } from "@/server/modules/analysis/services/aiClient";

const sampleInput = {
  bookTitle   : "儒林外史",
  chapterNo   : 1,
  chapterTitle: "说楔子敷陈大义 借名流隐括全文",
  content     : "范进见中举，众人态度大变。",
  profiles    : [
    {
      personaId    : "p1",
      canonicalName: "范进",
      aliases      : ["范老爷"],
      localSummary : "晚年中举"
    }
  ],
  chunkIndex: 0,
  chunkCount: 1
};

describe("ChapterAnalysisAiClient", () => {
  it("builds prompt through provider and parses structured response", async () => {
    const generateJson = vi.fn(async (_prompt: string) =>
      JSON.stringify({
        biographies: [
          {
            personaName: "范进",
            category   : "CAREER",
            event      : "中举后仕途起步"
          }
        ],
        mentions: [
          {
            personaName: "范进",
            rawText    : "范进见中举，众人态度大变。"
          }
        ],
        relationships: []
      })
    );
    const providerClient: AiProviderClient = { generateJson };
    const client = createChapterAnalysisAiClient(providerClient);

    const result = await client.analyzeChapterChunk(sampleInput);

    expect(generateJson).toHaveBeenCalledTimes(1);
    expect(generateJson.mock.calls[0]?.[0]).toContain("《儒林外史》");
    expect(result.biographies).toHaveLength(1);
    expect(result.mentions).toHaveLength(1);
  });

  it("returns empty arrays when provider returns unparseable content", async () => {
    const providerClient: AiProviderClient = {
      generateJson: async () => "not-json"
    };
    const client = createChapterAnalysisAiClient(providerClient);

    const result = await client.analyzeChapterChunk(sampleInput);
    expect(result.biographies).toEqual([]);
    expect(result.mentions).toEqual([]);
    expect(result.relationships).toEqual([]);
  });

  it("parses enhanced roster fields in discoverChapterRoster", async () => {
    const providerClient: AiProviderClient = {
      generateJson: vi.fn(async () => JSON.stringify([
        {
          surfaceForm      : "太祖皇帝",
          isNew            : true,
          isTitleOnly      : true,
          aliasType        : "TITLE",
          contextHint      : "明朝开国语境",
          suggestedRealName: "朱元璋",
          aliasConfidence  : 0.91
        }
      ]))
    };
    const client = createChapterAnalysisAiClient(providerClient);

    const roster = await client.discoverChapterRoster({
      bookTitle   : "儒林外史",
      chapterNo   : 1,
      chapterTitle: "第一回",
      content     : "太祖皇帝谕旨。",
      profiles    : []
    });

    expect(roster).toHaveLength(1);
    expect(roster[0]).toMatchObject({
      surfaceForm      : "太祖皇帝",
      aliasType        : "TITLE",
      suggestedRealName: "朱元璋",
      aliasConfidence  : 0.91
    });
  });

  it("parses title arbitration output", async () => {
    const providerClient: AiProviderClient = {
      generateJson: vi.fn(async () => JSON.stringify([
        { surfaceForm: "老爷", isPersonalized: true, confidence: 0.78, reason: "多章稳定指向" }
      ]))
    };
    const client = createChapterAnalysisAiClient(providerClient);
    const result = await client.arbitrateTitlePersonalization?.({
      bookTitle: "儒林外史",
      terms    : [
        {
          surfaceForm             : "老爷",
          chapterAppearanceCount  : 4,
          hasStableAliasBinding   : true,
          singlePersonaConsistency: true,
          genericRatio            : 0.2
        }
      ]
    });

    expect(result).toEqual([
      { surfaceForm: "老爷", isPersonalized: true, confidence: 0.78, reason: "多章稳定指向" }
    ]);
  });
});
