import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { BookNotFoundError } from "@/server/modules/books/errors";

/**
 * 原文阅读返回的段落结构。
 */
export interface ChapterReadParagraph {
  /** 段落下标（从 0 开始）。 */
  index            : number;
  /** 段落全文。 */
  text             : string;
  /** 段落是否包含高亮关键词。 */
  containsHighlight: boolean;
}

/**
 * 章节阅读快照。
 */
export interface ChapterReadSnapshot {
  /** 书籍 ID。 */
  bookId           : string;
  /** 章节 ID。 */
  chapterId        : string;
  /** 章节序号。 */
  chapterNo        : number;
  /** 章节标题。 */
  chapterTitle     : string;
  /** 当前选中段落下标（可为空）。 */
  selectedParaIndex: number | null;
  /** 高亮关键词（可为空）。 */
  highlight        : string | null;
  /** 章节段落数组。 */
  paragraphs       : ChapterReadParagraph[];
}

/**
 * 章节不存在错误（或章节不属于该书）。
 */
export class ChapterNotFoundError extends Error {
  /** 章节 ID。 */
  readonly chapterId: string;
  /** 所属书籍 ID。 */
  readonly bookId   : string;

  /**
   * @param bookId 书籍 ID。
   * @param chapterId 章节 ID。
   */
  constructor(bookId: string, chapterId: string) {
    super(`Chapter not found: ${chapterId} (book: ${bookId})`);
    this.chapterId = chapterId;
    this.bookId = bookId;
  }
}

/**
 * 段落下标越界错误。
 */
export class ParaIndexOutOfRangeError extends Error {
  /** 非法请求的段落下标。 */
  readonly paraIndex: number;
  /** 当前章节允许的最大下标。 */
  readonly maxIndex : number;

  /**
   * @param paraIndex 请求的段落下标。
   * @param maxIndex 当前章节最大下标。
   */
  constructor(paraIndex: number, maxIndex: number) {
    super(`paraIndex out of range: ${paraIndex}, max: ${maxIndex}`);
    this.paraIndex = paraIndex;
    this.maxIndex = maxIndex;
  }
}

/**
 * 章节阅读输入参数。
 */
export interface ReadChapterInput {
  /** 书籍 ID。 */
  bookId    : string;
  /** 章节 ID。 */
  chapterId : string;
  /** 可选段落下标。 */
  paraIndex?: number;
  /** 可选高亮关键词。 */
  highlight?: string;
}

/**
 * 将章节正文切分成段落。
 * 优先按空行切分，若无空行则按单行切分。
 */
function splitChapterToParagraphs(content: string): string[] {
  const normalized = content.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return [];
  }

  const byBlankLine = normalized
    .split(/\n\s*\n+/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (byBlankLine.length > 1) {
    return byBlankLine;
  }

  return normalized
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function createReadChapterService(
  prismaClient: PrismaClient = prisma
) {
  /**
   * 功能：读取章节原文并返回段落列表。
   * 输入：书籍 ID、章节 ID、可选段落下标/高亮词。
   * 输出：章节阅读快照（段落 + 高亮命中标记）。
   * 异常：
   * - `BookNotFoundError`：书籍不存在；
   * - `ChapterNotFoundError`：章节不存在或不属于该书；
   * - `ParaIndexOutOfRangeError`：段落下标越界。
   * 副作用：无（只读查询）。
   */
  async function readChapter(input: ReadChapterInput): Promise<ChapterReadSnapshot> {
    const book = await prismaClient.book.findFirst({
      where: {
        id       : input.bookId,
        deletedAt: null
      },
      select: { id: true }
    });
    if (!book) {
      throw new BookNotFoundError(input.bookId);
    }

    const chapter = await prismaClient.chapter.findFirst({
      where: {
        id    : input.chapterId,
        bookId: input.bookId
      },
      select: {
        id     : true,
        no     : true,
        title  : true,
        content: true
      }
    });
    if (!chapter) {
      throw new ChapterNotFoundError(input.bookId, input.chapterId);
    }

    const paragraphs = splitChapterToParagraphs(chapter.content);
    const maxIndex = paragraphs.length > 0 ? paragraphs.length - 1 : 0;
    if (typeof input.paraIndex === "number" && (input.paraIndex < 0 || input.paraIndex >= paragraphs.length)) {
      throw new ParaIndexOutOfRangeError(input.paraIndex, maxIndex);
    }

    const normalizedHighlight = input.highlight?.trim() ? input.highlight.trim() : null;
    return {
      bookId           : input.bookId,
      chapterId        : chapter.id,
      chapterNo        : chapter.no,
      chapterTitle     : chapter.title,
      selectedParaIndex: typeof input.paraIndex === "number" ? input.paraIndex : null,
      highlight        : normalizedHighlight,
      paragraphs       : paragraphs.map((item, index) => ({
        index,
        text             : item,
        containsHighlight: normalizedHighlight ? item.includes(normalizedHighlight) : false
      }))
    };
  }

  return {
    readChapter
  };
}

export const { readChapter } = createReadChapterService();
