import { AnalysisJobStatus } from "@/generated/prisma/enums";
import type { ChapterType, PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { chapterAnalysisService, type ChapterAnalysisResult } from "@/server/modules/analysis/services/ChapterAnalysisService";
import { validationAgentService } from "@/server/modules/analysis/services/ValidationAgentService";
import { ANALYSIS_PIPELINE_CONFIG } from "@/server/modules/analysis/config/pipeline";

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

interface ChapterValidationBlockResult {
  reportId      : string;
  errorCount    : number;
  autoFixable   : number;
  appliedAutoFix: number;
  needsReview   : boolean;
}

/**
 * 功能：约束章节解析器依赖，仅暴露 `analyzeChapter` 能力。
 * 输入：无（类型声明）。
 * 输出：章节解析函数签名。
 * 异常：无。
 * 副作用：无。
 */
type ChapterAnalyzer =
  Pick<typeof chapterAnalysisService, "analyzeChapter" | "resolvePersonaTitles" | "getTitleOnlyPersonaCount"> &
  Pick<typeof validationAgentService, "validateChapterResult"> &
  Partial<Pick<typeof validationAgentService, "validateBookResult" | "applyAutoFixes">>;

/**
 * 功能：定义任务执行器读取任务时的最小字段集合。
 * 输入：无（类型声明）。
 * 输出：任务主键、范围与状态等关键字段。
 * 异常：无。
 * 副作用：无。
 */
interface AnalysisJobRow {
  /** 任务主键（UUID）。 */
  id            : string;
  /** 所属书籍主键（UUID）。 */
  bookId        : string;
  /** 当前任务状态（QUEUED/RUNNING/SUCCEEDED/FAILED/CANCELED）。 */
  status        : AnalysisJobStatus;
  /** 执行范围（FULL_BOOK 或 CHAPTER_RANGE）。 */
  scope         : string;
  /** 范围任务起始章节号；全书任务时为 null。 */
  chapterStart  : number | null;
  /** 范围任务结束章节号；全书任务时为 null。 */
  chapterEnd    : number | null;
  /** 指定章节编号列表（CHAPTER_LIST 任务）；其他范围时为空数组。 */
  chapterIndices: number[];
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

function buildCompletedStage(done: number, total: number): string {
  return `实体提取（已完成${done}/${total}章）`;
}
/** 单章节失败后最多重试次数（不含首次）。 */
const CHAPTER_MAX_RETRIES = 2;

/** 单章节重试基础等待时间（ms），实际等待 = base * 第几次重试。 */
const CHAPTER_RETRY_BASE_MS = 3000;

/**
 * 每处理多少章触发一次增量称号溯源。
 * 目的：在长书解析过程中提前归并 TITLE_ONLY 人物，减少后续章节误识别扩散。
 */
const INCREMENTAL_RESOLVE_INTERVAL = ANALYSIS_PIPELINE_CONFIG.incrementalResolveInterval;
const CHAPTER_CONCURRENCY = ANALYSIS_PIPELINE_CONFIG.chapterConcurrency;

/**
 * 功能：判断章节级错误是否值得重试（网络抖动、限速、连接中断等临时性错误）。
 * 输入：unknown 错误对象。
 * 输出：true 表示可以重试；false 表示不可重试（逻辑错误、数据错误等）。
 * 异常：无。
 * 副作用：无。
 */
function isChapterRetryableError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return (
    message.includes("429") ||
    message.includes("rate limit") ||
    message.includes("timeout") ||
    message.includes("temporarily unavailable") ||
    message.includes("econnreset") ||
    message.includes("network") ||
    message.includes("terminated") ||
    message.includes("aborted") ||
    message.includes("fetch failed") ||
    message.includes("socket") ||
    message.includes("connection reset")
  );
}
/**
 * 功能：检查任务是否已被取消（乐观读，避免已删除书籍继续执行）。
 * 输入：PrismaClient、jobId。
 * 输出：true 表示已取消或不存在；false 表示仍在 RUNNING。
 * 副作用：只读查询。
 */
async function isJobCanceled(prismaClient: PrismaClient, jobId: string): Promise<boolean> {
  const row = await prismaClient.analysisJob.findUnique({
    where : { id: jobId },
    select: { status: true }
  });
  return !row || row.status === AnalysisJobStatus.CANCELED;
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
 * 功能：整书解析完成后，检测 mention 数 < 2 的孤儿 Persona 并将其置信度降至 0.4。
 * 目的：帮助审核者优先关注出场极少、可能为幻觉或次要角色的实体。
 * 输入：PrismaClient、书籍 ID。
 * 输出：被降级的孤儿 Persona 数量。
 * 异常：数据库访问异常会向上抛出。
 * 副作用：批量更新 personas.confidence 字段。
 */
export async function markOrphanPersonas(
  prismaClient: PrismaClient,
  bookId: string
): Promise<number> {
  // 查出本书所有已建档 Persona 的 ID。
  const profiles = await prismaClient.profile.findMany({
    where : { bookId },
    select: { personaId: true }
  });

  if (profiles.length === 0) {
    return 0;
  }

  const allPersonaIds = profiles.map(p => p.personaId);

  // 统计每个 Persona 在本书各章节的有效提及数（排除软删除）。
  const mentionGroups = await prismaClient.mention.groupBy({
    by   : ["personaId"],
    where: {
      personaId: { in: allPersonaIds },
      deletedAt: null,
      chapter  : { bookId }
    },
    _count: { id: true }
  });

  // 将有提及的 persona 按 ID 建立计数映射，方便 O(1) 查询。
  const mentionCountMap = new Map<string, number>(
    mentionGroups.map(g => [g.personaId, g._count.id])
  );

  // mention 数严格 < 2 的视为孤儿（包含 0 次，即完全没有提及记录的）。
  const orphanIds = allPersonaIds.filter(id => (mentionCountMap.get(id) ?? 0) < 2);

  if (orphanIds.length === 0) {
    return 0;
  }

  // 仅降级置信度尚未更低的孤儿，避免覆盖可能已被人工设置的更低分。
  await prismaClient.persona.updateMany({
    where: {
      id        : { in: orphanIds },
      confidence: { gt: 0.4 }
    },
    data: { confidence: 0.4 }
  });

  return orphanIds.length;
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
      id            : true,
      bookId        : true,
      status        : true,
      scope         : true,
      chapterStart  : true,
      chapterEnd    : true,
      chapterIndices: true
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
  // 前言（PRELUDE）和后记（POSTLUDE）通常是作者序跋，不包含故事人物，跳过解析。
  const SKIP_CHAPTER_TYPES: ChapterType[] = ["PRELUDE", "POSTLUDE"];

  if (job.scope === "CHAPTER_RANGE") {
    if (job.chapterStart == null || job.chapterEnd == null) {
      throw new Error(`解析任务 ${job.id} 的章节范围无效`);
    }

    return await prismaClient.chapter.findMany({
      where: {
        bookId: job.bookId,
        type  : { notIn: SKIP_CHAPTER_TYPES },
        no    : {
          gte: job.chapterStart,
          lte: job.chapterEnd
        }
      },
      orderBy: { no: "asc" },
      select : { id: true, no: true }
    });
  }

  if (job.scope === "CHAPTER_LIST") {
    if (!job.chapterIndices || job.chapterIndices.length === 0) {
      throw new Error(`解析任务 ${job.id} 的章节列表为空`);
    }

    return await prismaClient.chapter.findMany({
      where: {
        bookId: job.bookId,
        type  : { notIn: SKIP_CHAPTER_TYPES },
        no    : { in: job.chapterIndices }
      },
      orderBy: { no: "asc" },
      select : { id: true, no: true }
    });
  }

  return await prismaClient.chapter.findMany({
    where: {
      bookId: job.bookId,
      type  : { notIn: SKIP_CHAPTER_TYPES }
    },
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
  chapterAnalyzer: ChapterAnalyzer = {
    ...chapterAnalysisService,
    ...validationAgentService
  }
) {
  async function runChapterValidationBlocking(jobId: string, chapter: ChapterTask, bookId: string): Promise<ChapterValidationBlockResult> {
    const chapterRow = await prismaClient.chapter.findUnique({
      where : { id: chapter.id },
      select: { id: true, no: true, title: true, content: true, bookId: true }
    });
    if (!chapterRow) {
      throw new Error(`章节不存在: ${chapter.id}`);
    }

    const [book, newPersonas, newMentions, newRelationships, existingProfiles] = await Promise.all([
      prismaClient.book.findUnique({
        where : { id: bookId },
        select: { title: true }
      }),
      prismaClient.persona.findMany({
        where  : { profiles: { some: { bookId: chapterRow.bookId, deletedAt: null } }, deletedAt: null },
        select : { id: true, name: true, confidence: true, nameType: true },
        orderBy: { createdAt: "desc" },
        take   : 50
      }),
      prismaClient.mention.findMany({
        where : { chapterId: chapterRow.id, deletedAt: null },
        select: { personaId: true, rawText: true },
        take  : 200
      }),
      prismaClient.relationship.findMany({
        where : { chapterId: chapterRow.id, deletedAt: null },
        select: { sourceId: true, targetId: true, type: true },
        take  : 100
      }),
      prismaClient.profile.findMany({
        where  : { bookId: chapterRow.bookId, deletedAt: null },
        include: { persona: { select: { name: true, aliases: true } } }
      })
    ]);
    if (!book) {
      throw new Error(`书籍不存在: ${bookId}`);
    }
    const personaNameRows = await prismaClient.persona.findMany({
      where: {
        id: {
          in: Array.from(new Set([
            ...newMentions.map((item) => item.personaId),
            ...newRelationships.map((item) => item.sourceId),
            ...newRelationships.map((item) => item.targetId),
            ...newPersonas.map((item) => item.id)
          ]))
        },
        deletedAt: null
      },
      select: { id: true, name: true }
    });
    const personaNameMap = new Map(personaNameRows.map((row) => [row.id, row.name]));

    let lastError: unknown;
    for (let attempt = 0; attempt <= ANALYSIS_PIPELINE_CONFIG.chapterValidationRetries; attempt += 1) {
      try {
        const report = await chapterAnalyzer.validateChapterResult({
          bookId        : chapterRow.bookId,
          chapterId     : chapterRow.id,
          chapterNo     : chapterRow.no,
          chapterContent: chapterRow.content.slice(0, 3000),
          jobId,
          newPersonas   : newPersonas.map((p) => ({
            id: p.id, name: p.name, confidence: p.confidence ?? 0.5, nameType: p.nameType ?? "NAMED"
          })),
          newMentions: newMentions.map((m) => ({
            personaId: m.personaId,
            rawText  : `${personaNameMap.get(m.personaId) ?? m.personaId}: ${m.rawText}`
          })),
          newRelationships: newRelationships.map((r) => ({
            sourceId: r.sourceId, targetId: r.targetId, type: r.type
          })),
          existingProfiles: existingProfiles.map((p) => ({
            personaId    : p.personaId,
            canonicalName: p.persona?.name ?? p.localName,
            aliases      : (Array.isArray(p.persona?.aliases) ? p.persona.aliases : []),
            localSummary : p.localSummary
          }))
        });

        let appliedAutoFix = 0;
        if (report.summary.autoFixable > 0 && chapterAnalyzer.applyAutoFixes) {
          appliedAutoFix = await chapterAnalyzer.applyAutoFixes(report.id);
        }

        // 自动修复后若仍有 ERROR，标记需人工复审但不中止全书。
        const postFixErrorCount = report.summary.errorCount;

        return {
          reportId   : report.id,
          errorCount : postFixErrorCount,
          autoFixable: report.summary.autoFixable,
          appliedAutoFix,
          needsReview: postFixErrorCount > 0
        };
      } catch (error) {
        lastError = error;
        if (attempt >= ANALYSIS_PIPELINE_CONFIG.chapterValidationRetries) {
          break;
        }
      }
    }

    // 验证服务异常时，为避免全书中止，降级为 NEEDS_REVIEW 并继续。
    console.warn(
      "[analysis.runner] chapter.validation.degraded",
      JSON.stringify({
        jobId,
        chapterId: chapter.id,
        error    : toErrorMessage(lastError)
      })
    );
    return {
      reportId      : "validation-degraded",
      errorCount    : 0,
      autoFixable   : 0,
      appliedAutoFix: 0,
      needsReview   : true
    };
  }

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
    let failedCount = 0;
    try {
      chapters = await loadChaptersForJob(prismaClient, job);
      if (chapters.length === 0) {
        throw new Error(`解析任务 ${job.id} 未找到可执行章节`);
      }

      // 重置所有目标章节为 PENDING，确保检测状态与实际执行一致。
      await prismaClient.chapter.updateMany({
        where: { id: { in: chapters.map(c => c.id) } },
        data : { parseStatus: "PENDING" }
      });

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

      const pending = [...chapters];
      let doneCount = 0;
      let nextResolveAt = INCREMENTAL_RESOLVE_INTERVAL;
      let resolveChain = Promise.resolve();

      async function scheduleIncrementalTitleResolution(chapterNo: number): Promise<void> {
        resolveChain = resolveChain.then(async () => {
          if (doneCount < nextResolveAt) {
            return;
          }
          const titleOnlyCount = await chapterAnalyzer.getTitleOnlyPersonaCount(job.bookId);
          if (titleOnlyCount <= 0) {
            nextResolveAt += INCREMENTAL_RESOLVE_INTERVAL;
            return;
          }
          try {
            await chapterAnalyzer.resolvePersonaTitles(job.bookId);
            nextResolveAt += INCREMENTAL_RESOLVE_INTERVAL;
          } catch (incrementalResolveError) {
            console.warn(
              "[analysis.runner] incremental.title.resolve.failed",
              JSON.stringify({
                jobId : job.id,
                bookId: job.bookId,
                chapterNo,
                error : String(incrementalResolveError).slice(0, 500)
              })
            );
          }
        });

        await resolveChain;
      }

      async function workerLoop(): Promise<void> {
        while (true) {
          const chapter = pending.shift();
          if (!chapter) {
            return;
          }
          if (await isJobCanceled(prismaClient, job.id)) {
            return;
          }

          await prismaClient.chapter.update({
            where: { id: chapter.id },
            data : { parseStatus: "PROCESSING" }
          });

          let chapterSucceeded = false;
          let chapterAttempt = 0;
          let chapterNeedsReview = false;

          while (chapterAttempt <= CHAPTER_MAX_RETRIES) {
            try {
              const result: ChapterAnalysisResult = await chapterAnalyzer.analyzeChapter(chapter.id);
              const validationResult = await runChapterValidationBlocking(job.id, chapter, job.bookId);
              if (validationResult.needsReview) {
                chapterNeedsReview = true;
                console.warn(
                  "[analysis.runner] chapter.validation.needs_review",
                  JSON.stringify({
                    jobId     : job.id,
                    chapterId : chapter.id,
                    chapterNo : chapter.no,
                    reportId  : validationResult.reportId,
                    errorCount: validationResult.errorCount
                  })
                );
              }

              completed += 1;
              chapterSucceeded = true;
              console.info(
                "[analysis.runner] chapter.completed",
                JSON.stringify({
                  jobId    : job.id,
                  chapterId: chapter.id,
                  chapterNo: chapter.no,
                  attempt  : chapterAttempt,
                  created  : result.created
                })
              );
              break;
            } catch (chapterError) {
              const isRetryable = isChapterRetryableError(chapterError);
              const retriesExhausted = chapterAttempt >= CHAPTER_MAX_RETRIES;
              if (!isRetryable || retriesExhausted) {
                failedCount += 1;
                console.error(
                  "[analysis.runner] chapter.failed",
                  JSON.stringify({
                    jobId    : job.id,
                    chapterId: chapter.id,
                    chapterNo: chapter.no,
                    attempt  : chapterAttempt,
                    isRetryable,
                    error    : String(chapterError).slice(0, 500)
                  })
                );
                break;
              }

              const waitMs = CHAPTER_RETRY_BASE_MS * (chapterAttempt + 1);
              console.warn(
                "[analysis.runner] chapter.retry",
                JSON.stringify({
                  jobId    : job.id,
                  chapterId: chapter.id,
                  chapterNo: chapter.no,
                  attempt  : chapterAttempt + 1,
                  waitMs,
                  reason   : String(chapterError).slice(0, 200)
                })
              );
              await new Promise((resolve) => setTimeout(resolve, waitMs));
              chapterAttempt += 1;
            }
          }

          doneCount += 1;
          await prismaClient.$transaction([
              prismaClient.chapter.update({
                where: { id: chapter.id },
                data : { parseStatus: chapterSucceeded ? (chapterNeedsReview ? "PENDING" : "SUCCEEDED") : "FAILED" }
              }),
            prismaClient.book.update({
              where: { id: job.bookId },
              data : {
                parseProgress: Math.floor((doneCount / chapters.length) * 100),
                parseStage   : buildCompletedStage(doneCount, chapters.length)
              }
            })
          ]);

          if (chapterSucceeded) {
            await scheduleIncrementalTitleResolution(chapter.no);
          }
        }
      }

      await Promise.all(Array.from(
        { length: Math.max(1, Math.min(CHAPTER_CONCURRENCY, chapters.length)) },
        () => workerLoop()
      ));
      await resolveChain;

      // 全部章节均失败时，视为任务整体失败。
      if (completed === 0 && failedCount > 0) {
        throw new Error(`所有章节解析失败，共 ${failedCount} 章`);
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

      // 整书解析完成后执行孤儿检测：mention 数 < 2 的 Persona 置信度降至 0.4，供审核优先关注。
      // 仅在 FULL_BOOK 任务完成后触发，部分章节任务不做全局孤儿判断。
      if (job.scope === "FULL_BOOK") {
        const orphanCount = await markOrphanPersonas(prismaClient, job.bookId);
        if (orphanCount > 0) {
          console.info(
            "[analysis.runner] orphan.personas.marked",
            JSON.stringify({ jobId: job.id, bookId: job.bookId, orphanCount })
          );
        }

        // Phase 5: 称号真名溯源——批量 AI 推断 TITLE_ONLY Persona 的历史真名并回写。
        const titleOnlyCount = await chapterAnalyzer.getTitleOnlyPersonaCount(job.bookId);
        if (titleOnlyCount > 0) {
          const resolvedTitleCount = await chapterAnalyzer.resolvePersonaTitles(job.bookId);
          if (resolvedTitleCount > 0) {
            console.info(
              "[analysis.runner] title.personas.resolved",
              JSON.stringify({ jobId: job.id, bookId: job.bookId, resolvedTitleCount })
            );
          }
        }

        // Phase 6: 全书自检（不阻塞主流程，失败仅记日志）。
        if (chapterAnalyzer.validateBookResult) {
          try {
            const report = await chapterAnalyzer.validateBookResult(job.bookId, job.id);
            if (report.summary.autoFixable > 0 && chapterAnalyzer.applyAutoFixes) {
              const appliedCount = await chapterAnalyzer.applyAutoFixes(report.id);
              if (appliedCount > 0) {
                console.info(
                  "[analysis.runner] validation.autofix.applied",
                  JSON.stringify({ jobId: job.id, bookId: job.bookId, reportId: report.id, appliedCount })
                );
              }
            }
          } catch (validationError) {
            console.warn(
              "[analysis.runner] book.validation.failed",
              JSON.stringify({
                jobId : job.id,
                bookId: job.bookId,
                error : String(validationError).slice(0, 500)
              })
            );
          }
        }
      }
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
