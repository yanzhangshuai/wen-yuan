import { describe, expect, it, vi } from "vitest";

import { ProcessingStatus, RecordSource } from "@/generated/prisma/enums";
import { BookNotFoundError } from "@/server/modules/books/errors";
import { createListBookRelationshipsService } from "@/server/modules/relationships/listBookRelationships";

describe("listBookRelationships service", () => {
  it("lists active relationships under one book", async () => {
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
