import { ChapterType } from "@/generated/prisma/enums";
import { describe, expect, it, vi } from "vitest";

import {
  BookNotFoundError,
  BookRawContentMissingError,
  createGetChapterPreviewService,
  splitRawContentToChapterPreview
} from "@/server/modules/books/getChapterPreview";

describe("splitRawContentToChapterPreview", () => {
  it("splits Chinese chapter titles and marks prelude/postlude", () => {
    const content = [
      "楔子",
      "开场说明",
      "第1回 范进中举",
      "正文一",
      "第2回 周进入学",
      "正文二",
      "后记",
      "尾声文本"
    ].join("\n");

    const result = splitRawContentToChapterPreview(content);

    expect(result).toHaveLength(4);
    expect(result[0]).toEqual(expect.objectContaining({
      index      : 1,
      chapterType: ChapterType.PRELUDE,
      title      : "楔子"
    }));
    expect(result[1]).toEqual(expect.objectContaining({
      chapterType: ChapterType.CHAPTER,
      title      : "第1回 范进中举"
    }));
    expect(result[3]).toEqual(expect.objectContaining({
      chapterType: ChapterType.POSTLUDE,
      title      : "后记"
    }));
  });

  it("falls back to one chapter when no explicit headings", () => {
    const result = splitRawContentToChapterPreview("只有正文，没有章节标题。");

    expect(result).toEqual([
      {
        index      : 1,
        chapterType: ChapterType.CHAPTER,
        title      : "正文",
        wordCount  : 12
      }
    ]);
  });
});

describe("getChapterPreview", () => {
  it("returns preview from book raw content", async () => {
    // Arrange
    const findUnique = vi.fn().mockResolvedValue({
      id        : "book-1",
      rawContent: "第1回\n正文"
    });
    const service = createGetChapterPreviewService({
      book: { findUnique }
    } as never);

    // Act
    const result = await service.getChapterPreview("book-1");

    // Assert
    expect(findUnique).toHaveBeenCalledWith({
      where : { id: "book-1" },
      select: { id: true, rawContent: true }
    });
    expect(result.bookId).toBe("book-1");
    expect(result.chapterCount).toBe(1);
  });

  it("throws BookNotFoundError when book is missing", async () => {
    // Arrange
    const findUnique = vi.fn().mockResolvedValue(null);
    const service = createGetChapterPreviewService({ book: { findUnique } } as never);

    // Act + Assert
    await expect(service.getChapterPreview("missing-book")).rejects.toBeInstanceOf(BookNotFoundError);
  });

  it("throws BookRawContentMissingError when raw content is empty", async () => {
    // Arrange
    const findUnique = vi.fn().mockResolvedValue({
      id        : "book-1",
      rawContent: "   "
    });
    const service = createGetChapterPreviewService({ book: { findUnique } } as never);

    // Act + Assert
    await expect(service.getChapterPreview("book-1")).rejects.toBeInstanceOf(BookRawContentMissingError);
  });
});
