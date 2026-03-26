import { ChapterType } from "@/generated/prisma/enums";
import { describe, expect, it, vi } from "vitest";

import {
  BookNotFoundError,
  BookRawContentMissingError,
  ChapterConfirmPayloadError,
  createConfirmBookChaptersService
} from "@/server/modules/books/confirmBookChapters";

describe("confirmBookChapters", () => {
  it("replaces chapter rows in one transaction and returns confirmed result", async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id        : "book-1",
      rawContent: "第1回\n正文一\n第2回\n正文二"
    });
    const deleteMany = vi.fn().mockResolvedValue({ count: 2 });
    const createMany = vi.fn().mockResolvedValue({ count: 2 });
    const transaction = vi.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      chapter: {
        deleteMany,
        createMany
      }
    }));
    const service = createConfirmBookChaptersService({
      book        : { findFirst },
      $transaction: transaction
    } as never);

    const result = await service.confirmBookChapters("book-1", [
      { index: 1, chapterType: ChapterType.CHAPTER, title: "第一回 范进中举" },
      { index: 2, chapterType: ChapterType.CHAPTER, title: "第二回 周进入学" }
    ]);

    expect(findFirst).toHaveBeenCalledWith({
      where : { id: "book-1", deletedAt: null },
      select: { id: true, rawContent: true }
    });
    expect(deleteMany).toHaveBeenCalledWith({ where: { bookId: "book-1" } });
    expect(createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [
        expect.objectContaining({
          bookId : "book-1",
          no     : 1,
          title  : "第一回 范进中举",
          content: "正文一"
        }),
        expect.objectContaining({
          bookId : "book-1",
          no     : 2,
          title  : "第二回 周进入学",
          content: "正文二"
        })
      ]
    }));
    expect(result.chapterCount).toBe(2);
    expect(result.items).toHaveLength(2);
  });

  it("uses explicit chapter content when provided", async () => {
    const createMany = vi.fn().mockResolvedValue({ count: 1 });
    const service = createConfirmBookChaptersService({
      book: {
        findFirst: vi.fn().mockResolvedValue({
          id        : "book-1",
          rawContent: "第1回\n正文一"
        })
      },
      $transaction: vi.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
        chapter: {
          deleteMany: vi.fn(),
          createMany
        }
      }))
    } as never);

    await service.confirmBookChapters("book-1", [
      {
        index      : 1,
        chapterType: ChapterType.CHAPTER,
        title      : "第一回",
        content    : "手动合并后的正文"
      }
    ]);

    expect(createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [
        expect.objectContaining({
          content: "手动合并后的正文"
        })
      ]
    }));
  });

  it("throws payload error when chapters are empty", async () => {
    const service = createConfirmBookChaptersService({
      book        : { findFirst: vi.fn() },
      $transaction: vi.fn()
    } as never);

    await expect(service.confirmBookChapters("book-1", [])).rejects.toBeInstanceOf(ChapterConfirmPayloadError);
  });

  it("throws payload error when chapter indexes are duplicated", async () => {
    const service = createConfirmBookChaptersService({
      book: {
        findFirst: vi.fn().mockResolvedValue({
          id        : "book-1",
          rawContent: "第1回\n正文一"
        })
      },
      $transaction: vi.fn()
    } as never);

    await expect(
      service.confirmBookChapters("book-1", [
        { index: 1, chapterType: ChapterType.CHAPTER, title: "第一回" },
        { index: 1, chapterType: ChapterType.CHAPTER, title: "第一回补充" }
      ])
    ).rejects.toBeInstanceOf(ChapterConfirmPayloadError);
  });

  it("throws BookNotFoundError when book does not exist", async () => {
    const service = createConfirmBookChaptersService({
      book        : { findFirst: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn()
    } as never);

    await expect(
      service.confirmBookChapters("missing-book", [
        { index: 1, chapterType: ChapterType.CHAPTER, title: "第一回" }
      ])
    ).rejects.toBeInstanceOf(BookNotFoundError);
  });

  it("throws BookRawContentMissingError when raw content is empty", async () => {
    const service = createConfirmBookChaptersService({
      book: {
        findFirst: vi.fn().mockResolvedValue({
          id        : "book-1",
          rawContent: "   "
        })
      },
      $transaction: vi.fn()
    } as never);

    await expect(
      service.confirmBookChapters("book-1", [
        { index: 1, chapterType: ChapterType.CHAPTER, title: "第一回" }
      ])
    ).rejects.toBeInstanceOf(BookRawContentMissingError);
  });
});
