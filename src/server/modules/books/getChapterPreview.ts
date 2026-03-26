import { ChapterType } from "@/generated/prisma/enums";
import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { BookNotFoundError, BookRawContentMissingError } from "@/server/modules/books/errors";

export interface ChapterPreviewItem {
  /** 章节序号（从 1 开始）。 */
  index      : number;
  /** 章节类型（PRELUDE/CHAPTER/POSTLUDE）。 */
  chapterType: ChapterType;
  /** 章节标题。 */
  title      : string;
  /** 章节正文字数（按非空白字符计数）。 */
  wordCount  : number;
}

export interface ChapterPreviewResult {
  /** 书籍 ID。 */
  bookId      : string;
  /** 自动切分后的章节总数。 */
  chapterCount: number;
  /** 章节预览列表。 */
  items       : ChapterPreviewItem[];
}

const PRELUDE_TITLE_REGEX = /^(楔子|序章?|序言|引子)$/;
const POSTLUDE_TITLE_REGEX = /^(后记|尾声|跋|附录)$/;
const CHINESE_CHAPTER_TITLE_REGEX = /^(第[零〇一二三四五六七八九十百千万\d]+[回章节](?:\s+.+)?)$/;
const ENGLISH_CHAPTER_TITLE_REGEX = /^(chapter\s+\d+(?:\s*[:：.\-]\s*.+)?)$/i;

/**
 * 功能：根据章节标题推断章节类型。
 * 输入：`title`（单行标题文本）。
 * 输出：`ChapterType`。
 * 异常：无。
 * 副作用：无。
 */
function detectChapterTypeByTitle(title: string): ChapterType {
  if (PRELUDE_TITLE_REGEX.test(title)) {
    return ChapterType.PRELUDE;
  }

  if (POSTLUDE_TITLE_REGEX.test(title)) {
    return ChapterType.POSTLUDE;
  }

  return ChapterType.CHAPTER;
}

/**
 * 功能：判断某一行是否可识别为章节标题。
 * 输入：`line`（已 trim 的文本行）。
 * 输出：布尔值。
 * 异常：无。
 * 副作用：无。
 */
function isChapterTitleLine(line: string): boolean {
  return CHINESE_CHAPTER_TITLE_REGEX.test(line)
    || ENGLISH_CHAPTER_TITLE_REGEX.test(line)
    || PRELUDE_TITLE_REGEX.test(line)
    || POSTLUDE_TITLE_REGEX.test(line);
}

/**
 * 功能：统计文本字数（忽略所有空白字符）。
 * 输入：`value` 文本。
 * 输出：字符数。
 * 异常：无。
 * 副作用：无。
 */
function countWordLikeChars(value: string): number {
  return value.replace(/\s+/g, "").length;
}

/**
 * 功能：将原始全文按标题规则切分为章节预览。
 * 输入：`rawContent`（整本书原文）。
 * 输出：`ChapterPreviewItem[]`（可人工确认与调整的草稿章节）。
 * 异常：无。
 * 副作用：无。
 */
export function splitRawContentToChapterPreview(rawContent: string): ChapterPreviewItem[] {
  const lines = rawContent.split(/\r?\n/);
  const titleLines: Array<{ lineIndex: number; title: string }> = [];

  lines.forEach((line, lineIndex) => {
    const normalizedLine = line.trim();
    if (!normalizedLine) {
      return;
    }

    if (isChapterTitleLine(normalizedLine)) {
      titleLines.push({
        lineIndex,
        title: normalizedLine
      });
    }
  });

  if (titleLines.length === 0) {
    return [
      {
        index      : 1,
        chapterType: ChapterType.CHAPTER,
        title      : "正文",
        wordCount  : countWordLikeChars(rawContent)
      }
    ];
  }

  return titleLines.map((item, index) => {
    const nextItem = titleLines[index + 1];
    const contentStart = item.lineIndex + 1;
    const contentEnd = nextItem ? nextItem.lineIndex : lines.length;
    const contentLines = lines.slice(contentStart, contentEnd);
    const content = contentLines.join("\n");

    return {
      index      : index + 1,
      chapterType: detectChapterTypeByTitle(item.title),
      title      : item.title,
      wordCount  : countWordLikeChars(content)
    };
  });
}

/**
 * 功能：创建章节预览查询服务。
 * 输入：可注入 `prismaClient`。
 * 输出：`{ getChapterPreview }`。
 * 异常：由内部 `getChapterPreview` 抛出。
 * 副作用：无。
 */
export function createGetChapterPreviewService(
  prismaClient: PrismaClient = prisma
) {
  /**
   * 功能：读取指定书籍并返回章节切分预览。
   * 输入：`bookId`（UUID）。
   * 输出：`ChapterPreviewResult`。
   * 异常：书籍不存在抛 `BookNotFoundError`；原文为空抛 `BookRawContentMissingError`。
   * 副作用：无（只读查询）。
   */
  async function getChapterPreview(bookId: string): Promise<ChapterPreviewResult> {
    const book = await prismaClient.book.findUnique({
      where : { id: bookId },
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

    const items = splitRawContentToChapterPreview(book.rawContent);
    return {
      bookId      : book.id,
      chapterCount: items.length,
      items
    };
  }

  return { getChapterPreview };
}

export const { getChapterPreview } = createGetChapterPreviewService();
export { BookNotFoundError, BookRawContentMissingError } from "@/server/modules/books/errors";
