import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";

import {
  clearKnowledgeCache,
  compileNamePatternRule,
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
    extractionRule: {
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
    relationalTermEntry: {
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
    prismaMock.extractionRule.findMany.mockResolvedValueOnce([
      { ruleType: "HARD_BLOCK_SUFFIX", content: "兄" },
      { ruleType: "SOFT_BLOCK_SUFFIX", content: "叔" },
      { ruleType: "TITLE_STEM", content: "老爷" },
      { ruleType: "POSITION_STEM", content: "太守" },
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
    expect(knowledge.relationalTerms.has("兄长")).toBe(true);
    // 名字模式从静态常量加载（15 条规则），验证编译和匹配
    expect(knowledge.namePatternRules.length).toBeGreaterThanOrEqual(1);
    // "某公" 命中静态规则 ^某(公|君|氏|人)$
    const blockPattern = knowledge.namePatternRules.find((r) => r.action === "BLOCK" && r.compiled.test("某公"));
    expect(blockPattern).toBeDefined();

    // 姓氏以静态词库为基准，DB 仅提供追加；验证 DB 条目被合并入最终结果
    expect(knowledge.lexiconConfig.safetyGenericTitles).toEqual(["老爷"]);
    expect(knowledge.lexiconConfig.defaultGenericTitles).toEqual(["先生"]);
    expect(knowledge.lexiconConfig.surnameCompounds).toEqual(expect.arrayContaining(["欧阳"]));
    expect(knowledge.lexiconConfig.surnameSingles).toEqual(expect.arrayContaining(["赵"]));
    expect(knowledge.lexiconConfig.entityExtractionRules).toEqual(["识别人名"]);
    expect(knowledge.lexiconConfig.relationshipExtractionRules).toEqual(["识别关系"]);
    expect(Array.from(knowledge.hardBlockSuffixes)).toContain("兄");
    expect(Array.from(knowledge.softBlockSuffixes)).toContain("叔");
    expect(knowledge.titlePatterns.some((pattern) => pattern.test("范老爷"))).toBe(true);
    expect(knowledge.positionPatterns.some((pattern) => pattern.test("开封府太守"))).toBe(true);
  });

  it("returns cached runtime knowledge for the same book and book type without extra DB reads", async () => {
    const prismaMock = createPrismaMock();

    const prisma = prismaMock as unknown as PrismaClient;

    const first = await loadFullRuntimeKnowledge({ bookId: "book-cache", prisma });
    const second = await loadFullRuntimeKnowledge({ bookId: "book-cache", prisma });

    expect(second).toBe(first);
    expect(prismaMock.book.findUnique).toHaveBeenCalledTimes(1);
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

  it("applies D9 guards and only keeps valid name pattern rules", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    // 过长规则
    expect(compileNamePatternRule({
      id: "too-long", ruleType: "T", action: "BLOCK", pattern: "a".repeat(201), description: null
    })).toBeNull();

    // 嵌套量词
    expect(compileNamePatternRule({
      id: "nested", ruleType: "T", action: "BLOCK", pattern: "(ab+)+", description: null
    })).toBeNull();

    // 非法正则
    expect(compileNamePatternRule({
      id: "syntax", ruleType: "T", action: "BLOCK", pattern: "(", description: null
    })).toBeNull();

    // 合法规则
    const valid = compileNamePatternRule({
      id: "valid", ruleType: "T", action: "BLOCK", pattern: "^范进$", description: "valid"
    });
    expect(valid).not.toBeNull();
    expect(valid!.compiled.test("范进")).toBe(true);

    const warningTags = warnSpy.mock.calls.map((call) => String(call[0]));
    expect(warningTags).toContain("[knowledge.loader] name_pattern.skipped.length_exceeded");
    expect(warningTags).toContain("[knowledge.loader] name_pattern.skipped.nested_quantifier");
    expect(warningTags).toContain("[knowledge.loader] name_pattern.skipped.syntax_error");
  });

  it("skips rules that exceed compile-time guard threshold", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const nowSpy = vi.spyOn(Date, "now");

    nowSpy.mockReturnValue(150);
    nowSpy.mockReturnValueOnce(0);
    nowSpy.mockReturnValueOnce(150);

    const result = compileNamePatternRule({
      id: "timeout", ruleType: "T", action: "BLOCK", pattern: "^范进$", description: null
    });

    expect(result).toBeNull();
    expect(
      warnSpy.mock.calls.some((call) => String(call[0]) === "[knowledge.loader] name_pattern.skipped.compile_timeout")
    ).toBe(true);
  });
});
