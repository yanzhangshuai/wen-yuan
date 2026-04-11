import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";

import {
  buildAliasLookupFromDb,
  loadAnalysisRuntimeConfig,
  loadBookTypeConfig
} from "@/server/modules/knowledge/load-book-knowledge";

describe("load-book-knowledge", () => {
  it("loads book type preset config and falls back to empty config when missing", async () => {
    const prismaMock = {
      bookType: {
        findUnique: vi.fn()
          .mockResolvedValueOnce({ presetConfig: { chapterSplitSize: 1200 } })
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ presetConfig: null })
      }
    };
    const prisma = prismaMock as unknown as PrismaClient;

    await expect(loadBookTypeConfig("classic", prisma)).resolves.toEqual({
      chapterSplitSize: 1200
    });
    await expect(loadBookTypeConfig("missing", prisma)).resolves.toEqual({});
    await expect(loadBookTypeConfig("empty", prisma)).resolves.toEqual({});

    expect(prismaMock.bookType.findUnique).toHaveBeenNthCalledWith(1, {
      where: { key: "classic", isActive: true }
    });
  });

  it("builds runtime config from preset, generic titles, surnames and extraction rules", async () => {
    const prismaMock = {
      bookType: {
        findUnique: vi.fn().mockResolvedValueOnce({
          presetConfig: {
            genericTitles   : ["旧规则"],
            chapterSplitSize: 1500
          }
        })
      },
      genericTitleEntry: {
        findMany: vi.fn().mockResolvedValueOnce([
          { title: "老爷", tier: "SAFETY" },
          { title: "先生", tier: "DEFAULT" }
        ])
      },
      surnameEntry: {
        findMany: vi.fn().mockResolvedValueOnce([
          { surname: "欧阳", isCompound: true },
          { surname: "赵", isCompound: false }
        ])
      },
      extractionRule: {
        findMany: vi.fn().mockResolvedValueOnce([
          { ruleType: "ENTITY", content: "识别人名" },
          { ruleType: "RELATIONSHIP", content: "识别关系" }
        ])
      }
    };
    const prisma = prismaMock as unknown as PrismaClient;

    await expect(loadAnalysisRuntimeConfig("classic", prisma)).resolves.toEqual({
      genericTitles              : ["旧规则"],
      chapterSplitSize           : 1500,
      safetyGenericTitles        : ["老爷"],
      defaultGenericTitles       : ["先生"],
      surnameCompounds           : ["欧阳"],
      surnameSingles             : ["赵"],
      entityExtractionRules      : ["识别人名"],
      relationshipExtractionRules: ["识别关系"]
    });

    expect(prismaMock.surnameEntry.findMany).toHaveBeenCalledWith({
      where: {
        isActive: true,
        OR      : [
          { bookTypeId: null },
          { bookType: { key: "classic" } }
        ]
      },
      orderBy: [{ isCompound: "desc" }, { priority: "desc" }, { surname: "asc" }],
      select : { surname: true, isCompound: true }
    });
  });

  it("supports loading runtime config without book type preset", async () => {
    const prismaMock = {
      bookType: {
        findUnique: vi.fn()
      },
      genericTitleEntry: {
        findMany: vi.fn().mockResolvedValueOnce([])
      },
      surnameEntry: {
        findMany: vi.fn().mockResolvedValueOnce([])
      },
      extractionRule: {
        findMany: vi.fn().mockResolvedValueOnce([])
      }
    };
    const prisma = prismaMock as unknown as PrismaClient;

    await expect(loadAnalysisRuntimeConfig(null, prisma)).resolves.toEqual({
      defaultGenericTitles       : [],
      safetyGenericTitles        : [],
      surnameCompounds           : [],
      surnameSingles             : [],
      entityExtractionRules      : [],
      relationshipExtractionRules: []
    });

    expect(prismaMock.bookType.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.surnameEntry.findMany).toHaveBeenCalledWith({
      where: {
        isActive: true,
        OR      : [{ bookTypeId: null }]
      },
      orderBy: [{ isCompound: "desc" }, { priority: "desc" }, { surname: "asc" }],
      select : { surname: true, isCompound: true }
    });
  });

  it("builds alias lookup with mounted packs taking precedence over inherited packs", async () => {
    const prismaMock = {
      bookKnowledgePack: {
        findMany: vi.fn().mockResolvedValueOnce([
          { packId: "pack-mounted", priority: 8 }
        ])
      },
      knowledgePack: {
        findMany: vi.fn().mockResolvedValueOnce([
          { id: "pack-inherited-a" },
          { id: "pack-inherited-b" }
        ])
      },
      knowledgeEntry: {
        findMany: vi.fn().mockResolvedValueOnce([
          {
            packId       : "pack-inherited-a",
            canonicalName: "司马懿",
            aliases      : ["军师"],
            confidence   : 0.9
          },
          {
            packId       : "pack-mounted",
            canonicalName: "诸葛亮",
            aliases      : [" 军师 ", "卧龙"],
            confidence   : 0.4
          },
          {
            packId       : "pack-inherited-b",
            canonicalName: "贾诩",
            aliases      : ["文和"],
            confidence   : 0.95
          },
          {
            packId       : "pack-inherited-a",
            canonicalName: "陈宫",
            aliases      : ["文和"],
            confidence   : 0.5
          }
        ])
      }
    };
    const prisma = prismaMock as unknown as PrismaClient;

    const lookup = await buildAliasLookupFromDb("book-1", "classic", prisma);

    expect(prismaMock.knowledgeEntry.findMany).toHaveBeenCalledWith({
      where : { packId: { in: ["pack-mounted", "pack-inherited-a", "pack-inherited-b"] }, reviewStatus: "VERIFIED" },
      select: { packId: true, canonicalName: true, aliases: true, confidence: true }
    });
    expect(lookup.get("诸葛亮")).toBe("诸葛亮");
    expect(lookup.get("军师")).toBe("诸葛亮");
    expect(lookup.get("卧龙")).toBe("诸葛亮");
    expect(lookup.get("文和")).toBe("贾诩");
  });

  it("returns an empty alias lookup when no mounted or inherited packs are available", async () => {
    const prismaMock = {
      bookKnowledgePack: {
        findMany: vi.fn().mockResolvedValueOnce([])
      },
      knowledgePack: {
        findMany: vi.fn().mockResolvedValueOnce([])
      },
      knowledgeEntry: {
        findMany: vi.fn()
      }
    };
    const prisma = prismaMock as unknown as PrismaClient;

    const lookup = await buildAliasLookupFromDb("book-1", "classic", prisma);

    expect(lookup.size).toBe(0);
    expect(prismaMock.knowledgeEntry.findMany).not.toHaveBeenCalled();
  });
});
