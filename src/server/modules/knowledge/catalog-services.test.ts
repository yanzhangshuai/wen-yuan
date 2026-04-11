import { Prisma } from "@/generated/prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createBookType,
  deleteBookType,
  getBookType,
  listActiveBookTypes,
  listBookTypes,
  updateBookType
} from "@/server/modules/knowledge/book-types";
import {
  createKnowledgePack,
  deleteKnowledgePack,
  getKnowledgePack,
  listKnowledgePacks,
  updateKnowledgePack
} from "@/server/modules/knowledge/knowledge-packs";
import {
  getChangeLog,
  listChangeLogs
} from "@/server/modules/knowledge/change-logs";
import {
  createExtractionRule,
  deleteExtractionRule,
  listExtractionRules,
  previewCombinedRules,
  reorderExtractionRules,
  updateExtractionRule
} from "@/server/modules/knowledge/extraction-rules";
import {
  createGenericTitle,
  deleteGenericTitle,
  listGenericTitles,
  testGenericTitle,
  updateGenericTitle
} from "@/server/modules/knowledge/generic-titles";
import {
  createSurname,
  deleteSurname,
  importSurnames,
  listSurnames,
  testSurnameExtraction,
  updateSurname
} from "@/server/modules/knowledge/surnames";

const hoisted = vi.hoisted(() => {
  const prisma = {
    bookType: {
      findMany  : vi.fn(),
      findUnique: vi.fn(),
      create    : vi.fn(),
      update    : vi.fn(),
      delete    : vi.fn()
    },
    knowledgePack: {
      findMany  : vi.fn(),
      findUnique: vi.fn(),
      create    : vi.fn(),
      update    : vi.fn(),
      delete    : vi.fn()
    },
    knowledgeEntry: {
      groupBy: vi.fn()
    },
    knowledgeAuditLog: {
      findMany  : vi.fn(),
      count     : vi.fn(),
      findUnique: vi.fn()
    },
    extractionRule: {
      findMany: vi.fn(),
      create  : vi.fn(),
      update  : vi.fn(),
      delete  : vi.fn()
    },
    genericTitleEntry: {
      findMany  : vi.fn(),
      create    : vi.fn(),
      update    : vi.fn(),
      findUnique: vi.fn(),
      delete    : vi.fn()
    },
    surnameEntry: {
      findMany  : vi.fn(),
      create    : vi.fn(),
      update    : vi.fn(),
      findUnique: vi.fn(),
      delete    : vi.fn()
    },
    $transaction: vi.fn()
  };

  return { prisma };
});

vi.mock("@/server/db/prisma", () => ({
  prisma: hoisted.prisma
}));

