import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";

import {
  clearKnowledgeCache,
  loadFullRuntimeKnowledge
} from "@/server/modules/knowledge/load-book-knowledge";

function createPrismaMock() {
  return {
    bookType: {
      findUnique: vi.fn().mockResolvedValue(null)
    },
    genericTitleEntry: {
      findMany: vi.fn().mockResolvedValue([])
    },
    surnameEntry: {
      findMany: vi.fn().mockResolvedValue([])
    },
    extractionRule: {
      findMany: vi.fn().mockResolvedValue([])
    },
    bookKnowledgePack: {
      findMany: vi.fn().mockResolvedValue([])
    },
    knowledgePack: {
      findMany: vi.fn().mockResolvedValue([])
    },
    knowledgeEntry: {
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
    prismaMock.bookType.findUnique.mockResolvedValueOnce({
      presetConfig: {
        chapterSplitSize            : 1200,
        entityExtractionRules       : ["旧实体规则"],
        additionalRelationalSuffixes: ["兄"],
        additionalTitlePatterns     : ["太"]
      }
    });
    prismaMock.genericTitleEntry.findMany.mockResolvedValueOnce([
      { title: "老爷", tier: "SAFETY" },
      { title: "先生", tier: "DEFAULT" }
    ]);
    prismaMock.surnameEntry.findMany.mockResolvedValueOnce([
      { surname: "欧阳", isCompound: true },
      { surname: "赵", isCompound: false }
    ]);
    prismaMock.extractionRule.findMany.mockResolvedValueOnce([
      { ruleType: "ENTITY", content: "识别人名" },
      { ruleType: "RELATIONSHIP", content: "识别关系" },
      { ruleType: "HARD_BLOCK_SUFFIX", content: "兄" },
      { ruleType: "SOFT_BLOCK_SUFFIX", content: "叔" },
      { ruleType: "TITLE_STEM", content: "老爷" },
      { ruleType: "POSITION_STEM", content: "太守" }
    ]);
    prismaMock.bookKnowledgePack.findMany.mockResolvedValueOnce([
      { packId: "pack-mounted", priority: 10 }
    ]);
    prismaMock.knowledgePack.findMany.mockResolvedValueOnce([
      { id: "pack-inherited" }
    ]);
    prismaMock.knowledgeEntry.findMany.mockResolvedValueOnce([
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
    prismaMock.relationalTermEntry.findMany.mockResolvedValueOnce([
      { term: "兄长" },
      { term: "世叔" }
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
    const knowledge = await loadFullRuntimeKnowledge("book-1", "classic", prisma);

    expect(knowledge.bookId).toBe("book-1");
    expect(knowledge.bookTypeKey).toBe("classic");
    expect(knowledge.aliasLookup.get("范老爷")).toBe("范进");
    expect(knowledge.aliasLookup.get("王太守")).toBe("王惠");
    expect(knowledge.historicalFigures.has("孔子")).toBe(true);
    expect(knowledge.historicalFigureMap.get("孔夫子")?.name).toBe("孔子");
    expect(knowledge.relationalTerms.has("兄长")).toBe(true);
    expect(knowledge.namePatternRules).toHaveLength(1);
    expect(knowledge.namePatternRules[0].compiled.test("范进")).toBe(true);

    expect(knowledge.lexiconConfig).toMatchObject({
      chapterSplitSize           : 1200,
      safetyGenericTitles        : ["老爷"],
      defaultGenericTitles       : ["先生"],
      surnameCompounds           : ["欧阳"],
      surnameSingles             : ["赵"],
      entityExtractionRules      : ["旧实体规则", "识别人名"],
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

    const first = await loadFullRuntimeKnowledge("book-cache", null, prisma);
    const second = await loadFullRuntimeKnowledge("book-cache", null, prisma);

    expect(second).toBe(first);
    expect(prismaMock.namePatternRule.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.bookKnowledgePack.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.relationalTermEntry.findMany).toHaveBeenCalledTimes(1);
  });

  it("invalidates cache by book id via clearKnowledgeCache(bookId)", async () => {
    const prismaMock = createPrismaMock();
    const prisma = prismaMock as unknown as PrismaClient;

    const first = await loadFullRuntimeKnowledge("book-refresh", null, prisma);
    clearKnowledgeCache("book-refresh");
    const second = await loadFullRuntimeKnowledge("book-refresh", null, prisma);

    expect(second).not.toBe(first);
    expect(prismaMock.namePatternRule.findMany).toHaveBeenCalledTimes(2);
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
    const knowledge = await loadFullRuntimeKnowledge("book-d9", null, prisma);

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
    const knowledge = await loadFullRuntimeKnowledge("book-timeout", null, prisma);

    expect(knowledge.namePatternRules).toHaveLength(0);
    expect(
      warnSpy.mock.calls.some((call) => String(call[0]) === "[knowledge.loader] name_pattern.skipped.compile_timeout")
    ).toBe(true);
  });
});
