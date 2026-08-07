/**
 * 文件定位（服务模块单测）：
 * - 覆盖领域服务输入校验、分支处理与输出映射契约。
 * - 该层通常是 API Route 的核心下游，承担业务规则落地职责。
 *
 * 业务职责：
 * - 保证成功路径与异常路径都可预测。
 * - 降低重构时误改核心规则的风险。
 */

import { describe, expect, it, vi } from "vitest";

import { RecordSource } from "@/generated/prisma/enums";
import { createListDraftsService } from "@/server/modules/roleWorkbench/listDrafts";

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("list drafts service", () => {
  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("lists relationship drafts with summary counts", async () => {
    const personaCount = vi.fn().mockResolvedValue(1);
    const relationshipCount = vi.fn().mockResolvedValue(2);
    const factCount = vi.fn().mockResolvedValue(3);
    const relationshipFindMany = vi.fn().mockResolvedValue([
      {
        id                  : "rel-1",
        bookId              : "book-1",
        relationshipTypeCode: "师生",
        firstChapterId      : "chapter-1",
        firstChapterNo      : 1,
        weight              : 2,
        book                : { title: "儒林外史" },
        source              : { id: "p-1", name: "周进" },
        target              : { id: "p-2", name: "范进" }
      }
    ]);
    const service = createListDraftsService({
      entityProfile: {
        count   : personaCount,
        findMany: vi.fn()
      },
      relationship: {
        count   : relationshipCount,
        findMany: relationshipFindMany
      },
      fact: {
        count   : factCount,
        findMany: vi.fn()
      }
    } as never);

    const result = await service.listAdminDrafts({
      tab   : "RELATIONSHIP",
      source: RecordSource.AI
    });

    expect(result.summary).toEqual({
      persona     : 1,
      relationship: 2,
      biography   : 3,
      total       : 6
    });
    expect(result.personas).toEqual([]);
    expect(result.biographyRecords).toEqual([]);
    expect(result.relationships).toHaveLength(1);
    expect(result.relationships[0]).toEqual(expect.objectContaining({
      id        : "rel-1",
      sourceName: "周进",
      targetName: "范进",
      status    : "DRAFT"
    }));
    expect(relationshipFindMany).toHaveBeenCalledTimes(1);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("lists all draft tabs when tab filter is absent", async () => {
    const service = createListDraftsService({
      entityProfile: {
        count   : vi.fn().mockResolvedValue(1),
        findMany: vi.fn().mockResolvedValue([
          {
            id    : "profile-1",
            bookId: "book-1",
            book  : { title: "儒林外史" },
            entity: {
              id          : "persona-1",
              name        : "周进",
              aliases     : ["周学道"],
              nameType    : "NAMED",
              recordSource: RecordSource.AI,
              confidence  : 0.9,
              hometown    : "会稽"
            }
          }
        ])
      },
      relationship: {
        count   : vi.fn().mockResolvedValue(0),
        findMany: vi.fn().mockResolvedValue([])
      },
      fact: {
        count   : vi.fn().mockResolvedValue(1),
        findMany: vi.fn().mockResolvedValue([
          {
            id           : "bio-1",
            chapterId    : "chapter-1",
            chapterNo    : 1,
            eventCategory: "EVENT",
            payload      : {
              event   : "出场",
              title   : null,
              location: null
            },
            recordSource: RecordSource.AI,
            chapter     : {
              bookId: "book-1",
              book  : { title: "儒林外史" }
            },
            sourceEntity: {
              id  : "persona-1",
              name: "周进"
            }
          }
        ])
      }
    } as never);

    const result = await service.listAdminDrafts({
      bookId: "7e0f93a6-8ecf-4e8f-ac43-f0cd626f44e7"
    });

    expect(result.summary.total).toBe(2);
    expect(result.personas).toHaveLength(1);
    expect(result.personas[0]).toEqual(expect.objectContaining({
      personaId: "persona-1",
      name     : "周进"
    }));
    expect(result.biographyRecords).toHaveLength(1);
    expect(result.biographyRecords[0]).toEqual(expect.objectContaining({
      personaName: "周进",
      event      : "出场"
    }));
  });
});
