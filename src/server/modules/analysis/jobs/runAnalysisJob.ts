import { AnalysisJobStatus } from "@/generated/prisma/enums";
import type { ChapterType, PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import {
  createChapterAnalysisService
} from "@/server/modules/analysis/services/ChapterAnalysisService";
import { createValidationAgentService } from "@/server/modules/analysis/services/ValidationAgentService";
import { createAiCallExecutor } from "@/server/modules/analysis/services/AiCallExecutor";
import { createModelStrategyResolver } from "@/server/modules/analysis/services/ModelStrategyResolver";
import { ANALYSIS_PIPELINE_CONFIG } from "@/server/modules/analysis/config/pipeline";
import {
  clearKnowledgeCache,
  loadFullRuntimeKnowledge,
  type FullRuntimeKnowledge
} from "@/server/modules/knowledge/load-book-knowledge";
import { runPostAnalysisMerger } from "@/server/modules/analysis/services/PostAnalysisMerger";
import {
  createPipeline,
  type AnalysisPipelineFactoryDependencies
} from "@/server/modules/analysis/pipelines/factory";
import {
  createAnalysisRunService,
  type AnalysisRunService
} from "@/server/modules/analysis/runs/run-service";
import {
  createAnalysisStageRunService,
  type AnalysisStageRunService
} from "@/server/modules/analysis/runs/stage-run-service";
import type {
  AnalysisArchitecture,
  AnalysisPipeline,
  AnalysisPipelineResult,
  PipelineChapterTask
} from "@/server/modules/analysis/pipelines/types";
import type { SequentialPipelineDependencies } from "@/server/modules/analysis/pipelines/sequential/SequentialPipeline";
import type { ThreeStagePipelineDependencies } from "@/server/modules/analysis/pipelines/threestage/ThreeStagePipeline";
import { createAiProviderClient, type AiProviderClient } from "@/server/providers/ai";
import { PipelineStage } from "@/types/pipeline";
import { createSequentialReviewOutputAdapter } from "@/server/modules/analysis/review-output/sequential-review-output";
import {
  createProjectionBuilder,
  createProjectionRepository
} from "@/server/modules/review/evidence-review/projections";

/**
 * 文件定位（Next.js 服务端任务执行层）：
 * - 本文件位于 `src/server/modules/analysis/jobs`，是“整书解析任务”的实际执行器。
 * - 不属于 app router 的 `route.ts/page.tsx`，而是被 API/调度器在 Node.js 侧触发。
 *
 * 核心职责：
 * - 负责分析任务生命周期（QUEUED -> RUNNING -> SUCCEEDED/FAILED/CANCELED）；
 * - 按章节并发执行解析、章节级校验、增量称号溯源，并回写书籍进度；
 * - 在任务末尾执行全书级收尾流程（孤儿人物降权、全书校验、灰区仲裁）。
 *
 * 运行约束：
 * - 这是纯服务端逻辑，依赖数据库与 AI provider，不可在 Client Component 中运行。
 * - 其中重试、并发、阈值均是业务可调策略，变更会直接影响任务稳定性与成本。
 */
/**
 * 功能：定义任务执行时所需的最小章节信息载体。
 * 输入：无（类型声明）。
 * 输出：章节主键与章节序号。
 * 异常：无。
 * 副作用：无。
 */
interface ChapterTask extends PipelineChapterTask {
  /** 章节主键（UUID），用于调用章节解析服务。 */
  id: string;
  /** 章节序号（从 1 开始），用于日志与进度展示。 */
  no: number;
}

interface ChapterValidationBlockResult {
  /** 章节级验证报告 ID；降级场景可能是占位值 `validation-degraded`。 */
  reportId      : string;
  /** 章节级 ERROR 数量（自动修复后统计值）。 */
  errorCount    : number;
  /** 模型判定可自动修复的问题条数。 */
  autoFixable   : number;
  /** 实际成功应用的自动修复条数。 */
  appliedAutoFix: number;
  /** 是否仍需人工复审。true 时章节 parseStatus 会标记为 REVIEW_PENDING。 */
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
  Pick<ReturnType<typeof createChapterAnalysisService>, "analyzeChapter" | "resolvePersonaTitles" | "getTitleOnlyPersonaCount"> &
  Partial<Pick<ReturnType<typeof createChapterAnalysisService>, "extractChapterEntities" | "runGrayZoneArbitration">> &
  Pick<ReturnType<typeof createValidationAgentService>, "validateChapterResult"> &
  Partial<Pick<ReturnType<typeof createValidationAgentService>, "validateBookResult" | "applyAutoFixes">>;

interface ChapterAnalyzerFactoryInput {
  /** 当前任务 ID。用于策略解析与阶段日志归属。 */
  jobId : string;
  /** 当前任务所属书籍 ID。 */
  bookId: string;
}

type ChapterAnalyzerFactory = (input: ChapterAnalyzerFactoryInput) => Promise<ChapterAnalyzer>;

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
  /** 当前任务采用的解析架构；历史任务为空时回退为 sequential。 */
  architecture? : string | null;
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

/**
 * 功能：将数据库中的架构字段归一化为运行时可识别的枚举值。
 * 输入：任务记录中的 architecture 文本，可为空。
 * 输出：`sequential` 或 `threestage`；未知值归一化为 `threestage`（新默认）。
 */
function normalizeAnalysisArchitecture(architecture: string | null | undefined): AnalysisArchitecture {
  return architecture === "sequential" ? "sequential" : "threestage";
}

/**
 * 功能：生成任务启动时的初始阶段文案。
 * 输入：当前解析架构与章节总数。
 * 输出：书籍 parseStage 初始展示文本。
 */
function buildInitialPipelineStage(architecture: AnalysisArchitecture, totalChapters: number): string {
  if (architecture === "threestage") {
    return `阶段 A 硬提取（0/${totalChapters}章）`;
  }

  return buildProgressStage(0, totalChapters);
}

async function updateBookProgressSafely(
  prismaClient: PrismaClient,
  input: {
    bookId       : string;
    progress     : number;
    completedText: string;
    doneCount    : number;
    totalChapters: number;
    jobId        : string;
  }
): Promise<void> {
  try {
    // 仅允许进度单调递增，避免并发 worker 的乱序写入把 parseProgress 回退。
    await prismaClient.book.updateMany({
      where: {
        id           : input.bookId,
        parseProgress: { lt: input.progress }
      },
      data: {
        parseProgress: input.progress,
        parseStage   : input.completedText
      }
    });
  } catch (error) {
    // 进度写入失败不应让整书任务失败；最终状态会在收尾事务中统一落盘。
    console.warn(
      "[analysis.runner] book.progress.write.failed",
      JSON.stringify({
        jobId        : input.jobId,
        bookId       : input.bookId,
        doneCount    : input.doneCount,
        totalChapters: input.totalChapters,
        progress     : input.progress,
        error        : String(error).slice(0, 500)
      })
    );
  }
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

function formatPipelineWarningSummary(result: AnalysisPipelineResult): string | null {
  if (result.warnings.length === 0) {
    return null;
  }

  const summary = {
    warningCodes: result.warnings.map((warning) => warning.code),
    warnings    : result.warnings.map((warning) => ({
      code   : warning.code,
      stage  : warning.stage,
      message: warning.message,
      details: warning.details ?? null
    })),
    stages: result.stageSummaries.map((stageSummary) => ({
      stage  : stageSummary.stage,
      status : stageSummary.status,
      metrics: stageSummary.metrics
    }))
  };

  return JSON.stringify(summary).slice(0, 1000);
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
      architecture  : true,
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

function createDefaultChapterAnalyzerFactory(prismaClient: PrismaClient): ChapterAnalyzerFactory {
  return async ({ jobId, bookId }) => {
    const resolver = createModelStrategyResolver(prismaClient);
    await resolver.preloadStrategy({ jobId, bookId });
    const executor = createAiCallExecutor(prismaClient, resolver);

    const chapterService = createChapterAnalysisService(prismaClient, undefined, executor, resolver);
    const validationService = createValidationAgentService(prismaClient, executor, resolver);

    return {
      ...chapterService,
      ...validationService
    };
  };
}

/**
 * 审核输出构建器选项：允许测试或消费者注入轻量 stub，替换真实的 review output / projection 实现。
 */
export interface AnalysisJobRunnerReviewOutputOptions {
  /**
   * 将顺序架构章节分析结果写入统一 review output 表的适配器。
   * 仅在 architecture === "sequential" 时调用。
   */
  writeSequentialReviewOutput?: (input: { bookId: string; runId: string; chapterIds: string[] }) => Promise<unknown>;
  /**
   * 重建整书 projection 读模型。
   *
   * 无论任务范围（FULL_BOOK / CHAPTER_RANGE / CHAPTER_LIST）或架构如何，均在每次任务完成后调用：
   * projection 是基于全书已接受认领构建的读模型；局部重跑后，未触及章节保留现有认领，
   * 已触及章节替换为新认领，两者须合并投影为一个一致的全书视图供审核中心使用。
   */
  rebuildReviewProjection?: (input: { kind: "FULL_BOOK"; bookId: string }) => Promise<unknown>;
}

export function createAnalysisJobRunner(
  prismaClient: PrismaClient = prisma,
  chapterAnalyzer?: ChapterAnalyzer,
  chapterAnalyzerFactory?: ChapterAnalyzerFactory,
  pipelineFactory: (
    architecture: AnalysisArchitecture,
    dependencies: AnalysisPipelineFactoryDependencies
  ) => AnalysisPipeline = createPipeline,
  options: AnalysisJobRunnerReviewOutputOptions = {}
) {
  const resolvedWriteSequentialReviewOutput =
    options.writeSequentialReviewOutput
    ?? createSequentialReviewOutputAdapter(prismaClient).writeBookReviewOutput;
  const resolvedRebuildReviewProjection =
    options.rebuildReviewProjection
    ?? createProjectionBuilder({ repository: createProjectionRepository(prismaClient) }).rebuildProjection;
  const resolvedAnalyzerFactory = chapterAnalyzerFactory ?? createDefaultChapterAnalyzerFactory(prismaClient);
  const runService: AnalysisRunService = createAnalysisRunService(prismaClient);
  const stageRunService: AnalysisStageRunService = createAnalysisStageRunService(prismaClient);

  async function runChapterValidationBlocking(
    analyzer: ChapterAnalyzer,
    jobId: string,
    chapter: ChapterTask,
    bookId: string
  ): Promise<ChapterValidationBlockResult> {
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
        const report = await analyzer.validateChapterResult({
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
        if (report.summary.autoFixable > 0 && analyzer.applyAutoFixes) {
          appliedAutoFix = await analyzer.applyAutoFixes(report.id);
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
   * 功能：为全书级 pipeline 阶段一次性预加载书名与完整运行时知识。
   * 输入：书籍 ID。
   * 输出：下游阶段运行所需上下文。
   * 异常：书籍不存在时抛错；数据库查询失败时向上抛出。
   * 副作用：无（只读查询）。
   */
  async function loadBookRuntimeContext(bookId: string): Promise<{
    bookTitle       : string;
    runtimeKnowledge: FullRuntimeKnowledge;
  }> {
    const bookRow = await prismaClient.book.findUnique({
      where : { id: bookId },
      select: {
        title   : true,
        bookType: { select: { key: true } }
      }
    });

    if (!bookRow) {
      throw new Error(`书籍不存在: ${bookId}`);
    }

    const bookTypeKey = bookRow.bookType?.key ?? null;
    // D12：任务启动时强制刷新，保证本任务读到的是最新审核后知识快照。
    clearKnowledgeCache(bookId);
    const runtimeKnowledge = await loadFullRuntimeKnowledge(bookId, bookTypeKey, prismaClient);

    return {
      bookTitle: bookRow.title,
      runtimeKnowledge
    };
  }

  /**
   * 功能：组装顺序架构共享的运行时依赖。
   * 输入：当前任务快照与已就绪的分析器。
   * 输出：SequentialPipelineDependencies。
   * 异常：无。
   * 副作用：依赖中的回调会写入章节状态与调用章节校验。
   */
  function createSequentialPipelineDependencies(
    job: AnalysisJobRow,
    analyzer: ChapterAnalyzer
  ): SequentialPipelineDependencies {
    return {
      analyzer,
      chapterConcurrency            : CHAPTER_CONCURRENCY,
      incrementalResolveInterval    : INCREMENTAL_RESOLVE_INTERVAL,
      chapterMaxRetries             : CHAPTER_MAX_RETRIES,
      chapterRetryBaseMs            : CHAPTER_RETRY_BASE_MS,
      chapterValidationRiskThreshold: ANALYSIS_PIPELINE_CONFIG.chapterValidationRiskThreshold,
      updateChapterStatus           : async (chapterId, status) => {
        await prismaClient.chapter.update({
          where: { id: chapterId },
          data : { parseStatus: status }
        });
      },
      runChapterValidation: async (chapter) => await runChapterValidationBlocking(analyzer, job.id, chapter, job.bookId),
      isChapterRetryableError,
      loadRuntimeContext  : async (bookId) => {
        const ctx = await loadBookRuntimeContext(bookId);
        return { runtimeKnowledge: ctx.runtimeKnowledge };
      }
    };
  }

  /**
   * 功能：按任务上下文解析一个 AiProviderClient，供三阶段 pipeline 的 Stage A/B/C 直调。
   * 输入：任务快照。
   * 输出：已就绪的 AiProviderClient 实例。
   * 异常：策略解析或模型配置缺失时向上抛出。
   * 副作用：只读查询模型策略相关表。
   *
   * 说明：Stage A/B/C 服务类直接调用 `aiClient.generateJson`，不走 AiCallExecutor 的阶段日志通道。
   * 当前选择 `CHUNK_EXTRACTION` 阶段的模型做统一解析，保持与 Stage A（章节级硬提取）的语义接近；
   * 若未来需要每阶段不同模型，应拓展 ThreeStagePipelineDependencies 传入多个 client。
   */
  async function resolveThreeStageAiClient(job: AnalysisJobRow): Promise<AiProviderClient> {
    const resolver = createModelStrategyResolver(prismaClient);
    const model = await resolver.resolveForStage(PipelineStage.CHUNK_EXTRACTION, {
      jobId : job.id,
      bookId: job.bookId
    });
    return createAiProviderClient({
      provider : model.provider,
      apiKey   : model.apiKey,
      baseUrl  : model.baseUrl,
      modelName: model.modelName
    });
  }

  /**
   * 功能：组装三阶段架构的运行时依赖。
   * 输入：当前任务快照与 AiProviderClient。
   * 输出：ThreeStagePipelineDependencies。
   * 异常：无（依赖缺失会在 pipeline.run 阶段抛出）。
   * 副作用：无（仅打包参数）。
   */
  function createThreeStagePipelineDependencies(
    _job: AnalysisJobRow,
    aiClient: AiProviderClient
  ): ThreeStagePipelineDependencies {
    return {
      prisma            : prismaClient,
      aiClient,
      chapterConcurrency: CHAPTER_CONCURRENCY,
      chapterMaxRetries : CHAPTER_MAX_RETRIES,
      chapterRetryBaseMs: CHAPTER_RETRY_BASE_MS,
      isChapterRetryableError
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
    const runningJob: AnalysisJobRow = job;
    const analysisRun = await runService.createJobRun({
      jobId  : runningJob.id,
      bookId : runningJob.bookId,
      scope  : runningJob.scope,
      trigger: "ANALYSIS_JOB"
    });
    const analysisRunId = analysisRun.id;
    const activeAnalyzer = chapterAnalyzer ?? await resolvedAnalyzerFactory({
      jobId : runningJob.id,
      bookId: runningJob.bookId
    });

    let chapters: ChapterTask[] = [];
    let completedChapters = 0;
    try {
      await runService.markCurrentStage(analysisRunId, "JOB_CHAPTER_SELECTION");
      const chapterSelectionStage = await stageRunService.startStageRun({
        runId     : analysisRunId,
        bookId    : runningJob.bookId,
        stageKey  : "JOB_CHAPTER_SELECTION",
        inputCount: 0
      });

      try {
        chapters = await loadChaptersForJob(prismaClient, runningJob);
        if (chapters.length === 0) {
          throw new Error(`解析任务 ${runningJob.id} 未找到可执行章节`);
        }
        await stageRunService.succeedStageRun(chapterSelectionStage.id, {
          outputCount : chapters.length,
          skippedCount: 0
        });
      } catch (error) {
        await stageRunService.failStageRun(chapterSelectionStage.id, error);
        throw error;
      }

      const architecture = normalizeAnalysisArchitecture(runningJob.architecture);
      const pipeline = architecture === "threestage"
        ? pipelineFactory("threestage", {
          threestage: createThreeStagePipelineDependencies(runningJob, await resolveThreeStageAiClient(runningJob))
        })
        : pipelineFactory("sequential", {
          sequential: createSequentialPipelineDependencies(runningJob, activeAnalyzer)
        });

      // 重置所有目标章节为 PENDING，确保检测状态与实际执行一致。
      await prismaClient.chapter.updateMany({
        where: { id: { in: chapters.map(c => c.id) } },
        data : { parseStatus: "PENDING" }
      });

      // 初始化书籍解析状态，后续在章节循环中持续刷新进度与阶段文本。
      await prismaClient.book.update({
        where: { id: runningJob.bookId },
        data : {
          status       : "PROCESSING",
          parseProgress: 0,
          parseStage   : buildInitialPipelineStage(architecture, chapters.length),
          errorLog     : null
        }
      });

      const pipelineStageKey = `PIPELINE_${architecture.toUpperCase()}`;
      await runService.markCurrentStage(analysisRunId, pipelineStageKey);
      const pipelineStage = await stageRunService.startStageRun({
        runId         : analysisRunId,
        bookId        : runningJob.bookId,
        stageKey      : pipelineStageKey,
        inputCount    : chapters.length,
        chapterStartNo: chapters[0]?.no ?? null,
        chapterEndNo  : chapters.at(-1)?.no ?? null
      });

      let pipelineResult: AnalysisPipelineResult;
      try {
        pipelineResult = await pipeline.run({
          jobId     : runningJob.id,
          bookId    : runningJob.bookId,
          chapters,
          isCanceled: async () => await isJobCanceled(prismaClient, runningJob.id),
          onProgress: async (update) => {
            completedChapters = update.doneCount;
            await updateBookProgressSafely(prismaClient, {
              jobId        : runningJob.id,
              bookId       : runningJob.bookId,
              progress     : update.progress,
              completedText: update.stage,
              doneCount    : update.doneCount,
              totalChapters: update.totalChapters
            });
          }
        });
        completedChapters = pipelineResult.completedChapters;
        if (
          pipelineResult.completedChapters === 0
          && pipelineResult.failedChapters > 0
          && await isJobCanceled(prismaClient, runningJob.id)
        ) {
          await stageRunService.failStageRun(pipelineStage.id, new Error(`解析任务 ${runningJob.id} 已取消`), {
            failureCount: Math.max(1, chapters.length - completedChapters),
            errorClass  : "CANCELED"
          });
          await runService.cancelRun(analysisRunId);
          return;
        }
        if (pipelineResult.completedChapters === 0 && pipelineResult.failedChapters > 0) {
          throw new Error(`所有章节解析失败，共 ${pipelineResult.failedChapters} 章`);
        }
        await stageRunService.succeedStageRun(pipelineStage.id, {
          outputCount : pipelineResult.completedChapters,
          skippedCount: 0
        });
      } catch (error) {
        await stageRunService.failStageRun(pipelineStage.id, error, {
          failureCount: Math.max(1, chapters.length - completedChapters)
        });
        throw error;
      }

      if (await isJobCanceled(prismaClient, runningJob.id)) {
        await runService.cancelRun(analysisRunId);
        return;
      }

      // 落地审核中心所需的统一读模型：
      // 1. sequential 架构先将本次章节认领写入 review output 表，threestage 架构跳过此步。
      // 2. 无论任务范围（FULL_BOOK / CHAPTER_RANGE / CHAPTER_LIST）或架构，均重建 FULL_BOOK projection：
      //    projection 是基于全书已接受认领构建的只读视图；局部重跑后，未触及章节保留现有认领，
      //    已触及章节由新认领替换，两者须合并为一个一致的全书视图供审核中心使用。
      //    任一步骤失败则不推进任务终态，保证审核中心与分析结果保持一致。
      if (architecture === "sequential") {
        if (analysisRunId === null) {
          throw new Error(`解析任务 ${runningJob.id} 缺少 analysisRunId，无法生成审核输出`);
        }
        await resolvedWriteSequentialReviewOutput({
          bookId    : runningJob.bookId,
          runId     : analysisRunId,
          chapterIds: chapters.map(chapter => chapter.id)
        });
      }
      await resolvedRebuildReviewProjection({ kind: "FULL_BOOK", bookId: runningJob.bookId });
      console.info(
        "[analysis.runner] review.output.projection.completed",
        JSON.stringify({
          jobId       : runningJob.id,
          bookId      : runningJob.bookId,
          scope       : runningJob.scope,
          architecture,
          chapterCount: chapters.length
        })
      );

      const warningSummary = formatPipelineWarningSummary(pipelineResult);

      await prismaClient.$transaction([
        prismaClient.analysisJob.update({
          where: { id: runningJob.id },
          data : {
            status    : AnalysisJobStatus.SUCCEEDED,
            finishedAt: new Date(),
            errorLog  : warningSummary
          }
        }),
        prismaClient.book.update({
          where: { id: runningJob.bookId },
          data : {
            status       : "COMPLETED",
            parseProgress: 100,
            parseStage   : "完成",
            errorLog     : warningSummary
          }
        })
      ]);
      await runService.succeedRun(analysisRunId);

      // 整书解析完成后执行孤儿检测：mention 数 < 2 的 Persona 置信度降至 0.4，供审核优先关注。
      // 仅在 FULL_BOOK 任务完成后触发，部分章节任务不做全局孤儿判断。
      if (runningJob.scope === "FULL_BOOK") {
        const orphanCount = await markOrphanPersonas(prismaClient, runningJob.bookId);
        if (orphanCount > 0) {
          console.info(
            "[analysis.runner] orphan.personas.marked",
            JSON.stringify({ jobId: runningJob.id, bookId: runningJob.bookId, orphanCount })
          );
        }

        // Phase 5: 称号真名溯源——批量 AI 推断 TITLE_ONLY Persona 的历史真名并回写。
        const titleOnlyCount = await activeAnalyzer.getTitleOnlyPersonaCount(runningJob.bookId);
        if (titleOnlyCount > 0) {
          const resolvedTitleCount = await activeAnalyzer.resolvePersonaTitles(runningJob.bookId, { jobId: runningJob.id });
          if (resolvedTitleCount > 0) {
            console.info(
              "[analysis.runner] title.personas.resolved",
              JSON.stringify({ jobId: runningJob.id, bookId: runningJob.bookId, resolvedTitleCount })
            );
          }
        }

        if (activeAnalyzer.runGrayZoneArbitration) {
          const arbitrationWrittenCount = await activeAnalyzer.runGrayZoneArbitration(runningJob.bookId, { jobId: runningJob.id });
          if (arbitrationWrittenCount > 0) {
            console.info(
              "[analysis.runner] title.gray_zone.arbitrated",
              JSON.stringify({ jobId: runningJob.id, bookId: runningJob.bookId, arbitrationWrittenCount })
            );
          }
        }

        // Phase 5.5: 全书实体合并建议生成——检测重复/相似人物并写入 merge_suggestions 队列。
        try {
          const runtimeCtx = await loadBookRuntimeContext(runningJob.bookId);
          const mergeResult = await runPostAnalysisMerger(prismaClient, {
            bookId          : runningJob.bookId,
            runtimeKnowledge: runtimeCtx.runtimeKnowledge
          });
          if (mergeResult.created > 0) {
            console.info(
              "[analysis.runner] post.merge.suggestions.created",
              JSON.stringify({
                jobId     : runningJob.id,
                bookId    : runningJob.bookId,
                total     : mergeResult.created,
                autoMerged: mergeResult.autoMerged
              })
            );
          }
        } catch (mergeError) {
          console.warn(
            "[analysis.runner] post.merge.failed",
            JSON.stringify({
              jobId : runningJob.id,
              bookId: runningJob.bookId,
              error : String(mergeError).slice(0, 500)
            })
          );
        }

        // Phase 6: 全书自检（不阻塞主流程，失败仅记日志）。
        if (activeAnalyzer.validateBookResult) {
          try {
            const report = await activeAnalyzer.validateBookResult(runningJob.bookId, runningJob.id);
            if (report.summary.autoFixable > 0 && activeAnalyzer.applyAutoFixes) {
              const appliedCount = await activeAnalyzer.applyAutoFixes(report.id);
              if (appliedCount > 0) {
                console.info(
                  "[analysis.runner] validation.autofix.applied",
                  JSON.stringify({ jobId: runningJob.id, bookId: runningJob.bookId, reportId: report.id, appliedCount })
                );
              }
            }
          } catch (validationError) {
            console.warn(
              "[analysis.runner] book.validation.failed",
              JSON.stringify({
                jobId : runningJob.id,
                bookId: runningJob.bookId,
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
        : Math.floor((completedChapters / chapters.length) * 100);

      // 失败时同步回写任务与书籍状态，便于前台/后台展示一致的错误上下文。
      await prismaClient.$transaction([
        prismaClient.analysisJob.update({
          where: { id: runningJob.id },
          data : {
            status    : AnalysisJobStatus.FAILED,
            finishedAt: new Date(),
            errorLog  : errorMessage
          }
        }),
        prismaClient.book.update({
          where: { id: runningJob.bookId },
          data : {
            status       : "ERROR",
            parseProgress: failedProgress,
            parseStage   : "解析失败",
            errorLog     : errorMessage
          }
        })
      ]);

      await runService.failRun(analysisRunId, error);
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
