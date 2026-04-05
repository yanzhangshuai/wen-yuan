import { describe, expect, it, vi } from "vitest";

import { BioCategory, ProcessingStatus } from "@/generated/prisma/enums";
import { createUpdateBiographyRecordService } from "@/server/modules/biography/updateBiographyRecord";
import {
  BiographyInputError,
  BiographyRecordNotFoundError
} from "@/server/modules/biography/errors";

/**
 * 文件定位（生平记录更新服务单测）：
 * - 验证生平草稿编辑逻辑，包括 chapter 切换时章节序号联动更新、空更新防御、不存在记录防御。
 * - 服务层结果会被管理端审校界面直接消费，字段准确性决定时间线展示是否正确。
 */
describe("updateBiographyRecord service", () => {
  it("updates biography fields and chapter number", async () => {
    // 业务要点：当 chapterId 变化时，chapterNo 必须同步更新，否则时间线排序会错乱。
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
    // 防御规则：禁止空 patch，避免无意义更新触发审计噪声和并发写冲突。
    const service = createUpdateBiographyRecordService({
      $transaction: vi.fn()
    } as never);

    await expect(service.updateBiographyRecord("bio-1", {}))
      .rejects.toBeInstanceOf(BiographyInputError);
  });

  it("throws not found when biography does not exist", async () => {
    // 边界条件：记录不存在时必须抛领域错误，保证上游接口能返回明确 404 语义。
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
