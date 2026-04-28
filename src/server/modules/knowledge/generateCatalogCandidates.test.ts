import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  previewGenericTitleGenerationPrompt,
  reviewGeneratedGenericTitles
} from "@/server/modules/knowledge/generateGenericTitles";
import {
  previewSurnameGenerationPrompt,
  reviewGeneratedSurnames
} from "@/server/modules/knowledge/generateSurnames";

const hoisted = vi.hoisted(() => ({
  prisma: {
    bookType: {
      findUnique: vi.fn()
    },
    surnameRule: {
      findMany: vi.fn()
    },
    genericTitleRule: {
      findMany: vi.fn()
    },
    nerLexiconRule: {
      findMany  : vi.fn(),
      findFirst : vi.fn(),
      createMany: vi.fn()
    },
    promptExtractionRule: {
      findMany  : vi.fn(),
      findFirst : vi.fn(),
      createMany: vi.fn()
    },
    aiModel: {
      findFirst: vi.fn()
    }
  },
  createAiProviderClient: vi.fn(),
  decryptValue          : vi.fn(),
  repairJson            : vi.fn(),
  generateJson          : vi.fn()
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: hoisted.prisma
}));

vi.mock("@/server/providers/ai", () => ({
  createAiProviderClient: hoisted.createAiProviderClient
}));

vi.mock("@/server/security/encryption", () => ({
  decryptValue: hoisted.decryptValue
}));

vi.mock("@/types/analysis", () => ({
  repairJson: hoisted.repairJson
}));

