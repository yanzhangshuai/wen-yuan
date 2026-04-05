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

import { BookNotFoundError } from "@/server/modules/books/errors";
import {
  createFindPersonaPathService,
  PersonaNotFoundError
} from "@/server/modules/graph/findPersonaPath";

function createPrismaStub() {
  return {
    book: {
      findFirst: vi.fn().mockResolvedValue({ id: "book-1" })
    },
    persona: {
      findMany: vi.fn().mockResolvedValue([
        { id: "p1", name: "王冕" },
        { id: "p2", name: "周进" },
        { id: "p3", name: "范进" }
      ])
    },
    profile: {
      findMany: vi.fn().mockResolvedValue([
        { persona: { id: "p1", name: "王冕" } },
        { persona: { id: "p2", name: "周进" } },
        { persona: { id: "p3", name: "范进" } }
      ])
    },
    relationship: {
      findMany: vi.fn().mockResolvedValue([
        {
          id       : "r1",
          sourceId : "p1",
          targetId : "p2",
          type     : "师生",
          weight   : 1.0,
          chapterId: "c1",
          chapter  : { no: 1 }
        },
        {
          id       : "r2",
          sourceId : "p2",
          targetId : "p3",
          type     : "同僚",
          weight   : 0.8,
          chapterId: "c2",
          chapter  : { no: 2 }
        }
      ])
    }
  };
}

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("findPersonaPath service", () => {
  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns shortest path between two personas with PostgreSQL fallback", async () => {
    const service = createFindPersonaPathService(createPrismaStub() as never, null);

    const result = await service.findPersonaPath({
      bookId         : "book-1",
      sourcePersonaId: "p1",
      targetPersonaId: "p3"
    });

    expect(result.found).toBe(true);
    expect(result.hopCount).toBe(2);
    expect(result.nodes.map((item) => item.id)).toEqual(["p1", "p2", "p3"]);
    expect(result.edges.map((item) => item.id)).toEqual(["r1", "r2"]);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns found=false when path does not exist", async () => {
    const prismaClient = createPrismaStub();
    prismaClient.relationship.findMany.mockResolvedValue([
      {
        id       : "r1",
        sourceId : "p1",
        targetId : "p2",
        type     : "师生",
        weight   : 1.0,
        chapterId: "c1",
        chapter  : { no: 1 }
      }
    ]);
    const service = createFindPersonaPathService(prismaClient as never, null);

    const result = await service.findPersonaPath({
      bookId         : "book-1",
      sourcePersonaId: "p1",
      targetPersonaId: "p3"
    });

    expect(result.found).toBe(false);
    expect(result.hopCount).toBe(0);
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("throws when book does not exist", async () => {
    const service = createFindPersonaPathService({
      book: {
        findFirst: vi.fn().mockResolvedValue(null)
      }
    } as never);

    await expect(service.findPersonaPath({
      bookId         : "missing-book",
      sourcePersonaId: "p1",
      targetPersonaId: "p2"
    })).rejects.toBeInstanceOf(BookNotFoundError);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("throws when source or target persona does not exist", async () => {
    const service = createFindPersonaPathService({
      book: {
        findFirst: vi.fn().mockResolvedValue({ id: "book-1" })
      },
      persona: {
        findMany: vi.fn().mockResolvedValue([{ id: "p1", name: "王冕" }])
      },
      profile: {
        findMany: vi.fn().mockResolvedValue([{ persona: { id: "p1", name: "王冕" } }])
      },
      relationship: {
        findMany: vi.fn().mockResolvedValue([])
      }
    } as never, null);

    await expect(service.findPersonaPath({
      bookId         : "book-1",
      sourcePersonaId: "p1",
      targetPersonaId: "p3"
    })).rejects.toBeInstanceOf(PersonaNotFoundError);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("uses Neo4j shortest path when available", async () => {
    const runMock = vi.fn()
      .mockResolvedValueOnce({ records: [] })
      .mockResolvedValueOnce({ records: [] })
      .mockResolvedValueOnce({ records: [] })
      .mockResolvedValueOnce({
        records: [{
          get: (key: string) => {
            if (key === "nodeIds") {
              return ["p1", "p2", "p3"];
            }
            if (key === "edgeIds") {
              return ["r1", "r2"];
            }
            return [];
          }
        }]
      });
    const closeMock = vi.fn().mockResolvedValue(undefined);
    const neo4jDriver = {
      session: vi.fn().mockReturnValue({
        run  : runMock,
        close: closeMock
      })
    };

    const service = createFindPersonaPathService(createPrismaStub() as never, neo4jDriver);

    const result = await service.findPersonaPath({
      bookId         : "book-1",
      sourcePersonaId: "p1",
      targetPersonaId: "p3"
    });

    expect(result.found).toBe(true);
    expect(result.hopCount).toBe(2);
    expect(result.nodes.map((item) => item.id)).toEqual(["p1", "p2", "p3"]);
    expect(result.edges.map((item) => item.id)).toEqual(["r1", "r2"]);
    expect(runMock).toHaveBeenCalledTimes(4);
    expect(closeMock).toHaveBeenCalledTimes(2);
  });
});
