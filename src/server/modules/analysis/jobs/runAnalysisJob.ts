import { AnalysisJobStatus } from "@/generated/prisma/enums";
import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { chapterAnalysisService, type ChapterAnalysisResult } from "@/server/modules/analysis/services/ChapterAnalysisService";

/**
 * 功能：定义任务执行时所需的最小章节信息载体。
 * 输入：无（类型声明）。
 * 输出：章节主键与章节序号。
 * 异常：无。
 * 副作用：无。
 */
interface ChapterTask {
  /** 章节主键（UUID），用于调用章节解析服务。 */
  id: string;
  /** 章节序号（从 1 开始），用于日志与进度展示。 */
  no: number;
}

/**
 * 功能：约束章节解析器依赖，仅暴露 `analyzeChapter` 能力。
 * 输入：无（类型声明）。
 * 输出：章节解析函数签名。
 * 异常：无。
 * 副作用：无。
 */
type ChapterAnalyzer = Pick<typeof chapterAnalysisService, "analyzeChapter">;

/**
 * 功能：定义任务执行器读取任务时的最小字段集合。
 * 输入：无（类型声明）。
 * 输出：任务主键、范围与状态等关键字段。
 * 异常：无。
 * 副作用：无。
 */
interface AnalysisJobRow {
  /** 任务主键（UUID）。 */
  id          : string;
  /** 所属书籍主键（UUID）。 */
  bookId      : string;
  /** 当前任务状态（QUEUED/RUNNING/SUCCEEDED/FAILED/CANCELED）。 */
  status      : AnalysisJobStatus;
  /** 执行范围（FULL_BOOK 或 CHAPTER_RANGE）。 */
  scope       : string;
  /** 范围任务起始章节号；全书任务时为 null。 */
  chapterStart: number | null;
  /** 范围任务结束章节号；全书任务时为 null。 */
  chapterEnd  : number | null;
}

/**
 * 功能：构造书籍 `parseStage` 的可读进度文本。
 * 输入：当前章节索引（0-based）与总章节数。
 * 输出：形如“实体提取（第x/y章）”的阶段文案。
 * 异常：无。
 * 副作用：无。
 */
function buildProgressStage(index: number, total: number): string {
  return `实体提取（第${index + 1}/${total}章）`;
}

/**
 * 功能：将未知错误统一转换为可持久化的短错误信息。
 * 输入：unknown 错误对象。
 * 输出：最长 1000 字符的错误文本。
 * 异常：无。
 * 副作用：无。
 */
function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.slice(0, 1000);
  }

  return String(error).slice(0, 1000);
}

/**
 * 功能：按任务 ID 读取解析任务的执行关键字段。
 * 输入：PrismaClient、任务 ID。
 * 输出：任务快照；不存在时返回 null。
 * 异常：数据库访问异常会向上抛出。
 * 副作用：无（只读查询）。
 */
async function loadJob(prismaClient: PrismaClient, jobId: string): Promise<AnalysisJobRow | null> {
  return await prismaClient.analysisJob.findUnique({
    where : { id: jobId },
    select: {
      id          : true,
      bookId      : true,
      status      : true,
      scope       : true,
      chapterStart: true,
      chapterEnd  : true
    }
  });
}

/**
 * 功能：根据任务范围加载本次应执行的章节列表。
 * 输入：PrismaClient、任务快照（含 scope 与章节范围）。
 * 输出：按章节号升序排列的章节任务数组。
 * 异常：
 * - `CHAPTER_RANGE` 且起止为空时抛错；
 * - 数据库查询失败时抛错。
 * 副作用：无（只读查询）。
 */
async function loadChaptersForJob(
  prismaClient: PrismaClient,
  job: AnalysisJobRow
): Promise<ChapterTask[]> {
  if (job.scope === "CHAPTER_RANGE") {
    if (job.chapterStart == null || job.chapterEnd == null) {
      throw new Error(`解析任务 ${job.id} 的章节范围无效`);
    }

    return await prismaClient.chapter.findMany({
      where: {
        bookId: job.bookId,
        no    : {
          gte: job.chapterStart,
          lte: job.chapterEnd
        }
      },
      orderBy: { no: "asc" },
      select : { id: true, no: true }
    });
  }

  return await prismaClient.chapter.findMany({
    where  : { bookId: job.bookId },
    orderBy: { no: "asc" },
    select : { id: true, no: true }
  });
}

/**
 * 功能：以“乐观并发”方式原子抢占一个 QUEUED 任务为 RUNNING。
 * 输入：PrismaClient、任务 ID。
 * 输出：抢占成功返回 true；失败返回 false（已被其他执行器消费）。
 * 异常：数据库更新失败会向上抛出。
 * 副作用：写入 analysis_jobs 的状态与时间字段。
 */
async function claimQueuedJob(prismaClient: PrismaClient, jobId: string): Promise<boolean> {
  const updated = await prismaClient.analysisJob.updateMany({
    where: {
      id    : jobId,
      status: AnalysisJobStatus.QUEUED
    },
    data: {
      status    : AnalysisJobStatus.RUNNING,
      startedAt : new Date(),
      finishedAt: null,
      errorLog  : null
    }
  });

  return updated.count === 1;
}

