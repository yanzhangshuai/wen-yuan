import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { BookNotFoundError } from "@/server/modules/books/errors";

/**
 * 统一的查询字段选择器。
 * 目的：让 Prisma 返回类型稳定可推断，避免编辑器/ESLint 在不同版本下出现 unsafe assignment 误报。
 */
const BOOK_STATUS_SELECT = {
  status       : true,
  parseProgress: true,
  parseStage   : true,
  errorLog     : true,
  analysisJobs : {
    take   : 1,
    orderBy: { updatedAt: "desc" as const },
    select : {
      errorLog: true
    }
  }
} satisfies Prisma.BookSelect;

/**
 * 书籍解析状态快照。
 */
export interface BookStatusSnapshot {
  /** 当前状态字符串（如 PENDING/PROCESSING/COMPLETED/ERROR）。 */
  status  : string;
  /** 解析进度（0~100）。 */
  progress: number;
  /** 当前阶段文本。 */
  stage   : string | undefined;
  /** 错误摘要（优先书级，其次最新任务级）。 */
  errorLog: string | undefined;
}

export function createGetBookStatusService(
  prismaClient: PrismaClient = prisma
) {
  /**
   * 功能：查询单本书的实时解析状态。
   * 输入：`bookId`。
   * 输出：状态快照（状态/进度/阶段/错误摘要）。
   * 异常：书籍不存在时抛出 `BookNotFoundError`。
   * 副作用：无（只读查询）。
   */
  async function getBookStatus(bookId: string): Promise<BookStatusSnapshot> {
    const book = await prismaClient.book.findFirst({
      where: {
        id       : bookId,
        deletedAt: null
      },
      select: BOOK_STATUS_SELECT
    });

    if (!book) {
      throw new BookNotFoundError(bookId);
    }

    const latestJob = book.analysisJobs[0];
    const latestJobErrorLog = latestJob?.errorLog ?? undefined;

    return {
      status  : book.status,
      progress: book.parseProgress,
      stage   : book.parseStage ?? undefined,
      errorLog: book.errorLog ?? latestJobErrorLog
    };
  }

  return { getBookStatus };
}

export const { getBookStatus } = createGetBookStatusService();
export { BookNotFoundError } from "@/server/modules/books/errors";
