import { describe, expect, it, vi } from "vitest";

import { ProcessingStatus } from "@/generated/prisma/enums";
import { createDeleteRelationshipEventService } from "@/server/modules/relationships/deleteRelationshipEvent";
import { RelationshipEventNotFoundError } from "@/server/modules/relationships/errors";

function createTransactionMock(tx: unknown) {
  return vi.fn().mockImplementation(async (callback: (transactionClient: unknown) => unknown) => callback(tx));
}

describe("deleteRelationshipEvent service", () => {
  it("soft deletes a relationship event without touching the parent relationship", async () => {
    const eventUpdate = vi.fn().mockResolvedValue({
      id       : "event-1",
      status   : ProcessingStatus.REJECTED,
      deletedAt: new Date("2026-03-25T00:00:00.000Z")
    });
    const service = createDeleteRelationshipEventService({
      $transaction: createTransactionMock({
        relationshipEvent: {
          findUnique: vi.fn().mockResolvedValue({ id: "event-1", status: ProcessingStatus.DRAFT, deletedAt: null }),
          update    : eventUpdate
        }
      })
    } as never);

    const result = await service.deleteRelationshipEvent("event-1");

    expect(eventUpdate).toHaveBeenCalledWith({
      where : { id: "event-1" },
      data  : { status: ProcessingStatus.REJECTED, deletedAt: expect.any(Date) },
      select: { id: true, status: true, deletedAt: true }
    });
    expect(result).toEqual({
      id       : "event-1",
      status   : ProcessingStatus.REJECTED,
      deletedAt: "2026-03-25T00:00:00.000Z"
    });
  });

  it("returns an already soft-deleted event idempotently", async () => {
    const eventUpdate = vi.fn();
    const service = createDeleteRelationshipEventService({
      $transaction: createTransactionMock({
        relationshipEvent: {
          findUnique: vi.fn().mockResolvedValue({
            id: "event-1", status: ProcessingStatus.REJECTED, deletedAt: new Date("2026-03-24T00:00:00.000Z")
          }),
          update: eventUpdate
        }
      })
    } as never);

    const result = await service.deleteRelationshipEvent("event-1");

    expect(eventUpdate).not.toHaveBeenCalled();
    expect(result.deletedAt).toBe("2026-03-24T00:00:00.000Z");
  });

  it("throws not found when event does not exist", async () => {
    const service = createDeleteRelationshipEventService({
      $transaction: createTransactionMock({
        relationshipEvent: { findUnique: vi.fn().mockResolvedValue(null) }
      })
    } as never);

    await expect(service.deleteRelationshipEvent("event-missing"))
      .rejects.toBeInstanceOf(RelationshipEventNotFoundError);
  });

  it("does not require parent relationship lookup for deletion", async () => {
    const relationshipFindFirst = vi.fn();
    const service = createDeleteRelationshipEventService({
      $transaction: createTransactionMock({
        relationship     : { findFirst: relationshipFindFirst },
        relationshipEvent: {
          findUnique: vi.fn().mockResolvedValue({
            id: "event-1", status: ProcessingStatus.REJECTED, deletedAt: new Date("2026-03-24T00:00:00.000Z")
          })
        }
      })
    } as never);

    await service.deleteRelationshipEvent("event-1");

    expect(relationshipFindFirst).not.toHaveBeenCalled();
  });
});
