import { describe, expect, it, vi } from "vitest";

import { ProcessingStatus } from "@/generated/prisma/enums";
import { createDeleteBiographyRecordService } from "@/server/modules/biography/deleteBiographyRecord";
import { BiographyRecordNotFoundError } from "@/server/modules/biography/errors";

/**
 * 文件定位（服务层单测）：
 * - 覆盖人物生平记录删除逻辑，删除策略为“软删除 + 状态置为 REJECTED”，而非物理删除。
 * - 不直接依赖 Next.js 路由，但会被 `app/api/.../route.ts` 调用，是接口层下游核心能力。
 *
 * 业务规则（非技术限制）：
 * - 审校场景需要保留历史痕迹，因此删除后仍需保留记录并标记驳回状态。
 */
describe("deleteBiographyRecord service", () => {
  it("soft deletes biography as rejected", async () => {
    // 场景：管理员删除草稿时，必须留下可追溯状态，供后续审计与复核。
    const biographyFindFirst = vi.fn().mockResolvedValue({ id: "bio-1" });
    const biographyUpdate = vi.fn().mockResolvedValue({
      id       : "bio-1",
      status   : ProcessingStatus.REJECTED,
      deletedAt: new Date("2026-03-25T00:00:00.000Z")
    });
    const transaction = vi.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      biographyRecord: {
        findFirst: biographyFindFirst,
        update   : biographyUpdate
      }
    }));
    const service = createDeleteBiographyRecordService({
      $transaction: transaction
    } as never);

    const result = await service.deleteBiographyRecord("bio-1");

    expect(biographyUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status   : ProcessingStatus.REJECTED,
        deletedAt: expect.any(Date)
      })
    }));
    expect(result).toEqual({
      id       : "bio-1",
      status   : ProcessingStatus.REJECTED,
      deletedAt: "2026-03-25T00:00:00.000Z"
    });
  });

  it("throws not found when biography does not exist", async () => {
    // 防御目的：对不存在 ID 明确返回领域错误，避免“静默成功”误导上游页面。
    const transaction = vi.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      biographyRecord: {
        findFirst: vi.fn().mockResolvedValue(null)
      }
    }));
    const service = createDeleteBiographyRecordService({
      $transaction: transaction
    } as never);

    await expect(service.deleteBiographyRecord("missing"))
      .rejects.toBeInstanceOf(BiographyRecordNotFoundError);
  });

  it("falls back to transaction timestamp when prisma result lacks deletedAt", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-26T00:00:00.000Z"));

    try {
      const transaction = vi.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
        biographyRecord: {
          findFirst: vi.fn().mockResolvedValue({ id: "bio-2" }),
          update   : vi.fn().mockResolvedValue({
            id       : "bio-2",
            status   : ProcessingStatus.REJECTED,
            deletedAt: null
          })
        }
      }));
      const service = createDeleteBiographyRecordService({
        $transaction: transaction
      } as never);

      await expect(service.deleteBiographyRecord("bio-2")).resolves.toEqual({
        id       : "bio-2",
        status   : ProcessingStatus.REJECTED,
        deletedAt: "2026-03-26T00:00:00.000Z"
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