export function createAnalysisJobRunner(
  prismaClient: PrismaClient = prisma,
  chapterAnalyzer: ChapterAnalyzer = chapterAnalysisService
) {
  /**
   * 功能：执行指定解析任务（支持 QUEUED 任务和中断后的 RUNNING 任务继续跑）。
   * 输入：jobId。
   * 输出：无（完成后更新任务与书籍状态）。
   * 异常：仅在无法加载任务时抛错；执行错误会写回 DB 后再抛出。
   * 副作用：
   * - 更新 analysis_jobs.status/started_at/finished_at/error_log；
   * - 更新 books.status/parse_progress/parse_stage/error_log；
   * - 调用章节分析并写入章节草稿数据。
   */
  async function runAnalysisJobById(jobId: string): Promise<void> {
    const existingJob = await loadJob(prismaClient, jobId);
    if (!existingJob) {
      throw new Error(`解析任务不存在: ${jobId}`);
    }

    // 已经终态的任务直接短路，避免重复执行导致草稿重复写入或状态回退。
    if (existingJob.status === AnalysisJobStatus.SUCCEEDED || existingJob.status === AnalysisJobStatus.CANCELED) {
      return;
    }

    // QUEUED 任务先抢占为 RUNNING；抢占失败说明被并发执行器消费，当前执行器直接退出。
    if (existingJob.status === AnalysisJobStatus.QUEUED) {
      const claimed = await claimQueuedJob(prismaClient, existingJob.id);
      if (!claimed) {
        return;
      }
    }

    // 重新读取一次任务状态，确保后续执行基于最新快照。
    const job = await loadJob(prismaClient, jobId);
    if (!job || job.status !== AnalysisJobStatus.RUNNING) {
      return;
    }

    let chapters: ChapterTask[] = [];
    let completed = 0;
    try {
      chapters = await loadChaptersForJob(prismaClient, job);
      if (chapters.length === 0) {
        throw new Error(`解析任务 ${job.id} 未找到可执行章节`);
      }

      // 初始化书籍解析状态，后续在章节循环中持续刷新进度与阶段文本。
      await prismaClient.book.update({
        where: { id: job.bookId },
        data : {
          status       : "PROCESSING",
          parseProgress: 0,
          parseStage   : buildProgressStage(0, chapters.length),
          errorLog     : null
        }
      });

      for (const [index, chapter] of chapters.entries()) {
        await prismaClient.book.update({
          where: { id: job.bookId },
          data : {
            parseProgress: Math.floor((index / chapters.length) * 100),
            parseStage   : buildProgressStage(index, chapters.length)
          }
        });

        const result: ChapterAnalysisResult = await chapterAnalyzer.analyzeChapter(chapter.id);
        completed += 1;

        // 结构化日志用于排查“卡在某一章”或“章节草稿写入异常”等问题。
        console.info(
          "[analysis.runner] chapter.completed",
          JSON.stringify({
            jobId    : job.id,
            chapterId: chapter.id,
            chapterNo: chapter.no,
            created  : result.created
          })
        );
      }

      await prismaClient.$transaction([
        prismaClient.analysisJob.update({
          where: { id: job.id },
          data : {
            status    : AnalysisJobStatus.SUCCEEDED,
            finishedAt: new Date(),
            errorLog  : null
          }
        }),
        prismaClient.book.update({
          where: { id: job.bookId },
          data : {
            status       : "COMPLETED",
            parseProgress: 100,
            parseStage   : "完成",
            errorLog     : null
          }
        })
      ]);
    } catch (error) {
      const errorMessage = toErrorMessage(error);
      const failedProgress = chapters.length === 0
        ? 0
        : Math.floor((completed / chapters.length) * 100);

      // 失败时同步回写任务与书籍状态，便于前台/后台展示一致的错误上下文。
      await prismaClient.$transaction([
        prismaClient.analysisJob.update({
          where: { id: job.id },
          data : {
            status    : AnalysisJobStatus.FAILED,
            finishedAt: new Date(),
            errorLog  : errorMessage
          }
        }),
        prismaClient.book.update({
          where: { id: job.bookId },
          data : {
            status       : "ERROR",
            parseProgress: failedProgress,
            parseStage   : "解析失败",
            errorLog     : errorMessage
          }
        })
      ]);

      throw error;
    }
  }

  /**
   * 功能：调度并执行一个待处理任务（优先恢复 RUNNING 中断任务，其次消费 QUEUED）。
   * 输入：无。
   * 输出：执行到的 jobId；若无任务返回 null。
   * 异常：执行失败时向上抛出。
   * 副作用：同 runAnalysisJobById。
   */
  async function runNextAnalysisJob(): Promise<string | null> {
    const recoverableRunningJob = await prismaClient.analysisJob.findFirst({
      where: {
        status    : AnalysisJobStatus.RUNNING,
        finishedAt: null
      },
      orderBy: { updatedAt: "asc" },
      select : { id: true }
    });

    // 优先恢复 RUNNING 且未 finished 的任务，避免进程重启后出现“僵尸任务”。
    if (recoverableRunningJob) {
      await runAnalysisJobById(recoverableRunningJob.id);
      return recoverableRunningJob.id;
    }

    const queuedJob = await prismaClient.analysisJob.findFirst({
      where  : { status: AnalysisJobStatus.QUEUED },
      orderBy: { createdAt: "asc" },
      select : { id: true }
    });

    if (!queuedJob) {
      return null;
    }

    // 无可恢复任务时按 FIFO 消费最早入队任务。
    await runAnalysisJobById(queuedJob.id);
    return queuedJob.id;
  }

  return {
    runAnalysisJobById,
    runNextAnalysisJob
  };
}

export const {
  runAnalysisJobById,
  runNextAnalysisJob
} = createAnalysisJobRunner();
