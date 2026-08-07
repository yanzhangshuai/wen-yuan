/**
 * v5 分析管线编排器（runAnalysisJob）
 * =============================================================================
 * 文件定位：`src/server/modules/analysis/jobs/runAnalysisJob.ts`
 *
 * 职责：确定性编排 v5 管线 Pass0-5，串联已就绪的组件
 *   （identity / extraction / review / skills），不承载业务逻辑。
 *
 * 时序（arch doc §2.2/§2.3，硬约束）：
 *   claim → 快照(selectSkillsForJob) → 装载(resolveSkillsForJob)
 *     → Pass0(Tier1→Tier2) → Pass1(extractSlice+落库)
 *     → reconcile(Pass1 后 Pass3 前) → Pass3(refresh+Neo4j)
 *     → Pass4(自动接受) → Pass5(markOrphan+skillGenerator) → 终态
 *
 * 设计原则：
 * - 组件厚 + 管线薄：各 Pass 逻辑已在域模块实现，此处只编排；
 * - facts 唯一写入口：facts/mentions/aliases 由本管线落库；
 * - 乐观并发 claim：updateMany QUEUED→RUNNING，抢到才执行。
 */
import { AnalysisJobStatus } from "@/generated/prisma/enums";
import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import type { AnalysisScope } from "@/server/modules/books/startBookAnalysis";

/** 管线运行的 job 上下文（各 Pass 共享）。 */
export interface JobRunContext {
  jobId : string;
  bookId: string;
  scope : AnalysisScope;
}

/**
 * 功能：创建 v5 分析管线编排器。
 * 输入：prisma 客户端。
 * 输出：`runAnalysisJobById` / `runNextAnalysisJob`。
 * 异常：见各 Pass。
 * 副作用：读取/写入 analysis_jobs / facts / entities 等。
 */
