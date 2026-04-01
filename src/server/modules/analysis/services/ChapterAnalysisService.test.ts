import { ProcessingStatus } from "@/generated/prisma/enums";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createChapterAnalysisService } from "@/server/modules/analysis/services/ChapterAnalysisService";
import type { AliasRegistryService } from "@/server/modules/analysis/services/AliasRegistryService";
import { createChapterAnalysisAiClient } from "@/server/modules/analysis/services/aiClient";
import { createPersonaResolver } from "@/server/modules/analysis/services/PersonaResolver";
import { createMergePersonasService } from "@/server/modules/personas/mergePersonas";
import { createAiProviderClient } from "@/server/providers/ai";
import { decryptValue } from "@/server/security/encryption";

vi.mock("@/server/modules/analysis/services/PersonaResolver", () => ({
  createPersonaResolver: vi.fn()
}));

vi.mock("@/server/providers/ai", () => ({
  createAiProviderClient: vi.fn()
}));

vi.mock("@/server/modules/analysis/services/aiClient", () => ({
  createChapterAnalysisAiClient: vi.fn()
}));

vi.mock("@/server/security/encryption", () => ({
  decryptValue: vi.fn()
}));

vi.mock("@/server/modules/personas/mergePersonas", () => ({
  createMergePersonasService: vi.fn().mockReturnValue({
    mergePersonas: vi.fn().mockResolvedValue({ redirectedRelationships: 0 })
  })
}));

vi.mock("@/server/modules/analysis/services/ValidationAgentService", () => ({
  validationAgentService: {
    validateChapterResult: vi.fn()
  },
  createValidationAgentService: vi.fn()
}));

function buildChapter(overrides: Partial<{
  id       : string;
  bookId   : string;
  no       : number;
  title    : string;
  content  : string;
  aiModelId: string | null;
  book     : Record<string, unknown>;
}> = {}) {
  const {
    book: overrideBook,
    ...restOverrides
  } = overrides;

  const baseBook = {
    title    : "儒林外史",
    aiModelId: "model-1",
    profiles : [{
      personaId: "persona-existing",
      localName: "范进",
      persona  : {
        name   : "范进",
        aliases: ["范秀才"]
      }
    }]
  };

  return {
    id     : "chapter-1",
    bookId : "book-1",
    no     : 1,
    title  : "第一回",
    content: "范进中举",
    book   : {
      ...baseBook,
      ...(overrides.aiModelId !== undefined ? { aiModelId: overrides.aiModelId } : {}),
      ...overrideBook
    },
    ...restOverrides
  };
}

function createPrismaMock(chapter = buildChapter()) {
  const mentionDeleteMany = vi.fn().mockResolvedValue({ count: 0 });
  const mentionCreateMany = vi.fn().mockResolvedValue({ count: 0 });
  const biographyDeleteMany = vi.fn().mockResolvedValue({ count: 0 });
  const biographyCreateMany = vi.fn().mockResolvedValue({ count: 0 });
  const relationshipDeleteMany = vi.fn().mockResolvedValue({ count: 0 });
  const relationshipCreateMany = vi.fn().mockResolvedValue({ count: 0 });

  const tx = {
    mention: {
      deleteMany: mentionDeleteMany,
      createMany: mentionCreateMany
    },
    biographyRecord: {
      deleteMany: biographyDeleteMany,
      createMany: biographyCreateMany
    },
    relationship: {
      deleteMany: relationshipDeleteMany,
      createMany: relationshipCreateMany
    }
  };

  const prismaMock = {
    chapter: {
      findUnique: vi.fn().mockResolvedValue(chapter)
    },
    book: {
      findUnique: vi.fn()
    },
    profile: {
      findMany: vi.fn()
    },
    persona: {
      update: vi.fn()
    },
    aiModel: {
      findUnique: vi.fn(),
      findFirst : vi.fn()
    },
    $transaction: vi.fn().mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => {
      return callback(tx);
    })
  };

  return {
    prismaMock,
    tx,
    mentionDeleteMany,
    mentionCreateMany,
    biographyDeleteMany,
    biographyCreateMany,
    relationshipDeleteMany,
    relationshipCreateMany
  };
}

