import { NameType, ProcessingStatus, RecordSource } from "@/generated/prisma/enums";
import { describe, expect, it, vi } from "vitest";

import { BookNotFoundError } from "@/server/modules/books/errors";
import { createCreateBookPersonaService } from "@/server/modules/personas/createBookPersona";

/**
 * 文件定位（人物创建服务单测）：
 * - 覆盖“在指定书籍下新增人物”流程，验证 persona 与 profile 在同一事务内创建。
 * - 该能力对应管理端人工补录场景，直接影响图谱节点可见性与后续关系录入。
 *
 * 业务规则：
 * - 人工创建默认 `recordSource=MANUAL` 且直接 `VERIFIED`，这是业务规则，不是技术限制。
 */
describe("createBookPersona service", () => {
  it("creates manual persona and profile in one transaction", async () => {
    // 场景：创建动作必须原子化，避免出现“persona 已创建但 profile 缺失”的半成功脏数据。
    const bookFindFirst = vi.fn().mockResolvedValue({ id: "book-1" });
    const personaCreate = vi.fn().mockResolvedValue({
      id          : "persona-1",
      name        : "周进",
      aliases     : ["周学道"],
      gender      : "男",
      hometown    : "会稽",
      nameType    : NameType.NAMED,
      globalTags  : ["儒生"],
      confidence  : 1,
      recordSource: RecordSource.MANUAL
    });
    const chapterFindFirst = vi.fn().mockResolvedValue({
      id   : "chapter-1",
      no   : 2,
      title: "王孝廉村学识同科"
    });
    const profileCreate = vi.fn().mockResolvedValue({
      id                      : "profile-1",
      localName               : "周进",
      localSummary            : null,
      officialTitle           : null,
      firstAppearanceChapterId: "chapter-1",
      localTags               : ["清苦"],
      ironyIndex              : 0
    });
    const transaction = vi.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      book: {
        findFirst: bookFindFirst
      },
      persona: {
        create: personaCreate
      },
      chapter: {
        findFirst: chapterFindFirst
      },
      profile: {
        create: profileCreate
      }
    }));
    const service = createCreateBookPersonaService({
      $transaction: transaction
    } as never);

    const result = await service.createBookPersona("book-1", {
      name                    : " 周进 ",
      aliases                 : ["周学道", " 周学道 "],
      localTags               : ["清苦"],
      firstAppearanceChapterId: "chapter-1"
    });

    expect(personaCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        name        : "周进",
        aliases     : ["周学道"],
        recordSource: RecordSource.MANUAL
      })
    }));
    expect(profileCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        bookId                  : "book-1",
        localName               : "周进",
        firstAppearanceChapterId: "chapter-1"
      })
    }));
    expect(result).toEqual(expect.objectContaining({
      id                         : "persona-1",
      profileId                  : "profile-1",
      firstAppearanceChapterId   : "chapter-1",
      firstAppearanceChapterNo   : 2,
      firstAppearanceChapterTitle: "王孝廉村学识同科",
      recordSource               : RecordSource.MANUAL,
      status                     : ProcessingStatus.VERIFIED
    }));
  });

  it("throws not found when book does not exist", async () => {
    // 边界：bookId 非法/已删除时，不允许继续创建人物，防止孤儿 profile 出现。
    const transaction = vi.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      book: {
        findFirst: vi.fn().mockResolvedValue(null)
      }
    }));
    const service = createCreateBookPersonaService({
      $transaction: transaction
    } as never);

    await expect(service.createBookPersona("missing", {
      name: "周进"
    })).rejects.toBeInstanceOf(BookNotFoundError);
  });
});
