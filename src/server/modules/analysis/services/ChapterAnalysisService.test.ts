/**
 * 文件定位（分析流水线模块单测）：
 * - 覆盖 analysis 域服务/作业/配置解析能力，属于服务端核心业务逻辑层。
 * - 该模块是小说结构化解析的主链路，直接影响人物、关系、生平等下游数据质量。
 *
 * 业务职责：
 * - 验证模型调用策略、提示词拼装、结果归并、异常降级与任务状态流转。
 * - 约束输入归一化与输出契约，避免分析链路重构时出现隐性行为漂移。
 *
 * 维护提示：
 * - 这里的断言大多是业务规则（如状态推进、去重策略、容错路径），不是简单技术实现细节。
 */

import { ProcessingStatus } from "@/generated/prisma/enums";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createChapterAnalysisService,
  mergeChunkResultsForAnalysis,
  mergeRosterEntriesForAnalysis
} from "@/server/modules/analysis/services/ChapterAnalysisService";
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

function buildEnabledModel(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id       : "model-default",
    provider : "deepseek",
    name     : "DeepSeek V3",
    modelId  : "deepseek-chat",
    baseUrl  : "https://api.deepseek.com",
    apiKey   : "enc:v1:abc",
    isEnabled: true,
    isDefault: true,
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides
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
      findMany  : vi.fn().mockResolvedValue([]),
      findFirst : vi.fn().mockResolvedValue(buildEnabledModel())
    },
    modelStrategyConfig: {
      findFirst: vi.fn().mockResolvedValue(null)
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

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
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
      discoverChapterRoster        : vi.fn().mockResolvedValue([]),
      resolvePersonaTitles         : vi.fn().mockResolvedValue([]),
      arbitrateTitlePersonalization: vi.fn().mockResolvedValue([])
    } as never);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("throws when chapter does not exist", async () => {
    const { prismaMock } = createPrismaMock(null as never);
    const service = createChapterAnalysisService(prismaMock as never, {
      analyzeChapterChunk: vi.fn()
    } as never);

    await expect(service.analyzeChapter("missing-chapter")).rejects.toThrow("Chapter [missing-chapter] 不存在");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
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
    expect(result.chunkCount).toBe(1);
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

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
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

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("does not retry ai errors when no job context", async () => {
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

    await expect(service.analyzeChapter("chapter-1")).rejects.toThrow("429 rate limit");
    expect(analyzeChapterChunk).toHaveBeenCalledTimes(1);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
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

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("falls back to system default when configured stage model does not exist", async () => {
    const { prismaMock } = createPrismaMock(buildChapter({ aiModelId: "book-model" }));
    prismaMock.modelStrategyConfig.findFirst.mockResolvedValueOnce(null); // JOB
    prismaMock.modelStrategyConfig.findFirst.mockResolvedValueOnce({
      stages: {
        CHUNK_EXTRACTION: { modelId: "book-model" }
      }
    }); // BOOK
    prismaMock.modelStrategyConfig.findFirst.mockResolvedValueOnce(null); // GLOBAL

    const service = createChapterAnalysisService(prismaMock as never);
    const result = await service.analyzeChapter("chapter-1");

    expect(result.chapterId).toBe("chapter-1");
    expect(mockedCreateAiProviderClient).toHaveBeenCalledWith(expect.objectContaining({
      provider : "deepseek",
      modelName: "deepseek-chat"
    }));
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("falls back to system default when configured stage model is disabled", async () => {
    const { prismaMock } = createPrismaMock(buildChapter({ aiModelId: "book-model" }));
    prismaMock.modelStrategyConfig.findFirst.mockResolvedValueOnce(null); // JOB
    prismaMock.modelStrategyConfig.findFirst.mockResolvedValueOnce({
      stages: {
        CHUNK_EXTRACTION: { modelId: "book-model" }
      }
    }); // BOOK
    prismaMock.modelStrategyConfig.findFirst.mockResolvedValueOnce(null); // GLOBAL
    const service = createChapterAnalysisService(prismaMock as never);

    await expect(service.analyzeChapter("chapter-1")).resolves.toEqual(expect.objectContaining({
      chapterId: "chapter-1"
    }));
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("throws when no enabled default model exists", async () => {
    const { prismaMock } = createPrismaMock(buildChapter({ aiModelId: null }));
    prismaMock.aiModel.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    const service = createChapterAnalysisService(prismaMock as never);

    await expect(service.analyzeChapter("chapter-1")).rejects.toThrow(
      "未找到可用模型，请在 /admin/model 配置并启用至少一个模型"
    );
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
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

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
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

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
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

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
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

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
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
        findMany  : vi.fn().mockResolvedValue([]),
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
      modelStrategyConfig: {
        findFirst: vi.fn().mockResolvedValue(null)
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

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
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
        findMany  : vi.fn().mockResolvedValue([]),
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
      modelStrategyConfig: {
        findFirst: vi.fn().mockResolvedValue(null)
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

    const service = createChapterAnalysisService(prismaMock as never, undefined, aliasRegistry);
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

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("chapter analysis merge helpers", () => {
  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("deduplicates mentions when personaName/rawText/paraIndex are identical", () => {
    // Arrange
    const results = [{
      mentions: [
        { personaName: "范进", rawText: "范进", paraIndex: 0, summary: "首次出现" },
        { personaName: "范进", rawText: "范进", paraIndex: 0, summary: "重复出现" }
      ],
      biographies  : [],
      relationships: []
    }];

    // Act
    const merged = mergeChunkResultsForAnalysis(results);

    // Assert
    // paraIndex 相同表示同段同称谓，属于重复 mention，应折叠为单条。
    expect(merged.mentions).toHaveLength(1);
    expect(merged.mentions[0]).toMatchObject({
      personaName: "范进",
      rawText    : "范进",
      paraIndex  : 0
    });
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("keeps mentions when paraIndex differs", () => {
    // Arrange
    const results = [{
      mentions: [
        { personaName: "范进", rawText: "范进", paraIndex: 0 },
        { personaName: "范进", rawText: "范进", paraIndex: 1 }
      ],
      biographies  : [],
      relationships: []
    }];

    // Act
    const merged = mergeChunkResultsForAnalysis(results);

    // Assert
    // paraIndex 不同表示来自不同段落，不应被误判为重复 mention。
    expect(merged.mentions).toHaveLength(2);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns stable result for empty input and single-chunk input", () => {
    // Arrange
    const singleChunk = [{
      mentions   : [{ personaName: "严监生", rawText: "严监生", paraIndex: 3 }],
      biographies: [{
        personaName: "严监生",
        category   : "EVENT" as const,
        event      : "病中伸二指"
      }],
      relationships: []
    }];

    // Act
    const emptyMerged = mergeChunkResultsForAnalysis([]);
    const singleMerged = mergeChunkResultsForAnalysis(singleChunk);

    // Assert
    // 空输入必须稳定返回空结构，避免调用方出现 undefined 分支。
    expect(emptyMerged).toEqual({
      mentions     : [],
      biographies  : [],
      relationships: []
    });
    // 单分片输入应保持原样，防止 merge 逻辑引入额外副作用。
    expect(singleMerged).toEqual(singleChunk[0]);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("merges relationships with max weight and caps evidence entries at five", () => {
    // Arrange
    const results = [{
      mentions     : [],
      biographies  : [],
      relationships: [
        {
          sourceName: "范进",
          targetName: "周学道",
          type      : "师生",
          weight    : 0.3,
          evidence  : "证据1"
        },
        {
          sourceName: "范进",
          targetName: "周学道",
          type      : "师生",
          weight    : 0.9,
          evidence  : "证据2；证据3；证据4；证据5；证据6；证据7"
        }
      ]
    }];

    // Act
    const merged = mergeChunkResultsForAnalysis(results);
    const relationship = merged.relationships[0];
    const evidenceItems = relationship?.evidence?.split("；") ?? [];

    // Assert
    expect(merged.relationships).toHaveLength(1);
    // 合并后权重取 max，确保强证据关系优先保留。
    expect(relationship?.weight).toBe(0.9);
    // evidence 限制为 5 条，防止异常长文本污染后续展示与日志统计。
    expect(evidenceItems).toHaveLength(5);
    expect(evidenceItems).toEqual(["证据1", "证据2", "证据3", "证据4", "证据5"]);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("deduplicates roster by normalized name + alias type and trims whitespace", () => {
    // Arrange
    const entries = [
      {
        surfaceForm      : " 范老爷 ",
        aliasType        : "NICKNAME" as const,
        suggestedRealName: "范进",
        aliasConfidence  : 0.6
      },
      {
        surfaceForm      : "范老爷",
        aliasType        : "NICKNAME" as const,
        suggestedRealName: "范进",
        aliasConfidence  : 0.8
      },
      {
        surfaceForm      : "范老爷",
        aliasType        : "TITLE" as const,
        suggestedRealName: "范进",
        aliasConfidence  : 0.7
      }
    ];

    // Act
    const merged = mergeRosterEntriesForAnalysis(entries);
    const nickname = merged.find((item) => item.aliasType === "NICKNAME");
    const title = merged.find((item) => item.aliasType === "TITLE");

    // Assert
    // 同一 normalizedName 在不同 aliasType 下应保留多条（称谓类型语义不同）。
    expect(merged).toHaveLength(2);
    // surfaceForm 应被 trim，aliasConfidence 保留较高值。
    expect(nickname?.surfaceForm).toBe("范老爷");
    expect(nickname?.aliasConfidence).toBe(0.8);
    expect(title?.surfaceForm).toBe("范老爷");
  });
});
