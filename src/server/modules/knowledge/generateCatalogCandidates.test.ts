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
      provider : "deepseek",
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
      provider : "deepseek",
      apiKey   : "plain:encrypted-key",
      baseUrl  : "https://api.example.com",
      modelName: "deepseek-chat"
    });
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
      provider : "qwen",
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
