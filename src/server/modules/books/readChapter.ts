import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { BookNotFoundError } from "@/server/modules/books/errors";

/**
 * ============================================================================
 * 文件定位：`src/server/modules/books/readChapter.ts`
 * ----------------------------------------------------------------------------
 * 这是“章节阅读”服务模块，负责把章节原文转换成阅读面板可消费的数据结构。
 *
 * 业务职责：
 * - 校验书籍与章节归属关系；
 * - 将章节正文按规则切分段落；
 * - 处理可选段落定位（paraIndex）与关键词命中标记（highlight）。
 *
 * 上下游关系：
 * - 上游：`GET /api/books/:id/chapters/:chapterId/read`；
 * - 下游：Prisma 读取 `book/chapter`；
 * - 输出：`ChapterReadSnapshot`（直接供前端阅读侧栏渲染）。
 *
 * 注意：
 * - 段落切分规则属于业务体验规则，不是底层技术限制；
 * - 当前高亮使用 `includes`（大小写敏感、非分词匹配），如需更强检索应在后续迭代扩展。
 * ============================================================================
 */

/**
 * 原文阅读返回段落项。
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
  /** 章节段落数组（按正文顺序）。 */
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
  /** 可选段落下标（从 0 开始，常由证据跳转传入）。 */
  paraIndex?: number;
  /** 可选高亮关键词（空白字符串会被归一为 null）。 */
  highlight?: string;
}

/**
 * 将章节正文切分为段落数组。
 *
 * 规则分支说明：
 * 1) 先统一换行并 trim；
 * 2) 优先按“空行块”切分（更符合传统文本段落语义）；
 * 3) 若只有单块，则降级按单行切分（兼容没有空行的文本来源）。
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
    // Step 1) 校验书籍存在，形成服务层明确错误语义。
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

    // Step 2) 校验章节存在且属于该书，避免跨书读取。
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

    // Step 3) 正文切段并校验 paraIndex 边界。
    const paragraphs = splitChapterToParagraphs(chapter.content);
    // 空章节时 maxIndex 置为 0，用于错误提示统一输出范围。
    const maxIndex = paragraphs.length > 0 ? paragraphs.length - 1 : 0;
    if (typeof input.paraIndex === "number" && (input.paraIndex < 0 || input.paraIndex >= paragraphs.length)) {
      throw new ParaIndexOutOfRangeError(input.paraIndex, maxIndex);
    }

    // Step 4) 归一化高亮关键词：空字符串视为“不启用高亮”。
    const normalizedHighlight = input.highlight?.trim() ? input.highlight.trim() : null;
    return {
      bookId           : input.bookId,
      chapterId        : chapter.id,
      chapterNo        : chapter.no,
      chapterTitle     : chapter.title,
      selectedParaIndex: typeof input.paraIndex === "number" ? input.paraIndex : null,
      highlight        : normalizedHighlight,
      // Step 5) 生成段落视图模型，包含高亮命中布尔值。
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
