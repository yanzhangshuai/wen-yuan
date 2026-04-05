import { describe, expect, it, vi } from "vitest";

import { ProcessingStatus } from "@/generated/prisma/enums";
import { createDeleteRelationshipService } from "@/server/modules/relationships/deleteRelationship";
import { RelationshipNotFoundError } from "@/server/modules/relationships/errors";

/**
 * 文件定位（关系服务单测）：
 * - 验证人物关系删除采用软删除语义，确保图谱关系可审计、可追踪。
 * - 作为服务层契约测试，保障接口层调用 `deleteRelationship` 时返回稳定行为。
 */
describe("deleteRelationship service", () => {
  it("soft deletes relationship and marks as rejected", async () => {
    // 业务语义：删除关系并不意味着彻底丢弃数据，而是转为 REJECTED，避免误删后无恢复线索。
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
    // 防御场景：前端传入过期/错误关系 ID 时，服务应快速失败并让上层返回 404 类语义。
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
