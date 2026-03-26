import { ProcessingStatus } from "@/generated/prisma/enums";
import { describe, expect, it, vi } from "vitest";

import {
  BulkReviewInputError,
  createBulkReviewService
} from "@/server/modules/review/bulkReview";

describe("bulk review service", () => {
  it("throws input error when ids are empty", async () => {
    const service = createBulkReviewService({
      $transaction: vi.fn()
    } as never);

    await expect(service.bulkVerifyDrafts([])).rejects.toBeInstanceOf(BulkReviewInputError);
  });

  it("bulk verifies relationship and biography drafts", async () => {
    const relationshipUpdateMany = vi.fn().mockResolvedValue({ count: 2 });
    const biographyUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const transaction = vi.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      relationship: {
        updateMany: relationshipUpdateMany
      },
      biographyRecord: {
        updateMany: biographyUpdateMany
      }
    }));
    const service = createBulkReviewService({
      $transaction: transaction
    } as never);

    const result = await service.bulkVerifyDrafts([
      " draft-1 ",
      "draft-2",
      "draft-1"
    ]);

    expect(result).toEqual({
      ids                 : ["draft-1", "draft-2"],
      status              : ProcessingStatus.VERIFIED,
      relationshipCount   : 2,
      biographyRecordCount: 1,
      totalCount          : 3
    });
    expect(relationshipUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id       : { in: ["draft-1", "draft-2"] },
        status   : ProcessingStatus.DRAFT,
        deletedAt: null
      },
      data: {
        status: ProcessingStatus.VERIFIED
      }
    }));
    expect(biographyUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id       : { in: ["draft-1", "draft-2"] },
        status   : ProcessingStatus.DRAFT,
        deletedAt: null
      },
      data: {
        status: ProcessingStatus.VERIFIED
      }
    }));
  });

  it("bulk rejects relationship and biography drafts", async () => {
    const relationshipUpdateMany = vi.fn().mockResolvedValue({ count: 3 });
    const biographyUpdateMany = vi.fn().mockResolvedValue({ count: 2 });
    const transaction = vi.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      relationship: {
        updateMany: relationshipUpdateMany
      },
      biographyRecord: {
        updateMany: biographyUpdateMany
      }
    }));
    const service = createBulkReviewService({
      $transaction: transaction
    } as never);

    const result = await service.bulkRejectDrafts(["draft-3"]);

    expect(result).toEqual({
      ids                 : ["draft-3"],
      status              : ProcessingStatus.REJECTED,
      relationshipCount   : 3,
      biographyRecordCount: 2,
      totalCount          : 5
    });
    expect(relationshipUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { status: ProcessingStatus.REJECTED }
    }));
    expect(biographyUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { status: ProcessingStatus.REJECTED }
    }));
  });
});
