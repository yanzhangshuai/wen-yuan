import type { PrismaClient } from "@/generated/prisma/client";
import { AnalysisJobStatus } from "@/generated/prisma/enums";
import { prisma } from "@/server/db/prisma";
import { BookNotFoundError } from "@/server/modules/books/errors";

/**
 * 文件定位：
 * - 书籍模块删除服务，属于服务端业务逻辑层（非路由层）。
 * - 该服务负责执行“软删除 + 关联任务状态收敛”，保障数据一致性。
 *
 * 业务规则（重要）：
 * - 删除采用软删除（`deletedAt` 置值），不是物理删除；
 * - 删除书籍时，要把进行中的分析任务标记为 `CANCELED`，防止后台继续消耗资源。
 */

/**
 * 书籍软删除结果。
 */
export interface DeleteBookResult {
  /** 被删除书籍 ID（回传给调用方用于前端列表更新/路由同步）。 */
  id: string;
}

/**
 * 创建删除服务（支持依赖注入，便于测试替换 PrismaClient）。
 *
 * @param prismaClient 数据访问客户端，默认项目全局 prisma。
 * @returns `{ deleteBook }` 业务函数集合。
 */
export function createDeleteBookService(
  prismaClient: PrismaClient = prisma
) {
  /**
   * 功能：软删除书籍，并取消所有进行中的分析任务。
   * 输入：`bookId`。
   * 输出：删除结果（仅返回 ID）。
   * 异常：书籍不存在时抛出 `BookNotFoundError`。
   * 副作用：
   * - 将 `book.deletedAt` 置为当前时间；
   * - 将所有 QUEUED/RUNNING 的 analysisJob 置为 CANCELED。
   */
  async function deleteBook(bookId: string): Promise<DeleteBookResult> {
    // 先查“未删除书籍”，避免重复删除造成幂等歧义（业务上视为资源不存在）。
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
      // 通过领域错误让上层 Route 精准映射 404，而不是通用 500。
      throw new BookNotFoundError(bookId);
    }

    // 事务原因：
    // - 若只删除书籍不取消任务，会出现任务继续运行但书籍已“删除”的脏状态；
    // - 事务确保两步要么都成功，要么都回滚。
    await prismaClient.$transaction([
      prismaClient.book.update({
        where : { id: bookId },
        data  : { deletedAt: new Date() },
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

    // 返回最小必要信息，避免暴露多余内部字段。
    return { id: bookId };
  }

  return { deleteBook };
}

export const { deleteBook } = createDeleteBookService();
