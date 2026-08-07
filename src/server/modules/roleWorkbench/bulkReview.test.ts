import { ProcessingStatus } from "@/generated/prisma/enums";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  BulkDraftStatusInputError,
  createBulkDraftStatusService
} from "@/server/modules/roleWorkbench/bulkReview";

// mock 关系物化表重建函数：facts 状态变更后事务内调用，测试只关心是否被触发。
const hoisted = vi.hoisted(() => ({
  refreshRelationshipsForBook: vi.fn()
}));

vi.mock("@/server/modules/extraction/aggregator", () => ({
  refreshRelationshipsForBook: hoisted.refreshRelationshipsForBook
}));

/**
 * 文件定位（批量审校服务单测）：
 * - 覆盖管理端“批量通过/批量驳回”草稿的核心服务逻辑。
 * - 该能力会跨 `relationship` 与 `fact`（BIOGRAPHY）两类草稿表批量更新状态，
 *   并在事务内重建关系物化表。
 *
 * 业务规则：
 * - 输入 ID 需要去空格、去重后再执行批处理，避免重复统计或重复更新。
 */
describe("bulk draft status service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws input error when ids are empty", async () => {
    // 防御分支：空 ID 集合不允许提交，这是业务规则，不是技术限制。
    const service = createBulkDraftStatusService({
      $transaction: vi.fn()
    } as never);

    await expect(service.bulkVerifyDrafts([])).rejects.toBeInstanceOf(BulkDraftStatusInputError);
  });

  it("bulk verifies relationship and biography facts", async () => {
    // 成功分支：批量“通过”应统一写入 VERIFIED，并返回分表计数与总计，供后台结果提示使用。
    const relationshipUpdateMany = vi.fn().mockResolvedValue({ count: 2 });
    const factUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const factFindMany = vi.fn().mockResolvedValue([{ bookId: "book-1" }]);
    const transaction = vi.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      relationship: {
        updateMany: relationshipUpdateMany
      },
      fact: {
        updateMany: factUpdateMany,
        findMany  : factFindMany
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
      ids              : ["draft-1", "draft-2"],
      status           : ProcessingStatus.VERIFIED,
      relationshipCount: 2,
      factCount        : 1,
      totalCount       : 3
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
    expect(factUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id       : { in: ["draft-1", "draft-2"] },
        factType : "BIOGRAPHY",
        status   : ProcessingStatus.DRAFT,
        deletedAt: null
      },
      data: {
        status: ProcessingStatus.VERIFIED
      }
    }));
    // 事务内重建关系物化表：只对受影响事实所在书籍触发一次。
    expect(factFindMany).toHaveBeenCalledTimes(1);
    expect(hoisted.refreshRelationshipsForBook).toHaveBeenCalledWith("book-1", expect.anything());
  });

  it("bulk rejects relationship and biography facts", async () => {
    // 成功分支：批量“驳回”与批量“通过”共享数据范围，但写入目标状态不同。
    const relationshipUpdateMany = vi.fn().mockResolvedValue({ count: 3 });
    const factUpdateMany = vi.fn().mockResolvedValue({ count: 2 });
    const transaction = vi.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      relationship: {
        updateMany: relationshipUpdateMany
      },
      fact: {
        updateMany: factUpdateMany,
        findMany  : vi.fn().mockResolvedValue([])
      }
    }));
    const service = createBulkDraftStatusService({
      $transaction: transaction
    } as never);

    const result = await service.bulkRejectDrafts(["draft-3"]);

    expect(result).toEqual({
      ids              : ["draft-3"],
      status           : ProcessingStatus.REJECTED,
      relationshipCount: 3,
      factCount        : 2,
      totalCount       : 5
    });
    expect(relationshipUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { status: ProcessingStatus.REJECTED }
    }));
    expect(factUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { status: ProcessingStatus.REJECTED }
    }));
    // 没有命中 BIOGRAPHY 事实时，不触发关系重建。
    expect(hoisted.refreshRelationshipsForBook).not.toHaveBeenCalled();
  });
});
