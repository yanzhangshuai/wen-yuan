/**
 * 文件定位（服务模块单测）：
 * - 覆盖领域服务输入校验、分支处理与输出映射契约。
 * - 该层通常是 API Route 的核心下游，承担业务规则落地职责。
 *
 * 业务职责：
 * - 保证成功路径与异常路径都可预测。
 * - 降低重构时误改核心规则的风险。
 */

import { ChapterType } from "@/generated/prisma/enums";
import { describe, expect, it, vi } from "vitest";

import {
  BookNotFoundError,
  BookSourceFileMissingError,
  ChapterConfirmPayloadError,
  createConfirmBookChaptersService
} from "@/server/modules/books/confirmBookChapters";

/** 返回包含两章正文的 Buffer，供各测试用例复用。 */
function makeChapterBuffer(): Buffer {
  return Buffer.from("第一回 范进中举\n正文一\n第二回 周进入学\n正文二");
}

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("confirmBookChapters", () => {
  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("reads source file from storage, replaces chapter rows and returns result", async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id           : "book-1",
      sourceFileKey: "books/20260328/rulin.txt"
    });
    const deleteMany = vi.fn().mockResolvedValue({ count: 2 });
    const createMany = vi.fn().mockResolvedValue({ count: 2 });
    const transaction = vi.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      chapter: { deleteMany, createMany }
    }));
    const getObject = vi.fn().mockResolvedValue(makeChapterBuffer());

    const service = createConfirmBookChaptersService(
      { book: { findFirst }, $transaction: transaction } as never,
      { getObject } as never
    );

    const result = await service.confirmBookChapters("book-1", [
      { index: 1, chapterType: ChapterType.CHAPTER, title: "第一回 范进中举" },
      { index: 2, chapterType: ChapterType.CHAPTER, title: "第二回 周进入学" }
    ]);

    expect(findFirst).toHaveBeenCalledWith({
      where : { id: "book-1", deletedAt: null },
      select: { id: true, sourceFileKey: true }
    });
    expect(getObject).toHaveBeenCalledWith("books/20260328/rulin.txt");
    expect(deleteMany).toHaveBeenCalledWith({ where: { bookId: "book-1" } });
    expect(createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [
        expect.objectContaining({ bookId: "book-1", no: 1, title: "第一回 范进中举", content: "正文一" }),
        expect.objectContaining({ bookId: "book-1", no: 2, title: "第二回 周进入学", content: "正文二" })
      ]
    }));
    expect(result.chapterCount).toBe(2);
    expect(result.items).toHaveLength(2);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("uses explicit chapter content when provided", async () => {
    const createMany = vi.fn().mockResolvedValue({ count: 1 });
    const service = createConfirmBookChaptersService(
      {
        book: {
          findFirst: vi.fn().mockResolvedValue({ id: "book-1", sourceFileKey: "books/xxx.txt" })
        },
        $transaction: vi.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
          chapter: {
            deleteMany: vi.fn(),
            createMany
          }
        }))
      } as never,
      { getObject: vi.fn().mockResolvedValue(makeChapterBuffer()) } as never
    );

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
        expect.objectContaining({ content: "手动合并后的正文" })
      ]
    }));
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("falls back to empty content when target chapter index does not exist in storage", async () => {
    // storage 只有 index=1 的章节，用户确认 index=2，fallback 为空字符串
    const createMany = vi.fn().mockResolvedValue({ count: 1 });
    const service = createConfirmBookChaptersService(
      {
        book: {
          findFirst: vi.fn().mockResolvedValue({ id: "book-1", sourceFileKey: "books/xxx.txt" })
        },
        $transaction: vi.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
          chapter: { deleteMany: vi.fn(), createMany }
        }))
      } as never,
      { getObject: vi.fn().mockResolvedValue(Buffer.from("第一回 范进中举\n正文一")) } as never
    );

    await service.confirmBookChapters("book-1", [
      { index: 2, chapterType: ChapterType.CHAPTER, title: "正文二" }
    ]);

    expect(createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [
        expect.objectContaining({ no: 2, content: "" })
      ]
    }));
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("throws payload error when chapters are empty", async () => {
    const service = createConfirmBookChaptersService(
      { book: { findFirst: vi.fn() }, $transaction: vi.fn() } as never,
      { getObject: vi.fn() } as never
    );

    await expect(service.confirmBookChapters("book-1", [])).rejects.toBeInstanceOf(ChapterConfirmPayloadError);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("throws payload error when chapter indexes are duplicated", async () => {
    const service = createConfirmBookChaptersService(
      {
        book        : { findFirst: vi.fn().mockResolvedValue({ id: "book-1", sourceFileKey: "books/xxx.txt" }) },
        $transaction: vi.fn()
      } as never,
      { getObject: vi.fn().mockResolvedValue(makeChapterBuffer()) } as never
    );

    await expect(
      service.confirmBookChapters("book-1", [
        { index: 1, chapterType: ChapterType.CHAPTER, title: "第一回" },
        { index: 1, chapterType: ChapterType.CHAPTER, title: "第一回补充" }
      ])
    ).rejects.toBeInstanceOf(ChapterConfirmPayloadError);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("throws BookNotFoundError when book does not exist", async () => {
    const service = createConfirmBookChaptersService(
      { book: { findFirst: vi.fn().mockResolvedValue(null) }, $transaction: vi.fn() } as never,
      { getObject: vi.fn() } as never
    );

    await expect(
      service.confirmBookChapters("missing-book", [
        { index: 1, chapterType: ChapterType.CHAPTER, title: "第一回" }
      ])
    ).rejects.toBeInstanceOf(BookNotFoundError);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("throws BookSourceFileMissingError when book sourceFileKey is null", async () => {
    const service = createConfirmBookChaptersService(
      {
        book        : { findFirst: vi.fn().mockResolvedValue({ id: "book-1", sourceFileKey: null }) },
        $transaction: vi.fn()
      } as never,
      { getObject: vi.fn() } as never
    );

    await expect(
      service.confirmBookChapters("book-1", [
        { index: 1, chapterType: ChapterType.CHAPTER, title: "第一回" }
      ])
    ).rejects.toBeInstanceOf(BookSourceFileMissingError);
  });
});
