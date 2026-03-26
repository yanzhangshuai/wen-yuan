import { ChapterType } from "@/generated/prisma/enums";
import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { BookNotFoundError, BookRawContentMissingError } from "@/server/modules/books/errors";
import { splitRawContentToChapterPreview } from "@/server/modules/books/getChapterPreview";

export interface ConfirmBookChapterInputItem {
  /** 章节序号（从 1 开始，需唯一）。 */
  index      : number;
  /** 章节类型。 */
  chapterType: ChapterType;
  /** 章节标题。 */
  title      : string;
  /** 手动覆盖正文（可选）。 */
  content?   : string | null;
}

export interface ConfirmBookChaptersResult {
  /** 书籍 ID。 */
  bookId      : string;
  /** 最终确认的章节总数。 */
  chapterCount: number;
  /** 持久化后的章节摘要。 */
  items       : Array<{
    /** 章节序号。 */
    index      : number;
    /** 章节类型。 */
    chapterType: ChapterType;
    /** 章节标题。 */
    title      : string;
    /** 章节字数（按非空白字符统计）。 */
    wordCount  : number;
  }>;
}

/**
 * 功能：表示章节确认请求体不合法。
 * 输入：`message` 业务错误信息。
 * 输出：错误实例。
 * 异常：无。
 * 副作用：无。
 */
export class ChapterConfirmPayloadError extends Error {
  constructor(message: string) {
    super(message);
  }
}

/**
 * 功能：统计文本字数（忽略空白字符）。
 * 输入：`value` 文本。
 * 输出：字符数。
 * 异常：无。
 * 副作用：无。
 */
function countWordLikeChars(value: string): number {
  return value.replace(/\s+/g, "").length;
}

/**
 * 功能：标准化并校验章节数组（按序排序 + 去重校验）。
 * 输入：`items` 章节输入列表。
 * 输出：按 `index` 升序的新数组。
 * 异常：章节序号重复时抛 `ChapterConfirmPayloadError`。
 * 副作用：无。
 */
function normalizeChapterItems(items: ConfirmBookChapterInputItem[]): ConfirmBookChapterInputItem[] {
  const sortedItems = [...items].sort((left, right) => left.index - right.index);

  const seen = new Set<number>();
  for (const item of sortedItems) {
    if (seen.has(item.index)) {
      throw new ChapterConfirmPayloadError("章节序号不能重复");
    }
    seen.add(item.index);
  }

  return sortedItems;
}

/**
 * 功能：为确认后的章节生成最终正文内容。
 * 输入：`rawContent` 原文、`confirmedItems` 用户确认章节。
 * 输出：与 `confirmedItems` 一一对应的正文字符串数组。
 * 异常：无。
 * 副作用：无。
 */
function resolveChapterContents(
  rawContent: string,
  confirmedItems: ConfirmBookChapterInputItem[]
): string[] {
  const previewItems = splitRawContentToChapterPreview(rawContent);
  const fallbackContents = previewItems.map((item) => item.title);

  const lines = rawContent.split(/\r?\n/);
  const titleLineIndexes: number[] = [];
  lines.forEach((line, lineIndex) => {
    const normalizedLine = line.trim();
    if (!normalizedLine) {
      return;
    }

    if (fallbackContents.includes(normalizedLine)) {
      titleLineIndexes.push(lineIndex);
    }
  });

  const autoContents = previewItems.map((_item, index) => {
    const startLine = titleLineIndexes[index];
    const nextStartLine = titleLineIndexes[index + 1] ?? lines.length;
    if (startLine === undefined) {
      return "";
    }

    return lines.slice(startLine + 1, nextStartLine).join("\n");
  });

  return confirmedItems.map((item, index) => {
    const explicitContent = item.content?.trim();
    if (explicitContent) {
      return explicitContent;
    }

    const isLastItem = index === confirmedItems.length - 1;
    if (isLastItem && index < autoContents.length) {
      return autoContents.slice(index).join("\n\n");
    }

    return autoContents[index] ?? "";
  });
}

/**
 * 功能：创建章节确认服务（覆盖写入章节表）。
 * 输入：可注入 `prismaClient`。
 * 输出：`{ confirmBookChapters }`。
 * 异常：由内部 `confirmBookChapters` 抛出。
 * 副作用：无（仅返回闭包函数）。
 */
export function createConfirmBookChaptersService(
  prismaClient: PrismaClient = prisma
) {
  /**
   * 功能：落库用户确认后的章节切分结果。
   * 输入：`bookId` 与确认后的章节数组。
   * 输出：`ConfirmBookChaptersResult`。
   * 异常：无章节输入、书籍不存在、原文缺失时抛业务错误。
   * 副作用：删除旧章节并批量写入新章节。
   */
  async function confirmBookChapters(
    bookId: string,
    items: ConfirmBookChapterInputItem[]
  ): Promise<ConfirmBookChaptersResult> {
    if (items.length === 0) {
      throw new ChapterConfirmPayloadError("至少需要确认一个章节");
    }

    const book = await prismaClient.book.findFirst({
      where: {
        id       : bookId,
        deletedAt: null
      },
      select: {
        id        : true,
        rawContent: true
      }
    });

    if (!book) {
      throw new BookNotFoundError(bookId);
    }

    if (!book.rawContent?.trim()) {
      throw new BookRawContentMissingError(bookId);
    }

    const normalizedItems = normalizeChapterItems(items);
    const contents = resolveChapterContents(book.rawContent, normalizedItems);
    const now = new Date();

    await prismaClient.$transaction(async (tx) => {
      await tx.chapter.deleteMany({
        where: { bookId }
      });

      await tx.chapter.createMany({
        data: normalizedItems.map((item, index) => ({
          bookId,
          type      : item.chapterType,
          no        : item.index,
          unit      : "回",
          noText    : null,
          title     : item.title.trim(),
          content   : contents[index] ?? "",
          isAbstract: item.chapterType === ChapterType.PRELUDE,
          createdAt : now,
          updatedAt : now
        }))
      });
    });

    return {
      bookId,
      chapterCount: normalizedItems.length,
      items       : normalizedItems.map((item, index) => ({
        index      : item.index,
        chapterType: item.chapterType,
        title      : item.title.trim(),
        wordCount  : countWordLikeChars(contents[index] ?? "")
      }))
    };
  }

  return { confirmBookChapters };
}

export const { confirmBookChapters } = createConfirmBookChaptersService();
export { BookNotFoundError, BookRawContentMissingError } from "@/server/modules/books/errors";
