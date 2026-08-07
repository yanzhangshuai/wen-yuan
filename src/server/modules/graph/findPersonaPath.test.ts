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
    entity: {
      findMany: vi.fn().mockResolvedValue([
        { id: "p1", name: "王冕" },
        { id: "p2", name: "周进" },
        { id: "p3", name: "范进" }
      ])
    },
    entityProfile: {
      findMany: vi.fn().mockResolvedValue([
        { entity: { id: "p1", name: "王冕" } },
        { entity: { id: "p2", name: "周进" } },
        { entity: { id: "p3", name: "范进" } }
      ])
    },
    relationship: {
      findMany: vi.fn().mockResolvedValue([
        {
          id                  : "r1",
          sourceEntityId      : "p1",
          targetEntityId      : "p2",
          relationshipTypeCode: "师生",
          firstChapterId      : "c1",
          firstChapterNo      : 1
        },
        {
          id                  : "r2",
          sourceEntityId      : "p2",
          targetEntityId      : "p3",
          relationshipTypeCode: "同僚",
          firstChapterId      : "c2",
          firstChapterNo      : 2
        }
      ])
    },
    // 关系码 → 展示名由 skill 契约并集提供（lookupTypeNames 从 active skill 激活版 frontmatter 取码）
    skill: {
      findMany: vi.fn().mockResolvedValue([])
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
        id                  : "r1",
        sourceEntityId      : "p1",
        targetEntityId      : "p2",
        relationshipTypeCode: "师生",
        firstChapterId      : "c1",
        firstChapterNo      : 1
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
      entity: {
        findMany: vi.fn().mockResolvedValue([{ id: "p1", name: "王冕" }])
      },
      entityProfile: {
        findMany: vi.fn().mockResolvedValue([{ entity: { id: "p1", name: "王冕" } }])
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

  it("returns zero-hop path when source and target are the same persona", async () => {
    const prismaClient = createPrismaStub();
    prismaClient.entityProfile.findMany.mockResolvedValueOnce([
      { entity: { id: "p1", name: "王冕" } },
      { entity: { id: "p2", name: "周进" } }
    ]);
    prismaClient.relationship.findMany.mockResolvedValueOnce([
      {
        id                  : "r-extra",
        sourceEntityId      : "p1",
        targetEntityId      : "p3",
        relationshipTypeCode: "同乡",
        firstChapterId      : "c1",
        firstChapterNo      : 1
      }
    ]);
    prismaClient.entity.findMany
      .mockResolvedValueOnce([{ id: "p3", name: "范进" }]);

    const service = createFindPersonaPathService(prismaClient as never, null);
    const result = await service.findPersonaPath({
      bookId         : "book-1",
      sourcePersonaId: "p1",
      targetPersonaId: "p1"
    });

    expect(result.found).toBe(true);
    expect(result.hopCount).toBe(0);
    expect(result.nodes).toEqual([{ id: "p1", name: "王冕" }]);
    expect(result.edges).toEqual([]);
    expect(prismaClient.entity.findMany).toHaveBeenCalledWith({
      where : { id: { in: ["p3"] }, deletedAt: null },
      select: { id: true, name: true }
    });
  });

  it("skips extra entity lookup when profiles already cover every path endpoint", async () => {
    const prismaClient = createPrismaStub();
    const service = createFindPersonaPathService(prismaClient as never, null);

    const result = await service.findPersonaPath({
      bookId         : "book-1",
      sourcePersonaId: "p1",
      targetPersonaId: "p3"
    });

    expect(result.found).toBe(true);
    expect(prismaClient.entity.findMany).not.toHaveBeenCalled();
  });

  it("throws the missing source persona id when the source endpoint is absent", async () => {
    const prismaClient = createPrismaStub();
    prismaClient.entityProfile.findMany.mockResolvedValueOnce([
      { entity: { id: "p2", name: "周进" } },
      { entity: { id: "p3", name: "范进" } }
    ]);
    prismaClient.relationship.findMany.mockResolvedValueOnce([]);

    const service = createFindPersonaPathService(prismaClient as never, null);

    await expect(service.findPersonaPath({
      bookId         : "book-1",
      sourcePersonaId: "p1",
      targetPersonaId: "p3"
    })).rejects.toMatchObject({
      personaId: "p1"
    });
  });

  it("returns found=false when Neo4j yields no record", async () => {
    const runMock = vi.fn()
      .mockResolvedValueOnce({ records: [] })
      .mockResolvedValueOnce({ records: [] })
      .mockResolvedValueOnce({ records: [] })
      .mockResolvedValueOnce({ records: [] });
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

    expect(result).toMatchObject({
      found   : false,
      hopCount: 0,
      nodes   : [],
      edges   : []
    });
    expect(closeMock).toHaveBeenCalledTimes(2);
  });

  it("returns found=false when Neo4j returns an empty path payload", async () => {
    const runMock = vi.fn()
      .mockResolvedValueOnce({ records: [] })
      .mockResolvedValueOnce({ records: [] })
      .mockResolvedValueOnce({ records: [] })
      .mockResolvedValueOnce({
        records: [{
          get: (key: string) => {
            if (key === "nodeIds") {
              return [];
            }
            if (key === "edgeIds") {
              return ["r1"];
            }
            return [];
          }
        }]
      });
    const neo4jDriver = {
      session: vi.fn().mockReturnValue({
        run  : runMock,
        close: vi.fn().mockResolvedValue(undefined)
      })
    };

    const service = createFindPersonaPathService(createPrismaStub() as never, neo4jDriver);
    const result = await service.findPersonaPath({
      bookId         : "book-1",
      sourcePersonaId: "p1",
      targetPersonaId: "p3"
    });

    expect(result).toMatchObject({
      found   : false,
      hopCount: 0,
      nodes   : [],
      edges   : []
    });
  });

  it("treats malformed Neo4j node ids as not found", async () => {
    const runMock = vi.fn()
      .mockResolvedValueOnce({ records: [] })
      .mockResolvedValueOnce({ records: [] })
      .mockResolvedValueOnce({ records: [] })
      .mockResolvedValueOnce({
        records: [{
          get: (key: string) => {
            if (key === "nodeIds") {
              return "p1,p2,p3";
            }
            if (key === "edgeIds") {
              return ["r1", "r2"];
            }
            return [];
          }
        }]
      });
    const neo4jDriver = {
      session: vi.fn().mockReturnValue({
        run  : runMock,
        close: vi.fn().mockResolvedValue(undefined)
      })
    };

    const service = createFindPersonaPathService(createPrismaStub() as never, neo4jDriver);
    const result = await service.findPersonaPath({
      bookId         : "book-1",
      sourcePersonaId: "p1",
      targetPersonaId: "p3"
    });

    expect(result.found).toBe(false);
    expect(result.nodes).toEqual([]);
  });

  it("uses empty string when a Neo4j path node name is missing from the persona map", async () => {
    const runMock = vi.fn()
      .mockResolvedValueOnce({ records: [] })
      .mockResolvedValueOnce({ records: [] })
      .mockResolvedValueOnce({ records: [] })
      .mockResolvedValueOnce({
        records: [{
          get: (key: string) => {
            if (key === "nodeIds") {
              return ["p1", "ghost", "p3"];
            }
            if (key === "edgeIds") {
              return ["r1", "r2"];
            }
            return [];
          }
        }]
      });
    const neo4jDriver = {
      session: vi.fn().mockReturnValue({
        run  : runMock,
        close: vi.fn().mockResolvedValue(undefined)
      })
    };

    const service = createFindPersonaPathService(createPrismaStub() as never, neo4jDriver);
    const result = await service.findPersonaPath({
      bookId         : "book-1",
      sourcePersonaId: "p1",
      targetPersonaId: "p3"
    });

    expect(result.found).toBe(true);
    expect(result.nodes).toEqual([
      { id: "p1", name: "王冕" },
      { id: "ghost", name: "" },
      { id: "p3", name: "范进" }
    ]);
  });

  it("falls back to PostgreSQL BFS when Neo4j returns unmapped edge ids", async () => {
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
              return ["missing-edge"];
            }
            return [];
          }
        }]
      });
    const neo4jDriver = {
      session: vi.fn().mockReturnValue({
        run  : runMock,
        close: vi.fn().mockResolvedValue(undefined)
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
    expect(result.edges.map((item) => item.id)).toEqual(["r1", "r2"]);
  });

  it("falls back to PostgreSQL BFS when Neo4j throws", async () => {
    const runMock = vi.fn()
      .mockResolvedValueOnce({ records: [] })
      .mockResolvedValueOnce({ records: [] })
      .mockRejectedValueOnce(new Error("neo4j offline"));
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
    expect(closeMock).toHaveBeenCalled();
  });
});
