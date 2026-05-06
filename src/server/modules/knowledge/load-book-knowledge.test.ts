import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";

import {
  clearKnowledgeCache,
  loadFullRuntimeKnowledge
} from "@/server/modules/knowledge/load-book-knowledge";

function createPrismaMock() {
  return {
    book: {
      findUnique: vi.fn().mockResolvedValue({
        id        : "book-1",
        bookTypeId: null,
        bookType  : null
      })
    },
    bookType: {
      findUnique: vi.fn().mockResolvedValue(null)
    },
    genericTitleRule: {
      findMany: vi.fn().mockResolvedValue([])
    },
    surnameRule: {
      findMany: vi.fn().mockResolvedValue([])
    },
    nerLexiconRule: {
      findMany: vi.fn().mockResolvedValue([])
    },
    promptExtractionRule: {
      findMany: vi.fn().mockResolvedValue([])
    },
    bookAliasPack: {
      findMany: vi.fn().mockResolvedValue([])
    },
    aliasPack: {
      findMany: vi.fn().mockResolvedValue([])
    },
    aliasEntry: {
      findMany: vi.fn().mockResolvedValue([])
    },
    historicalFigureEntry: {
      findMany: vi.fn().mockResolvedValue([])
    },
    relationalTermEntry: {
      findMany: vi.fn().mockResolvedValue([])
    },
    namePatternRule: {
      findMany: vi.fn().mockResolvedValue([])
    },
    relationshipTypeDefinition: {
      findMany: vi.fn().mockResolvedValue([])
    }
  };
}

