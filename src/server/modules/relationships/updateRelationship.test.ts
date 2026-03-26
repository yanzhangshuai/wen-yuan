import { describe, expect, it, vi } from "vitest";

import { ProcessingStatus } from "@/generated/prisma/enums";
import { createUpdateRelationshipService } from "@/server/modules/relationships/updateRelationship";
import {
  RelationshipInputError,
  RelationshipNotFoundError
} from "@/server/modules/relationships/errors";

describe("updateRelationship service", () => {
  it("updates relationship fields", async () => {
    const relationshipFindFirst = vi.fn().mockResolvedValue({ id: "rel-1" });
    const relationshipUpdate = vi.fn().mockResolvedValue({
      id         : "rel-1",
      chapterId  : "chapter-1",
      sourceId   : "persona-a",
      targetId   : "persona-b",
      type       : "同盟",
      weight     : 1.5,
      description: "更新背景",
      evidence   : "更新证据",
      confidence : 0.88,
      status     : ProcessingStatus.VERIFIED,
      updatedAt  : new Date("2026-03-25T00:00:00.000Z")
    });
    const transaction = vi.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      relationship: {
        findFirst: relationshipFindFirst,
        update   : relationshipUpdate
      }
    }));

    const service = createUpdateRelationshipService({
      $transaction: transaction
    } as never);

    const result = await service.updateRelationship("rel-1", {
      type      : " 同盟 ",
      weight    : 1.5,
      status    : ProcessingStatus.VERIFIED,
      confidence: 0.88
    });

    expect(relationshipUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        type      : "同盟",
        weight    : 1.5,
        status    : ProcessingStatus.VERIFIED,
        confidence: 0.88
      })
    }));
    expect(result).toEqual(expect.objectContaining({
      id       : "rel-1",
      type     : "同盟",
      status   : ProcessingStatus.VERIFIED,
      updatedAt: "2026-03-25T00:00:00.000Z"
    }));
  });

  it("throws input error when no update field provided", async () => {
    const service = createUpdateRelationshipService({
      $transaction: vi.fn()
    } as never);

    await expect(service.updateRelationship("rel-1", {}))
      .rejects.toBeInstanceOf(RelationshipInputError);
  });

  it("throws not found when relationship does not exist", async () => {
    const transaction = vi.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      relationship: {
        findFirst: vi.fn().mockResolvedValue(null)
      }
    }));
    const service = createUpdateRelationshipService({
      $transaction: transaction
    } as never);

    await expect(service.updateRelationship("rel-missing", { type: "同盟" }))
      .rejects.toBeInstanceOf(RelationshipNotFoundError);
  });
});
