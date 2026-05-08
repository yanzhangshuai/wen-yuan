import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  previewGenericTitleGenerationPrompt,
  reviewGeneratedGenericTitles
} from "@/server/modules/knowledge/generateGenericTitles";

const hoisted = vi.hoisted(() => ({
  prisma: {
    bookType: {
      findUnique: vi.fn()
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
    expect(result.skipped).toBe(2);
    expect(result.skippedExisting).toBe(1);
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
        title            : "掌门",
        confidence       : 0.4,
        defaultSelected  : false,
        recommendedAction: "REJECT",
        rejectionReason  : "置信度低于 0.5，默认不保存"
      })
    ]);
    expect(result.candidates.map((candidate) => candidate.title)).not.toContain("老爷");
  });
});