describe("chapter analysis service", () => {
  const mockedCreatePersonaResolver = vi.mocked(createPersonaResolver);
  const mockedCreateAiProviderClient = vi.mocked(createAiProviderClient);
  const mockedCreateChapterAnalysisAiClient = vi.mocked(createChapterAnalysisAiClient);
  const mockedDecryptValue = vi.mocked(decryptValue);
  const mockedCreateMergePersonasService = vi.mocked(createMergePersonasService);
  let mergePersonasMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});

    mergePersonasMock = vi.fn().mockResolvedValue({ redirectedRelationships: 0 });
    mockedCreateMergePersonasService.mockReturnValue({
      mergePersonas: mergePersonasMock
    } as never);
    mockedCreatePersonaResolver.mockReturnValue({
      resolve: vi.fn().mockResolvedValue({
        status    : "resolved",
        personaId : "persona-existing",
        confidence: 1
      })
    } as never);
    mockedDecryptValue.mockImplementation((value) => `plain:${value}`);
    mockedCreateAiProviderClient.mockReturnValue({ provider: "mocked" } as never);
    mockedCreateChapterAnalysisAiClient.mockReturnValue({
      analyzeChapterChunk: vi.fn().mockResolvedValue({
        mentions     : [],
        biographies  : [],
        relationships: []
      }),
      discoverChapterRoster: vi.fn().mockResolvedValue([]),
      resolvePersonaTitles : vi.fn().mockResolvedValue([])
    } as never);
  });

  it("throws when chapter does not exist", async () => {
    const { prismaMock } = createPrismaMock(null as never);
    const service = createChapterAnalysisService(prismaMock as never, {
      analyzeChapterChunk: vi.fn()
    } as never);

    await expect(service.analyzeChapter("missing-chapter")).rejects.toThrow("Chapter [missing-chapter] 不存在");
  });

  it("persists deduplicated records and counts hallucinations", async () => {
    const longParagraph = "甲".repeat(3601);
    const chapter = buildChapter({
      content: `短段落\n\n${longParagraph}\n\n尾段`
    });
    const {
      prismaMock,
      mentionCreateMany,
      biographyCreateMany,
      relationshipCreateMany,
      mentionDeleteMany,
      biographyDeleteMany,
      relationshipDeleteMany
    } = createPrismaMock(chapter);

    const resolveMock = vi.fn(async ({ extractedName }: { extractedName: string }) => {
      if (extractedName === "张三") {
        return {
          status    : "resolved",
          personaId : "persona-zhang",
          confidence: 1
        };
      }
      if (extractedName === "李四") {
        return {
          status     : "created",
          personaId  : "persona-li",
          confidence : 0.8,
          matchedName: "李四"
        };
      }
      return {
        status    : "hallucinated",
        confidence: 0.2,
        reason    : "name_not_in_chapter"
      };
    });
    mockedCreatePersonaResolver.mockReturnValue({ resolve: resolveMock } as never);

    const analyzeChapterChunk = vi.fn().mockImplementation(async ({ chunkIndex }: { chunkIndex: number }) => {
      if (chunkIndex !== 0) {
        return {
          mentions     : [],
          biographies  : [],
          relationships: []
        };
      }

      return {
        mentions: [
          { personaName: "张三", rawText: "张三", summary: "现身", paraIndex: 0 },
          { personaName: "张三", rawText: "张三", summary: "现身", paraIndex: 0 },
          { personaName: "幻影", rawText: "幻影", paraIndex: 1 }
        ],
        biographies: [
          { personaName: "李四", category: "EVENT", event: "中举", ironyNote: "批判社会" },
          {
            personaName: "李四",
            category   : "CAREER",
            event      : "出仕",
            ironyNote  : "乙".repeat(320)
          },
          { personaName: "幻影", category: "BIRTH", event: "不存在" }
        ],
        relationships: [
          { sourceName: "张三", targetName: "李四", type: "ALLY", description: "a", evidence: "  证据  " },
          { sourceName: "张三", targetName: "李四", type: "ALLY", description: "a", evidence: "证据" },
          { sourceName: "张三", targetName: "张三", type: "SELF", description: "self", evidence: "x" },
          { sourceName: "幻影", targetName: "李四", type: "ALLY" }
        ]
      };
    });
    const service = createChapterAnalysisService(prismaMock as never, {
      analyzeChapterChunk,
      discoverChapterRoster: vi.fn().mockResolvedValue([])
    } as never);

    const result = await service.analyzeChapter("chapter-1");

    expect(result.chapterId).toBe("chapter-1");
    expect(result.chunkCount).toBe(4);
    expect(result.hallucinationCount).toBe(3);
    expect(result.created).toEqual({
      personas     : 1,
      mentions     : 1,
      biographies  : 2,
      relationships: 1
    });

    expect(mentionDeleteMany).toHaveBeenCalledWith({
      where: { chapterId: "chapter-1" }
    });
    expect(biographyDeleteMany).toHaveBeenCalledWith({
      where: { chapterId: "chapter-1", status: ProcessingStatus.DRAFT }
    });
    expect(relationshipDeleteMany).toHaveBeenCalledWith({
      where: { chapterId: "chapter-1", status: ProcessingStatus.DRAFT }
    });

    expect(resolveMock).toHaveBeenCalledTimes(3);

    expect(mentionCreateMany).toHaveBeenCalledWith({
      data: [{
        chapterId: "chapter-1",
        personaId: "persona-zhang",
        rawText  : "张三",
        summary  : "现身",
        paraIndex: 0
      }]
    });

    expect(biographyCreateMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          personaId: "persona-li",
          category : "EVENT",
          ironyNote: undefined
        }),
        expect.objectContaining({
          personaId: "persona-li",
          category : "CAREER",
          ironyNote: "乙".repeat(300)
        })
      ]
    });

    expect(relationshipCreateMany).toHaveBeenCalledWith({
      data: [{
        chapterId  : "chapter-1",
        sourceId   : "persona-zhang",
        targetId   : "persona-li",
        type       : "ALLY",
        weight     : 1,
        description: undefined,
        evidence   : "证据",
        status     : ProcessingStatus.DRAFT
      }]
    });
  });

  it("skips createMany calls when ai extraction is empty", async () => {
    const { prismaMock, mentionCreateMany, biographyCreateMany, relationshipCreateMany } = createPrismaMock();

    const service = createChapterAnalysisService(prismaMock as never, {
      analyzeChapterChunk: vi.fn().mockResolvedValue({
        mentions     : [],
        biographies  : [],
        relationships: []
      }),
      discoverChapterRoster: vi.fn().mockResolvedValue([])
    } as never);

    const result = await service.analyzeChapter("chapter-1");

    expect(result.created).toEqual({
      personas     : 0,
      mentions     : 0,
      biographies  : 0,
      relationships: 0
    });
    expect(mentionCreateMany).not.toHaveBeenCalled();
    expect(biographyCreateMany).not.toHaveBeenCalled();
    expect(relationshipCreateMany).not.toHaveBeenCalled();
  });

  it("retries retryable ai errors and succeeds", async () => {
    const { prismaMock } = createPrismaMock();
    const analyzeChapterChunk = vi.fn()
      .mockRejectedValueOnce(new Error("429 rate limit"))
      .mockResolvedValueOnce({
        mentions     : [],
        biographies  : [],
        relationships: []
      });
    const service = createChapterAnalysisService(prismaMock as never, {
      analyzeChapterChunk,
      discoverChapterRoster: vi.fn().mockResolvedValue([])
    } as never);

    const result = await service.analyzeChapter("chapter-1");

    expect(result.created.mentions).toBe(0);
    expect(analyzeChapterChunk).toHaveBeenCalledTimes(2);
  });

  it("throws immediately on non-retryable ai errors", async () => {
    const { prismaMock } = createPrismaMock();
    const analyzeChapterChunk = vi.fn().mockRejectedValueOnce(new Error("invalid json payload"));
    const service = createChapterAnalysisService(prismaMock as never, {
      analyzeChapterChunk,
      discoverChapterRoster: vi.fn().mockResolvedValue([])
    } as never);

    await expect(service.analyzeChapter("chapter-1")).rejects.toThrow("invalid json payload");
    expect(analyzeChapterChunk).toHaveBeenCalledTimes(1);
  });

  it("throws when assigned model does not exist", async () => {
    const { prismaMock } = createPrismaMock(buildChapter({ aiModelId: "book-model" }));
    prismaMock.aiModel.findUnique.mockResolvedValueOnce(null);
    const service = createChapterAnalysisService(prismaMock as never);

    await expect(service.analyzeChapter("chapter-1")).rejects.toThrow("书籍绑定模型不存在: book-model");
  });

  it("throws when assigned model is disabled", async () => {
    const { prismaMock } = createPrismaMock(buildChapter({ aiModelId: "book-model" }));
    prismaMock.aiModel.findUnique.mockResolvedValueOnce({
      id       : "book-model",
      provider : "deepseek",
      name     : "DeepSeek V3",
      modelId  : "deepseek-chat",
      baseUrl  : "https://api.deepseek.com",
      apiKey   : "enc:v1:abc",
      isEnabled: false
    });
    const service = createChapterAnalysisService(prismaMock as never);

    await expect(service.analyzeChapter("chapter-1")).rejects.toThrow("书籍绑定模型未启用: DeepSeek V3");
  });

  it("throws when no enabled default model exists", async () => {
    const { prismaMock } = createPrismaMock(buildChapter({ aiModelId: null }));
    prismaMock.aiModel.findFirst.mockResolvedValueOnce(null);
    const service = createChapterAnalysisService(prismaMock as never);

    await expect(service.analyzeChapter("chapter-1")).rejects.toThrow(
      "未找到可用默认模型，请在 /admin/model 配置并启用至少一个模型"
    );
  });

  it("throws when provider is unsupported", async () => {
    const { prismaMock } = createPrismaMock(buildChapter({ aiModelId: null }));
    prismaMock.aiModel.findFirst.mockResolvedValueOnce({
      id       : "model-default",
      provider : "openai",
      name     : "OpenAI Compatible",
      modelId  : "gpt-4o-mini",
      baseUrl  : "https://api.openai.com",
      apiKey   : "enc:v1:abc",
      isEnabled: true
    });
    const service = createChapterAnalysisService(prismaMock as never);

    await expect(service.analyzeChapter("chapter-1")).rejects.toThrow("不支持的模型 provider: openai");
  });

  it("throws when stored api key is missing or malformed", async () => {
    const { prismaMock } = createPrismaMock(buildChapter({ aiModelId: null }));
    const service = createChapterAnalysisService(prismaMock as never);

    prismaMock.aiModel.findFirst.mockResolvedValueOnce({
      id       : "model-default",
      provider : "deepseek",
      name     : "DeepSeek V3",
      modelId  : "deepseek-chat",
      baseUrl  : "https://api.deepseek.com",
      apiKey   : null,
      isEnabled: true
    });
    await expect(service.analyzeChapter("chapter-1")).rejects.toThrow("模型「DeepSeek V3」未配置 API Key");

    prismaMock.aiModel.findFirst.mockResolvedValueOnce({
      id       : "model-default",
      provider : "deepseek",
      name     : "DeepSeek V3",
      modelId  : "deepseek-chat",
      baseUrl  : "https://api.deepseek.com",
      apiKey   : "plain-key",
      isEnabled: true
    });
    await expect(service.analyzeChapter("chapter-1")).rejects.toThrow(
      "模型「DeepSeek V3」API Key 存储格式非法，请在模型设置页重新保存"
    );
  });

  it("builds runtime ai client from default model and provider config", async () => {
    const { prismaMock } = createPrismaMock(buildChapter({ aiModelId: null }));
    prismaMock.aiModel.findFirst.mockResolvedValueOnce({
      id       : "model-default",
      provider : "DeepSeek",
      name     : "DeepSeek V3",
      modelId  : "deepseek-chat",
      baseUrl  : "https://api.deepseek.com",
      apiKey   : "enc:v1:cipher",
      isEnabled: true
    });
    mockedDecryptValue.mockReturnValueOnce("plain-api-key");

    const runtimeAiClient = {
      analyzeChapterChunk: vi.fn().mockResolvedValue({
        mentions     : [],
        biographies  : [],
        relationships: []
      }),
      discoverChapterRoster: vi.fn().mockResolvedValue([])
    };
    mockedCreateChapterAnalysisAiClient.mockReturnValueOnce(runtimeAiClient as never);
    const service = createChapterAnalysisService(prismaMock as never);

    const result = await service.analyzeChapter("chapter-1");

    expect(result.chunkCount).toBe(1);
    expect(mockedCreateAiProviderClient).toHaveBeenCalledWith({
      provider : "deepseek",
      apiKey   : "plain-api-key",
      baseUrl  : "https://api.deepseek.com",
      modelName: "deepseek-chat"
    });
    expect(mockedCreateChapterAnalysisAiClient).toHaveBeenCalledTimes(1);
    expect(runtimeAiClient.analyzeChapterChunk).toHaveBeenCalledTimes(1);
  });

  it("registers high-confidence roster alias hints and passes chapterNo to resolver", async () => {
    const { prismaMock, mentionCreateMany } = createPrismaMock();
    const resolveMock = vi.fn().mockResolvedValue({
      status    : "resolved",
      personaId : "persona-existing",
      confidence: 1
    });
    mockedCreatePersonaResolver.mockReturnValueOnce({ resolve: resolveMock } as never);

    const registerAlias = vi.fn().mockResolvedValue(undefined);
    const aliasRegistry: AliasRegistryService = {
      lookupAlias        : vi.fn(),
      registerAlias,
      loadBookAliasCache : vi.fn(),
      listPendingMappings: vi.fn(),
      listReviewMappings : vi.fn(),
      updateMappingStatus: vi.fn()
    };

    const service = createChapterAnalysisService(prismaMock as never, {
      analyzeChapterChunk: vi.fn().mockResolvedValue({
        mentions     : [{ personaName: "范老爷", rawText: "范老爷来了", paraIndex: 0 }],
        biographies  : [],
        relationships: []
      }),
      discoverChapterRoster: vi.fn().mockResolvedValue([
        {
          surfaceForm      : "范老爷",
          aliasType        : "NICKNAME",
          suggestedRealName: "范进",
          aliasConfidence  : 0.88,
          contextHint      : {
            alias              : "范老爷",
            aliasType          : "NICKNAME",
            coOccurringPersonas: ["严监生"],
            contextClue        : "与范进同段叙述中举",
            confidence         : 0.88
          }
        }
      ]),
      resolvePersonaTitles: vi.fn().mockResolvedValue([])
    } as never, aliasRegistry);

    await service.analyzeChapter("chapter-1");

    expect(registerAlias).toHaveBeenCalledWith({
      bookId      : "book-1",
      personaId   : "persona-existing",
      alias       : "范老爷",
      resolvedName: "范进",
      aliasType   : "NICKNAME",
      confidence  : 0.88,
      evidence    : "与范进同段叙述中举",
      chapterStart: 1,
      status      : "PENDING"
    }, expect.any(Object));

    const firstResolveInput = resolveMock.mock.calls[0]?.[0] as {
      chapterNo?: number;
      rosterMap : Map<string, string>;
    } | undefined;
    expect(firstResolveInput?.chapterNo).toBe(1);
    expect(firstResolveInput?.rosterMap.get("范老爷")).toBe("persona-existing");
    expect(mentionCreateMany).toHaveBeenCalledTimes(1);
  });

  it("persists alias mapping after title resolution", async () => {
    const prismaMock = {
      book: {
        findUnique: vi.fn().mockResolvedValue({
          title    : "儒林外史",
          aiModelId: null
        })
      },
      profile: {
        findMany: vi.fn().mockResolvedValue([
          {
            localSummary: "明朝开国人物",
            persona     : { id: "title-1", name: "太祖皇帝" }
          }
        ])
      },
      persona: {
        findFirst: vi.fn().mockResolvedValue(null),
        update   : vi.fn().mockResolvedValue({})
      },
      aiModel: {
        findUnique: vi.fn(),
        findFirst : vi.fn().mockResolvedValue({
          id       : "model-default",
          provider : "DeepSeek",
          name     : "DeepSeek V3",
          modelId  : "deepseek-chat",
          baseUrl  : "https://api.deepseek.com",
          apiKey   : "enc:v1:cipher",
          isEnabled: true
        })
      },
      $transaction: vi.fn().mockImplementation(async (callback: (client: unknown) => Promise<unknown>) => {
        // $transaction 内部使用 tx.persona.update，此处模拟
        const txClient = {
          persona     : prismaMock.persona,
          aliasMapping: { create: vi.fn(), update: vi.fn(), findFirst: vi.fn() }
        };
        return callback(txClient);
      })
    };
    const registerAlias = vi.fn().mockResolvedValue(undefined);
    const aliasRegistry: AliasRegistryService = {
      lookupAlias        : vi.fn(),
      registerAlias,
      loadBookAliasCache : vi.fn(),
      listPendingMappings: vi.fn(),
      listReviewMappings : vi.fn(),
      updateMappingStatus: vi.fn()
    };

    mockedCreateChapterAnalysisAiClient.mockReturnValueOnce({
      analyzeChapterChunk: vi.fn().mockResolvedValue({
        mentions     : [],
        biographies  : [],
        relationships: []
      }),
      discoverChapterRoster: vi.fn().mockResolvedValue([]),
      resolvePersonaTitles : vi.fn().mockResolvedValue([
        {
          personaId     : "title-1",
          title         : "太祖皇帝",
          realName      : "朱元璋",
          confidence    : 0.93,
          historicalNote: "明太祖"
        }
      ])
    } as never);

    const service = createChapterAnalysisService(prismaMock as never, undefined, aliasRegistry);
    const updatedCount = await service.resolvePersonaTitles("book-1");

    expect(updatedCount).toBe(1);
    expect(prismaMock.persona.update).toHaveBeenCalledWith({
      where: { id: "title-1" },
      data : {
        name      : "朱元璋",
        nameType  : "NAMED",
        confidence: 0.93,
        aliases   : { push: "太祖皇帝" }
      }
    });
    expect(registerAlias).toHaveBeenCalledWith({
      bookId      : "book-1",
      personaId   : "title-1",
      alias       : "太祖皇帝",
      resolvedName: "朱元璋",
      aliasType   : "TITLE",
      confidence  : 0.93,
      evidence    : "明太祖",
      status      : "CONFIRMED"
    }, expect.any(Object));
  });

  it("merges into existing persona when duplicate found in resolvePersonaTitles", async () => {
    const prismaMock = {
      book: {
        findUnique: vi.fn().mockResolvedValue({
          title    : "儒林外史",
          aiModelId: null
        })
      },
      profile: {
        findMany: vi.fn().mockResolvedValue([
          {
            localSummary: "明朝开国人物",
            persona     : { id: "title-1", name: "太祖皇帝" }
          }
        ])
      },
      persona: {
        // findFirst 返回已存在的 persona（触发合并路径）
        findFirst: vi.fn().mockResolvedValue({ id: "existing-persona-zhu" }),
        update   : vi.fn().mockResolvedValue({})
      },
      aiModel: {
        findUnique: vi.fn(),
        findFirst : vi.fn().mockResolvedValue({
          id       : "model-default",
          provider : "DeepSeek",
          name     : "DeepSeek V3",
          modelId  : "deepseek-chat",
          baseUrl  : "https://api.deepseek.com",
          apiKey   : "enc:v1:cipher",
          isEnabled: true
        })
      },
      $transaction: vi.fn().mockImplementation(async (callback: (client: unknown) => Promise<unknown>) => {
        const txClient = {
          persona     : prismaMock.persona,
          aliasMapping: { create: vi.fn(), update: vi.fn(), findFirst: vi.fn() }
        };
        return callback(txClient);
      })
    };

    const registerAlias = vi.fn().mockResolvedValue(undefined);
    const aliasRegistry: AliasRegistryService = {
      lookupAlias        : vi.fn(),
      registerAlias,
      loadBookAliasCache : vi.fn(),
      listPendingMappings: vi.fn(),
      listReviewMappings : vi.fn(),
      updateMappingStatus: vi.fn()
    };

    mockedCreateChapterAnalysisAiClient.mockReturnValueOnce({
      analyzeChapterChunk  : vi.fn(),
      discoverChapterRoster: vi.fn(),
      resolvePersonaTitles : vi.fn().mockResolvedValue([
        {
          personaId     : "title-1",
          title         : "太祖皇帝",
          realName      : "朱元璋",
          confidence    : 0.95,
          historicalNote: "明太祖洪武帝"
        }
      ])
    } as never);

    const service = createChapterAnalysisService(prismaMock as never, undefined, aliasRegistry, null);
    const updatedCount = await service.resolvePersonaTitles("book-1");

    expect(updatedCount).toBe(1);
    // 应调用 mergePersonas 而非 persona.update
    expect(mergePersonasMock).toHaveBeenCalledWith({
      targetId: "existing-persona-zhu",
      sourceId: "title-1"
    });
    // 不应调用 persona.update（因为走的 merge 路径）
    expect(prismaMock.persona.update).not.toHaveBeenCalled();
    // 别名注册应指向合并目标
    expect(registerAlias).toHaveBeenCalledWith({
      bookId      : "book-1",
      personaId   : "existing-persona-zhu",
      alias       : "太祖皇帝",
      resolvedName: "朱元璋",
      aliasType   : "TITLE",
      confidence  : 0.95,
      evidence    : "明太祖洪武帝",
      status      : "CONFIRMED"
    });
  });
});
