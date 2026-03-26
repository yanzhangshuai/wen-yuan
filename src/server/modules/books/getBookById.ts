import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { BookNotFoundError } from "@/server/modules/books/errors";
import { normalizeBookStatus, type BookLibraryListItem } from "@/types/book";

/**
 * 书籍详情查询行。
 */
interface BookDetailRow {
  /** 书籍 ID。 */
  id            : string;
  /** 书名。 */
  title         : string;
  /** 作者。 */
  author        : string | null;
  /** 朝代。 */
  dynasty       : string | null;
  /** 简介。 */
  description   : string | null;
  /** 封面 URL。 */
  coverUrl      : string | null;
  /** 原始状态字符串。 */
  status        : string;
  /** 书级错误摘要。 */
  errorLog      : string | null;
  /** 创建时间。 */
  createdAt     : Date;
  /** 更新时间。 */
  updatedAt     : Date;
  /** 源文件 key。 */
  sourceFileKey : string | null;
  /** 源文件 URL。 */
  sourceFileUrl : string | null;
  /** 源文件名。 */
  sourceFileName: string | null;
  /** 源文件 MIME。 */
  sourceFileMime: string | null;
  /** 源文件大小。 */
  sourceFileSize: number | null;
  /** 当前绑定模型。 */
  aiModel       : {
    name: string;
  } | null;
  chapters    : Array<{ id: string }>;
  profiles    : Array<{ id: string }>;
  analysisJobs: Array<{
    updatedAt : Date;
    finishedAt: Date | null;
    errorLog  : string | null;
    aiModel   : {
      name: string;
    } | null;
  }>;
}

/**
 * 解析最近一次分析时间。
 */
function resolveLastAnalyzedAt(
  status: ReturnType<typeof normalizeBookStatus>,
  updatedAt: Date,
  analysisJobs: BookDetailRow["analysisJobs"]
): string | null {
  return analysisJobs[0]?.finishedAt?.toISOString()
    ?? analysisJobs[0]?.updatedAt.toISOString()
    ?? (status === "PENDING" ? null : updatedAt.toISOString());
}

/**
 * 将详情查询结果映射为统一书籍 DTO。
 */
function mapBookDetail(book: BookDetailRow): BookLibraryListItem {
  const status = normalizeBookStatus(book.status);
  const currentModel = book.aiModel?.name ?? book.analysisJobs[0]?.aiModel?.name ?? null;
  const lastErrorSummary = book.errorLog ?? book.analysisJobs[0]?.errorLog ?? null;

  return {
    id            : book.id,
    title         : book.title,
    author        : book.author,
    dynasty       : book.dynasty,
    coverUrl      : book.coverUrl,
    status,
    chapterCount  : book.chapters.length,
    personaCount  : book.profiles.length,
    lastAnalyzedAt: resolveLastAnalyzedAt(status, book.updatedAt, book.analysisJobs),
    currentModel,
    lastErrorSummary,
    createdAt     : book.createdAt.toISOString(),
    updatedAt     : book.updatedAt.toISOString(),
    sourceFile    : {
      key : book.sourceFileKey,
      url : book.sourceFileUrl,
      name: book.sourceFileName,
      mime: book.sourceFileMime,
      size: book.sourceFileSize
    }
  };
}

export function createGetBookByIdService(
  prismaClient: PrismaClient = prisma
) {
  /**
   * 功能：获取单本书详情。
   * 输入：`bookId`。
   * 输出：`BookLibraryListItem`（与书库卡片结构兼容）。
   * 异常：书籍不存在时抛出 `BookNotFoundError`。
   * 副作用：无（只读查询）。
   */
  async function getBookById(bookId: string): Promise<BookLibraryListItem> {
    const book = await prismaClient.book.findFirst({
      where: {
        id       : bookId,
        deletedAt: null
      },
      select: {
        id            : true,
        title         : true,
        author        : true,
        dynasty       : true,
        description   : true,
        coverUrl      : true,
        status        : true,
        errorLog      : true,
        createdAt     : true,
        updatedAt     : true,
        sourceFileKey : true,
        sourceFileUrl : true,
        sourceFileName: true,
        sourceFileMime: true,
        sourceFileSize: true,
        aiModel       : {
          select: {
            name: true
          }
        },
        chapters: {
          select: {
            id: true
          }
        },
        profiles: {
          where : { deletedAt: null },
          select: {
            id: true
          }
        },
        analysisJobs: {
          take   : 1,
          orderBy: { updatedAt: "desc" },
          select : {
            updatedAt : true,
            finishedAt: true,
            errorLog  : true,
            aiModel   : {
              select: {
                name: true
              }
            }
          }
        }
      }
    });

    if (!book) {
      throw new BookNotFoundError(bookId);
    }

    return mapBookDetail(book as BookDetailRow);
  }

  return { getBookById };
}

export const { getBookById } = createGetBookByIdService();
