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
            id      : "rel-1",
            sourceId: "persona-1",
            targetId: "persona-2",
            type    : "师生",
            weight  : 1.5,
            status  : ProcessingStatus.DRAFT
          }
        ])
      },
      mention: {
        findMany: vi.fn().mockResolvedValue([{ personaId: "persona-2" }])
      },
      profile: {
        findMany: vi.fn().mockResolvedValue([
          {
            personaId   : "persona-1",
            ironyIndex  : 4,
            visualConfig: {
              x: 120,
              y: 240
            },
            persona: {
              id          : "persona-1",
              name        : "周进",
              nameType    : "NAMED",
              recordSource: RecordSource.AI
            }
          }
        ])
      },
      persona: {
        findMany: vi.fn().mockResolvedValue([
          {
            id          : "persona-2",
            name        : "范进",
            nameType    : "NAMED",
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
        id       : "rel-1",
        source   : "persona-1",
        target   : "persona-2",
        sentiment: "positive"
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
      }
    } as never);

    await expect(service.getBookGraph({ bookId: "missing-book" })).rejects.toBeInstanceOf(BookNotFoundError);
  });
});
