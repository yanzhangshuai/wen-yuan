import type { PrismaClient } from "@/generated/prisma/client";
import { type AnalysisJobStatus } from "@/generated/prisma/enums";
import { prisma } from "@/server/db/prisma";
import { BookNotFoundError } from "@/server/modules/books/errors";

/**
 * 单条解析任务列表项。
 */
export interface AnalysisJobListItem {
  /** 任务 ID。 */
  id            : string;
  /** 任务状态。 */
  status        : AnalysisJobStatus;
  /** 解析范围（FULL_BOOK / CHAPTER_RANGE / CHAPTER_LIST）。 */
  scope         : string;
  /** 章节起点（范围任务）。 */
  chapterStart  : number | null;
  /** 章节终点（范围任务）。 */
  chapterEnd    : number | null;
  /** 指定章节编号列表（CHAPTER_LIST 任务）。 */
  chapterIndices: number[];
  /** 当前重试次数。 */
  attempt       : number;
  /** 失败摘要（失败时有值）。 */
  errorLog      : string | null;
  /** 任务开始时间（ISO 8601）。 */
  startedAt     : string | null;
  /** 任务完成时间（ISO 8601）。 */
  finishedAt    : string | null;
  /** 任务创建时间（ISO 8601）。 */
  createdAt     : string;
  /** 使用的 AI 模型名称。 */
  aiModelName   : string | null;
}

export function createListBookAnalysisJobsService(
  prismaClient: PrismaClient = prisma
) {
  /**
   * 功能：获取指定书籍的所有解析任务记录，按创建时间降序排列。
   * 输入：`bookId`。
   * 输出：解析任务列表。
   * 异常：书籍不存在时抛出 `BookNotFoundError`。
   * 副作用：无（只读查询）。
   */
  async function listBookAnalysisJobs(bookId: string): Promise<AnalysisJobListItem[]> {
    const book = await prismaClient.book.findFirst({
      where : { id: bookId, deletedAt: null },
      select: { id: true }
    });

    if (!book) {
      throw new BookNotFoundError(bookId);
    }

    const jobs = await prismaClient.analysisJob.findMany({
      where  : { bookId },
      orderBy: { createdAt: "desc" },
      select : {
        id            : true,
        status        : true,
        scope         : true,
        chapterStart  : true,
        chapterEnd    : true,
        chapterIndices: true,
        attempt       : true,
        errorLog      : true,
        startedAt     : true,
        finishedAt    : true,
        createdAt     : true,
        aiModel       : {
          select: { name: true }
        }
      }
    });

    return jobs.map(job => ({
      id            : job.id,
      status        : job.status,
      scope         : job.scope,
      chapterStart  : job.chapterStart,
      chapterEnd    : job.chapterEnd,
      chapterIndices: job.chapterIndices,
      attempt       : job.attempt,
      errorLog      : job.errorLog,
      startedAt     : job.startedAt?.toISOString() ?? null,
      finishedAt    : job.finishedAt?.toISOString() ?? null,
      createdAt     : job.createdAt.toISOString(),
      aiModelName   : job.aiModel?.name ?? null
    }));
  }

  return { listBookAnalysisJobs };
}

export const { listBookAnalysisJobs } = createListBookAnalysisJobsService();
export { BookNotFoundError } from "@/server/modules/books/errors";
