import { describe, expect, it, vi } from "vitest";

import { BioCategory, ProcessingStatus, RecordSource } from "@/generated/prisma/enums";
import { createCreatePersonaBiographyService } from "@/server/modules/biography/createPersonaBiography";
import { BiographyInputError } from "@/server/modules/biography/errors";
import { PersonaNotFoundError } from "@/server/modules/personas/errors";

/**
 * 文件定位（人物生平创建服务单测）：
 * - 覆盖为指定人物新增生平记录的服务逻辑，包含人物存在性、章节有效性与默认状态规则。
 * - 管理端审校人员人工补录生平时会调用该能力。
 *
 * 业务规则：
 * - 人工录入默认 `recordSource=MANUAL` 且 `status=VERIFIED`，以区别 AI 草稿待审状态。
 */
describe("createPersonaBiography service", () => {
  it("creates manual biography record as verified", async () => {
    // 成功场景：服务需要同时读取 persona + chapter，并把 chapter.no 回填为 chapterNo 供时间线排序。
    const personaFindFirst = vi.fn().mockResolvedValue({ id: "persona-1" });
    const chapterFindFirst = vi.fn().mockResolvedValue({ id: "chapter-1", no: 8 });
    const biographyCreate = vi.fn().mockResolvedValue({
      id          : "bio-1",
      personaId   : "persona-1",
      chapterId   : "chapter-1",
      chapterNo   : 8,
      category    : BioCategory.CAREER,
      title       : "山东学道",
      location    : "山东",
      event       : "授职",
      virtualYear : null,
      recordSource: RecordSource.MANUAL,
      status      : ProcessingStatus.VERIFIED,
      createdAt   : new Date("2026-03-25T00:00:00.000Z")
    });
    const transaction = vi.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      persona: {
        findFirst: personaFindFirst
      },
      chapter: {
        findFirst: chapterFindFirst
      },
      biographyRecord: {
        create: biographyCreate
      }
    }));
    const service = createCreatePersonaBiographyService({
      $transaction: transaction
    } as never);

    const result = await service.createPersonaBiography("persona-1", {
      chapterId: "chapter-1",
      category : BioCategory.CAREER,
      title    : "山东学道",
      location : "山东",
      event    : "授职"
    });

    expect(biographyCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        recordSource: RecordSource.MANUAL,
        status      : ProcessingStatus.VERIFIED
      })
    }));
    expect(result).toEqual({
      id          : "bio-1",
      personaId   : "persona-1",
      chapterId   : "chapter-1",
      chapterNo   : 8,
      category    : BioCategory.CAREER,
      title       : "山东学道",
      location    : "山东",
      event       : "授职",
      virtualYear : null,
      recordSource: RecordSource.MANUAL,
      status      : ProcessingStatus.VERIFIED,
      createdAt   : "2026-03-25T00:00:00.000Z"
    });
  });

  it("throws persona not found when persona is missing", async () => {
    // 前置校验：人物不存在时不允许创建生平，防止出现孤儿 biography 记录。
    const transaction = vi.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      persona: {
        findFirst: vi.fn().mockResolvedValue(null)
      }
    }));
    const service = createCreatePersonaBiographyService({
      $transaction: transaction
    } as never);

    await expect(service.createPersonaBiography("missing", {
      chapterId: "chapter-1",
      event    : "出场"
    })).rejects.toBeInstanceOf(PersonaNotFoundError);
  });

  it("throws input error when chapter is missing", async () => {
    // 输入防御：chapterId 无效时抛输入错误，提示调用方先修复章节关联。
    const transaction = vi.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      persona: {
        findFirst: vi.fn().mockResolvedValue({ id: "persona-1" })
      },
      chapter: {
        findFirst: vi.fn().mockResolvedValue(null)
      }
    }));
    const service = createCreatePersonaBiographyService({
      $transaction: transaction
    } as never);

    await expect(service.createPersonaBiography("persona-1", {
      chapterId: "missing-chapter",
      event    : "出场"
    })).rejects.toBeInstanceOf(BiographyInputError);
  });
});
