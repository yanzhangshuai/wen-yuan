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

describe("listBooks", () => {
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
        _count       : {
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
});
