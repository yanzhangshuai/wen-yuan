import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  generateEntries,
  previewAliasPackGenerationPrompt,
  reviewGenerateEntries
} from "@/server/modules/knowledge/generateEntries";

const hoisted = vi.hoisted(() => ({
  prisma: {
    aiModel: {
      findFirst: vi.fn()
    },
    aliasPack: {
      findUnique: vi.fn()
    },
    book: {
      findUnique: vi.fn()
    },
    aliasEntry: {
      findMany: vi.fn()
    },
    $transaction: vi.fn()
  },
  createAiProviderClient: vi.fn(),
  decryptValue          : vi.fn(),
  repairJson            : vi.fn(),
  auditLog              : vi.fn(),
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

vi.mock("@/server/modules/knowledge/audit", () => ({
  auditLog: hoisted.auditLog
}));

describe("generateEntries", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    hoisted.createAiProviderClient.mockReturnValue({
      generateJson: hoisted.generateJson
    });
    hoisted.decryptValue.mockImplementation((value: string) => `plain:${value}`);
    hoisted.repairJson.mockImplementation((value: string) => value);
  });

  it("builds generation preview prompts with existing entries and optional book context", async () => {
    hoisted.prisma.aliasPack.findUnique.mockResolvedValueOnce({
      id         : "pack-1",
      name       : "三国人物包",
      description: "覆盖主要人物与军师别名",
      bookType   : { key: "classic" },
      entries    : [
        { canonicalName: "关羽", aliases: ["云长", "关公"] }
      ]
    });
    hoisted.prisma.book.findUnique.mockResolvedValueOnce({
      id    : "book-1",
      title : "三国演义",
      author: "罗贯中"
    });

    const preview = await previewAliasPackGenerationPrompt({
      packId                : "pack-1",
      targetCount           : 12,
      additionalInstructions: "优先覆盖主角",
      bookId                : "book-1"
    });

    expect(preview).toMatchObject({
      packId     : "pack-1",
      packName   : "三国人物包",
      genreKey   : "classic",
      targetCount: 12,
      bookContext: {
        id    : "book-1",
        title : "三国演义",
        author: "罗贯中"
      }
    });
    expect(preview.systemPrompt).toContain("canonicalName、aliases、confidence");
    expect(preview.userPrompt).toContain("三国人物包");
    expect(preview.userPrompt).toContain("《三国演义》");
    expect(preview.userPrompt).toContain("关羽: 云长、关公");
    expect(preview.userPrompt).toContain("补充要求：优先覆盖主角");
    expect(hoisted.prisma.aliasPack.findUnique).toHaveBeenCalledWith({
      where  : { id: "pack-1" },
      include: {
        bookType: { select: { key: true } },
        entries : {
          where  : { reviewStatus: { in: ["PENDING", "VERIFIED"] } },
          orderBy: { confidence: "desc" },
          take   : 80,
          select : {
            canonicalName: true,
            aliases      : true
          }
        }
      }
    });
  });

  it("rejects preview requests when the pack or target book does not exist", async () => {
    hoisted.prisma.aliasPack.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id         : "pack-1",
        name       : "三国人物包",
        description: null,
        bookType   : null,
        entries    : []
      });
    hoisted.prisma.book.findUnique.mockResolvedValueOnce(null);

    await expect(previewAliasPackGenerationPrompt({
      packId: "missing-pack"
    })).rejects.toThrow("知识包不存在");
    await expect(previewAliasPackGenerationPrompt({
      packId: "pack-1",
      bookId: "missing-book"
    })).rejects.toThrow("目标书籍不存在");
  });

  it("reviews AI generated candidates with deduplication, overlap detection and low-confidence rejection", async () => {
    hoisted.prisma.aliasPack.findUnique.mockResolvedValueOnce({
      id         : "pack-1",
      name       : "三国人物包",
      description: "覆盖主要人物与军师别名",
      bookType   : { key: "classic" },
      entries    : []
    });
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
        { canonicalName: "关羽", aliases: ["关公", "云长"], confidence: 0.97 },
        { canonicalName: "赵云", aliases: ["子龙", "子龙"], confidence: 0.8 },
        { canonicalName: "赵云", aliases: ["常山赵子龙"], confidence: 0.9 },
        { canonicalName: "低置信", aliases: ["路人"], confidence: 0.3 },
        { canonicalName: "无别名", aliases: [], confidence: 0.8 }
      ]),
      usage: null
    });
    hoisted.prisma.aliasEntry.findMany.mockResolvedValueOnce([
      { canonicalName: "关羽", aliases: ["云长", "关公"] },
      { canonicalName: "张飞", aliases: ["翼德"] }
    ]);

    const result = await reviewGenerateEntries({
      packId                : "pack-1",
      targetCount           : 20,
      additionalInstructions: "不要输出泛称",
      modelId               : "model-1"
    });

    expect(result.packName).toBe("三国人物包");
    expect(result.model).toEqual({
      id       : "model-1",
      provider : "DEEPSEEK",
      protocol : "openai-compatible",
      modelName: "deepseek-chat"
    });
    expect(result.skipped).toBe(3);
    expect(result.skippedExisting).toBe(1);
    expect(result.candidates[0]).toMatchObject({
      canonicalName    : "赵云",
      aliases          : ["子龙", "常山赵子龙"],
      confidence       : 0.9,
      defaultSelected  : true,
      recommendedAction: "SELECT"
    });
    expect(result.candidates[1]).toMatchObject({
      canonicalName    : "低置信",
      confidence       : 0.3,
      defaultSelected  : false,
      recommendedAction: "REJECT",
      rejectionReason  : "置信度低于 0.5，默认不保存"
    });
    expect(result.candidates.map((candidate) => candidate.canonicalName)).not.toContain("关羽");
    expect(hoisted.createAiProviderClient).toHaveBeenCalledWith({
      provider : "DEEPSEEK",
      protocol : "openai-compatible",
      apiKey   : "plain:encrypted-key",
      baseUrl  : "https://api.example.com",
      modelName: "deepseek-chat"
    });
  });

  it("persists only default-selected candidates and writes generation audit logs", async () => {
    const createEntry = vi.fn().mockResolvedValue({ id: "entry-1" });
    const bumpPackVersion = vi.fn().mockResolvedValue({ id: "pack-1" });

    hoisted.prisma.aliasPack.findUnique.mockResolvedValueOnce({
      id         : "pack-1",
      name       : "三国人物包",
      description: "覆盖主要人物与军师别名",
      bookType   : { key: "classic" },
      entries    : []
    });
    hoisted.prisma.book.findUnique.mockResolvedValueOnce({
      id    : "book-1",
      title : "三国演义",
      author: "罗贯中"
    });
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
        { canonicalName: "赵云", aliases: ["子龙"], confidence: 0.91 },
        { canonicalName: "低置信", aliases: ["路人"], confidence: 0.2 },
        { canonicalName: "无别名", aliases: [], confidence: 0.88 }
      ]),
      usage: null
    });
    hoisted.prisma.aliasEntry.findMany.mockResolvedValueOnce([]);
    hoisted.prisma.$transaction.mockImplementationOnce(async (callback: unknown) => {
      const runTransaction = callback as (tx: {
        aliasEntry: { create: typeof createEntry };
        aliasPack : { update: typeof bumpPackVersion };
      }) => Promise<unknown>;
      return runTransaction({
        aliasEntry: { create: createEntry },
        aliasPack : { update: bumpPackVersion }
      });
    });

    const result = await generateEntries({
      packId     : "pack-1",
      targetCount: 10,
      modelId    : "model-1",
      bookId     : "book-1",
      operatorId : "user-1"
    });

    expect(result.created).toBe(1);
    expect(result.skipped).toBe(1);
    expect(createEntry).toHaveBeenCalledWith({
      data: {
        packId       : "pack-1",
        canonicalName: "赵云",
        aliases      : ["子龙"],
        confidence   : 0.91,
        source       : "LLM_GENERATED",
        reviewStatus : "PENDING",
        notes        : "LLM 生成候选，待人工审核 model=deepseek-chat"
      }
    });
    expect(bumpPackVersion).toHaveBeenCalledWith({
      where: { id: "pack-1" },
      data : { version: { increment: 1 } }
    });
    expect(hoisted.auditLog).toHaveBeenCalledWith({
      objectType: "KNOWLEDGE_PACK",
      objectId  : "pack-1",
      objectName: "三国人物包",
      action    : "GENERATE",
      after     : {
        targetCount: 10,
        created    : 1,
        skipped    : 1,
        modelId    : "model-1",
        modelName  : "deepseek-chat",
        bookId     : "book-1",
        bookTitle  : "三国演义"
      },
      operatorId: "user-1"
    });
  });

  it("surfaces a clear error when the selected model is unavailable", async () => {
    hoisted.prisma.aliasPack.findUnique.mockResolvedValueOnce({
      id         : "pack-1",
      name       : "三国人物包",
      description: null,
      bookType   : null,
      entries    : []
    });
    hoisted.prisma.aiModel.findFirst.mockResolvedValueOnce(null);

    await expect(reviewGenerateEntries({
      packId : "pack-1",
      modelId: "missing-model"
    })).rejects.toThrow("选定模型不可用，请确认模型已启用并完成 Key 配置");
  });
});
