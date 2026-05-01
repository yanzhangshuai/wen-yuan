import { describe, expect, it, vi } from "vitest";

import { ProcessingStatus, RecordSource } from "@/generated/prisma/enums";
import { createUpdateRelationshipService } from "@/server/modules/relationships/updateRelationship";
import {
  RelationshipInputError,
  RelationshipNotFoundError
} from "@/server/modules/relationships/errors";

function createTransactionMock(tx: unknown) {
  return vi.fn().mockImplementation(async (callback: (transactionClient: unknown) => unknown) => callback(tx));
}

describe("updateRelationship service", () => {
  it("upgrades recordSource from DRAFT_AI to AI", async () => {
    const relationshipUpdate = vi.fn().mockResolvedValue({
      id                  : "rel-1",
      bookId              : "book-1",
      sourceId            : "persona-a",
      targetId            : "persona-b",
      relationshipTypeCode: "teacher_student",
      recordSource        : RecordSource.AI,
      status              : ProcessingStatus.DRAFT,
      updatedAt           : new Date("2026-03-25T00:00:00.000Z")
    });
    const service = createUpdateRelationshipService({
      $transaction: createTransactionMock({
        relationship: {
          findFirst: vi.fn().mockResolvedValue({
            id          : "rel-1",
            recordSource: RecordSource.DRAFT_AI
          }),
          update: relationshipUpdate
        }
      })
    } as never);

    const result = await service.updateRelationship("rel-1", {
      recordSource: RecordSource.AI
    });

    expect(relationshipUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: { recordSource: RecordSource.AI }
    }));
    expect(result.recordSource).toBe(RecordSource.AI);
  });

  it("upgrades recordSource from AI to MANUAL", async () => {
    const relationshipUpdate = vi.fn().mockResolvedValue({
      id                  : "rel-1",
      bookId              : "book-1",
      sourceId            : "persona-a",
      targetId            : "persona-b",
      relationshipTypeCode: "teacher_student",
      recordSource        : RecordSource.MANUAL,
      status              : ProcessingStatus.DRAFT,
      updatedAt           : new Date("2026-03-25T00:00:00.000Z")
    });
    const service = createUpdateRelationshipService({
      $transaction: createTransactionMock({
        relationship: {
          findFirst: vi.fn().mockResolvedValue({ id: "rel-1", recordSource: RecordSource.AI }),
          update   : relationshipUpdate
        }
      })
    } as never);

    await service.updateRelationship("rel-1", { recordSource: RecordSource.MANUAL });

    expect(relationshipUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: { recordSource: RecordSource.MANUAL }
    }));
  });

  it("rejects recordSource downgrade from MANUAL to AI", async () => {
    const relationshipUpdate = vi.fn();
    const service = createUpdateRelationshipService({
      $transaction: createTransactionMock({
        relationship: {
          findFirst: vi.fn().mockResolvedValue({ id: "rel-1", recordSource: RecordSource.MANUAL }),
          update   : relationshipUpdate
        }
      })
    } as never);

    await expect(service.updateRelationship("rel-1", {
      recordSource: RecordSource.AI
    })).rejects.toBeInstanceOf(RelationshipInputError);
    expect(relationshipUpdate).not.toHaveBeenCalled();
  });

  it("updates status independently from recordSource", async () => {
    const relationshipUpdate = vi.fn().mockResolvedValue({
      id                  : "rel-1",
      bookId              : "book-1",
      sourceId            : "persona-a",
      targetId            : "persona-b",
      relationshipTypeCode: "teacher_student",
      recordSource        : RecordSource.DRAFT_AI,
      status              : ProcessingStatus.VERIFIED,
      updatedAt           : new Date("2026-03-25T00:00:00.000Z")
    });
    const service = createUpdateRelationshipService({
      $transaction: createTransactionMock({
        relationship: {
          findFirst: vi.fn().mockResolvedValue({ id: "rel-1", recordSource: RecordSource.DRAFT_AI }),
          update   : relationshipUpdate
        }
      })
    } as never);

    const result = await service.updateRelationship("rel-1", {
      status: ProcessingStatus.VERIFIED
    });

    expect(relationshipUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: { status: ProcessingStatus.VERIFIED }
    }));
    expect(result).toEqual(expect.objectContaining({
      id       : "rel-1",
      status   : ProcessingStatus.VERIFIED,
      updatedAt: "2026-03-25T00:00:00.000Z"
    }));
  });

  it("updates relationshipTypeCode after validating an active definition", async () => {
    const relationshipUpdate = vi.fn().mockResolvedValue({
      id                  : "rel-1",
      bookId              : "book-1",
      sourceId            : "persona-a",
      targetId            : "persona-b",
      relationshipTypeCode: "classmate",
      recordSource        : RecordSource.AI,
      status              : ProcessingStatus.DRAFT,
      updatedAt           : new Date("2026-03-25T00:00:00.000Z")
    });
    const tx = {
      relationship: {
        findFirst: vi.fn().mockResolvedValue({ id: "rel-1", recordSource: RecordSource.AI }),
        update   : relationshipUpdate
      },
      relationshipTypeDefinition: {
        findFirst: vi.fn().mockResolvedValue({ code: "classmate" })
      }
    };
    const service = createUpdateRelationshipService({
      $transaction: createTransactionMock(tx)
    } as never);

    await service.updateRelationship("rel-1", {
      relationshipTypeCode: " classmate "
    });

    expect(tx.relationshipTypeDefinition.findFirst).toHaveBeenCalledWith({
      where : { code: "classmate", status: "ACTIVE" },
      select: { code: true }
    });
    expect(relationshipUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: { relationshipTypeCode: "classmate" }
    }));
  });

  it("throws input error when no update field provided", async () => {
    const service = createUpdateRelationshipService({ $transaction: vi.fn() } as never);

    await expect(service.updateRelationship("rel-1", {}))
      .rejects.toBeInstanceOf(RelationshipInputError);
  });

  it("throws not found when relationship does not exist", async () => {
    const service = createUpdateRelationshipService({
      $transaction: createTransactionMock({
        relationship: {
          findFirst: vi.fn().mockResolvedValue(null)
        }
      })
    } as never);

    await expect(service.updateRelationship("rel-missing", { status: ProcessingStatus.VERIFIED }))
      .rejects.toBeInstanceOf(RelationshipNotFoundError);
  });
});
