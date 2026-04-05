import { describe, expect, it, vi } from "vitest";

import { ProcessingStatus, RecordSource } from "@/generated/prisma/enums";
import { BookNotFoundError } from "@/server/modules/books/errors";
import { createListBookRelationshipsService } from "@/server/modules/relationships/listBookRelationships";

/**
 * 文件定位（关系列表服务单测）：
 * - 验证按书籍聚合关系边数据，并输出前端图谱/列表可直接消费的结构。
 * - 该服务承接关系筛选（type/source）逻辑，是审校页和图谱页的重要数据入口。
 */
describe("listBookRelationships service", () => {
  it("lists active relationships under one book", async () => {
    // 成功场景：校验 where 条件包含 bookId 与筛选参数，防止跨书籍数据串读。
    const bookFindFirst = vi.fn().mockResolvedValue({ id: "book-1" });
    const relationshipFindMany = vi.fn().mockResolvedValue([
      {
        id          : "rel-1",
        chapterId   : "chapter-1",
        type        : "师生",
        weight      : 0.8,
        description : "关系背景",
        evidence    : "原文证据",
        confidence  : 0.91,
        recordSource: RecordSource.MANUAL,
        status      : ProcessingStatus.VERIFIED,
        sourceId    : "persona-a",
        targetId    : "persona-b",
        source      : { name: "周进" },
        target      : { name: "范进" },
        chapter     : { no: 3 }
      }
    ]);

    const service = createListBookRelationshipsService({
      book: {
        findFirst: bookFindFirst
      },
      relationship: {
        findMany: relationshipFindMany
      }
    } as never);

    const result = await service.listBookRelationships("book-1", {
      type  : "师生",
      source: RecordSource.MANUAL
    });

    expect(bookFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id       : "book-1",
        deletedAt: null
      })
    }));
    expect(relationshipFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        chapter     : { bookId: "book-1" },
        type        : "师生",
        recordSource: RecordSource.MANUAL
      })
    }));
    expect(result).toEqual([
      {
        id          : "rel-1",
        bookId      : "book-1",
        chapterId   : "chapter-1",
        chapterNo   : 3,
        sourceId    : "persona-a",
        sourceName  : "周进",
        targetId    : "persona-b",
        targetName  : "范进",
        type        : "师生",
        weight      : 0.8,
        description : "关系背景",
        evidence    : "原文证据",
        confidence  : 0.91,
        recordSource: RecordSource.MANUAL,
        status      : ProcessingStatus.VERIFIED
      }
    ]);
  });

  it("throws not found when book is missing", async () => {
    // 边界场景：书籍不存在时应提前失败，避免执行无意义关系查询。
    const service = createListBookRelationshipsService({
      book: {
        findFirst: vi.fn().mockResolvedValue(null)
      },
      relationship: {
        findMany: vi.fn()
      }
    } as never);

    await expect(service.listBookRelationships("missing-book"))
      .rejects.toBeInstanceOf(BookNotFoundError);
  });
});