describe("knowledge catalog services", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("book-types", () => {
    it("builds filtered list and public active list queries", async () => {
      hoisted.prisma.bookType.findMany.mockResolvedValueOnce([{ id: "bt-1" }]).mockResolvedValueOnce([{ id: "bt-2" }]);

      await expect(listBookTypes({ active: false })).resolves.toEqual([{ id: "bt-1" }]);
      await expect(listActiveBookTypes()).resolves.toEqual([{ id: "bt-2" }]);

      expect(hoisted.prisma.bookType.findMany).toHaveBeenNthCalledWith(1, {
        where  : { isActive: false },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: {
          _count: {
            select: {
              books         : true,
              knowledgePacks: true
            }
          }
        }
      });
      expect(hoisted.prisma.bookType.findMany).toHaveBeenNthCalledWith(2, {
        where  : { isActive: true },
        orderBy: { sortOrder: "asc" },
        select : { id: true, key: true, name: true, sortOrder: true }
      });
    });

    it("gets, creates, updates and deletes book types with guard rails", async () => {
      hoisted.prisma.bookType.findUnique
        .mockResolvedValueOnce({ id: "bt-1" })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: "bt-2", _count: { books: 2 } })
        .mockResolvedValueOnce({ id: "bt-3", _count: { books: 0 } });
      hoisted.prisma.bookType.create.mockResolvedValueOnce({ id: "bt-new" });
      hoisted.prisma.bookType.update.mockResolvedValueOnce({ id: "bt-updated" });
      hoisted.prisma.bookType.delete.mockResolvedValueOnce({ id: "bt-3" });

      await expect(getBookType("bt-1")).resolves.toEqual({ id: "bt-1" });
      await expect(createBookType({
        key        : "classic",
        name       : "章回小说",
        description: "desc"
      })).resolves.toEqual({ id: "bt-new" });
      await expect(updateBookType("bt-1", {
        key         : "classic-updated",
        name        : "章回小说新版",
        description : "new desc",
        presetConfig: null,
        sortOrder   : 9,
        isActive    : false
      })).resolves.toEqual({ id: "bt-updated" });
      await expect(deleteBookType("missing")).rejects.toThrow("书籍类型不存在");
      await expect(deleteBookType("bt-2")).rejects.toThrow("该书籍类型下仍有 2 本书籍");
      await expect(deleteBookType("bt-3")).resolves.toEqual({ id: "bt-3" });

      expect(hoisted.prisma.bookType.findUnique).toHaveBeenNthCalledWith(1, {
        where  : { id: "bt-1" },
        include: {
          _count: {
            select: {
              books         : true,
              knowledgePacks: true
            }
          }
        }
      });
      expect(hoisted.prisma.bookType.create).toHaveBeenCalledWith({
        data: {
          key         : "classic",
          name        : "章回小说",
          description : "desc",
          presetConfig: undefined,
          sortOrder   : 0
        }
      });
      expect(hoisted.prisma.bookType.update).toHaveBeenCalledWith({
        where: { id: "bt-1" },
        data : {
          key         : "classic-updated",
          name        : "章回小说新版",
          description : "new desc",
          presetConfig: Prisma.JsonNull,
          sortOrder   : 9,
          isActive    : false
        }
      });
      expect(hoisted.prisma.bookType.delete).toHaveBeenCalledWith({ where: { id: "bt-3" } });
    });
  });

  describe("knowledge-packs", () => {
    it("returns empty pack list without querying review counts", async () => {
      hoisted.prisma.knowledgePack.findMany.mockResolvedValueOnce([]);

      await expect(listKnowledgePacks({ bookTypeId: "bt-1", scope: "GENRE" })).resolves.toEqual([]);

      expect(hoisted.prisma.knowledgePack.findMany).toHaveBeenCalledWith({
        where  : { bookTypeId: "bt-1", scope: "GENRE" },
        orderBy: [{ createdAt: "desc" }],
        include: {
          bookType: { select: { id: true, key: true, name: true } },
          _count  : {
            select: {
              entries  : true,
              bookPacks: true
            }
          }
        }
      });
      expect(hoisted.prisma.knowledgeEntry.groupBy).not.toHaveBeenCalled();
    });

    it("hydrates pack status counts for list and detail queries", async () => {
      hoisted.prisma.knowledgePack.findMany.mockResolvedValueOnce([
        { id: "pack-1", name: "人物别名" },
        { id: "pack-2", name: "官衔" }
      ]);
      hoisted.prisma.knowledgeEntry.groupBy
        .mockResolvedValueOnce([
          { packId: "pack-1", reviewStatus: "VERIFIED", _count: 2 },
          { packId: "pack-1", reviewStatus: "PENDING", _count: 1 }
        ])
        .mockResolvedValueOnce([
          { reviewStatus: "VERIFIED", _count: 4 },
          { reviewStatus: "PENDING", _count: 1 }
        ]);
      hoisted.prisma.knowledgePack.findUnique
        .mockResolvedValueOnce({ id: "pack-1", name: "人物别名" })
        .mockResolvedValueOnce(null);
      hoisted.prisma.knowledgePack.create.mockResolvedValueOnce({ id: "pack-3" });
      hoisted.prisma.knowledgePack.update.mockResolvedValueOnce({ id: "pack-1", version: 2 });
      hoisted.prisma.knowledgePack.delete.mockResolvedValueOnce({ id: "pack-1" });

      await expect(listKnowledgePacks()).resolves.toEqual([
        { id: "pack-1", name: "人物别名", statusCounts: { PENDING: 1, VERIFIED: 2 } },
        { id: "pack-2", name: "官衔", statusCounts: {} }
      ]);
      await expect(getKnowledgePack("pack-1")).resolves.toEqual({
        id          : "pack-1",
        name        : "人物别名",
        statusCounts: { PENDING: 1, VERIFIED: 4 }
      });
      await expect(getKnowledgePack("missing")).resolves.toBeNull();
      await expect(createKnowledgePack({
        bookTypeId : "bt-1",
        name       : "人物别名",
        scope      : "GENRE",
        description: "desc"
      })).resolves.toEqual({ id: "pack-3" });
      await expect(updateKnowledgePack("pack-1", {
        name       : "新名称",
        description: "new desc",
        isActive   : false,
        version    : 2
      })).resolves.toEqual({ id: "pack-1", version: 2 });
      await expect(deleteKnowledgePack("pack-1")).resolves.toEqual({ id: "pack-1" });

      expect(hoisted.prisma.knowledgePack.create).toHaveBeenCalledWith({
        data: {
          bookTypeId : "bt-1",
          name       : "人物别名",
          scope      : "GENRE",
          description: "desc"
        }
      });
      expect(hoisted.prisma.knowledgePack.update).toHaveBeenCalledWith({
        where: { id: "pack-1" },
        data : {
          name       : "新名称",
          description: "new desc",
          isActive   : false,
          version    : 2
        }
      });
    });
  });

  describe("change-logs", () => {
    it("builds paginated audit queries with bounded page size", async () => {
      const items = [{ id: "log-1" }];
      hoisted.prisma.knowledgeAuditLog.findMany.mockResolvedValueOnce(items);
      hoisted.prisma.knowledgeAuditLog.count.mockResolvedValueOnce(23);
      hoisted.prisma.knowledgeAuditLog.findUnique.mockResolvedValueOnce({ id: "log-1" });

      await expect(listChangeLogs({
        objectType: "KNOWLEDGE_PACK",
        objectId  : "pack-1",
        action    : "IMPORT",
        from      : "2026-01-01T00:00:00.000Z",
        to        : "2026-01-31T00:00:00.000Z",
        page      : 2,
        pageSize  : 999
      })).resolves.toEqual({
        items,
        total   : 23,
        page    : 2,
        pageSize: 100
      });
      await expect(getChangeLog("log-1")).resolves.toEqual({ id: "log-1" });

      expect(hoisted.prisma.knowledgeAuditLog.findMany).toHaveBeenCalledWith({
        where: {
          objectType: "KNOWLEDGE_PACK",
          objectId  : "pack-1",
          action    : "IMPORT",
          createdAt : {
            gte: new Date("2026-01-01T00:00:00.000Z"),
            lte: new Date("2026-01-31T00:00:00.000Z")
          }
        },
        orderBy: { createdAt: "desc" },
        skip   : 100,
        take   : 100
      });
      expect(hoisted.prisma.knowledgeAuditLog.count).toHaveBeenCalledWith({
        where: {
          objectType: "KNOWLEDGE_PACK",
          objectId  : "pack-1",
          action    : "IMPORT",
          createdAt : {
            gte: new Date("2026-01-01T00:00:00.000Z"),
            lte: new Date("2026-01-31T00:00:00.000Z")
          }
        }
      });
    });

    it("supports default pagination and partial date filters", async () => {
      hoisted.prisma.knowledgeAuditLog.findMany
        .mockResolvedValueOnce([{ id: "log-default" }])
        .mockResolvedValueOnce([{ id: "log-from" }])
        .mockResolvedValueOnce([{ id: "log-to" }]);
      hoisted.prisma.knowledgeAuditLog.count
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(3);

      await expect(listChangeLogs()).resolves.toEqual({
        items   : [{ id: "log-default" }],
        total   : 1,
        page    : 1,
        pageSize: 20
      });
      await expect(listChangeLogs({
        from: "2026-02-01T00:00:00.000Z"
      })).resolves.toEqual({
        items   : [{ id: "log-from" }],
        total   : 2,
        page    : 1,
        pageSize: 20
      });
      await expect(listChangeLogs({
        to      : "2026-02-28T00:00:00.000Z",
        pageSize: 50
      })).resolves.toEqual({
        items   : [{ id: "log-to" }],
        total   : 3,
        page    : 1,
        pageSize: 50
      });

      expect(hoisted.prisma.knowledgeAuditLog.findMany).toHaveBeenNthCalledWith(1, {
        where  : {},
        orderBy: { createdAt: "desc" },
        skip   : 0,
        take   : 20
      });
      expect(hoisted.prisma.knowledgeAuditLog.findMany).toHaveBeenNthCalledWith(2, {
        where: {
          createdAt: {
            gte: new Date("2026-02-01T00:00:00.000Z")
          }
        },
        orderBy: { createdAt: "desc" },
        skip   : 0,
        take   : 20
      });
      expect(hoisted.prisma.knowledgeAuditLog.findMany).toHaveBeenNthCalledWith(3, {
        where: {
          createdAt: {
            lte: new Date("2026-02-28T00:00:00.000Z")
          }
        },
        orderBy: { createdAt: "desc" },
        skip   : 0,
        take   : 50
      });
    });

    it("looks up a single audit log by id", async () => {
      hoisted.prisma.knowledgeAuditLog.findUnique.mockResolvedValueOnce({ id: "log-2" });

      await expect(getChangeLog("log-2")).resolves.toEqual({ id: "log-2" });

      expect(hoisted.prisma.knowledgeAuditLog.findUnique).toHaveBeenCalledWith({
        where: { id: "log-2" }
      });
    });
  });

  describe("extraction-rules", () => {
    it("supports list/create/update/delete/reorder and combined preview flows", async () => {
      hoisted.prisma.extractionRule.findMany
        .mockResolvedValueOnce([{ id: "rule-1" }])
        .mockResolvedValueOnce([
          { id: "rule-1", content: "规则一", genreKey: null, sortOrder: 1 },
          { id: "rule-2", content: "规则二", genreKey: "classic", sortOrder: 2 }
        ])
        .mockResolvedValueOnce([
          { id: "rule-3", content: "通用关系", genreKey: null, sortOrder: 1 }
        ]);
      hoisted.prisma.extractionRule.create.mockResolvedValueOnce({ id: "rule-new" });
      hoisted.prisma.extractionRule.update
        .mockResolvedValueOnce({ id: "rule-1" })
        .mockResolvedValueOnce({ id: "rule-a" })
        .mockResolvedValueOnce({ id: "rule-b" });
      hoisted.prisma.extractionRule.delete.mockResolvedValueOnce({ id: "rule-1" });
      hoisted.prisma.$transaction.mockResolvedValueOnce([{ id: "rule-a" }, { id: "rule-b" }]);

      await expect(listExtractionRules({
        ruleType: "ENTITY",
        genreKey: "classic",
        active  : true
      })).resolves.toEqual([{ id: "rule-1" }]);
      await expect(createExtractionRule({
        content   : "人物规则",
        changeNote: "初始导入"
      })).resolves.toEqual({ id: "rule-new" });
      await expect(updateExtractionRule("rule-1", {
        content   : "更新规则",
        genreKey  : null,
        sortOrder : 7,
        isActive  : false,
        changeNote: "调整"
      })).resolves.toEqual({ id: "rule-1" });
      await expect(deleteExtractionRule("rule-1")).resolves.toEqual({ id: "rule-1" });
      await expect(reorderExtractionRules("ENTITY", ["rule-a", "rule-b"])).resolves.toBeUndefined();
      await expect(previewCombinedRules("ENTITY", "classic")).resolves.toEqual({
        ruleType: "ENTITY",
        genreKey: "classic",
        count   : 2,
        combined: "1. 规则一\n2. 规则二",
        rules   : [
          { id: "rule-1", content: "规则一", genreKey: null, sortOrder: 1 },
          { id: "rule-2", content: "规则二", genreKey: "classic", sortOrder: 2 }
        ]
      });
      await expect(previewCombinedRules("RELATIONSHIP")).resolves.toEqual({
        ruleType: "RELATIONSHIP",
        genreKey: null,
        count   : 1,
        combined: "1. 通用关系",
        rules   : [
          { id: "rule-3", content: "通用关系", genreKey: null, sortOrder: 1 }
        ]
      });

      expect(hoisted.prisma.extractionRule.create).toHaveBeenCalledWith({
        data: {
          ruleType  : "ENTITY",
          content   : "人物规则",
          genreKey  : undefined,
          sortOrder : 0,
          changeNote: "初始导入"
        }
      });
      expect(hoisted.prisma.extractionRule.update).toHaveBeenNthCalledWith(1, {
        where: { id: "rule-1" },
        data : {
          content   : "更新规则",
          genreKey  : null,
          sortOrder : 7,
          isActive  : false,
          changeNote: "调整"
        }
      });
      expect(hoisted.prisma.extractionRule.update).toHaveBeenNthCalledWith(2, {
        where: { id: "rule-a" },
        data : { sortOrder: 1 }
      });
      expect(hoisted.prisma.extractionRule.update).toHaveBeenNthCalledWith(3, {
        where: { id: "rule-b" },
        data : { sortOrder: 2 }
      });
      expect(hoisted.prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe("generic-titles", () => {
    it("supports list/create/update and guarded delete flows", async () => {
      hoisted.prisma.genericTitleEntry.findMany.mockResolvedValueOnce([{ id: "title-1" }]);
      hoisted.prisma.genericTitleEntry.create.mockResolvedValueOnce({ id: "title-new" });
      hoisted.prisma.genericTitleEntry.update.mockResolvedValueOnce({ id: "title-1" });
      hoisted.prisma.genericTitleEntry.findUnique
        .mockResolvedValueOnce({ id: "title-safe", tier: "SAFETY" })
        .mockResolvedValueOnce({ id: "title-normal", tier: "DEFAULT" })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ title: "老爷", isActive: true, tier: "SAFETY" })
        .mockResolvedValueOnce({ title: "掌门", isActive: true, tier: "DEFAULT", exemptInGenres: ["wuxia"] })
        .mockResolvedValueOnce({ title: "先生", isActive: true, tier: "DEFAULT", exemptInGenres: null });
      hoisted.prisma.genericTitleEntry.delete.mockResolvedValueOnce({ id: "title-normal" });

      await expect(listGenericTitles({
        tier  : "DEFAULT",
        q     : "老",
        active: true
      })).resolves.toEqual([{ id: "title-1" }]);
      await expect(createGenericTitle({
        title      : "掌门",
        description: "武侠常见称谓"
      })).resolves.toEqual({ id: "title-new" });
      await expect(updateGenericTitle("title-1", {
        tier          : "GRAY_ZONE",
        exemptInGenres: null,
        description   : "需人工判断",
        isActive      : false
      })).resolves.toEqual({ id: "title-1" });
      await expect(deleteGenericTitle("title-safe")).rejects.toThrow("SAFETY 级别称谓不可删除");
      await expect(deleteGenericTitle("title-normal")).resolves.toEqual({ id: "title-normal" });
      await expect(testGenericTitle("陌生称谓")).resolves.toEqual({
        title : "陌生称谓",
        genre : null,
        result: "not_found",
        reason: "未在词库中找到该称谓",
        tier  : null
      });
      await expect(testGenericTitle("老爷", "classic")).resolves.toEqual({
        title : "老爷",
        genre : "classic",
        result: "generic",
        reason: "该称谓为安全泛称，任何情况下不个体化",
        tier  : "SAFETY"
      });
      await expect(testGenericTitle("掌门", "wuxia")).resolves.toEqual({
        title : "掌门",
        genre : "wuxia",
        result: "exempt",
        reason: "该称谓在wuxia书籍类型下已豁免（exemptInGenres）",
        tier  : "DEFAULT"
      });
      await expect(testGenericTitle("先生")).resolves.toEqual({
        title : "先生",
        genre : null,
        result: "generic",
        reason: "该称谓为默认泛称",
        tier  : "DEFAULT"
      });

      expect(hoisted.prisma.genericTitleEntry.update).toHaveBeenCalledWith({
        where: { id: "title-1" },
        data : {
          tier          : "GRAY_ZONE",
          exemptInGenres: Prisma.JsonNull,
          description   : "需人工判断",
          isActive      : false
        }
      });
    });
  });

  describe("surnames", () => {
    it("supports list/create/update/delete/import and extraction helpers", async () => {
      hoisted.prisma.surnameEntry.findMany
        .mockResolvedValueOnce([{ id: "surname-1" }])
        .mockResolvedValueOnce([
          { surname: "欧阳", isCompound: true, priority: 10 },
          { surname: "赵", isCompound: false, priority: 0 }
        ])
        .mockResolvedValueOnce([
          { surname: "欧阳", isCompound: true, priority: 10 },
          { surname: "赵", isCompound: false, priority: 0 }
        ])
        .mockResolvedValueOnce([
          { surname: "欧阳", isCompound: true, priority: 10 },
          { surname: "赵", isCompound: false, priority: 0 }
        ]);
      hoisted.prisma.surnameEntry.create
        .mockResolvedValueOnce({ id: "surname-new" })
        .mockResolvedValueOnce({ id: "created-1" })
        .mockResolvedValueOnce({ id: "created-2" });
      hoisted.prisma.surnameEntry.update.mockResolvedValueOnce({ id: "surname-1" });
      hoisted.prisma.surnameEntry.delete.mockResolvedValueOnce({ id: "surname-1" });
      hoisted.prisma.surnameEntry.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: "existing-zhao" })
        .mockResolvedValueOnce(null);

      await expect(listSurnames({
        compound: true,
        q       : "欧",
        active  : true
      })).resolves.toEqual([{ id: "surname-1" }]);
      await expect(createSurname({
        surname    : "欧阳",
        description: "复姓示例",
        bookTypeId : "bt-1"
      })).resolves.toEqual({ id: "surname-new" });
      await expect(updateSurname("surname-1", {
        priority   : 12,
        description: "权重更高",
        bookTypeId : null,
        isActive   : false
      })).resolves.toEqual({ id: "surname-1" });
      await expect(deleteSurname("surname-1")).resolves.toEqual({ id: "surname-1" });
      await expect(importSurnames("欧阳 赵\n司马，赵")).resolves.toEqual({
        total  : 3,
        created: 2,
        skipped: 1
      });
      await expect(testSurnameExtraction("欧阳修")).resolves.toEqual({
        input           : "欧阳修",
        extractedSurname: "欧阳",
        matchType       : "compound",
        priority        : 10
      });
      await expect(testSurnameExtraction("赵云")).resolves.toEqual({
        input           : "赵云",
        extractedSurname: "赵",
        matchType       : "single",
        priority        : 0
      });
      await expect(testSurnameExtraction("李白")).resolves.toEqual({
        input           : "李白",
        extractedSurname: null,
        matchType       : "not_found",
        priority        : 0
      });

      expect(hoisted.prisma.surnameEntry.findMany).toHaveBeenNthCalledWith(1, {
        where: {
          isCompound: true,
          isActive  : true,
          surname   : { contains: "欧" }
        },
        orderBy: [{ isCompound: "desc" }, { priority: "desc" }, { surname: "asc" }],
        include: { bookType: { select: { id: true, key: true, name: true } } }
      });
      expect(hoisted.prisma.surnameEntry.create).toHaveBeenNthCalledWith(1, {
        data: {
          surname    : "欧阳",
          isCompound : true,
          priority   : 10,
          description: "复姓示例",
          bookTypeId : "bt-1",
          source     : "MANUAL"
        }
      });
      expect(hoisted.prisma.surnameEntry.create).toHaveBeenNthCalledWith(2, {
        data: {
          surname   : "欧阳",
          isCompound: true,
          priority  : 10,
          source    : "IMPORTED"
        }
      });
      expect(hoisted.prisma.surnameEntry.create).toHaveBeenNthCalledWith(3, {
        data: {
          surname   : "司马",
          isCompound: true,
          priority  : 10,
          source    : "IMPORTED"
        }
      });
    });
  });
});
