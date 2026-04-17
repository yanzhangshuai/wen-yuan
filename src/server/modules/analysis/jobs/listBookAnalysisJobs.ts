import type { PrismaClient } from "@/generated/prisma/client";
import { type AnalysisJobStatus } from "@/generated/prisma/enums";
import { prisma } from "@/server/db/prisma";
import { BookNotFoundError } from "@/server/modules/books/errors";
import type { AnalysisArchitecture } from "@/types/analysis-pipeline";

/**
 * 文件定位（服务端分析任务查询层）：
 * - 负责列出某本书的分析任务历史，用于后台任务列表、排障与回溯。
 * - 该服务只读数据库，不改动任务状态。
 */

/**
 * 单条解析任务列表项。
 */
export interface AnalysisJobListItem {
  /** 任务 ID。 */
  id            : string;
  /** 任务状态。 */
  status        : AnalysisJobStatus;
  /** 解析架构。 */
  architecture  : AnalysisArchitecture;
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
  /** 最近一次阶段执行所使用的 AI 模型名称（可能为空）。 */
  aiModelName   : string | null;
}

interface AnalysisJobListQueryRow {
  id            : string;
  status        : AnalysisJobStatus;
  architecture  : string;
  scope         : string;
  chapterStart  : number | null;
  chapterEnd    : number | null;
  chapterIndices: number[];
  attempt       : number;
  errorLog      : string | null;
  startedAt     : Date | null;
  finishedAt    : Date | null;
  createdAt     : Date;
  phaseLogs     : Array<{
    model: {
      name: string;
    } | null;
  }>;
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
    // 先校验书籍存在，确保“空列表”不会掩盖 bookId 无效这类调用错误。
    const book = await prismaClient.book.findFirst({
      where : { id: bookId, deletedAt: null },
      select: { id: true }
    });

    if (!book) {
      throw new BookNotFoundError(bookId);
    }

    // phaseLogs 只取最新一条：用于展示“最后一次执行模型”，避免返回过多历史日志。
    const jobs = await prismaClient.analysisJob.findMany({
      where  : { bookId },
      orderBy: { createdAt: "desc" },
      select : {
        id            : true,
        status        : true,
        architecture  : true,
        scope         : true,
        chapterStart  : true,
        chapterEnd    : true,
        chapterIndices: true,
        attempt       : true,
        errorLog      : true,
        startedAt     : true,
        finishedAt    : true,
        createdAt     : true,
        phaseLogs     : {
          take   : 1,
          orderBy: { createdAt: "desc" },
          select : {
            model: {
              select: { name: true }
            }
          }
        }
      }
    }) as AnalysisJobListQueryRow[];

    return jobs.map(job => ({
      id            : job.id,
      status        : job.status,
      architecture  : job.architecture === "threestage" ? "threestage" : "sequential",
      scope         : job.scope,
      chapterStart  : job.chapterStart,
      chapterEnd    : job.chapterEnd,
      chapterIndices: job.chapterIndices,
      attempt       : job.attempt,
      errorLog      : job.errorLog,
      startedAt     : job.startedAt?.toISOString() ?? null,
      finishedAt    : job.finishedAt?.toISOString() ?? null,
      createdAt     : job.createdAt.toISOString(),
      // 防御性判空：历史数据可能没有 phaseLogs 或 model 关联。
      aiModelName   : job.phaseLogs?.[0]?.model?.name ?? null
    }));
  }

  return { listBookAnalysisJobs };
}

export const { listBookAnalysisJobs } = createListBookAnalysisJobsService();
export { BookNotFoundError } from "@/server/modules/books/errors";
