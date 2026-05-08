import { describe, expect, it, vi } from "vitest";

import { ProcessingStatus, RecordSource } from "@/generated/prisma/enums";
import { BookNotFoundError } from "@/server/modules/books/errors";
import { createListBookRelationshipsService } from "@/server/modules/relationships/listBookRelationships";

describe("listBookRelationships service", () => {
  it("returns relationships with direct chapterNo from the row", async () => {
    const relationshipFindMany = vi.fn().mockResolvedValue([
      {
        id                  : "rel-1",
        sourceId            : "persona-a",
        targetId            : "persona-b",
        relationshipTypeCode: "teacher_student",
        recordSource        : RecordSource.MANUAL,
        status              : ProcessingStatus.VERIFIED,
        chapterNo           : 3
      }
    ]);
    const service = createListBookRelationshipsService({
      book: {
        findFirst: vi.fn().mockResolvedValue({ id: "book-1" })
      },
      relationship: {
        findMany: relationshipFindMany
      },
      relationshipTypeDefinition: {
        findMany: vi.fn().mockResolvedValue([{ code: "teacher_student", name: "师生" }])
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
    expect(result).toEqual([
      {
        id                  : "rel-1",
        sourceId            : "persona-a",
        targetId            : "persona-b",
        relationshipTypeCode: "teacher_student",
        relationshipTypeName: "师生",
        recordSource        : RecordSource.MANUAL,
        status              : ProcessingStatus.VERIFIED,
        chapterNo           : 3
      }
    ]);
  });

  it("returns null chapterNo when the relationship has no chapter set", async () => {
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
            recordSource        : RecordSource.DRAFT_AI,
            status              : ProcessingStatus.DRAFT,
            chapterNo           : null
          }
        ])
      },
      relationshipTypeDefinition: {
        findMany: vi.fn().mockResolvedValue([{ code: "teacher_student", name: "师生" }])
      }
    } as never);

    const result = await service.listBookRelationships("book-1");

    expect(result[0]).toEqual(expect.objectContaining({
      chapterNo: null
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
      relationshipTypeDefinition: {
        findMany: vi.fn().mockResolvedValue([])
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
      relationshipTypeDefinition: {
        findMany: vi.fn()
      }
    } as never);

    await expect(service.listBookRelationships("missing-book"))
      .rejects.toBeInstanceOf(BookNotFoundError);
  });
});
