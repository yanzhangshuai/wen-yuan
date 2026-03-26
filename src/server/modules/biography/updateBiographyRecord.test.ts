import { describe, expect, it, vi } from "vitest";

import { BioCategory, ProcessingStatus } from "@/generated/prisma/enums";
import { createUpdateBiographyRecordService } from "@/server/modules/biography/updateBiographyRecord";
import {
  BiographyInputError,
  BiographyRecordNotFoundError
} from "@/server/modules/biography/errors";

describe("updateBiographyRecord service", () => {
  it("updates biography fields and chapter number", async () => {
    const biographyFindFirst = vi.fn().mockResolvedValue({ id: "bio-1" });
    const chapterFindFirst = vi.fn().mockResolvedValue({ id: "chapter-2", no: 12 });
    const biographyUpdate = vi.fn().mockResolvedValue({
      id         : "bio-1",
      personaId  : "persona-1",
      chapterId  : "chapter-2",
      chapterNo  : 12,
      category   : BioCategory.EVENT,
      title      : "再度失意",
      location   : "会稽",
      event      : "落第",
      virtualYear: null,
      status     : ProcessingStatus.VERIFIED,
      updatedAt  : new Date("2026-03-25T00:00:00.000Z")
    });
    const transaction = vi.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      biographyRecord: {
        findFirst: biographyFindFirst,
        update   : biographyUpdate
      },
      chapter: {
        findFirst: chapterFindFirst
      }
    }));
    const service = createUpdateBiographyRecordService({
      $transaction: transaction
    } as never);

    const result = await service.updateBiographyRecord("bio-1", {
      chapterId: "chapter-2",
      event    : "落第",
      status   : ProcessingStatus.VERIFIED
    });

    expect(biographyUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        chapterId: "chapter-2",
        chapterNo: 12,
        event    : "落第",
        status   : ProcessingStatus.VERIFIED
      })
    }));
    expect(result).toEqual(expect.objectContaining({
      id       : "bio-1",
      chapterId: "chapter-2",
      chapterNo: 12,
      event    : "落第",
      status   : ProcessingStatus.VERIFIED,
      updatedAt: "2026-03-25T00:00:00.000Z"
    }));
  });

  it("throws input error when fields are empty", async () => {
    const service = createUpdateBiographyRecordService({
      $transaction: vi.fn()
    } as never);

    await expect(service.updateBiographyRecord("bio-1", {}))
      .rejects.toBeInstanceOf(BiographyInputError);
  });

  it("throws not found when biography does not exist", async () => {
    const transaction = vi.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      biographyRecord: {
        findFirst: vi.fn().mockResolvedValue(null)
      }
    }));
    const service = createUpdateBiographyRecordService({
      $transaction: transaction
    } as never);

    await expect(service.updateBiographyRecord("missing", { event: "更新" }))
      .rejects.toBeInstanceOf(BiographyRecordNotFoundError);
  });
});