describe("knowledge catalog generation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    hoisted.createAiProviderClient.mockReturnValue({
      generateJson: hoisted.generateJson
    });
    hoisted.decryptValue.mockImplementation((value: string) => `plain:${value}`);
    hoisted.repairJson.mockImplementation((value: string) => value);
  });

  it("builds surname preview prompts with reference book type context", async () => {
    hoisted.prisma.bookType.findUnique.mockResolvedValueOnce({
      id  : "bt-1",
      key : "classic",
      name: "章回小说"
    });
    hoisted.prisma.surnameRule.findMany.mockResolvedValueOnce([
      {
        surname    : "欧阳",
        isCompound : true,
        priority   : 10,
        description: "古典小说常见复姓",
        bookType   : { key: "classic", name: "章回小说" }
      }
    ]);

    const preview = await previewSurnameGenerationPrompt({
      targetCount           : 12,
      additionalInstructions: "优先补充复姓",
      referenceBookTypeId   : "bt-1"
    });

    expect(preview).toMatchObject({
      targetCount      : 12,
      referenceBookType: {
        id  : "bt-1",
        key : "classic",
        name: "章回小说"
      }
    });
    expect(preview.systemPrompt).toContain("surname、isCompound、priority、confidence");
    expect(preview.userPrompt).toContain("参考题材：章回小说");
    expect(preview.userPrompt).toContain("欧阳");
    expect(preview.userPrompt).toContain("补充要求：优先补充复姓");
  });

  it("reviews generated surnames with deduplication, overlap detection and low-confidence rejection", async () => {
    hoisted.prisma.surnameRule.findMany
      .mockResolvedValueOnce([
        {
          surname    : "欧阳",
          isCompound : true,
          priority   : 10,
          description: "古典小说常见复姓",
          bookType   : { key: "classic", name: "章回小说" }
        }
      ])
      .mockResolvedValueOnce([
        { surname: "欧阳" }
      ]);
    hoisted.prisma.aiModel.findFirst.mockResolvedValueOnce({
      id      : "model-1",
      provider: "DEEPSEEK",
      protocol: "openai-compatible",
      modelId : "deepseek-chat",
      apiKey  : "encrypted-key",
      baseUrl : "https://api.example.com"
    });
    hoisted.generateJson.mockResolvedValueOnce({
      content: JSON.stringify([
        { surname: "欧阳", isCompound: true, priority: 10, confidence: 0.95 },
        { surname: "赵", priority: 2, confidence: 0.82 },
        { surname: "赵", priority: 5, confidence: 0.91 },
        { surname: "司马", confidence: 0.88 },
        { surname: "阿甲", confidence: 0.4 },
        { surname: "abc", confidence: 0.7 }
      ]),
      usage: null
    });

    const result = await reviewGeneratedSurnames({
      targetCount: 20,
      modelId    : "model-1"
    });

    expect(result.model).toEqual({
      id       : "model-1",
      provider : "DEEPSEEK",
      protocol : "openai-compatible",
      modelName: "deepseek-chat"
    });
    expect(result.skipped).toBe(2);
    expect(result.candidates).toEqual([
      expect.objectContaining({
        surname          : "赵",
        isCompound       : false,
        priority         : 5,
        confidence       : 0.91,
        defaultSelected  : true,
        recommendedAction: "SELECT"
      }),
      expect.objectContaining({
        surname          : "司马",
        isCompound       : true,
        priority         : 10,
        confidence       : 0.88,
        defaultSelected  : true,
        recommendedAction: "SELECT"
      }),
      expect.objectContaining({
        surname          : "欧阳",
        overlapSurname   : "欧阳",
        defaultSelected  : false,
        recommendedAction: "REJECT",
        rejectionReason  : "姓氏已存在于当前词库中，默认不重复保存"
      }),
      expect.objectContaining({
        surname          : "阿甲",
        confidence       : 0.4,
        defaultSelected  : false,
        recommendedAction: "REJECT",
        rejectionReason  : "置信度低于 0.5，默认不保存"
      })
    ]);
    expect(hoisted.createAiProviderClient).toHaveBeenCalledWith({
      provider : "DEEPSEEK",
      protocol : "openai-compatible",
      apiKey   : "plain:encrypted-key",
      baseUrl  : "https://api.example.com",
      modelName: "deepseek-chat"
    });
  });

  it("builds ner lexicon preview prompts with reference book type context", async () => {
    const { previewNerLexiconGenerationPrompt } = await import("./generateNerLexiconRules");

    hoisted.prisma.bookType.findUnique.mockResolvedValueOnce({
      id  : "bt-3",
      key : "historic",
      name: "历史演义"
    });
    hoisted.prisma.nerLexiconRule.findMany.mockResolvedValueOnce([
      {
        content : "大人",
        ruleType: "TITLE_STEM",
        bookType: { key: "historic", name: "历史演义" }
      }
    ]);

    const preview = await previewNerLexiconGenerationPrompt({
      ruleType              : "TITLE_STEM",
      targetCount           : 10,
      bookTypeId            : "bt-3",
      additionalInstructions: "优先补充古代敬称"
    });

    expect(preview.systemPrompt).toContain("content、confidence");
    expect(preview.userPrompt).toContain("TITLE_STEM");
    expect(preview.userPrompt).toContain("历史演义");
    expect(preview.userPrompt).toContain("大人");
    expect(preview.userPrompt).toContain("补充要求：优先补充古代敬称");
  });

  it("builds ner lexicon preview prompts without reference book type defaults", async () => {
    const { previewNerLexiconGenerationPrompt } = await import("./generateNerLexiconRules");

    hoisted.prisma.nerLexiconRule.findMany.mockResolvedValueOnce([]);

    const preview = await previewNerLexiconGenerationPrompt({
      ruleType: "POSITION_STEM"
    });

    expect(preview).toMatchObject({
      ruleType         : "POSITION_STEM",
      targetCount      : 30,
      referenceBookType: null
    });
    expect(hoisted.prisma.bookType.findUnique).not.toHaveBeenCalled();
    expect(preview.userPrompt).toContain("参考题材：未指定，请按通用古典文学场景生成。");
    expect(preview.userPrompt).toContain("（当前暂无已启用规则）");
  });

  it("rejects ner lexicon preview when the reference book type is missing", async () => {
    const { previewNerLexiconGenerationPrompt } = await import("./generateNerLexiconRules");

    hoisted.prisma.bookType.findUnique.mockResolvedValueOnce(null);
    hoisted.prisma.nerLexiconRule.findMany.mockResolvedValueOnce([]);

    await expect(previewNerLexiconGenerationPrompt({
      ruleType  : "TITLE_STEM",
      bookTypeId: "bt-missing"
    })).rejects.toThrow("参考题材不存在");
  });

  it("generates ner lexicon rules with dedupe inactive persistence and sort-order increment", async () => {
    const { generateNerLexiconRules } = await import("./generateNerLexiconRules");

    hoisted.prisma.bookType.findUnique.mockResolvedValueOnce({
      id  : "bt-4",
      key : "gongdou",
      name: "宫斗"
    });
    hoisted.prisma.nerLexiconRule.findMany
      .mockResolvedValueOnce([
        {
          content : "娘娘",
          ruleType: "TITLE_STEM",
          bookType: { key: "gongdou", name: "宫斗" }
        }
      ])
      .mockResolvedValueOnce([
        { content: "老爷" }
      ]);
    hoisted.prisma.nerLexiconRule.findFirst.mockResolvedValueOnce({ sortOrder: 7 });
    hoisted.prisma.aiModel.findFirst.mockResolvedValueOnce({
      id      : "model-3",
      provider: "GLM",
      protocol: "openai-compatible",
      modelId : "glm-4.5",
      apiKey  : "encrypted-key-3",
      baseUrl : "https://api.glm.example.com"
    });
    hoisted.generateJson.mockResolvedValueOnce({
      content: JSON.stringify([
        { content: "老爷", confidence: 0.92 },
        { content: "夫子", confidence: 0.88 },
        { content: "夫子", confidence: 0.76 },
        { content: "掌柜", confidence: 0.85 }
      ]),
      usage: null
    });
    hoisted.prisma.nerLexiconRule.createMany.mockResolvedValueOnce({ count: 2 });

    const result = await generateNerLexiconRules({
      ruleType              : "TITLE_STEM",
      targetCount           : 20,
      bookTypeId            : "bt-4",
      additionalInstructions: "优先补充宫廷敬称",
      selectedModelId       : "model-3"
    });

    expect(result).toEqual({
      created: 2,
      skipped: 2,
      model  : {
        id       : "model-3",
        provider : "GLM",
        protocol : "openai-compatible",
        modelName: "glm-4.5"
      }
    });
    expect(hoisted.prisma.nerLexiconRule.createMany).toHaveBeenCalledWith({
      data: [
        {
          ruleType  : "TITLE_STEM",
          content   : "夫子",
          bookTypeId: "bt-4",
          sortOrder : 8,
          isActive  : false,
          source    : "LLM_SUGGESTED"
        },
        {
          ruleType  : "TITLE_STEM",
          content   : "掌柜",
          bookTypeId: "bt-4",
          sortOrder : 9,
          isActive  : false,
          source    : "LLM_SUGGESTED"
        }
      ]
    });
  });

  it("skips ner lexicon persistence when every generated rule is filtered out", async () => {
    const { generateNerLexiconRules } = await import("./generateNerLexiconRules");

    hoisted.prisma.nerLexiconRule.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { content: "夫子" }
      ]);
    hoisted.prisma.nerLexiconRule.findFirst.mockResolvedValueOnce(null);
    hoisted.prisma.aiModel.findFirst.mockResolvedValueOnce({
      id      : "model-5",
      provider: "QWEN",
      protocol: "openai-compatible",
      modelId : "qwen-plus",
      apiKey  : "encrypted-key-5",
      baseUrl : "https://api.qwen.example.com"
    });
    hoisted.generateJson.mockResolvedValueOnce({
      content: JSON.stringify([
        { content: "夫子", confidence: 0.9 },
        { content: "夫子", confidence: 0.8 }
      ]),
      usage: null
    });

    const result = await generateNerLexiconRules({
      ruleType       : "POSITION_STEM",
      selectedModelId: "model-5"
    });

    expect(result).toEqual({
      created: 0,
      skipped: 2,
      model  : {
        id       : "model-5",
        provider : "QWEN",
        protocol : "openai-compatible",
        modelName: "qwen-plus"
      }
    });
    expect(hoisted.prisma.nerLexiconRule.createMany).not.toHaveBeenCalled();
  });

  it("builds prompt extraction preview prompts with reference book type context", async () => {
    const { previewPromptExtractionGenerationPrompt } = await import("./generatePromptExtractionRules");

    hoisted.prisma.bookType.findUnique.mockResolvedValueOnce({
      id  : "bt-5",
      key : "xianxia",
      name: "仙侠"
    });
    hoisted.prisma.promptExtractionRule.findMany.mockResolvedValueOnce([
      {
        content : "抽取门派与修行体系",
        ruleType: "ENTITY",
        bookType: { key: "xianxia", name: "仙侠" }
      }
    ]);

    const preview = await previewPromptExtractionGenerationPrompt({
      ruleType              : "ENTITY",
      targetCount           : 8,
      bookTypeId            : "bt-5",
      additionalInstructions: "优先补充仙门体系"
    });

    expect(preview.systemPrompt).toContain("content、confidence");
    expect(preview.userPrompt).toContain("ENTITY");
    expect(preview.userPrompt).toContain("仙侠");
    expect(preview.userPrompt).toContain("抽取门派与修行体系");
    expect(preview.userPrompt).toContain("补充要求：优先补充仙门体系");
  });

  it("builds prompt extraction preview prompts without reference book type defaults", async () => {
    const { previewPromptExtractionGenerationPrompt } = await import("./generatePromptExtractionRules");

    hoisted.prisma.promptExtractionRule.findMany.mockResolvedValueOnce([]);

    const preview = await previewPromptExtractionGenerationPrompt({
      ruleType: "RELATIONSHIP"
    });

    expect(preview).toMatchObject({
      ruleType         : "RELATIONSHIP",
      targetCount      : 30,
      referenceBookType: null
    });
    expect(hoisted.prisma.bookType.findUnique).not.toHaveBeenCalled();
    expect(preview.userPrompt).toContain("参考题材：未指定，请按通用古典文学场景生成。");
    expect(preview.userPrompt).toContain("（当前暂无已启用规则）");
  });

  it("rejects prompt extraction preview when the reference book type is missing", async () => {
    const { previewPromptExtractionGenerationPrompt } = await import("./generatePromptExtractionRules");

    hoisted.prisma.bookType.findUnique.mockResolvedValueOnce(null);
    hoisted.prisma.promptExtractionRule.findMany.mockResolvedValueOnce([]);

    await expect(previewPromptExtractionGenerationPrompt({
      ruleType  : "ENTITY",
      bookTypeId: "bt-missing"
    })).rejects.toThrow("参考题材不存在");
  });

  it("generates prompt extraction rules with dedupe inactive persistence and sort-order increment", async () => {
    const { generatePromptExtractionRules } = await import("./generatePromptExtractionRules");

    hoisted.prisma.bookType.findUnique.mockResolvedValueOnce({
      id  : "bt-6",
      key : "zhiguai",
      name: "志怪"
    });
    hoisted.prisma.promptExtractionRule.findMany
      .mockResolvedValueOnce([
        {
          content : "抽取妖怪类别与修炼方式",
          ruleType: "ENTITY",
          bookType: { key: "zhiguai", name: "志怪" }
        }
      ])
      .mockResolvedValueOnce([
        { content: "抽取神怪身份" }
      ]);
    hoisted.prisma.promptExtractionRule.findFirst.mockResolvedValueOnce({ sortOrder: 3 });
    hoisted.prisma.aiModel.findFirst.mockResolvedValueOnce({
      id      : "model-4",
      provider: "DOUBAO",
      protocol: "openai-compatible",
      modelId : "doubao-pro",
      apiKey  : "encrypted-key-4",
      baseUrl : "https://api.doubao.example.com"
    });
    hoisted.generateJson.mockResolvedValueOnce({
      content: JSON.stringify([
        { content: "抽取神怪身份", confidence: 0.91 },
        { content: "抽取法器名称与用途", confidence: 0.88 },
        { content: "抽取法器名称与用途", confidence: 0.73 },
        { content: "抽取禁忌与代价", confidence: 0.86 }
      ]),
      usage: null
    });
    hoisted.prisma.promptExtractionRule.createMany.mockResolvedValueOnce({ count: 2 });

    const result = await generatePromptExtractionRules({
      ruleType              : "ENTITY",
      targetCount           : 12,
      bookTypeId            : "bt-6",
      additionalInstructions: "优先补充志怪世界观",
      selectedModelId       : "model-4"
    });

    expect(result).toEqual({
      created: 2,
      skipped: 2,
      model  : {
        id       : "model-4",
        provider : "DOUBAO",
        protocol : "openai-compatible",
        modelName: "doubao-pro"
      }
    });
    expect(hoisted.prisma.promptExtractionRule.createMany).toHaveBeenCalledWith({
      data: [
        {
          ruleType  : "ENTITY",
          content   : "抽取法器名称与用途",
          bookTypeId: "bt-6",
          sortOrder : 4,
          isActive  : false,
          source    : "LLM_SUGGESTED"
        },
        {
          ruleType  : "ENTITY",
          content   : "抽取禁忌与代价",
          bookTypeId: "bt-6",
          sortOrder : 5,
          isActive  : false,
          source    : "LLM_SUGGESTED"
        }
      ]
    });
  });

  it("skips prompt extraction persistence when every generated rule is filtered out", async () => {
    const { generatePromptExtractionRules } = await import("./generatePromptExtractionRules");

    hoisted.prisma.promptExtractionRule.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { content: "抽取门派关系" }
      ]);
    hoisted.prisma.promptExtractionRule.findFirst.mockResolvedValueOnce(null);
    hoisted.prisma.aiModel.findFirst.mockResolvedValueOnce({
      id      : "model-6",
      provider: "GLM",
      protocol: "openai-compatible",
      modelId : "glm-4.5-air",
      apiKey  : "encrypted-key-6",
      baseUrl : "https://api.glm.example.com"
    });
    hoisted.generateJson.mockResolvedValueOnce({
      content: JSON.stringify([
        { content: "抽取门派关系", confidence: 0.9 },
        { content: "抽取门派关系", confidence: 0.8 }
      ]),
      usage: null
    });

    const result = await generatePromptExtractionRules({
      ruleType       : "RELATIONSHIP",
      selectedModelId: "model-6"
    });

    expect(result).toEqual({
      created: 0,
      skipped: 2,
      model  : {
        id       : "model-6",
        provider : "GLM",
        protocol : "openai-compatible",
        modelName: "glm-4.5-air"
      }
    });
    expect(hoisted.prisma.promptExtractionRule.createMany).not.toHaveBeenCalled();
  });

  it("builds generic title preview prompts with reference book type context", async () => {
    hoisted.prisma.bookType.findUnique.mockResolvedValueOnce({
      id  : "bt-2",
      key : "wuxia",
      name: "武侠"
    });
    hoisted.prisma.genericTitleRule.findMany.mockResolvedValueOnce([
      {
        title              : "先生",
        tier               : "DEFAULT",
        exemptInBookTypeIds: ["wuxia"],
        description        : "多数场景为泛称"
      }
    ]);

    const preview = await previewGenericTitleGenerationPrompt({
      targetCount           : 15,
      additionalInstructions: "优先补充武侠常见称谓",
      referenceBookTypeId   : "bt-2"
    });

    expect(preview).toMatchObject({
      targetCount      : 15,
      referenceBookType: {
        id  : "bt-2",
        key : "wuxia",
        name: "武侠"
      }
    });
    expect(preview.systemPrompt).toContain("title、tier、exemptInBookTypeIds、confidence");
    expect(preview.userPrompt).toContain("参考题材：武侠");
    expect(preview.userPrompt).toContain("先生");
    expect(preview.userPrompt).toContain("补充要求：优先补充武侠常见称谓");
  });

  it("reviews generated generic titles with tier normalization, overlap detection and low-confidence rejection", async () => {
    hoisted.prisma.genericTitleRule.findMany
      .mockResolvedValueOnce([
        {
          title              : "老爷",
          tier               : "DEFAULT",
          exemptInBookTypeIds: ["classic"],
          description        : "多数场景为泛称"
        }
      ])
      .mockResolvedValueOnce([
        { title: "老爷" }
      ]);
    hoisted.prisma.aiModel.findFirst.mockResolvedValueOnce({
      id      : "model-2",
      provider: "QWEN",
      protocol: "openai-compatible",
      modelId : "qwen-max",
      apiKey  : "encrypted-key-2",
      baseUrl : "https://api.qwen.example.com"
    });
    hoisted.generateJson.mockResolvedValueOnce({
      content: JSON.stringify([
        { title: "老爷", tier: "DEFAULT", exemptInBookTypeIds: ["classic"], confidence: 0.9 },
        { title: "先生", tier: "DEFAULT", exemptInBookTypeIds: ["wuxia", "wuxia"], confidence: 0.82 },
        { title: "先生", tier: "SAFETY", exemptInBookTypeIds: ["classic"], confidence: 0.91 },
        { title: "掌门", tier: "DEFAULT", exemptInBookTypeIds: ["wuxia"], confidence: 0.4 }
      ]),
      usage: null
    });

    const result = await reviewGeneratedGenericTitles({
      targetCount: 20,
      modelId    : "model-2"
    });

    expect(result.model).toEqual({
      id       : "model-2",
      provider : "QWEN",
      protocol : "openai-compatible",
      modelName: "qwen-max"
    });
    expect(result.skipped).toBe(1);
    expect(result.candidates).toEqual([
      expect.objectContaining({
        title              : "先生",
        tier               : "SAFETY",
        exemptInBookTypeIds: [],
        confidence         : 0.91,
        defaultSelected    : true,
        recommendedAction  : "SELECT"
      }),
      expect.objectContaining({
        title            : "老爷",
        overlapTitle     : "老爷",
        defaultSelected  : false,
        recommendedAction: "REJECT",
        rejectionReason  : "称谓已存在于当前词库中，默认不重复保存"
      }),
      expect.objectContaining({
        title            : "掌门",
        confidence       : 0.4,
        defaultSelected  : false,
        recommendedAction: "REJECT",
        rejectionReason  : "置信度低于 0.5，默认不保存"
      })
    ]);
  });
});
