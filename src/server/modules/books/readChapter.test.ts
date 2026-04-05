import { describe, expect, it, vi } from "vitest";

import { BookNotFoundError } from "@/server/modules/books/errors";
import {
  ChapterNotFoundError,
  createReadChapterService,
  ParaIndexOutOfRangeError
} from "@/server/modules/books/readChapter";

/**
 * 文件定位（章节阅读服务单测）：
 * - 覆盖章节正文读取与段落拆分能力，服务用于阅读器页/审校页按段查看文本。
 * - 同时验证 highlight 与 paraIndex 等定位参数的边界处理。
 *
 * 业务目标：
 * - 输出结构既要支持全文展示，也要支持“命中高亮段落快速定位”。
 */
describe("readChapter service", () => {
  it("returns chapter paragraphs with highlight markers", async () => {
    // 场景：用户按关键词跳读时，需要知道哪些段落命中，前端据此高亮或滚动定位。
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
    // 防御分支：防止前端传入越界段落索引导致读取语义不明确，必须显式报错。
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
    // 双边界覆盖：
    // 1) 书籍不存在 -> 直接失败
    // 2) 章节不存在 -> 在书籍存在前提下失败
    // 目的：保证错误来源可区分，便于路由层给出准确提示。
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
