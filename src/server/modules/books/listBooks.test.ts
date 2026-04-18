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

import { createListBooksService } from "@/server/modules/books/listBooks";

function createBookRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id            : "book-1",
    title         : "儒林外史",
    author        : "吴敬梓",
    dynasty       : "清",
    coverUrl      : "/api/assets/books/book-1/cover/cover.png",
    status        : "COMPLETED",
    errorLog      : null,
    createdAt     : new Date("2026-03-24T09:10:00.000Z"),
    updatedAt     : new Date("2026-03-24T10:10:00.000Z"),
    sourceFileKey : "books/book-1/source/original.txt",
    sourceFileUrl : "/api/assets/books/book-1/source/original.txt",
    sourceFileName: "rulin.txt",
    sourceFileMime: "text/plain; charset=utf-8",
    sourceFileSize: 1234,
    _count        : {
      chapters: 2,
      profiles: 3
    },
    analysisJobs: [
      {
        updatedAt : new Date("2026-03-24T10:00:00.000Z"),
        finishedAt: new Date("2026-03-24T10:08:00.000Z"),
        errorLog  : null,
        phaseLogs : [
          {
            model: {
              name: "DeepSeek V3"
            }
          }
        ]
      }
    ],
    ...overrides
  };
}

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("listBooks", () => {
  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns books in library view shape with source file snapshot", async () => {
    const findMany = vi.fn().mockResolvedValue([createBookRow()]);
    const service = createListBooksService({ book: { findMany } } as never);

    const result = await service.listBooks();

    expect(findMany).toHaveBeenCalledOnce();
    expect(findMany).toHaveBeenCalledWith({
      where  : { deletedAt: null },
      orderBy: { updatedAt: "desc" },
      select : expect.objectContaining({
        id           : true,
        title        : true,
        coverUrl     : true,
        errorLog     : true,
        sourceFileKey: true,
        analysisJobs : {
          take   : 1,
          orderBy: { updatedAt: "desc" },
          select : expect.objectContaining({
            architecture: true
          })
        },
        _count: {
          select: {
            chapters: true,
            profiles: {
              where: { deletedAt: null }
            }
          }
        }
      })
    });
    expect(result).toEqual([
      {
        id              : "book-1",
        title           : "儒林外史",
        author          : "吴敬梓",
        dynasty         : "清",
        coverUrl        : "/api/assets/books/book-1/cover/cover.png",
        status          : "COMPLETED",
        chapterCount    : 2,
        personaCount    : 3,
        lastAnalyzedAt  : "2026-03-24T10:08:00.000Z",
        currentModel    : "DeepSeek V3",
        lastArchitecture: null,
        lastErrorSummary: null,
        createdAt       : "2026-03-24T09:10:00.000Z",
        updatedAt       : "2026-03-24T10:10:00.000Z",
        sourceFile      : {
          key : "books/book-1/source/original.txt",
          url : "/api/assets/books/book-1/source/original.txt",
          name: "rulin.txt",
          mime: "text/plain; charset=utf-8",
          size: 1234
        }
      }
    ]);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("uses latest analysis model as currentModel", async () => {
    const findMany = vi.fn().mockResolvedValue([
      createBookRow({
        analysisJobs: [
          {
            updatedAt : new Date("2026-03-24T10:00:00.000Z"),
            finishedAt: new Date("2026-03-24T10:08:00.000Z"),
            errorLog  : null,
            phaseLogs : [
              {
                model: {
                  name: "Gemini Flash"
                }
              }
            ]
          }
        ]
      })
    ]);

    const service = createListBooksService({ book: { findMany } } as never);
    const [item] = await service.listBooks();

    expect(item.currentModel).toBe("Gemini Flash");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("prefers book-level errorLog over analysis error", async () => {
    const findMany = vi.fn().mockResolvedValue([
      createBookRow({
        errorLog    : "book error",
        analysisJobs: [
          {
            updatedAt : new Date("2026-03-24T10:00:00.000Z"),
            finishedAt: null,
            errorLog  : "analysis error",
            phaseLogs : [
              {
                model: {
                  name: "DeepSeek V3"
                }
              }
            ]
          }
        ]
      })
    ]);

    const service = createListBooksService({ book: { findMany } } as never);
    const [item] = await service.listBooks();

    expect(item.lastErrorSummary).toBe("book error");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("falls back to analysis error when book-level errorLog is empty", async () => {
    const findMany = vi.fn().mockResolvedValue([
      createBookRow({
        errorLog    : null,
        analysisJobs: [
          {
            updatedAt : new Date("2026-03-24T10:00:00.000Z"),
            finishedAt: null,
            errorLog  : "analysis error",
            phaseLogs : [
              {
                model: {
                  name: "DeepSeek V3"
                }
              }
            ]
          }
        ]
      })
    ]);

    const service = createListBooksService({ book: { findMany } } as never);
    const [item] = await service.listBooks();

    expect(item.lastErrorSummary).toBe("analysis error");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("uses analysis updatedAt when finishedAt is missing", async () => {
    const findMany = vi.fn().mockResolvedValue([
      createBookRow({
        analysisJobs: [
          {
            updatedAt : new Date("2026-03-24T10:06:00.000Z"),
            finishedAt: null,
            errorLog  : null,
            phaseLogs : [
              {
                model: {
                  name: "DeepSeek V3"
                }
              }
            ]
          }
        ]
      })
    ]);

    const service = createListBooksService({ book: { findMany } } as never);
    const [item] = await service.listBooks();

    expect(item.lastAnalyzedAt).toBe("2026-03-24T10:06:00.000Z");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns null lastAnalyzedAt for pending book without analysis jobs", async () => {
    const findMany = vi.fn().mockResolvedValue([
      createBookRow({
        status      : "PENDING",
        analysisJobs: []
      })
    ]);

    const service = createListBooksService({ book: { findMany } } as never);
    const [item] = await service.listBooks();

    expect(item.lastAnalyzedAt).toBeNull();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("falls back to book updatedAt for non-pending book without analysis jobs", async () => {
    const findMany = vi.fn().mockResolvedValue([
      createBookRow({
        status      : "PROCESSING",
        updatedAt   : new Date("2026-03-24T11:00:00.000Z"),
        analysisJobs: []
      })
    ]);

    const service = createListBooksService({ book: { findMany } } as never);
    const [item] = await service.listBooks();

    expect(item.lastAnalyzedAt).toBe("2026-03-24T11:00:00.000Z");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("normalizes unknown status to PENDING", async () => {
    const findMany = vi.fn().mockResolvedValue([
      createBookRow({
        status      : "UNKNOWN_STATUS",
        analysisJobs: []
      })
    ]);

    const service = createListBooksService({ book: { findMany } } as never);
    const [item] = await service.listBooks();

    expect(item.status).toBe("PENDING");
    expect(item.lastAnalyzedAt).toBeNull();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("keeps nullable source file fields when no source is attached", async () => {
    const findMany = vi.fn().mockResolvedValue([
      createBookRow({
        sourceFileKey : null,
        sourceFileUrl : null,
        sourceFileName: null,
        sourceFileMime: null,
        sourceFileSize: null
      })
    ]);

    const service = createListBooksService({ book: { findMany } } as never);
    const [item] = await service.listBooks();

    expect(item.sourceFile).toEqual({
      key : null,
      url : null,
      name: null,
      mime: null,
      size: null
    });
  });

  it("uses persona count for latest threestage full-book cards", async () => {
    const findMany = vi.fn().mockResolvedValue([
      createBookRow({
        _count      : { chapters: 2, profiles: 0, personas: 2 },
        analysisJobs: [{
          updatedAt   : new Date("2026-04-18T00:00:00.000Z"),
          finishedAt  : new Date("2026-04-18T00:01:00.000Z"),
          errorLog    : null,
          architecture: "threestage",
          scope       : "FULL_BOOK",
          phaseLogs   : []
        }]
      })
    ]);

    const service = createListBooksService({ book: { findMany } } as never);
    const [item] = await service.listBooks();

    expect(item.personaCount).toBe(2);
  });
});
