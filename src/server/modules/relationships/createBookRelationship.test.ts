import { describe, expect, it, vi } from "vitest";

import { Prisma } from "@/generated/prisma/client";
import { ProcessingStatus, RecordSource } from "@/generated/prisma/enums";
import { BookNotFoundError } from "@/server/modules/books/errors";
import { PersonaNotFoundError } from "@/server/modules/personas/errors";
import { createCreateBookRelationshipService } from "@/server/modules/relationships/createBookRelationship";
import { RelationshipInputError } from "@/server/modules/relationships/errors";

function createTransactionMock(tx: unknown) {
  return vi.fn().mockImplementation(async (callback: (transactionClient: unknown) => unknown) => callback(tx));
}

describe("createBookRelationship service", () => {
  it("creates a first manual relationship as verified", async () => {
    const relationshipFindFirst = vi.fn().mockResolvedValue(null);
    const relationshipCreate = vi.fn().mockResolvedValue({
      id                  : "rel-1",
      bookId              : "book-1",
      sourceId            : "persona-a",
      targetId            : "persona-b",
      relationshipTypeCode: "teacher_student",
      recordSource        : RecordSource.MANUAL,
      status              : ProcessingStatus.VERIFIED
    });
    const tx = {
      book: {
        findFirst: vi.fn().mockResolvedValue({ id: "book-1" })
      },
      persona: {
        findMany: vi.fn().mockResolvedValue([
          { id: "persona-a" },
          { id: "persona-b" }
        ])
      },
      relationshipTypeDefinition: {
        findFirst: vi.fn().mockResolvedValue({
          code         : "teacher_student",
          directionMode: "INVERSE"
        })
      },
      relationship: {
        findFirst: relationshipFindFirst,
        create   : relationshipCreate
      }
    };
    const service = createCreateBookRelationshipService({
      $transaction: createTransactionMock(tx)
    } as never);

    const result = await service.createBookRelationship("book-1", {
      sourceId            : "persona-a",
      targetId            : "persona-b",
      relationshipTypeCode: " teacher_student "
    });

    expect(tx.relationshipTypeDefinition.findFirst).toHaveBeenCalledWith({
      where : { code: "teacher_student", status: "ACTIVE" },
      select: { code: true, directionMode: true }
    });
    expect(relationshipFindFirst).toHaveBeenCalledWith({
      where: {
        bookId              : "book-1",
        sourceId            : "persona-a",
        targetId            : "persona-b",
        relationshipTypeCode: "teacher_student",
        deletedAt           : null
      },
      select: {
        id: true
      }
    });
    expect(relationshipCreate).toHaveBeenCalledWith({
      data: {
        bookId              : "book-1",
        sourceId            : "persona-a",
        targetId            : "persona-b",
        relationshipTypeCode: "teacher_student",
        recordSource        : RecordSource.MANUAL,
        status              : ProcessingStatus.VERIFIED
      },
      select: {
        id                  : true,
        bookId              : true,
        sourceId            : true,
        targetId            : true,
        relationshipTypeCode: true,
        recordSource        : true,
        status              : true
      }
    });
    expect(result).toEqual({
      id                  : "rel-1",
      bookId              : "book-1",
      sourceId            : "persona-a",
      targetId            : "persona-b",
      relationshipTypeCode: "teacher_student",
      recordSource        : RecordSource.MANUAL,
      status              : ProcessingStatus.VERIFIED
    });
  });

  it("retries as an idempotent update when a concurrent create hits the unique index", async () => {
    const uniqueConflict = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed on the relationship pair index",
      {
        code         : "P2002",
        clientVersion: "test"
      }
    );
    const firstCreate = vi.fn().mockRejectedValue(uniqueConflict);
    const firstTx = {
      book: {
        findFirst: vi.fn().mockResolvedValue({ id: "book-1" })
      },
      persona: {
        findMany: vi.fn().mockResolvedValue([
          { id: "persona-a" },
          { id: "persona-b" }
        ])
      },
      relationshipTypeDefinition: {
        findFirst: vi.fn().mockResolvedValue({
          code         : "teacher_student",
          directionMode: "INVERSE"
        })
      },
      relationship: {
        findFirst: vi.fn().mockResolvedValue(null),
        create   : firstCreate
      }
    };
    const relationshipUpdate = vi.fn().mockResolvedValue({
      id                  : "rel-1",
      bookId              : "book-1",
      sourceId            : "persona-a",
      targetId            : "persona-b",
      relationshipTypeCode: "teacher_student",
      recordSource        : RecordSource.MANUAL,
      status              : ProcessingStatus.VERIFIED
    });
    const secondTx = {
      book: {
        findFirst: vi.fn().mockResolvedValue({ id: "book-1" })
      },
      persona: {
        findMany: vi.fn().mockResolvedValue([
          { id: "persona-a" },
          { id: "persona-b" }
        ])
      },
      relationshipTypeDefinition: {
        findFirst: vi.fn().mockResolvedValue({
          code         : "teacher_student",
          directionMode: "INVERSE"
        })
      },
      relationship: {
        findFirst: vi.fn().mockResolvedValue({ id: "rel-1" }),
        update   : relationshipUpdate
      }
    };
    const transaction = vi.fn()
      .mockImplementationOnce(async (callback: (transactionClient: unknown) => unknown) => callback(firstTx))
      .mockImplementationOnce(async (callback: (transactionClient: unknown) => unknown) => callback(secondTx));
    const service = createCreateBookRelationshipService({
      $transaction: transaction
    } as never);

    const result = await service.createBookRelationship("book-1", {
      sourceId            : "persona-a",
      targetId            : "persona-b",
      relationshipTypeCode: "teacher_student"
    });

    expect(transaction).toHaveBeenCalledTimes(2);
    expect(firstCreate).toHaveBeenCalledTimes(1);
    expect(relationshipUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "rel-1" },
      data : expect.objectContaining({
        recordSource: RecordSource.MANUAL,
        status      : ProcessingStatus.VERIFIED,
        deletedAt   : null
      })
    }));
    expect(result).toEqual({
      id                  : "rel-1",
      bookId              : "book-1",
      sourceId            : "persona-a",
      targetId            : "persona-b",
      relationshipTypeCode: "teacher_student",
      recordSource        : RecordSource.MANUAL,
      status              : ProcessingStatus.VERIFIED
    });
  });

  it("upgrades an existing DRAFT_AI relationship to MANUAL", async () => {
    const relationshipUpdate = vi.fn().mockResolvedValue({
      id                  : "rel-1",
      bookId              : "book-1",
      sourceId            : "persona-a",
      targetId            : "persona-b",
      relationshipTypeCode: "teacher_student",
      recordSource        : RecordSource.MANUAL,
      status              : ProcessingStatus.VERIFIED
    });
    const service = createCreateBookRelationshipService({
      $transaction: createTransactionMock({
        book: {
          findFirst: vi.fn().mockResolvedValue({ id: "book-1" })
        },
        persona: {
          findMany: vi.fn().mockResolvedValue([{ id: "persona-a" }, { id: "persona-b" }])
        },
        relationshipTypeDefinition: {
          findFirst: vi.fn().mockResolvedValue({ code: "teacher_student", directionMode: "INVERSE" })
        },
        relationship: {
          findFirst: vi.fn().mockResolvedValue({ id: "rel-1" }),
          update   : relationshipUpdate
        }
      })
    } as never);

    await service.createBookRelationship("book-1", {
      sourceId            : "persona-a",
      targetId            : "persona-b",
      relationshipTypeCode: "teacher_student"
    });

    expect(relationshipUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "rel-1" },
      data : expect.objectContaining({
        recordSource: RecordSource.MANUAL,
        status      : ProcessingStatus.VERIFIED,
        deletedAt   : null
      })
    }));
  });

  it("keeps an existing MANUAL relationship idempotent", async () => {
    const relationshipUpdate = vi.fn().mockResolvedValue({
      id                  : "rel-manual",
      bookId              : "book-1",
      sourceId            : "persona-a",
      targetId            : "persona-b",
      relationshipTypeCode: "teacher_student",
      recordSource        : RecordSource.MANUAL,
      status              : ProcessingStatus.VERIFIED
    });
    const service = createCreateBookRelationshipService({
      $transaction: createTransactionMock({
        book                      : { findFirst: vi.fn().mockResolvedValue({ id: "book-1" }) },
        persona                   : { findMany: vi.fn().mockResolvedValue([{ id: "persona-a" }, { id: "persona-b" }]) },
        relationshipTypeDefinition: {
          findFirst: vi.fn().mockResolvedValue({ code: "teacher_student", directionMode: "INVERSE" })
        },
        relationship: {
          findFirst: vi.fn().mockResolvedValue({ id: "rel-manual" }),
          update   : relationshipUpdate
        }
      })
    } as never);

    const result = await service.createBookRelationship("book-1", {
      sourceId            : "persona-a",
      targetId            : "persona-b",
      relationshipTypeCode: "teacher_student"
    });

    expect(result.id).toBe("rel-manual");
    expect(result.recordSource).toBe(RecordSource.MANUAL);
  });

  it("canonicalizes symmetric relationship endpoints by UUID order", async () => {
    const relationshipFindFirst = vi.fn().mockResolvedValue(null);
    const relationshipCreate = vi.fn().mockResolvedValue({
      id                  : "rel-1",
      bookId              : "book-1",
      sourceId            : "00000000-0000-0000-0000-000000000001",
      targetId            : "ffffffff-ffff-ffff-ffff-ffffffffffff",
      relationshipTypeCode: "classmate",
      recordSource        : RecordSource.MANUAL,
      status              : ProcessingStatus.VERIFIED
    });
    const service = createCreateBookRelationshipService({
      $transaction: createTransactionMock({
        book   : { findFirst: vi.fn().mockResolvedValue({ id: "book-1" }) },
        persona: {
          findMany: vi.fn().mockResolvedValue([
            { id: "ffffffff-ffff-ffff-ffff-ffffffffffff" },
            { id: "00000000-0000-0000-0000-000000000001" }
          ])
        },
        relationshipTypeDefinition: {
          findFirst: vi.fn().mockResolvedValue({ code: "classmate", directionMode: "SYMMETRIC" })
        },
        relationship: {
          findFirst: relationshipFindFirst,
          create   : relationshipCreate
        }
      })
    } as never);

    await service.createBookRelationship("book-1", {
      sourceId            : "ffffffff-ffff-ffff-ffff-ffffffffffff",
      targetId            : "00000000-0000-0000-0000-000000000001",
      relationshipTypeCode: "classmate"
    });

    expect(relationshipFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        bookId              : "book-1",
        sourceId            : "00000000-0000-0000-0000-000000000001",
        targetId            : "ffffffff-ffff-ffff-ffff-ffffffffffff",
        relationshipTypeCode: "classmate",
        deletedAt           : null
      }
    }));
  });

  it("rejects inactive relationship type definitions", async () => {
    const service = createCreateBookRelationshipService({
      $transaction: createTransactionMock({
        book                      : { findFirst: vi.fn().mockResolvedValue({ id: "book-1" }) },
        persona                   : { findMany: vi.fn().mockResolvedValue([{ id: "persona-a" }, { id: "persona-b" }]) },
        relationshipTypeDefinition: { findFirst: vi.fn().mockResolvedValue(null) },
        relationship              : { upsert: vi.fn() }
      })
    } as never);

    await expect(service.createBookRelationship("book-1", {
      sourceId            : "persona-a",
      targetId            : "persona-b",
      relationshipTypeCode: "inactive_type"
    })).rejects.toBeInstanceOf(RelationshipInputError);
  });

  it("rejects self-loop relationships", async () => {
    const service = createCreateBookRelationshipService({ $transaction: vi.fn() } as never);

    await expect(service.createBookRelationship("book-1", {
      sourceId            : "persona-a",
      targetId            : "persona-a",
      relationshipTypeCode: "teacher_student"
    })).rejects.toBeInstanceOf(RelationshipInputError);
  });

  it("rejects soft-deleted persona endpoints", async () => {
    const service = createCreateBookRelationshipService({
      $transaction: createTransactionMock({
        book                      : { findFirst: vi.fn().mockResolvedValue({ id: "book-1" }) },
        persona                   : { findMany: vi.fn().mockResolvedValue([{ id: "persona-a" }]) },
        relationshipTypeDefinition: { findFirst: vi.fn() },
        relationship              : { upsert: vi.fn() }
      })
    } as never);

    await expect(service.createBookRelationship("book-1", {
      sourceId            : "persona-a",
      targetId            : "persona-b",
      relationshipTypeCode: "teacher_student"
    })).rejects.toBeInstanceOf(PersonaNotFoundError);
  });

  it("throws book not found when target book does not exist", async () => {
    const service = createCreateBookRelationshipService({
      $transaction: createTransactionMock({
        book: { findFirst: vi.fn().mockResolvedValue(null) }
      })
    } as never);

    await expect(service.createBookRelationship("missing-book", {
      sourceId            : "persona-a",
      targetId            : "persona-b",
      relationshipTypeCode: "teacher_student"
    })).rejects.toBeInstanceOf(BookNotFoundError);
  });
});
