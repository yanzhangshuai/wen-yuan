import { ProcessingStatus, RecordSource } from "@/generated/prisma/enums";
import { describe, expect, it, vi } from "vitest";

import { BookNotFoundError } from "@/server/modules/books/errors";
import { createListBookPersonasService } from "@/server/modules/personas/listBookPersonas";

/**
 * 文件定位（人物列表服务单测）：
 * - 验证按书籍维度聚合人物资料（persona + profile）的映射结果。
 * - 该服务是管理端人物列表页与图谱编辑器的共同数据来源之一。
 *
 * 业务关注点：
 * - 需要把跨表字段整合成前端可直接消费的结构，并正确带出来源/状态信息。
 */
describe("listBookPersonas service", () => {
  it("returns mapped personas for a book", async () => {
    // 场景：书籍存在时，列表接口必须返回“业务视图模型”，而非裸 Prisma 结构。
    const findFirst = vi.fn().mockResolvedValue({ id: "book-1" });
    const findMany = vi.fn().mockResolvedValue([
      {
        id           : "profile-1",
        bookId       : "book-1",
        localName    : "周进",
        localSummary : "旧儒生",
        officialTitle: "学道",
        localTags    : ["清苦"],
        ironyIndex   : 3.1,
        persona      : {
          id          : "persona-1",
          name        : "周进",
          aliases     : ["周学道"],
          gender      : "男",
          hometown    : "会稽",
          nameType    : "NAMED",
          globalTags  : ["儒生"],
          confidence  : 1,
          recordSource: RecordSource.MANUAL
        }
      }
    ]);
    const service = createListBookPersonasService({
      book: {
        findFirst
      },
      profile: {
        findMany
      }
    } as never);

    const result = await service.listBookPersonas("book-1");

    expect(findFirst).toHaveBeenCalled();
    expect(findMany).toHaveBeenCalled();
    expect(result).toEqual([
      expect.objectContaining({
        id          : "persona-1",
        profileId   : "profile-1",
        status      : ProcessingStatus.VERIFIED,
        recordSource: RecordSource.MANUAL
      })
    ]);
  });

  it("throws not found when book does not exist", async () => {
    // 场景：书籍已删除或 ID 错误时，需要阻断查询并给上游明确“资源不存在”信号。
    const service = createListBookPersonasService({
      book: {
        findFirst: vi.fn().mockResolvedValue(null)
      }
    } as never);

    await expect(service.listBookPersonas("missing"))
      .rejects.toBeInstanceOf(BookNotFoundError);
  });

  it("returns personas from persona projection when the latest full-book job uses threestage", async () => {
    const service = createListBookPersonasService({
      book       : { findFirst: vi.fn().mockResolvedValue({ id: "book-1" }) },
      analysisJob: {
        findFirst: vi.fn().mockResolvedValue({
          architecture: "threestage",
          scope       : "FULL_BOOK"
        })
      },
      persona: {
        findMany: vi.fn().mockResolvedValue([
          {
            id                     : "persona-1",
            name                   : "鲍廷玺",
            aliases                : [],
            gender                 : null,
            hometown               : null,
            nameType               : "NAMED",
            globalTags             : [],
            confidence             : 0.88,
            recordSource           : "AI",
            status                 : "CONFIRMED",
            mentionCount           : 3,
            effectiveBiographyCount: 1,
            distinctChapters       : 2
          }
        ])
      },
      profile: {
        findMany: vi.fn().mockResolvedValue([])
      }
    } as never);

    const result = await service.listBookPersonas("book-1");

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("persona-1");
    expect(result[0]?.profileId).toBeNull();
  });
});
