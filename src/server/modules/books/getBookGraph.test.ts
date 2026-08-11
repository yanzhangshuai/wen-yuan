import { describe, expect, it, vi } from "vitest";

import { ProcessingStatus, RecordSource } from "@/generated/prisma/enums";
import { BookNotFoundError } from "@/server/modules/books/errors";
import { createGetBookGraphService } from "@/server/modules/books/getBookGraph";

/**
 * 文件定位（图谱构建服务单测）：
 * - 验证 `getBookGraph` 将关系、提及、画像等多源数据合并为统一图结构（nodes/edges）。
 * - 该服务是图谱可视化页面的数据核心，输出字段稳定性直接决定前端渲染正确性。
 *
 * 业务关注：
 * - 节点状态、影响力、坐标、边情感等属于派生结果，需要在服务层统一收敛。
 */
describe("getBookGraph service", () => {
  it("returns graph nodes and edges for a book", async () => {
    // 场景：验证存在显式关系 + mention 补全人物时，服务能返回完整节点集合并附带默认状态。
    const service = createGetBookGraphService({
      book: {
        findFirst: vi.fn().mockResolvedValue({ id: "book-1" })
      },
      relationship: {
        findMany: vi.fn().mockResolvedValue([
          {
            id                  : "rel-1",
            sourceEntityId      : "persona-1",
            targetEntityId      : "persona-2",
            relationshipTypeCode: "师生",
            factCount           : 3,
            weight              : 3,
            status              : ProcessingStatus.DRAFT
          }
        ])
      },
      // 关系码 → 展示名由 skill 契约并集提供（lookupTypeNames 从 active skill 激活版 frontmatter 取码）
      skill: {
        findMany: vi.fn().mockResolvedValue([])
      },
      mention: {
        findMany: vi.fn().mockResolvedValue([{ entityId: "persona-2" }])
      },
      entityProfile: {
        findMany: vi.fn().mockResolvedValue([
          {
            entityId    : "persona-1",
            ironyIndex  : 4,
            visualConfig: {
              x: 120,
              y: 240
            },
            entity: {
              id          : "persona-1",
              name        : "周进",
              nameType    : "NAMED",
              entityType  : "PERSON",
              recordSource: RecordSource.AI
            }
          }
        ])
      },
      entity: {
        findMany: vi.fn().mockResolvedValue([
          {
            id          : "persona-2",
            name        : "范进",
            nameType    : "NAMED",
            entityType  : "PERSON",
            recordSource: RecordSource.MANUAL
          }
        ])
      }
    } as never);

    const result = await service.getBookGraph({
      bookId : "book-1",
      chapter: 10
    });

    expect(result.edges).toEqual([
      expect.objectContaining({
        id        : "rel-1",
        source    : "persona-1",
        target    : "persona-2",
        weight    : 3,
        eventCount: 3,
        sentiment : "positive"
      })
    ]);
    expect(result.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id       : "persona-1",
        influence: 4,
        x        : 120,
        y        : 240,
        status   : ProcessingStatus.DRAFT
      }),
      expect.objectContaining({
        id    : "persona-2",
        status: ProcessingStatus.VERIFIED
      })
    ]));
  });

  it("throws when book does not exist", async () => {
    // 边界：无效 bookId 应快速抛出 BookNotFoundError，避免下游继续执行多表查询。
    const service = createGetBookGraphService({
      book: {
        findFirst: vi.fn().mockResolvedValue(null)
      },
      skill: {
        findMany: vi.fn().mockResolvedValue([])
      }
    } as never);

    await expect(service.getBookGraph({ bookId: "missing-book" })).rejects.toBeInstanceOf(BookNotFoundError);
  });

  it("builds full-book graph without mention fallback and maps negative or unknown sentiments", async () => {
    const mentionFindMany = vi.fn();
    const entityFindMany = vi.fn();
    const service = createGetBookGraphService({
      book: {
        findFirst: vi.fn().mockResolvedValue({ id: "book-1" })
      },
      relationship: {
        findMany: vi.fn().mockResolvedValue([
          {
            id                  : "rel-neg",
            sourceEntityId      : "persona-1",
            targetEntityId      : "persona-2",
            relationshipTypeCode: "敌对",
            factCount           : 2,
            weight              : 2,
            status              : ProcessingStatus.VERIFIED
          },
          {
            id                  : "rel-neutral",
            sourceEntityId      : "persona-2",
            targetEntityId      : "persona-1",
            relationshipTypeCode: "陌生",
            factCount           : 1,
            weight              : 1,
            status              : ProcessingStatus.DRAFT
          }
        ])
      },
      mention: {
        findMany: mentionFindMany
      },
      entityProfile: {
        findMany: vi.fn().mockResolvedValue([
          {
            entityId    : "persona-1",
            ironyIndex  : 1.25,
            visualConfig: { x: 18 },
            entity      : {
              id          : "persona-1",
              name        : "周进",
              nameType    : "NAMED",
              entityType  : "PERSON",
              recordSource: RecordSource.MANUAL
            }
          },
          {
            entityId    : "persona-2",
            ironyIndex  : 0.5,
            visualConfig: [],
            entity      : {
              id          : "persona-2",
              name        : "范进",
              nameType    : "NAMED",
              entityType  : "PERSON",
              recordSource: RecordSource.AI
            }
          }
        ])
      },
      entity: {
        findMany: entityFindMany
      },
      skill: {
        findMany: vi.fn().mockResolvedValue([])
      }
    } as never);

    const result = await service.getBookGraph({ bookId: "book-1" });

    expect(mentionFindMany).not.toHaveBeenCalled();
    expect(entityFindMany).not.toHaveBeenCalled();
    expect(result.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id        : "rel-neg",
        weight    : 2,
        eventCount: 2,
        sentiment : "negative"
      }),
      expect.objectContaining({
        id        : "rel-neutral",
        weight    : 1,
        eventCount: 1,
        sentiment : "neutral"
      })
    ]));

    const manualNode = result.nodes.find((node) => node.id === "persona-1");
    const aiNode = result.nodes.find((node) => node.id === "persona-2");
    expect(manualNode).toEqual(expect.objectContaining({
      id       : "persona-1",
      influence: 2.5,
      status   : ProcessingStatus.VERIFIED,
      x        : 18
    }));
    expect(aiNode).toEqual(expect.objectContaining({
      id       : "persona-2",
      influence: 1,
      status   : ProcessingStatus.DRAFT
    }));
    expect(aiNode && "x" in aiNode).toBe(false);
    expect(aiNode && "y" in aiNode).toBe(false);
  });
});