describe("load-book-knowledge", () => {
  beforeEach(() => {
    clearKnowledgeCache();
    vi.restoreAllMocks();
  });

  it("loads full runtime knowledge with merged lexicon, alias lookup and verified knowledge entries", async () => {
    const prismaMock = createPrismaMock();
    // 词典配置已全面 DB 驱动 — 不再依赖 loadBookTypeConfig / baseConfig
    prismaMock.genericTitleRule.findMany.mockResolvedValueOnce([
      { title: "老爷", tier: "SAFETY" },
      { title: "先生", tier: "DEFAULT" },
      { title: "兄长", tier: "RELATIONAL" },
      { title: "世叔", tier: "RELATIONAL" }
    ]);
    prismaMock.surnameRule.findMany.mockResolvedValueOnce([
      { surname: "欧阳", isCompound: true },
      { surname: "赵", isCompound: false }
    ]);
    prismaMock.nerLexiconRule.findMany.mockResolvedValueOnce([
      { ruleType: "HARD_BLOCK_SUFFIX", content: "兄" },
      { ruleType: "SOFT_BLOCK_SUFFIX", content: "叔" },
      { ruleType: "TITLE_STEM", content: "老爷" },
      { ruleType: "POSITION_STEM", content: "太守" }
    ]);
    prismaMock.promptExtractionRule.findMany.mockResolvedValueOnce([
      { ruleType: "ENTITY", content: "识别人名" },
      { ruleType: "RELATIONSHIP", content: "识别关系" }
    ]);
    prismaMock.bookAliasPack.findMany.mockResolvedValueOnce([
      { packId: "pack-mounted", priority: 10 }
    ]);
    prismaMock.aliasPack.findMany.mockResolvedValueOnce([
      { id: "pack-inherited" }
    ]);
    prismaMock.aliasEntry.findMany.mockResolvedValueOnce([
      {
        packId       : "pack-mounted",
        canonicalName: "范进",
        aliases      : ["范老爷"],
        confidence   : 0.8
      },
      {
        packId       : "pack-inherited",
        canonicalName: "王惠",
        aliases      : ["王太守"],
        confidence   : 0.9
      }
    ]);
    prismaMock.historicalFigureEntry.findMany.mockResolvedValueOnce([
      {
        id         : "hf-1",
        name       : "孔子",
        aliases    : ["孔夫子"],
        dynasty    : "春秋",
        category   : "PHILOSOPHER",
        description: "儒家学派创始人"
      }
    ]);
    prismaMock.namePatternRule.findMany.mockResolvedValueOnce([
      {
        id         : "rule-1",
        ruleType   : "TITLE_ONLY",
        action     : "BLOCK",
        pattern    : "^范[进举人]+$",
        description: "过滤称谓混淆"
      }
    ]);

    const prisma = prismaMock as unknown as PrismaClient;
    prismaMock.book.findUnique.mockResolvedValueOnce({
      id        : "book-1",
      bookTypeId: "book-type-classic",
      bookType  : { key: "classic" }
    });

    const knowledge = await loadFullRuntimeKnowledge({ bookId: "book-1", prisma });

    expect(knowledge.bookId).toBe("book-1");
    expect(knowledge.bookTypeId).toBe("book-type-classic");
    expect(knowledge.bookTypeKey).toBe("classic");
    expect(knowledge.aliasLookup.get("范老爷")).toBe("范进");
    expect(knowledge.aliasLookup.get("王太守")).toBe("王惠");
    expect(knowledge.historicalFigures.has("孔子")).toBe(true);
    expect(knowledge.historicalFigureMap.get("孔夫子")?.name).toBe("孔子");
    expect(knowledge.relationalTerms.has("兄长")).toBe(true);
    expect(knowledge.namePatternRules).toHaveLength(1);
    expect(knowledge.namePatternRules[0].compiled.test("范进")).toBe(true);

    expect(knowledge.lexiconConfig).toMatchObject({
      safetyGenericTitles        : ["老爷"],
      defaultGenericTitles       : ["先生"],
      surnameCompounds           : ["欧阳"],
      surnameSingles             : ["赵"],
      entityExtractionRules      : ["识别人名"],
      relationshipExtractionRules: ["识别关系"]
    });
    expect(Array.from(knowledge.hardBlockSuffixes)).toContain("兄");
    expect(Array.from(knowledge.softBlockSuffixes)).toContain("叔");
    expect(knowledge.titlePatterns.some((pattern) => pattern.test("范老爷"))).toBe(true);
    expect(knowledge.positionPatterns.some((pattern) => pattern.test("开封府太守"))).toBe(true);
  });

  it("returns cached runtime knowledge for the same book and book type without extra DB reads", async () => {
    const prismaMock = createPrismaMock();
    prismaMock.namePatternRule.findMany.mockResolvedValue([
      {
        id         : "rule-1",
        ruleType   : "TITLE_ONLY",
        action     : "BLOCK",
        pattern    : "^范进$",
        description: null
      }
    ]);

    const prisma = prismaMock as unknown as PrismaClient;

    const first = await loadFullRuntimeKnowledge({ bookId: "book-cache", prisma });
    const second = await loadFullRuntimeKnowledge({ bookId: "book-cache", prisma });

    expect(second).toBe(first);
    expect(prismaMock.book.findUnique).toHaveBeenCalledTimes(1);
    expect(prismaMock.namePatternRule.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.bookAliasPack.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.genericTitleRule.findMany).toHaveBeenCalledTimes(1);
  });

  it("invalidates cache by book id via clearKnowledgeCache(bookId)", async () => {
    const prismaMock = createPrismaMock();
    const prisma = prismaMock as unknown as PrismaClient;

    const first = await loadFullRuntimeKnowledge({ bookId: "book-refresh", prisma });
    clearKnowledgeCache("book-refresh");
    const second = await loadFullRuntimeKnowledge({ bookId: "book-refresh", prisma });

    expect(second).not.toBe(first);
    expect(prismaMock.namePatternRule.findMany).toHaveBeenCalledTimes(2);
  });

  it("force refreshes cached runtime knowledge and filters relationship types by book type", async () => {
    const prismaMock = createPrismaMock();
    prismaMock.book.findUnique.mockResolvedValue({
      id        : "book-filtered",
      bookTypeId: "type-classic",
      bookType  : { key: "classic" }
    });
    prismaMock.relationshipTypeDefinition.findMany.mockResolvedValueOnce([
      {
        code           : "relationship_common",
        name           : "父子",
        group          : "血缘",
        directionMode  : "INVERSE",
        sourceRoleLabel: "父亲",
        targetRoleLabel: "儿子",
        aliases        : ["父亲", "儿子"],
        examples       : ["范父→范进", "周父→周进", "多余例子"]
      },
      {
        code           : "relationship_classic",
        name           : "同门",
        group          : "师承",
        directionMode  : "SYMMETRIC",
        sourceRoleLabel: null,
        targetRoleLabel: null,
        aliases        : ["同师"],
        examples       : []
      }
    ]);
    prismaMock.relationshipTypeDefinition.findMany.mockResolvedValueOnce([]);

    const prisma = prismaMock as unknown as PrismaClient;
    const first = await loadFullRuntimeKnowledge({ bookId: "book-filtered", prisma });
    const second = await loadFullRuntimeKnowledge({ bookId: "book-filtered", prisma, forceRefresh: true });

    expect(second).not.toBe(first);
    expect(prismaMock.relationshipTypeDefinition.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: {
        status: "ACTIVE",
        OR    : [
          { bookTypeId: "type-classic" },
          { bookTypeId: null }
        ]
      }
    }));
    expect(first.relationshipTypes.map((item) => item.code)).toEqual(["relationship_common", "relationship_classic"]);
    expect(first.relationshipTypeByCode.get("relationship_common")?.sourceRoleLabel).toBe("父亲");
    expect(first.relationshipTypeDictionaryText).toContain("relationship_common · 父子 · INVERSE · 父亲→儿子");
    expect(first.relationshipTypeDictionaryText).toContain("别名: 父亲/儿子");
    expect(first.relationshipTypeDictionaryText).toContain("例: 范父→范进；周父→周进");
    expect(first.relationshipTypeDictionaryText).not.toContain("多余例子");
  });

  it("applies D9 guards and only keeps valid name pattern rules", async () => {
    const prismaMock = createPrismaMock();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    prismaMock.namePatternRule.findMany.mockResolvedValueOnce([
      {
        id         : "rule-too-long",
        ruleType   : "TITLE_ONLY",
        action     : "BLOCK",
        pattern    : "a".repeat(201),
        description: null
      },
      {
        id         : "rule-nested-quantifier",
        ruleType   : "TITLE_ONLY",
        action     : "BLOCK",
        pattern    : "(ab+)+",
        description: null
      },
      {
        id         : "rule-invalid-syntax",
        ruleType   : "TITLE_ONLY",
        action     : "BLOCK",
        pattern    : "(",
        description: null
      },
      {
        id         : "rule-valid",
        ruleType   : "TITLE_ONLY",
        action     : "BLOCK",
        pattern    : "^范进$",
        description: "valid"
      }
    ]);

    const prisma = prismaMock as unknown as PrismaClient;
    const knowledge = await loadFullRuntimeKnowledge({ bookId: "book-d9", prisma });

    expect(knowledge.namePatternRules.map((item) => item.id)).toEqual(["rule-valid"]);

    const warningTags = warnSpy.mock.calls.map((call) => String(call[0]));
    expect(warningTags).toContain("[knowledge.loader] name_pattern.skipped.length_exceeded");
    expect(warningTags).toContain("[knowledge.loader] name_pattern.skipped.nested_quantifier");
    expect(warningTags).toContain("[knowledge.loader] name_pattern.skipped.syntax_error");
  });

  it("skips rules that exceed compile-time guard threshold", async () => {
    const prismaMock = createPrismaMock();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const nowSpy = vi.spyOn(Date, "now");

    nowSpy.mockReturnValue(150);
    nowSpy.mockReturnValueOnce(0);
    nowSpy.mockReturnValueOnce(150);

    prismaMock.namePatternRule.findMany.mockResolvedValueOnce([
      {
        id         : "rule-timeout",
        ruleType   : "TITLE_ONLY",
        action     : "BLOCK",
        pattern    : "^范进$",
        description: null
      }
    ]);

    const prisma = prismaMock as unknown as PrismaClient;
    const knowledge = await loadFullRuntimeKnowledge({ bookId: "book-timeout", prisma });

    expect(knowledge.namePatternRules).toHaveLength(0);
    expect(
      warnSpy.mock.calls.some((call) => String(call[0]) === "[knowledge.loader] name_pattern.skipped.compile_timeout")
    ).toBe(true);
  });
});
