import { describe, expect, it, vi } from "vitest";

import { ProcessingStatus } from "@/generated/prisma/enums";
import { createDeleteRelationshipService } from "@/server/modules/relationships/deleteRelationship";
import { RelationshipNotFoundError } from "@/server/modules/relationships/errors";

describe("deleteRelationship service", () => {
  it("soft deletes relationship and marks as rejected", async () => {
    const relationshipFindFirst = vi.fn().mockResolvedValue({ id: "rel-1" });
    const relationshipUpdate = vi.fn().mockResolvedValue({
      id       : "rel-1",
      status   : ProcessingStatus.REJECTED,
      deletedAt: new Date("2026-03-25T00:00:00.000Z")
    });
    const transaction = vi.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      relationship: {
        findFirst: relationshipFindFirst,
        update   : relationshipUpdate
      }
    }));
    const service = createDeleteRelationshipService({
      $transaction: transaction
    } as never);

    const result = await service.deleteRelationship("rel-1");

    expect(relationshipUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status   : ProcessingStatus.REJECTED,
        deletedAt: expect.any(Date)
      })
    }));
    expect(result).toEqual({
      id       : "rel-1",
      status   : ProcessingStatus.REJECTED,
      deletedAt: "2026-03-25T00:00:00.000Z"
    });
  });

  it("throws not found when relationship does not exist", async () => {
    const transaction = vi.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      relationship: {
        findFirst: vi.fn().mockResolvedValue(null)
      }
    }));
    const service = createDeleteRelationshipService({
      $transaction: transaction
    } as never);

    await expect(service.deleteRelationship("rel-missing"))
      .rejects.toBeInstanceOf(RelationshipNotFoundError);
  });
});
