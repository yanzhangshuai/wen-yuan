import { ProcessingStatus } from "@/generated/prisma/enums";
import { describe, expect, it, vi } from "vitest";

import {
  BulkDraftStatusInputError,
  createBulkDraftStatusService
} from "@/server/modules/roleWorkbench/bulkReview";

/**
 * 文件定位（批量审校服务单测）：
 * - 覆盖管理端“批量通过/批量驳回”草稿的核心服务逻辑。
 * - 该能力会跨 `relationship` 与 `biographyRecord` 两类草稿表批量更新状态。
 *
 * 业务规则：
 * - 输入 ID 需要去空格、去重后再执行批处理，避免重复统计或重复更新。
 */
describe("bulk draft status service", () => {
  it("throws input error when ids are empty", async () => {
    // 防御分支：空 ID 集合不允许提交，这是业务规则，不是技术限制。
    const service = createBulkDraftStatusService({
      $transaction: vi.fn()
    } as never);

    await expect(service.bulkVerifyDrafts([])).rejects.toBeInstanceOf(BulkDraftStatusInputError);
  });

  it("bulk verifies relationship and biography drafts", async () => {
    // 成功分支：批量“通过”应统一写入 VERIFIED，并返回分表计数与总计，供后台结果提示使用。
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
    const service = createBulkDraftStatusService({
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
    // 成功分支：批量“驳回”与批量“通过”共享数据范围，但写入目标状态不同。
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
    const service = createBulkDraftStatusService({
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
