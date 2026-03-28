import { ChapterType } from "@/generated/prisma/enums";
import { describe, expect, it, vi } from "vitest";

import {
  BookNotFoundError,
  BookSourceFileMissingError,
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
    // 楔子是 PRELUDE，从 index 0 开始
    expect(result[0]).toEqual(expect.objectContaining({
      index      : 0,
      chapterType: ChapterType.PRELUDE,
      title      : "楔子"
    }));
    // 第一正文章节 index 为 1
    expect(result[1]).toEqual(expect.objectContaining({
      index      : 1,
      chapterType: ChapterType.CHAPTER,
      title      : "第1回 范进中举"
    }));
    expect(result[3]).toEqual(expect.objectContaining({
      index      : 3,
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
  it("reads source file from storage, splits and returns preview", async () => {
    // Arrange
    const rawContent = [
      "第1回 范进中举",
      "正文一"
    ].join("\n");
    const findFirst = vi.fn().mockResolvedValue({
      id           : "book-1",
      sourceFileKey: "books/20260328/rulin.txt"
    });
    const getObject = vi.fn().mockResolvedValue(Buffer.from(rawContent));
    const service = createGetChapterPreviewService(
      { book: { findFirst } } as never,
      { getObject } as never
    );

    // Act
    const result = await service.getChapterPreview("book-1");

    // Assert
    expect(findFirst).toHaveBeenCalledWith({
      where : { id: "book-1", deletedAt: null },
      select: { id: true, sourceFileKey: true }
    });
    expect(getObject).toHaveBeenCalledWith("books/20260328/rulin.txt");
    expect(result.bookId).toBe("book-1");
    expect(result.chapterCount).toBe(1);
    expect(result.items[0]).toEqual(expect.objectContaining({
      index      : 1,
      chapterType: ChapterType.CHAPTER,
      title      : "第1回 范进中举"
    }));
  });

  it("throws BookNotFoundError when book is missing", async () => {
    // Arrange
    const findFirst = vi.fn().mockResolvedValue(null);
    const service = createGetChapterPreviewService(
      { book: { findFirst } } as never,
      { getObject: vi.fn() } as never
    );

    // Act + Assert
    await expect(service.getChapterPreview("missing-book")).rejects.toBeInstanceOf(BookNotFoundError);
  });

  it("throws BookSourceFileMissingError when sourceFileKey is null", async () => {
    // Arrange
    const findFirst = vi.fn().mockResolvedValue({
      id           : "book-1",
      sourceFileKey: null
    });
    const service = createGetChapterPreviewService(
      { book: { findFirst } } as never,
      { getObject: vi.fn() } as never
    );

    // Act + Assert
    await expect(service.getChapterPreview("book-1")).rejects.toBeInstanceOf(BookSourceFileMissingError);
  });
});