export function createAnalysisJobRunner(prismaClient: PrismaClient = prisma) {
  /**
   * 功能：乐观抢占一个 QUEUED job（QUEUED→RUNNING）。
   * 输入：jobId。
   * 输出：是否抢到（true=本进程执行，false=已被其他 runner 处理）。
   * 副作用：更新 analysis_jobs 状态 + startedAt。
   */
  async function claimQueuedJob(jobId: string): Promise<boolean> {
    const result = await prismaClient.analysisJob.updateMany({
      where: { id: jobId, status: AnalysisJobStatus.QUEUED },
      data : {
        status    : AnalysisJobStatus.RUNNING,
        startedAt : new Date(),
        finishedAt: null,
        errorLog  : null
      }
    });
    return result.count === 1;
  }

  /**
   * 功能：检查任务是否被取消（status === CANCELED）。
   * 输入：jobId。
   * 输出：true=已取消。
   * 副作用：只读查询。
   */
  async function isJobCanceled(jobId: string): Promise<boolean> {
    const job = await prismaClient.analysisJob.findUnique({
      where : { id: jobId },
      select: { status: true }
    });
    return job?.status === AnalysisJobStatus.CANCELED;
  }

  /**
   * 功能：按 job scope 选目标章节（no 过滤）。
   * 输入：jobId。
   * 输出：`{ bookId, scope, chapters }`（chapters 为按 no 排序的章节 ref）。
   * 异常：job 不存在时抛错。
   * 副作用：只读查询。
   */
  async function loadJobContext(jobId: string): Promise<{
    jobId   : string;
    bookId  : string;
    scope   : AnalysisScope;
    chapters: Array<{ id: string; no: number; title: string; content: string }>;
  }> {
    const job = await prismaClient.analysisJob.findUnique({
      where : { id: jobId },
      select: {
        id            : true,
        bookId        : true,
        scope         : true,
        chapterStart  : true,
        chapterEnd    : true,
        chapterIndices: true
      }
    });
    if (!job) {
      throw new Error(`分析任务不存在: ${jobId}`);
    }

    const scope = (job.scope ?? "FULL_BOOK") as AnalysisScope;
    const chapterWhere =
      scope === "CHAPTER_RANGE"
        ? { no: { gte: job.chapterStart ?? 1, lte: job.chapterEnd ?? Number.MAX_SAFE_INTEGER } }
        : scope === "CHAPTER_LIST"
          ? { no: { in: job.chapterIndices } }
          : {};

    const chapters = await prismaClient.chapter.findMany({
      where  : { bookId: job.bookId, ...chapterWhere },
      select : { id: true, no: true, title: true, content: true },
      orderBy: [{ no: "asc" }]
    });

    return { jobId: job.id, bookId: job.bookId, scope, chapters };
  }

  /**
   * 功能：写入终态（成功/失败 + 同步 book 状态）。
   * 输入：jobId、bookId、成功标志、错误信息（可选）。
   * 副作用：更新 analysis_jobs + books。
   */
  async function writeTerminalState(
    jobId: string,
    bookId: string,
    succeeded: boolean,
    errorMessage?: string
  ): Promise<void> {
    await prismaClient.$transaction([
      prismaClient.analysisJob.update({
        where: { id: jobId },
        data : {
          status    : succeeded ? AnalysisJobStatus.SUCCEEDED : AnalysisJobStatus.FAILED,
          finishedAt: new Date(),
          errorLog  : errorMessage ?? null
        }
      }),
      prismaClient.book.update({
        where: { id: bookId },
        data : {
          status  : succeeded ? "COMPLETED" : "ERROR",
          errorLog: succeeded ? null : (errorMessage ?? null)
        }
      })
    ]);
  }

  /**
   * 功能：执行一次分析任务（入口，analyze route 直接调用）。
   * 输入：jobId。
   * 输出：无（失败抛错由调用方记录日志）。
   * 异常：任务不存在 / 各 Pass 失败。
   * 副作用：整个管线写入。
   */
  async function runAnalysisJobById(jobId: string): Promise<void> {
    // 乐观抢占：被其他 runner 处理则直接返回。
    const claimed = await claimQueuedJob(jobId);
    if (!claimed) {
      return;
    }

    let context: { jobId: string; bookId: string; scope: AnalysisScope; chapters: Array<{ id: string; no: number; title: string; content: string }> };
    try {
      context = await loadJobContext(jobId);
    } catch (error) {
      // job 不存在时无法定位 book，直接标记失败。
      await writeTerminalState(jobId, "", false, error instanceof Error ? error.message : String(error));
      return;
    }

    try {
      // 管线主体 Pass0-5 由阶段 2-4 填充。
      await runPipeline(context);
      await writeTerminalState(context.jobId, context.bookId, true);
    } catch (error) {
      await writeTerminalState(context.jobId, context.bookId, false, error instanceof Error ? error.message : String(error));
    }
  }

  /** 管线主体（阶段 2-4 填充 Pass0-5 编排）。 */
  async function runPipeline(context: { jobId: string; bookId: string; scope: AnalysisScope }): Promise<void> {
    // 取消贯穿：每个 Pass 前检查，CANCELED 则提前退出（不覆盖取消状态）。
    if (await isJobCanceled(context.jobId)) {
      return;
    }

    // 阶段 2-4 实现。
    // 当前骨架只做快照 + 装载，验证生命周期。
    const { skillSelector } = await import("@/server/modules/skills/skillSelector");
    const { skillLoader } = await import("@/server/modules/skills/loader");
    await skillSelector.selectSkillsForJob({ bookId: context.bookId, jobId: context.jobId });
    await skillLoader.resolveSkillsForJob(context.jobId);
  }

  return {
    runAnalysisJobById,
    runNextAnalysisJob: runAnalysisJobById
  };
}

/** 默认导出实例：生产代码直接复用；测试注入 mock PrismaClient。 */
export const runAnalysisJobById = createAnalysisJobRunner(prisma).runAnalysisJobById;
export const runNextAnalysisJob = createAnalysisJobRunner(prisma).runNextAnalysisJob;
