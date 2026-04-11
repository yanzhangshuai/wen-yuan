import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  batchRejectEntries,
  batchVerifyEntries,
  createKnowledgeEntry,
  deleteKnowledgeEntry,
  exportEntries,
  importEntries,
  listKnowledgeEntries,
  rejectEntry,
  updateKnowledgeEntry,
  verifyEntry
} from "@/server/modules/knowledge/knowledge-entries";

const hoisted = vi.hoisted(() => ({
  prisma: {
    knowledgeEntry: {
      findMany  : vi.fn(),
      count     : vi.fn(),
      create    : vi.fn(),
      update    : vi.fn(),
      delete    : vi.fn(),
      updateMany: vi.fn()
    },
    knowledgePack: {
      findUnique: vi.fn()
    },
    $transaction: vi.fn()
  },
  auditLog: vi.fn()
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: hoisted.prisma
}));

vi.mock("@/server/modules/knowledge/audit", () => ({
  auditLog: hoisted.auditLog
}));

describe("knowledge-entries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("lists paginated entries and attaches overlap metadata", async () => {
    hoisted.prisma.knowledgeEntry.findMany
      .mockResolvedValueOnce([
        {
          id           : "entry-1",
          canonicalName: "诸葛亮",
          aliases      : ["孔明", "卧龙"]
        },
        {
          id           : "entry-3",
          canonicalName: "司马懿",
          aliases      : ["仲达"]
        }
      ])
      .mockResolvedValueOnce([
        {
          id           : "entry-1",
          canonicalName: "诸葛亮",
          aliases      : ["孔明", "卧龙"]
        },
        {
          id           : "entry-2",
          canonicalName: "卧龙先生",
          aliases      : ["孔明"]
        },
        {
          id           : "entry-3",
          canonicalName: "司马懿",
          aliases      : ["仲达"]
        }
      ]);
    hoisted.prisma.knowledgeEntry.count.mockResolvedValueOnce(11);

    await expect(listKnowledgeEntries({
      packId      : "pack-1",
      reviewStatus: "PENDING",
      q           : "孔明",
      page        : 2,
      pageSize    : 10
    })).resolves.toEqual({
      entries: [
        {
          id            : "entry-1",
          canonicalName : "诸葛亮",
          aliases       : ["孔明", "卧龙"],
          overlapEntries: ["卧龙先生"],
          overlapTerms  : ["孔明"]
        },
        {
          id            : "entry-3",
          canonicalName : "司马懿",
          aliases       : ["仲达"],
          overlapEntries: [],
          overlapTerms  : []
        }
      ],
      total   : 11,
      page    : 2,
      pageSize: 10
    });

    expect(hoisted.prisma.knowledgeEntry.findMany).toHaveBeenNthCalledWith(1, {
      where: {
        packId      : "pack-1",
        reviewStatus: "PENDING",
        OR          : [
          { canonicalName: { contains: "孔明", mode: "insensitive" } },
          { aliases: { has: "孔明" } }
        ]
      },
      orderBy: [{ createdAt: "desc" }],
      skip   : 10,
      take   : 10
    });
  });

  it("uses default paging and keeps overlap empty for entries outside the overlap pool", async () => {
    hoisted.prisma.knowledgeEntry.findMany
      .mockResolvedValueOnce([
        {
          id           : "entry-rejected",
          canonicalName: "旧称",
          aliases      : ["孤名", "   "]
        }
      ])
      .mockResolvedValueOnce([
        {
          id           : "entry-2",
          canonicalName: "卧龙先生",
          aliases      : ["孔明"]
        }
      ]);
    hoisted.prisma.knowledgeEntry.count.mockResolvedValueOnce(1);

    await expect(listKnowledgeEntries({
      packId: "pack-1"
    })).resolves.toEqual({
      entries: [{
        id            : "entry-rejected",
        canonicalName : "旧称",
        aliases       : ["孤名", "   "],
        overlapEntries: [],
        overlapTerms  : []
      }],
      total   : 1,
      page    : 1,
      pageSize: 50
    });

    expect(hoisted.prisma.knowledgeEntry.findMany).toHaveBeenNthCalledWith(1, {
      where: {
        packId: "pack-1"
      },
      orderBy: [{ createdAt: "desc" }],
      skip   : 0,
      take   : 50
    });
  });

  it("creates, updates, deletes and reviews entries with deterministic review timestamps", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-11T12:00:00.000Z"));

    hoisted.prisma.knowledgeEntry.create.mockResolvedValueOnce({ id: "entry-new" });
    hoisted.prisma.knowledgeEntry.update
      .mockResolvedValueOnce({ id: "entry-1" })
      .mockResolvedValueOnce({ id: "entry-2" })
      .mockResolvedValueOnce({ id: "entry-3" });
    hoisted.prisma.knowledgeEntry.delete.mockResolvedValueOnce({ id: "entry-4" });
    hoisted.prisma.knowledgeEntry.updateMany
      .mockResolvedValueOnce({ count: 2 })
      .mockResolvedValueOnce({ count: 1 });

    await expect(createKnowledgeEntry({
      packId       : "pack-1",
      canonicalName: "赵云",
      aliases      : ["子龙"]
    })).resolves.toEqual({ id: "entry-new" });
    await expect(updateKnowledgeEntry("entry-1", {
      canonicalName: "赵子龙",
      aliases      : ["赵云", "子龙"],
      notes        : null,
      confidence   : 0.88
    })).resolves.toEqual({ id: "entry-1" });
    await expect(deleteKnowledgeEntry("entry-4")).resolves.toEqual({ id: "entry-4" });
    await expect(verifyEntry("entry-2")).resolves.toEqual({ id: "entry-2" });
    await expect(rejectEntry("entry-3", "与现有条目重复")).resolves.toEqual({ id: "entry-3" });
    await expect(batchVerifyEntries(["entry-2", "entry-3"])).resolves.toEqual({ count: 2 });
    await expect(batchRejectEntries(["entry-4"], "批量拒绝")).resolves.toEqual({ count: 1 });

    expect(hoisted.prisma.knowledgeEntry.create).toHaveBeenCalledWith({
      data: {
        packId       : "pack-1",
        canonicalName: "赵云",
        aliases      : ["子龙"],
        entryType    : "CHARACTER",
        notes        : undefined,
        source       : "MANUAL",
        sourceDetail : undefined,
        reviewStatus : "PENDING",
        confidence   : 1
      }
    });
    expect(hoisted.prisma.knowledgeEntry.update).toHaveBeenNthCalledWith(1, {
      where: { id: "entry-1" },
      data : {
        canonicalName: "赵子龙",
        aliases      : ["赵云", "子龙"],
        notes        : null,
        confidence   : 0.88
      }
    });
    expect(hoisted.prisma.knowledgeEntry.update).toHaveBeenNthCalledWith(2, {
      where: { id: "entry-2" },
      data : {
        reviewStatus: "VERIFIED",
        reviewedAt  : new Date("2026-04-11T12:00:00.000Z")
      }
    });
    expect(hoisted.prisma.knowledgeEntry.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: { in: ["entry-4"] } },
      data : {
        reviewStatus: "REJECTED",
        reviewNote  : "批量拒绝",
        reviewedAt  : new Date("2026-04-11T12:00:00.000Z")
      }
    });
  });

  it("supports sparse updates and rejection without review notes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-11T13:00:00.000Z"));

    hoisted.prisma.knowledgeEntry.update
      .mockResolvedValueOnce({ id: "entry-5" })
      .mockResolvedValueOnce({ id: "entry-6" });
    hoisted.prisma.knowledgeEntry.updateMany.mockResolvedValueOnce({ count: 2 });

    await expect(updateKnowledgeEntry("entry-5", {
      aliases: ["张飞", "翼德"]
    })).resolves.toEqual({ id: "entry-5" });
    await expect(rejectEntry("entry-6")).resolves.toEqual({ id: "entry-6" });
    await expect(batchRejectEntries(["entry-7", "entry-8"])).resolves.toEqual({ count: 2 });

    expect(hoisted.prisma.knowledgeEntry.update).toHaveBeenNthCalledWith(1, {
      where: { id: "entry-5" },
      data : {
        aliases: ["张飞", "翼德"]
      }
    });
    expect(hoisted.prisma.knowledgeEntry.update).toHaveBeenNthCalledWith(2, {
      where: { id: "entry-6" },
      data : {
        reviewStatus: "REJECTED",
        reviewNote  : undefined,
        reviewedAt  : new Date("2026-04-11T13:00:00.000Z")
      }
    });
    expect(hoisted.prisma.knowledgeEntry.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["entry-7", "entry-8"] } },
      data : {
        reviewStatus: "REJECTED",
        reviewNote  : undefined,
        reviewedAt  : new Date("2026-04-11T13:00:00.000Z")
      }
    });
  });

  it("imports entries in a transaction and writes audit logs for successful imports", async () => {
    const createMany = vi.fn().mockResolvedValue({ count: 2 });
    const updatePackVersion = vi.fn().mockResolvedValue({ id: "pack-1" });

    hoisted.prisma.$transaction.mockImplementationOnce(async (callback: unknown) => {
      const runTransaction = callback as (tx: {
        knowledgeEntry: { createMany: typeof createMany };
        knowledgePack : { update: typeof updatePackVersion };
      }) => Promise<unknown>;
      return runTransaction({
        knowledgeEntry: { createMany },
        knowledgePack : { update: updatePackVersion }
      });
    });
    hoisted.prisma.knowledgePack.findUnique.mockResolvedValueOnce({ name: "人物别名包" });

    await expect(importEntries("pack-1", [
      { canonicalName: "赵云", aliases: ["子龙"] },
      { canonicalName: "关羽", aliases: ["云长"], confidence: 0.72 }
    ], {
      source      : "LLM_GENERATED",
      sourceDetail: "batch-1",
      operatorId  : "user-1",
      auditAction : "REVIEW_IMPORT"
    })).resolves.toEqual({ count: 2 });

    expect(createMany).toHaveBeenCalledWith({
      data: [
        {
          packId       : "pack-1",
          canonicalName: "赵云",
          aliases      : ["子龙"],
          entryType    : "CHARACTER",
          notes        : undefined,
          source       : "LLM_GENERATED",
          sourceDetail : "batch-1",
          reviewStatus : "PENDING",
          confidence   : 0.8
        },
        {
          packId       : "pack-1",
          canonicalName: "关羽",
          aliases      : ["云长"],
          entryType    : "CHARACTER",
          notes        : undefined,
          source       : "LLM_GENERATED",
          sourceDetail : "batch-1",
          reviewStatus : "PENDING",
          confidence   : 0.72
        }
      ]
    });
    expect(updatePackVersion).toHaveBeenCalledWith({
      where: { id: "pack-1" },
      data : { version: { increment: 1 } }
    });
    expect(hoisted.auditLog).toHaveBeenCalledWith({
      objectType: "KNOWLEDGE_PACK",
      objectId  : "pack-1",
      objectName: "人物别名包",
      action    : "REVIEW_IMPORT",
      after     : {
        count       : 2,
        reviewStatus: "PENDING",
        source      : "LLM_GENERATED",
        sourceDetail: "batch-1"
      },
      operatorId: "user-1"
    });
  });

  it("uses import defaults and skips audit when the pack lookup misses", async () => {
    const createMany = vi.fn().mockResolvedValue({ count: 1 });
    const updatePackVersion = vi.fn().mockResolvedValue({ id: "pack-2" });

    hoisted.prisma.$transaction.mockImplementationOnce(async (callback: unknown) => {
      const runTransaction = callback as (tx: {
        knowledgeEntry: { createMany: typeof createMany };
        knowledgePack : { update: typeof updatePackVersion };
      }) => Promise<unknown>;
      return runTransaction({
        knowledgeEntry: { createMany },
        knowledgePack : { update: updatePackVersion }
      });
    });
    hoisted.prisma.knowledgePack.findUnique.mockResolvedValueOnce(null);

    await expect(importEntries("pack-2", [{
      canonicalName: "张飞",
      aliases      : ["翼德"],
      notes        : "蜀汉猛将"
    }])).resolves.toEqual({ count: 1 });

    expect(createMany).toHaveBeenCalledWith({
      data: [{
        packId       : "pack-2",
        canonicalName: "张飞",
        aliases      : ["翼德"],
        entryType    : "CHARACTER",
        notes        : "蜀汉猛将",
        source       : "IMPORTED",
        sourceDetail : undefined,
        reviewStatus : "PENDING",
        confidence   : 1
      }]
    });
    expect(hoisted.auditLog).not.toHaveBeenCalled();
  });

  it("skips audit writes when an import creates no rows", async () => {
    const createMany = vi.fn().mockResolvedValue({ count: 0 });
    const updatePackVersion = vi.fn().mockResolvedValue({ id: "pack-1" });

    hoisted.prisma.$transaction.mockImplementationOnce(async (callback: unknown) => {
      const runTransaction = callback as (tx: {
        knowledgeEntry: { createMany: typeof createMany };
        knowledgePack : { update: typeof updatePackVersion };
      }) => Promise<unknown>;
      return runTransaction({
        knowledgeEntry: { createMany },
        knowledgePack : { update: updatePackVersion }
      });
    });

    await expect(importEntries("pack-1", [
      { canonicalName: "空条目", aliases: ["无"] }
    ], {
      reviewStatus: "VERIFIED"
    })).resolves.toEqual({ count: 0 });

    expect(hoisted.prisma.knowledgePack.findUnique).not.toHaveBeenCalled();
    expect(hoisted.auditLog).not.toHaveBeenCalled();
  });

  it("exports default verified json with null genre and csv rows with empty notes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-11T13:30:00.000Z"));

    hoisted.prisma.knowledgePack.findUnique
      .mockResolvedValueOnce({
        id      : "pack-2",
        name    : "官职别名包",
        version : 1,
        bookType: null,
        entries : [{
          canonicalName: "太守",
          aliases      : ["郡守"],
          entryType    : "TITLE",
          notes        : null
        }]
      })
      .mockResolvedValueOnce({
        id      : "pack-2",
        name    : "官职别名包",
        version : 1,
        bookType: null,
        entries : [{
          canonicalName: "太守",
          aliases      : ["郡守"],
          entryType    : "TITLE",
          notes        : null
        }]
      });

    const jsonResult = await exportEntries("pack-2");
    expect(JSON.parse(jsonResult.content)).toEqual({
      meta: {
        packName    : "官职别名包",
        genre       : null,
        version     : 1,
        reviewScope : "VERIFIED",
        exportedAt  : "2026-04-11T13:30:00.000Z",
        totalEntries: 1
      },
      entries: [{
        canonicalName: "太守",
        aliases      : ["郡守"],
        entryType    : "TITLE",
        notes        : null
      }]
    });

    await expect(exportEntries("pack-2", "csv")).resolves.toEqual({
      content    : 'canonicalName,aliases,entryType,notes\n太守,"郡守",TITLE,""',
      contentType: "text/csv"
    });
  });

  it("exports entries as csv or json and rejects unknown packs", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-11T12:30:00.000Z"));

    hoisted.prisma.knowledgePack.findUnique
      .mockResolvedValueOnce({
        id      : "pack-1",
        name    : "人物别名包",
        version : 3,
        bookType: {
          key: "classic"
        },
        entries: [
          {
            canonicalName: "诸葛亮",
            aliases      : ["孔明", "卧龙"],
            entryType    : "CHARACTER",
            notes        : '引号"测试'
          }
        ]
      })
      .mockResolvedValueOnce({
        id      : "pack-1",
        name    : "人物别名包",
        version : 3,
        bookType: {
          key: "classic"
        },
        entries: [
          {
            canonicalName: "诸葛亮",
            aliases      : ["孔明", "卧龙"],
            entryType    : "CHARACTER",
            notes        : "隆中对主角"
          }
        ]
      })
      .mockResolvedValueOnce(null);

    await expect(exportEntries("pack-1", "csv", "ALL")).resolves.toEqual({
      content    : 'canonicalName,aliases,entryType,notes\n诸葛亮,"孔明|卧龙",CHARACTER,"引号""测试"',
      contentType: "text/csv"
    });

    const jsonResult = await exportEntries("pack-1");
    expect(jsonResult.contentType).toBe("application/json");
    expect(JSON.parse(jsonResult.content)).toEqual({
      meta: {
        packName    : "人物别名包",
        genre       : "classic",
        version     : 3,
        reviewScope : "VERIFIED",
        exportedAt  : "2026-04-11T12:30:00.000Z",
        totalEntries: 1
      },
      entries: [
        {
          canonicalName: "诸葛亮",
          aliases      : ["孔明", "卧龙"],
          entryType    : "CHARACTER",
          notes        : "隆中对主角"
        }
      ]
    });

    await expect(exportEntries("missing-pack")).rejects.toThrow("知识包不存在");

    expect(hoisted.prisma.knowledgePack.findUnique).toHaveBeenNthCalledWith(1, {
      where  : { id: "pack-1" },
      include: {
        bookType: { select: { key: true } },
        entries : {
          where  : { reviewStatus: { not: "REJECTED" } },
          orderBy: { canonicalName: "asc" },
          select : {
            canonicalName: true,
            aliases      : true,
            entryType    : true,
            notes        : true
          }
        }
      }
    });
  });
});
