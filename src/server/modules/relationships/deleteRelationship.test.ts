import { describe, expect, it, vi } from "vitest";

import { ProcessingStatus } from "@/generated/prisma/enums";
import { createDeleteRelationshipService } from "@/server/modules/relationships/deleteRelationship";
import { RelationshipNotFoundError } from "@/server/modules/relationships/errors";

function createTransactionMock(tx: unknown) {
  return vi.fn().mockImplementation(async (callback: (transactionClient: unknown) => unknown) => callback(tx));
}

describe("deleteRelationship service", () => {
  it("soft deletes relationship", async () => {
    const relationshipUpdate = vi.fn().mockResolvedValue({
      id       : "rel-1",
      status   : ProcessingStatus.REJECTED,
      deletedAt: new Date("2026-03-25T00:00:00.000Z")
    });
    const service = createDeleteRelationshipService({
      $transaction: createTransactionMock({
        relationship: {
          findUnique: vi.fn().mockResolvedValue({ id: "rel-1", deletedAt: null }),
          update    : relationshipUpdate
        }
      })
    } as never);

    const result = await service.deleteRelationship("rel-1");

    expect(relationshipUpdate).toHaveBeenCalledWith({
      where: { id: "rel-1" },
      data : {
        status   : ProcessingStatus.REJECTED,
        deletedAt: expect.any(Date)
      },
      select: {
        id       : true,
        status   : true,
        deletedAt: true
      }
    });
    expect(result).toEqual({
      id       : "rel-1",
      status   : ProcessingStatus.REJECTED,
      deletedAt: "2026-03-25T00:00:00.000Z"
    });
  });

  it("returns an already soft-deleted relationship idempotently", async () => {
    const relationshipUpdate = vi.fn();
    const service = createDeleteRelationshipService({
      $transaction: createTransactionMock({
        relationship: {
          findUnique: vi.fn().mockResolvedValue({
            id       : "rel-1",
            status   : ProcessingStatus.REJECTED,
            deletedAt: new Date("2026-03-24T00:00:00.000Z")
          }),
          update: relationshipUpdate
        }
      })
    } as never);

    const result = await service.deleteRelationship("rel-1");

    expect(relationshipUpdate).not.toHaveBeenCalled();
    expect(result).toEqual({
      id       : "rel-1",
      status   : ProcessingStatus.REJECTED,
      deletedAt: "2026-03-24T00:00:00.000Z"
    });
  });

  it("throws not found when relationship does not exist", async () => {
    const service = createDeleteRelationshipService({
      $transaction: createTransactionMock({
        relationship: {
          findUnique: vi.fn().mockResolvedValue(null)
        }
      })
    } as never);

    await expect(service.deleteRelationship("rel-missing"))
      .rejects.toBeInstanceOf(RelationshipNotFoundError);
  });
});
