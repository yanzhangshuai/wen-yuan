import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { BookNotFoundError } from "@/server/modules/books/errors";

/**
 * 文件定位（服务端书籍模块 / 状态查询）：
 * - 提供“书籍解析实时状态快照”查询能力。
 * - 被轮询接口、管理后台进度展示等下游消费，属于只读服务层。
 */

/**
 * 统一的查询字段选择器。
 * 目的：让 Prisma 返回类型稳定可推断，避免编辑器/ESLint 在不同版本下出现 unsafe assignment 误报。
 * 额外收益：字段白名单集中维护，可防止无意扩展查询导致性能抖动。
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
  },
  chapters: {
    orderBy: { no: "asc" as const },
    select : {
      no         : true,
      title      : true,
      parseStatus: true
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
  /** 当前阶段文本；为空通常表示尚未开始或阶段未上报。 */
  stage   : string | undefined;
  /** 错误摘要（优先书级错误，其次回退到最新分析任务错误）。 */
  errorLog: string | undefined;
  /** 各章节解析状态列表（按章节号升序）。 */
  chapters: Array<{ no: number; title: string; parseStatus: string }>;
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
    // 先查书籍并一次性拿到所需关联数据，避免多次 round-trip。
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

    // 仅取最新任务的错误日志作为书级 errorLog 的补充信息，防止 UI 空展示。
    const latestJob = book.analysisJobs[0];
    const latestJobErrorLog = latestJob?.errorLog ?? undefined;

    return {
      status  : book.status,
      progress: book.parseProgress,
      // parseStage 可能为 null，这里统一转为 undefined，保持前端可选字段语义一致。
      stage   : book.parseStage ?? undefined,
      errorLog: book.errorLog ?? latestJobErrorLog,
      chapters: book.chapters
    };
  }

  return { getBookStatus };
}

export const { getBookStatus } = createGetBookStatusService();
export { BookNotFoundError } from "@/server/modules/books/errors";
