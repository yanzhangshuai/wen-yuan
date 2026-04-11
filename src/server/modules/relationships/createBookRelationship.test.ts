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

import { ProcessingStatus, RecordSource } from "@/generated/prisma/enums";
import { BookNotFoundError } from "@/server/modules/books/errors";
import { PersonaNotFoundError } from "@/server/modules/personas/errors";
import { createCreateBookRelationshipService } from "@/server/modules/relationships/createBookRelationship";
import { RelationshipInputError } from "@/server/modules/relationships/errors";

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("createBookRelationship service", () => {
  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("creates manual relationship as verified", async () => {
    const bookFindFirst = vi.fn().mockResolvedValue({ id: "book-1" });
    const chapterFindFirst = vi.fn().mockResolvedValue({ id: "chapter-1", no: 2 });
    const personaFindMany = vi.fn().mockResolvedValue([
      { id: "persona-a" },
      { id: "persona-b" }
    ]);
    const relationshipFindFirst = vi.fn().mockResolvedValue(null);
    const relationshipCreate = vi.fn().mockResolvedValue({
      id          : "rel-1",
      chapterId   : "chapter-1",
      sourceId    : "persona-a",
      targetId    : "persona-b",
      type        : "师生",
      weight      : 1.2,
      description : "关系背景",
      evidence    : "证据片段",
      confidence  : 0.95,
      recordSource: RecordSource.MANUAL,
      status      : ProcessingStatus.VERIFIED
    });
    const transaction = vi.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      book: {
        findFirst: bookFindFirst
      },
      chapter: {
        findFirst: chapterFindFirst
      },
      persona: {
        findMany: personaFindMany
      },
      relationship: {
        findFirst: relationshipFindFirst,
        create   : relationshipCreate
      }
    }));

    const service = createCreateBookRelationshipService({
      $transaction: transaction
    } as never);

    const result = await service.createBookRelationship("book-1", {
      chapterId  : "chapter-1",
      sourceId   : "persona-a",
      targetId   : "persona-b",
      type       : " 师生 ",
      weight     : 1.2,
      description: "关系背景",
      evidence   : "证据片段",
      confidence : 0.95
    });

    expect(relationshipCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        type        : "师生",
        recordSource: RecordSource.MANUAL,
        status      : ProcessingStatus.VERIFIED
      })
    }));
    expect(result).toEqual({
      id          : "rel-1",
      bookId      : "book-1",
      chapterId   : "chapter-1",
      chapterNo   : 2,
      sourceId    : "persona-a",
      targetId    : "persona-b",
      type        : "师生",
      weight      : 1.2,
      description : "关系背景",
      evidence    : "证据片段",
      confidence  : 0.95,
      recordSource: RecordSource.MANUAL,
      status      : ProcessingStatus.VERIFIED
    });
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("throws input error when source and target are same", async () => {
    const service = createCreateBookRelationshipService({
      $transaction: vi.fn()
    } as never);

    await expect(service.createBookRelationship("book-1", {
      chapterId: "chapter-1",
      sourceId : "persona-a",
      targetId : "persona-a",
      type     : "师生"
    })).rejects.toBeInstanceOf(RelationshipInputError);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("throws persona not found when one endpoint is missing", async () => {
    const transaction = vi.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      book: {
        findFirst: vi.fn().mockResolvedValue({ id: "book-1" })
      },
      chapter: {
        findFirst: vi.fn().mockResolvedValue({ id: "chapter-1", no: 1 })
      },
      persona: {
        findMany: vi.fn().mockResolvedValue([{ id: "persona-a" }])
      },
      relationship: {
        findFirst: vi.fn()
      }
    }));
    const service = createCreateBookRelationshipService({
      $transaction: transaction
    } as never);

    await expect(service.createBookRelationship("book-1", {
      chapterId: "chapter-1",
      sourceId : "persona-a",
      targetId : "persona-b",
      type     : "师生"
    })).rejects.toBeInstanceOf(PersonaNotFoundError);
  });

  it("throws book not found when target book does not exist", async () => {
    const transaction = vi.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      book: {
        findFirst: vi.fn().mockResolvedValue(null)
      }
    }));
    const service = createCreateBookRelationshipService({
      $transaction: transaction
    } as never);

    await expect(service.createBookRelationship("missing-book", {
      chapterId: "chapter-1",
      sourceId : "persona-a",
      targetId : "persona-b",
      type     : "师生"
    })).rejects.toBeInstanceOf(BookNotFoundError);
  });

  it("throws input error when chapter does not belong to book", async () => {
    const transaction = vi.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      book: {
        findFirst: vi.fn().mockResolvedValue({ id: "book-1" })
      },
      chapter: {
        findFirst: vi.fn().mockResolvedValue(null)
      }
    }));
    const service = createCreateBookRelationshipService({
      $transaction: transaction
    } as never);

    await expect(service.createBookRelationship("book-1", {
      chapterId: "chapter-404",
      sourceId : "persona-a",
      targetId : "persona-b",
      type     : "师生"
    })).rejects.toBeInstanceOf(RelationshipInputError);
  });

  it("throws persona not found when source persona is missing", async () => {
    const transaction = vi.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      book: {
        findFirst: vi.fn().mockResolvedValue({ id: "book-1" })
      },
      chapter: {
        findFirst: vi.fn().mockResolvedValue({ id: "chapter-1", no: 1 })
      },
      persona: {
        findMany: vi.fn().mockResolvedValue([{ id: "persona-b" }])
      },
      relationship: {
        findFirst: vi.fn()
      }
    }));
    const service = createCreateBookRelationshipService({
      $transaction: transaction
    } as never);

    await expect(service.createBookRelationship("book-1", {
      chapterId: "chapter-1",
      sourceId : "persona-a",
      targetId : "persona-b",
      type     : "师生"
    })).rejects.toBeInstanceOf(PersonaNotFoundError);
  });

  it("throws input error when manual relationship already exists", async () => {
    const transaction = vi.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      book: {
        findFirst: vi.fn().mockResolvedValue({ id: "book-1" })
      },
      chapter: {
        findFirst: vi.fn().mockResolvedValue({ id: "chapter-1", no: 2 })
      },
      persona: {
        findMany: vi.fn().mockResolvedValue([
          { id: "persona-a" },
          { id: "persona-b" }
        ])
      },
      relationship: {
        findFirst: vi.fn().mockResolvedValue({ id: "rel-existing" })
      }
    }));
    const service = createCreateBookRelationshipService({
      $transaction: transaction
    } as never);

    await expect(service.createBookRelationship("book-1", {
      chapterId: "chapter-1",
      sourceId : "persona-a",
      targetId : "persona-b",
      type     : "同盟"
    })).rejects.toBeInstanceOf(RelationshipInputError);
  });

  it("defaults numeric fields and normalizes optional text fields", async () => {
    const relationshipCreate = vi.fn().mockResolvedValue({
      id          : "rel-2",
      chapterId   : "chapter-1",
      sourceId    : "persona-a",
      targetId    : "persona-b",
      type        : "同盟",
      weight      : 1,
      description : null,
      evidence    : null,
      confidence  : 1,
      recordSource: RecordSource.MANUAL,
      status      : ProcessingStatus.VERIFIED
    });
    const transaction = vi.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      book: {
        findFirst: vi.fn().mockResolvedValue({ id: "book-1" })
      },
      chapter: {
        findFirst: vi.fn().mockResolvedValue({ id: "chapter-1", no: 2 })
      },
      persona: {
        findMany: vi.fn().mockResolvedValue([
          { id: "persona-a" },
          { id: "persona-b" }
        ])
      },
      relationship: {
        findFirst: vi.fn().mockResolvedValue(null),
        create   : relationshipCreate
      }
    }));
    const service = createCreateBookRelationshipService({
      $transaction: transaction
    } as never);

    const result = await service.createBookRelationship("book-1", {
      chapterId  : "chapter-1",
      sourceId   : "persona-a",
      targetId   : "persona-b",
      type       : " 同盟 ",
      description: "   ",
      evidence   : "\n"
    });

    expect(relationshipCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        type       : "同盟",
        weight     : 1,
        description: null,
        evidence   : null,
        confidence : 1
      })
    }));
    expect(result).toEqual(expect.objectContaining({
      weight     : 1,
      description: null,
      evidence   : null,
      confidence : 1
    }));
  });
});
