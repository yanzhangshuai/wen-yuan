import { describe, expect, it, vi } from "vitest";

import { ProcessingStatus } from "@/generated/prisma/enums";
import { createDeleteBiographyRecordService } from "@/server/modules/biography/deleteBiographyRecord";
import { BiographyRecordNotFoundError } from "@/server/modules/biography/errors";

describe("deleteBiographyRecord service", () => {
  it("soft deletes biography as rejected", async () => {
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
});
