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
  createGetChapterPreviewService,
  splitRawContentToChapterPreview
} from "@/server/modules/books/getChapterPreview";
import { isNonContentTitle } from "@/server/modules/books/chapterSplit";

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("splitRawContentToChapterPreview", () => {
  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("splits Chinese chapter titles, keeps prelude (楔子), filters non-content titles (后记)", () => {
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

    // 楔子保留，后记被过滤，共 3 项
    expect(result).toHaveLength(3);
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
    expect(result[2]).toEqual(expect.objectContaining({
      index      : 2,
      chapterType: ChapterType.CHAPTER,
      title      : "第2回 周进入学"
    }));
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
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

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("《儒林外史》前言不应成为章节", () => {
    const content = [
      "前言",
      "这是一段关于儒林外史的介绍文字，作为前言使用。",
      "第一回 说楔子敷陈大义 借名流隐括全文",
      "人生南北多歧路。将相神仙，也要凡人做。",
      "第二回 王孝廉村学识同科 周蒙师暮年登上第",
      "话说山东兖州府汶上县…"
    ].join("\n");

    const result = splitRawContentToChapterPreview(content);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(expect.objectContaining({
      index      : 1,
      chapterType: ChapterType.CHAPTER,
      title      : "第一回 说楔子敷陈大义 借名流隐括全文"
    }));
    expect(result[1]).toEqual(expect.objectContaining({
      index      : 2,
      chapterType: ChapterType.CHAPTER,
      title      : "第二回 王孝廉村学识同科 周蒙师暮年登上第"
    }));
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("正确识别 '第1章' 格式", () => {
    const content = [
      "第1章 开始",
      "章节内容一",
      "第2章 继续",
      "章节内容二"
    ].join("\n");

    const result = splitRawContentToChapterPreview(content);
    expect(result).toHaveLength(2);
    expect(result[0].title).toBe("第1章 开始");
    expect(result[1].title).toBe("第2章 继续");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("正确识别 'Chapter 1' 格式", () => {
    const content = [
      "Chapter 1: The Beginning",
      "Some content here.",
      "Chapter 2: The Middle",
      "More content."
    ].join("\n");

    const result = splitRawContentToChapterPreview(content);
    expect(result).toHaveLength(2);
    expect(result[0].title).toBe("Chapter 1: The Beginning");
    expect(result[1].title).toBe("Chapter 2: The Middle");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("序言、后记不应被识别为正文章节", () => {
    const content = [
      "序言",
      "这是一本关于历史的书。",
      "第一章 起源",
      "正文开始。",
      "后记",
      "作者写于某年。"
    ].join("\n");

    const result = splitRawContentToChapterPreview(content);

    // 只有 "第一章 起源" 应被保留
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(expect.objectContaining({
      index      : 1,
      chapterType: ChapterType.CHAPTER,
      title      : "第一章 起源"
    }));
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("过滤多种非正文标题：出版说明、内容简介、导读、跋", () => {
    const content = [
      "出版说明",
      "本书由XX出版社出版。",
      "内容简介",
      "本书讲述了……",
      "导读",
      "如何阅读本书……",
      "第一回 正文开头",
      "这里是正文。",
      "跋",
      "全书完。"
    ].join("\n");

    const result = splitRawContentToChapterPreview(content);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("第一回 正文开头");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("楔子和引子不被过滤（它们是正文叙事开端）", () => {
    const content = [
      "楔子",
      "话说天下大势……",
      "引子",
      "从前有座山……",
      "第一回 正文",
      "正文内容。"
    ].join("\n");

    const result = splitRawContentToChapterPreview(content);
    // 楔子 + 引子 + 第一回 = 3 章
    expect(result).toHaveLength(3);
    expect(result[0].title).toBe("楔子");
    expect(result[1].title).toBe("引子");
    expect(result[2].title).toBe("第一回 正文");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("尾声和结语不被过滤（它们可能是正文叙事结尾）", () => {
    const content = [
      "第一回 正文",
      "正文内容。",
      "尾声",
      "故事的结局……",
      "结语",
      "最终的总结。"
    ].join("\n");

    const result = splitRawContentToChapterPreview(content);
    // 第一回 + 尾声 + 结语 = 3 章
    expect(result).toHaveLength(3);
    expect(result[0].title).toBe("第一回 正文");
    expect(result[1].title).toBe("尾声");
    expect(result[2].title).toBe("结语");
  });
});

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("isNonContentTitle", () => {
  it.each([
    "前言", "序言", "序", "绪论", "引言", "内容简介",
    "作者简介", "出版说明", "编者按", "编者的话", "导读",
    "再版说明", "修订说明", "译者序", "译后记", "凡例",
    "自序", "他序", "后记", "跋", "附录说明", "序章"
  ])("识别 '%s' 为非正文标题", (title) => {
    expect(isNonContentTitle(title)).toBe(true);
  });

  it.each([
    "第一回 说楔子", "第1章 开始", "Chapter 1", "楔子", "引子",
    "尾声", "结语", "附录", "第三十回 三十回正文"
  ])("不误判 '%s' 为非正文标题", (title) => {
    expect(isNonContentTitle(title)).toBe(false);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("带后缀的非正文标题也能识别", () => {
    expect(isNonContentTitle("前言 关于本书")).toBe(true);
    expect(isNonContentTitle("导读　阅读指南")).toBe(true);
    expect(isNonContentTitle("自序 作者寄语")).toBe(true);
  });
  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
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

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
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

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
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
