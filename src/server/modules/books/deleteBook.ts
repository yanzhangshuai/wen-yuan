import type { PrismaClient } from "@/generated/prisma/client";
import { AnalysisJobStatus } from "@/generated/prisma/enums";
import { prisma } from "@/server/db/prisma";
import { BookNotFoundError } from "@/server/modules/books/errors";

/**
 * 书籍软删除结果。
 */
export interface DeleteBookResult {
  /** 被删除书籍 ID。 */
  id: string;
}

export function createDeleteBookService(
  prismaClient: PrismaClient = prisma
) {
  /**
   * 功能：软删除书籍，并取消所有进行中的分析任务。
   * 输入：`bookId`。
   * 输出：删除结果（仅返回 ID）。
   * 异常：书籍不存在时抛出 `BookNotFoundError`。
   * 副作用：将 `book.deletedAt` 置为当前时间；将所有 QUEUED/RUNNING 的 analysisJob 置为 CANCELED。
   */
  async function deleteBook(bookId: string): Promise<DeleteBookResult> {
    const book = await prismaClient.book.findFirst({
      where: {
        id       : bookId,
        deletedAt: null
      },
      select: {
        id: true
      }
    });

    if (!book) {
      throw new BookNotFoundError(bookId);
    }

    await prismaClient.$transaction([
      prismaClient.book.update({
        where: { id: bookId },
        data : { deletedAt: new Date() },
        select: { id: true }
      }),
      prismaClient.analysisJob.updateMany({
        where: {
          bookId,
          status: { in: [AnalysisJobStatus.QUEUED, AnalysisJobStatus.RUNNING] }
        },
        data: { status: AnalysisJobStatus.CANCELED }
      })
    ]);

    return { id: bookId };
  }

  return { deleteBook };
}

export const { deleteBook } = createDeleteBookService();
