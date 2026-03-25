import { ChapterType } from "@/generated/prisma/enums";
import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { BookNotFoundError, BookRawContentMissingError } from "@/server/modules/books/errors";

export interface ChapterPreviewItem {
  index      : number;
  chapterType: ChapterType;
  title      : string;
  wordCount  : number;
}

export interface ChapterPreviewResult {
  bookId      : string;
  chapterCount: number;
  items       : ChapterPreviewItem[];
}

const PRELUDE_TITLE_REGEX = /^(楔子|序章?|序言|引子)$/;
const POSTLUDE_TITLE_REGEX = /^(后记|尾声|跋|附录)$/;
const CHINESE_CHAPTER_TITLE_REGEX = /^(第[零〇一二三四五六七八九十百千万\d]+[回章节](?:\s+.+)?)$/;
const ENGLISH_CHAPTER_TITLE_REGEX = /^(chapter\s+\d+(?:\s*[:：.\-]\s*.+)?)$/i;

function detectChapterTypeByTitle(title: string): ChapterType {
  if (PRELUDE_TITLE_REGEX.test(title)) {
    return ChapterType.PRELUDE;
  }

  if (POSTLUDE_TITLE_REGEX.test(title)) {
    return ChapterType.POSTLUDE;
  }

  return ChapterType.CHAPTER;
}

function isChapterTitleLine(line: string): boolean {
  return CHINESE_CHAPTER_TITLE_REGEX.test(line)
    || ENGLISH_CHAPTER_TITLE_REGEX.test(line)
    || PRELUDE_TITLE_REGEX.test(line)
    || POSTLUDE_TITLE_REGEX.test(line);
}

function countWordLikeChars(value: string): number {
  return value.replace(/\s+/g, "").length;
}

/**
 * 先给出“可人工修正”的章节草稿，后续再接模型辅助二次切分。
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

export function createGetChapterPreviewService(
  prismaClient: PrismaClient = prisma
) {
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

