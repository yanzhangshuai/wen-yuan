import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { normalizeBookStatus, type BookLibraryListItem } from "@/types/book";

/**
 * 书库查询行（v1.1 新契约：包含 source file 字段）。
 */
interface BookListRow {
  /** 书籍 ID。 */
  id       : string;
  /** 书名。 */
  title    : string;
  /** 作者。 */
  author   : string | null;
  /** 朝代。 */
  dynasty  : string | null;
  /** 封面 URL。 */
  coverUrl : string | null;
  /** 原始状态字符串（DB 中为可扩展字符串）。 */
  status   : string;
  /** 创建时间。 */
  createdAt: Date;
  /** 更新时间。 */
  updatedAt: Date;
  /** 书级错误摘要。 */
  errorLog : string | null;
  /** 当前绑定模型。 */
  aiModel      : {
    name: string;
  } | null;
  /** 章节占位数组（用于计数）。 */
  chapters    : Array<{ id: string }>;
  /** 人物档案占位数组（用于计数）。 */
  profiles    : Array<{ id: string }>;
  /** 最近一次解析任务快照（取 latest 1 条）。 */
  analysisJobs: Array<{
    updatedAt : Date;
    finishedAt: Date | null;
    errorLog  : string | null;
    aiModel   : {
      name: string;
    } | null;
  }>;
  /** 存储对象 key。 */
  sourceFileKey : string | null;
  /** 可访问 URL。 */
  sourceFileUrl : string | null;
  /** 原始文件名。 */
  sourceFileName: string | null;
  /** 文件 MIME。 */
  sourceFileMime: string | null;
  /** 文件大小（字节）。 */
  sourceFileSize: number | null;
}

/** Prisma 查询选择集：统一新契约字段。 */
const BOOK_LIST_SELECT = {
  id       : true,
  title    : true,
  author   : true,
  dynasty  : true,
  coverUrl : true,
  status   : true,
  createdAt: true,
  updatedAt: true,
  errorLog : true,
  aiModel  : {
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
  },
  sourceFileKey : true,
  sourceFileUrl : true,
  sourceFileName: true,
  sourceFileMime: true,
  sourceFileSize: true
} as const;

/**
 * 解析最近一次分析时间。
 * 优先级：任务完成时间 > 任务更新时间 > 书更新时间（非 PENDING）。
 */
function resolveLastAnalyzedAt(
  status: ReturnType<typeof normalizeBookStatus>,
  updatedAt: Date,
  analysisJobs: BookListRow["analysisJobs"]
): string | null {
  return analysisJobs[0]?.finishedAt?.toISOString()
    ?? analysisJobs[0]?.updatedAt.toISOString()
    ?? (status === "PENDING" ? null : updatedAt.toISOString());
}

/**
 * 将查询行映射为统一 `BookLibraryListItem`。
 */
function mapBook(book: BookListRow): BookLibraryListItem {
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

export function createListBooksService(
  prismaClient: PrismaClient = prisma
) {
  /**
   * 功能：获取书库列表（按更新时间倒序）。
   * 输入：无。
   * 输出：统一书库卡片数据列表（新 schema）。
   * 异常：数据库异常向上抛出。
   * 副作用：无（只读查询）。
   */
  async function listBooks(): Promise<BookLibraryListItem[]> {
    const books = await prismaClient.book.findMany({
      where  : { deletedAt: null },
      orderBy: { updatedAt: "desc" },
      select : BOOK_LIST_SELECT
    });

    return books.map((book) => mapBook(book as BookListRow));
  }

  return { listBooks };
}

export const { listBooks } = createListBooksService();
