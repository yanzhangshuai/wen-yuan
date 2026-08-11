import { describe, expect, it, vi } from "vitest";

import { ProcessingStatus, RecordSource } from "@/generated/prisma/enums";
import { BookNotFoundError } from "@/server/modules/books/errors";
import { createGetPersonaDetailService, PersonaNotFoundError } from "@/server/modules/graph/getPersonaDetail";

/**
 * 文件定位（人物详情服务单测）：
 * - 验证 `getPersonaDetail` 将实体主档、书级档案、直接关系、生平时间轴、出场统计
 *   聚合为图谱面板可直接渲染的 DTO。
 * - 关注字段口径与图谱快照一致（状态推导、关系码→展示名）。
 */
describe("getPersonaDetail service", () => {
  const baseMock = {
    book: {
      findFirst: vi.fn().mockResolvedValue({ id: "book-1" })
    },
    entity: {
      findFirst: vi.fn().mockResolvedValue({
        id          : "persona-1",
        name        : "周进",
        nameType    : "NAMED",
        entityType  : "PERSON",
        recordSource: RecordSource.AI,
        confidence  : 0.9,
        gender      : "男",
        hometown    : "山东兖州",
        globalTags  : ["寒士"],
        aliases     : ["周老师"],
        summary     : "科举失意多年后中举的老学究。"
      })
    },
    entityProfile: {
      findFirst: vi.fn().mockResolvedValue({
        localName             : "周老师",
        localSummary          : "屡试不第，最终中举。",
        officialTitle         : null,
        localTags             : ["迂腐", "老学究"],
        ironyIndex            : 6,
        status                : ProcessingStatus.VERIFIED,
        firstAppearanceChapter: { no: 2 }
      })
    },
    relationship: {
      findMany: vi.fn().mockResolvedValue([
        {
          id                  : "rel-1",
          sourceEntityId      : "persona-1",
          targetEntityId      : "persona-2",
          relationshipTypeCode: "师生",
          factCount           : 3,
          status              : ProcessingStatus.DRAFT,
          firstChapterNo      : 3,
          latestChapterNo     : 8,
          source              : { id: "persona-1", name: "周进" },
          target              : { id: "persona-2", name: "范进" }
        }
      ])
    },
    fact: {
      findMany: vi.fn().mockResolvedValue([
        {
          id           : "fact-1",
          chapterId    : "chapter-1",
          chapterNo    : 2,
          eventCategory: "EXAM",
          virtualYear  : "甲午年",
          payload      : {
            title   : "进学",
            location: "济南",
            event   : "周进进学，众人贺喜。",
            tags    : ["科举"]
          },
          recordSource: RecordSource.DRAFT_AI,
          status      : ProcessingStatus.DRAFT
        }
      ])
    },
    mention: {
      count: vi.fn().mockResolvedValue(12)
    },
    skill: {
      findMany: vi.fn().mockResolvedValue([])
    }
  };

  it("aggregates persona detail across entity/profile/relationship/fact", async () => {
    const service = createGetPersonaDetailService(baseMock as never);

    const result = await service.getPersonaDetail({
      bookId   : "book-1",
      personaId: "persona-1"
    });

    // 主档字段透传。
    expect(result).toMatchObject({
      id        : "persona-1",
      name      : "周进",
      nameType  : "NAMED",
      entityType: "PERSON",
      status    : ProcessingStatus.DRAFT,
      confidence: 0.9,
      gender    : "男",
      hometown  : "山东兖州",
      aliases   : ["周老师"],
      globalTags: ["寒士"],
      summary   : "科举失意多年后中举的老学究。"
    });

    // 书级档案 + 首次出场章节。
    expect(result.profile).toEqual({
      localName               : "周老师",
      localSummary            : "屡试不第，最终中举。",
      officialTitle           : null,
      localTags               : ["迂腐", "老学究"],
      ironyIndex              : 6,
      status                  : ProcessingStatus.VERIFIED,
      firstAppearanceChapterNo: 2
    });

    // 直接关系：关系对象 = 另一端，类型码映射展示名。
    expect(result.relationships).toEqual([
      {
        id             : "rel-1",
        counterpartId  : "persona-2",
        counterpartName: "范进",
        type           : "师生",
        factCount      : 3,
        status         : ProcessingStatus.DRAFT,
        firstChapterNo : 3,
        latestChapterNo: 8
      }
    ]);

    // 时间轴：payload 拆解为平铺字段。
    expect(result.timeline).toEqual([
      {
        id          : "fact-1",
        chapterId   : "chapter-1",
        chapterNo   : 2,
        category    : "EXAM",
        title       : "进学",
        location    : "济南",
        event       : "周进进学，众人贺喜。",
        virtualYear : "甲午年",
        tags        : ["科举"],
        recordSource: RecordSource.DRAFT_AI,
        status      : ProcessingStatus.DRAFT
      }
    ]);

    expect(result.appearanceCount).toBe(12);
    expect(result.firstAppearanceChapterNo).toBe(2);
  });

  it("throws BookNotFoundError when book does not exist", async () => {
    const service = createGetPersonaDetailService({
      book: { findFirst: vi.fn().mockResolvedValue(null) }
    } as never);

    await expect(service.getPersonaDetail({
      bookId   : "missing-book",
      personaId: "persona-1"
    })).rejects.toBeInstanceOf(BookNotFoundError);
  });

  it("throws PersonaNotFoundError when persona does not exist", async () => {
    const service = createGetPersonaDetailService({
      ...baseMock,
      entity: { findFirst: vi.fn().mockResolvedValue(null) }
    } as never);

    await expect(service.getPersonaDetail({
      bookId   : "book-1",
      personaId: "ghost"
    })).rejects.toBeInstanceOf(PersonaNotFoundError);
  });

  it("handles missing profile and empty relationships gracefully", async () => {
    const service = createGetPersonaDetailService({
      ...baseMock,
      entityProfile: { findFirst: vi.fn().mockResolvedValue(null) },
      relationship : { findMany: vi.fn().mockResolvedValue([]) },
      fact         : { findMany: vi.fn().mockResolvedValue([]) }
    } as never);

    const result = await service.getPersonaDetail({
      bookId   : "book-1",
      personaId: "persona-1"
    });

    expect(result.profile).toBeNull();
    expect(result.relationships).toEqual([]);
    expect(result.timeline).toEqual([]);
    expect(result.firstAppearanceChapterNo).toBeNull();
  });

  it("excludes REJECTED timeline events at the query level", async () => {
    const factFindMany = vi.fn().mockResolvedValue([]);
    const service = createGetPersonaDetailService({
      ...baseMock,
      fact: { findMany: factFindMany }
    } as never);

    await service.getPersonaDetail({
      bookId   : "book-1",
      personaId: "persona-1"
    });

    // REJECTED 事实在查询条件里排除，而不是服务层 JS 过滤（口径与审核流程一致）。
    expect(factFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: { not: ProcessingStatus.REJECTED }
      })
    }));
  });

  it("reads v7 BIOGRAPHY payload.summary as event content", async () => {
    // v7/v5 管线把传记正文写入 payload.summary（历史 v4 用 payload.event），两者都应可读。
    const service = createGetPersonaDetailService({
      ...baseMock,
      fact: {
        findMany: vi.fn().mockResolvedValue([
          {
            id           : "fact-v7",
            chapterId    : "chapter-31",
            chapterNo    : 31,
            eventCategory: "SOCIAL",
            virtualYear  : null,
            payload      : {
              summary : "杜少卿托病辞官，不愿进京任职。",
              location: "南京"
            },
            recordSource: RecordSource.DRAFT_AI,
            status      : ProcessingStatus.DRAFT
          }
        ])
      }
    } as never);

    const result = await service.getPersonaDetail({
      bookId   : "book-1",
      personaId: "persona-1"
    });

    expect(result.timeline[0]).toMatchObject({
      chapterNo: 31,
      category : "SOCIAL",
      location : "南京",
      event    : "杜少卿托病辞官，不愿进京任职。"
    });
  });
});
