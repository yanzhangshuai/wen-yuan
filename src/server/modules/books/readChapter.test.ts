import { describe, expect, it, vi } from "vitest";

import { BookNotFoundError } from "@/server/modules/books/errors";
import {
  ChapterNotFoundError,
  createReadChapterService,
  ParaIndexOutOfRangeError
} from "@/server/modules/books/readChapter";

describe("readChapter service", () => {
  it("returns chapter paragraphs with highlight markers", async () => {
    const service = createReadChapterService({
      book: {
        findFirst: vi.fn().mockResolvedValue({ id: "book-1" })
      },
      chapter: {
        findFirst: vi.fn().mockResolvedValue({
          id     : "chapter-1",
          no     : 1,
          title  : "第一回",
          content: "第一段。\n\n第二段提到范进。"
        })
      }
    } as never);

    const result = await service.readChapter({
      bookId   : "book-1",
      chapterId: "chapter-1",
      highlight: "范进"
    });

    expect(result.paragraphs).toHaveLength(2);
    expect(result.paragraphs[1]).toEqual(expect.objectContaining({
      index            : 1,
      containsHighlight: true
    }));
  });

  it("throws when paraIndex is out of range", async () => {
    const service = createReadChapterService({
      book: {
        findFirst: vi.fn().mockResolvedValue({ id: "book-1" })
      },
      chapter: {
        findFirst: vi.fn().mockResolvedValue({
          id     : "chapter-1",
          no     : 1,
          title  : "第一回",
          content: "只有一段"
        })
      }
    } as never);

    await expect(service.readChapter({
      bookId   : "book-1",
      chapterId: "chapter-1",
      paraIndex: 2
    })).rejects.toBeInstanceOf(ParaIndexOutOfRangeError);
  });

  it("throws not found errors", async () => {
    const service = createReadChapterService({
      book: {
        findFirst: vi.fn().mockResolvedValue(null)
      }
    } as never);

    await expect(service.readChapter({
      bookId   : "missing",
      chapterId: "chapter-1"
    })).rejects.toBeInstanceOf(BookNotFoundError);

    const service2 = createReadChapterService({
      book: {
        findFirst: vi.fn().mockResolvedValue({ id: "book-1" })
      },
      chapter: {
        findFirst: vi.fn().mockResolvedValue(null)
      }
    } as never);

    await expect(service2.readChapter({
      bookId   : "book-1",
      chapterId: "missing"
    })).rejects.toBeInstanceOf(ChapterNotFoundError);
  });
});
