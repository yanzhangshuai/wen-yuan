import { describe, expect, it, vi } from "vitest";

import { ProcessingStatus, RecordSource } from "@/generated/prisma/enums";
import { PersonaNotFoundError } from "@/server/modules/personas/errors";
import { createCreateBookRelationshipService } from "@/server/modules/relationships/createBookRelationship";
import { RelationshipInputError } from "@/server/modules/relationships/errors";

describe("createBookRelationship service", () => {
  it("creates manual relationship as verified", async () => {
    const bookFindFirst = vi.fn().mockResolvedValue({ id: "book-1" });
    const chapterFindFirst = vi.fn().mockResolvedValue({ id: "chapter-1", no: 2 });
    const personaFindMany = vi.fn().mockResolvedValue([
      { id: "persona-a" },
      { id: "persona-b" }
    ]);
    const relationshipFindFirst = vi.fn().mockResolvedValue(null);
    const relationshipCreate = vi.fn().mockResolvedValue({
      id          : "rel-1",
      chapterId   : "chapter-1",
      sourceId    : "persona-a",
      targetId    : "persona-b",
      type        : "师生",
      weight      : 1.2,
      description : "关系背景",
      evidence    : "证据片段",
      confidence  : 0.95,
      recordSource: RecordSource.MANUAL,
      status      : ProcessingStatus.VERIFIED
    });
    const transaction = vi.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      book: {
        findFirst: bookFindFirst
      },
      chapter: {
        findFirst: chapterFindFirst
      },
      persona: {
        findMany: personaFindMany
      },
      relationship: {
        findFirst: relationshipFindFirst,
        create   : relationshipCreate
      }
    }));

    const service = createCreateBookRelationshipService({
      $transaction: transaction
    } as never);

    const result = await service.createBookRelationship("book-1", {
      chapterId  : "chapter-1",
      sourceId   : "persona-a",
      targetId   : "persona-b",
      type       : " 师生 ",
      weight     : 1.2,
      description: "关系背景",
      evidence   : "证据片段",
      confidence : 0.95
    });

    expect(relationshipCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        type        : "师生",
        recordSource: RecordSource.MANUAL,
        status      : ProcessingStatus.VERIFIED
      })
    }));
    expect(result).toEqual({
      id          : "rel-1",
      bookId      : "book-1",
      chapterId   : "chapter-1",
      chapterNo   : 2,
      sourceId    : "persona-a",
      targetId    : "persona-b",
      type        : "师生",
      weight      : 1.2,
      description : "关系背景",
      evidence    : "证据片段",
      confidence  : 0.95,
      recordSource: RecordSource.MANUAL,
      status      : ProcessingStatus.VERIFIED
    });
  });

  it("throws input error when source and target are same", async () => {
    const service = createCreateBookRelationshipService({
      $transaction: vi.fn()
    } as never);

    await expect(service.createBookRelationship("book-1", {
      chapterId: "chapter-1",
      sourceId : "persona-a",
      targetId : "persona-a",
      type     : "师生"
    })).rejects.toBeInstanceOf(RelationshipInputError);
  });

  it("throws persona not found when one endpoint is missing", async () => {
    const transaction = vi.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      book: {
        findFirst: vi.fn().mockResolvedValue({ id: "book-1" })
      },
      chapter: {
        findFirst: vi.fn().mockResolvedValue({ id: "chapter-1", no: 1 })
      },
      persona: {
        findMany: vi.fn().mockResolvedValue([{ id: "persona-a" }])
      },
      relationship: {
        findFirst: vi.fn()
      }
    }));
    const service = createCreateBookRelationshipService({
      $transaction: transaction
    } as never);

    await expect(service.createBookRelationship("book-1", {
      chapterId: "chapter-1",
      sourceId : "persona-a",
      targetId : "persona-b",
      type     : "师生"
    })).rejects.toBeInstanceOf(PersonaNotFoundError);
  });
});
