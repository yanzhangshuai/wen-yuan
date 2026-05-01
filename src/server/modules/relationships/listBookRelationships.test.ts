import { describe, expect, it, vi } from "vitest";

import { ProcessingStatus, RecordSource } from "@/generated/prisma/enums";
import { BookNotFoundError } from "@/server/modules/books/errors";
import { createListBookRelationshipsService } from "@/server/modules/relationships/listBookRelationships";

describe("listBookRelationships service", () => {
  it("counts only active events and uses the minimum active chapter number", async () => {
    const relationshipFindMany = vi.fn().mockResolvedValue([
      {
        id                  : "rel-1",
        sourceId            : "persona-a",
        targetId            : "persona-b",
        relationshipTypeCode: "teacher_student",
        relationshipType    : { name: "师生" },
        recordSource        : RecordSource.MANUAL,
        status              : ProcessingStatus.VERIFIED
      }
    ]);
    const relationshipEventGroupBy = vi.fn().mockResolvedValue([
      {
        relationshipId: "rel-1",
        _count        : { _all: 2 },
        _min          : { chapterNo: 3 }
      }
    ]);
    const service = createListBookRelationshipsService({
      book: {
        findFirst: vi.fn().mockResolvedValue({ id: "book-1" })
      },
      relationship: {
        findMany: relationshipFindMany
      },
      relationshipEvent: {
        groupBy: relationshipEventGroupBy
      }
    } as never);

    const result = await service.listBookRelationships("book-1");

    expect(relationshipFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        bookId   : "book-1",
        deletedAt: null,
        source   : { deletedAt: null },
        target   : { deletedAt: null }
      })
    }));
    expect(relationshipEventGroupBy).toHaveBeenCalledWith({
      by   : ["relationshipId"],
      where: {
        relationshipId: { in: ["rel-1"] },
        deletedAt     : null
      },
      _count: { _all: true },
      _min  : { chapterNo: true }
    });
    expect(result).toEqual([
      {
        id                  : "rel-1",
        sourceId            : "persona-a",
        targetId            : "persona-b",
        relationshipTypeCode: "teacher_student",
        relationshipTypeName: "师生",
        recordSource        : RecordSource.MANUAL,
        status              : ProcessingStatus.VERIFIED,
        eventCount          : 2,
        firstChapterNo      : 3
      }
    ]);
  });

  it("returns zero eventCount and null firstChapterNo when no active events exist", async () => {
    const service = createListBookRelationshipsService({
      book: {
        findFirst: vi.fn().mockResolvedValue({ id: "book-1" })
      },
      relationship: {
        findMany: vi.fn().mockResolvedValue([
          {
            id                  : "rel-1",
            sourceId            : "persona-a",
            targetId            : "persona-b",
            relationshipTypeCode: "teacher_student",
            relationshipType    : { name: "师生" },
            recordSource        : RecordSource.DRAFT_AI,
            status              : ProcessingStatus.DRAFT
          }
        ])
      },
      relationshipEvent: {
        groupBy: vi.fn().mockResolvedValue([])
      }
    } as never);

    const result = await service.listBookRelationships("book-1");

    expect(result[0]).toEqual(expect.objectContaining({
      eventCount    : 0,
      firstChapterNo: null
    }));
  });

  it("isolates relationships by bookId and relationshipTypeCode filter", async () => {
    const relationshipFindMany = vi.fn().mockResolvedValue([]);
    const service = createListBookRelationshipsService({
      book: {
        findFirst: vi.fn().mockResolvedValue({ id: "book-1" })
      },
      relationship: {
        findMany: relationshipFindMany
      },
      relationshipEvent: {
        groupBy: vi.fn()
      }
    } as never);

    await service.listBookRelationships("book-1", {
      relationshipTypeCode: "teacher_student",
      status              : ProcessingStatus.VERIFIED,
      source              : RecordSource.MANUAL
    });

    expect(relationshipFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        bookId              : "book-1",
        relationshipTypeCode: "teacher_student",
        status              : ProcessingStatus.VERIFIED,
        recordSource        : RecordSource.MANUAL
      })
    }));
  });

  it("throws not found when book is missing", async () => {
    const service = createListBookRelationshipsService({
      book: {
        findFirst: vi.fn().mockResolvedValue(null)
      },
      relationship: {
        findMany: vi.fn()
      },
      relationshipEvent: {
        groupBy: vi.fn()
      }
    } as never);

    await expect(service.listBookRelationships("missing-book"))
      .rejects.toBeInstanceOf(BookNotFoundError);
  });
});
