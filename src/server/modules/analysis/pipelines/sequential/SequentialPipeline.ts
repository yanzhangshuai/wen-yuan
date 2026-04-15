import type {
  AnalysisPipeline,
  AnalysisPipelineResult,
  PipelineChapterTask,
  PipelineRunParams
} from "@/server/modules/analysis/pipelines/types";
import type { ChapterAnalysisResult } from "@/server/modules/analysis/services/ChapterAnalysisService";
import type { BookLexiconConfig } from "@/server/modules/analysis/config/lexicon";
import type { FullRuntimeKnowledge } from "@/server/modules/knowledge/load-book-knowledge";

const SEQUENTIAL_PIPELINE_DEPENDENCY_ERROR = "SequentialPipeline 缺少运行时依赖，无法执行章节分析。";

/**
 * 功能：定义顺序解析管线的运行时依赖。
 * 输入：无（类型声明）。
 * 输出：共享章节循环所需的分析器与回调。
 * 异常：无。
 * 副作用：无。
 */
export interface ChapterLoopAnalyzer {
  analyzeChapter(
    chapterId: string,
    context: {
      jobId                  : string;
      externalPersonaMap?    : Map<string, string>;
      preloadedLexiconConfig?: BookLexiconConfig;
      runtimeKnowledge?      : FullRuntimeKnowledge;
    }
  ): Promise<ChapterAnalysisResult>;
  resolvePersonaTitles(bookId: string, context: { jobId: string }): Promise<number>;
  getTitleOnlyPersonaCount(bookId: string): Promise<number>;
}

/**
 * 功能：定义章节级验证回调的统一返回结构。
 * 输入：无（类型声明）。
 * 输出：是否需要人工复核以及报告摘要。
 * 异常：无。
 * 副作用：无。
 */
export interface ChapterLoopValidationResult {
  reportId   : string;
  errorCount : number;
  needsReview: boolean;
}

/**
 * 功能：定义顺序解析管线的运行时依赖。
 * 输入：无（类型声明）。
 * 输出：共享章节循环所需的分析器与回调。
 * 异常：无。
 * 副作用：无。
 */
export interface SequentialPipelineDependencies {
  analyzer                      : ChapterLoopAnalyzer;
  chapterConcurrency            : number;
  incrementalResolveInterval    : number;
  chapterMaxRetries             : number;
  chapterRetryBaseMs            : number;
  chapterValidationRiskThreshold: number;
  updateChapterStatus           : (chapterId: string, status: "PROCESSING" | "SUCCEEDED" | "FAILED" | "REVIEW_PENDING") => Promise<void>;
  runChapterValidation          : (chapter: PipelineChapterTask) => Promise<ChapterLoopValidationResult>;
  isChapterRetryableError       : (error: unknown) => boolean;
  wait?                         : (ms: number) => Promise<void>;
  loadRuntimeContext?           : (bookId: string) => Promise<{ runtimeKnowledge: FullRuntimeKnowledge }>;
}

/**
 * 功能：定义共享章节循环的运行时阶段选项。
 * 输入：无（类型声明）。
 * 输出：阶段名称、进度区间与 two-pass 注入的上下文。
 * 异常：无。
 * 副作用：无。
 */
export interface SequentialChapterLoopOptions {
  stageLabel             : string;
  progressBase           : number;
  progressRange          : number;
  externalPersonaMap?    : Map<string, string>;
  preloadedLexiconConfig?: BookLexiconConfig;
  runtimeKnowledge?      : FullRuntimeKnowledge;
}

type SequentialPipelineDependenciesInput = Partial<SequentialPipelineDependencies>;

function waitForRetry(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * 功能：执行顺序/Pass 3 共用的章节主循环。
 * 输入：pipeline 基础参数、运行时依赖、阶段选项。
 * 输出：成功/失败章节统计。
 * 异常：章节级错误在循环内消化；是否升级为任务失败交由上层决定。
 * 副作用：更新章节状态、写入书籍进度、触发增量称号溯源与章节级校验。
 */
export async function runSequentialChapterLoop(
  params: PipelineRunParams,
  dependencies: SequentialPipelineDependencies,
  options: SequentialChapterLoopOptions
): Promise<AnalysisPipelineResult> {
  const pending = [...params.chapters];
  const wait = dependencies.wait ?? waitForRetry;

  let completedChapters = 0;
  let failedChapters = 0;
  let doneCount = 0;
  let nextResolveAt = dependencies.incrementalResolveInterval;
  let resolveChain = Promise.resolve();

  async function scheduleIncrementalTitleResolution(chapterNo: number): Promise<void> {
    resolveChain = resolveChain.then(async () => {
      if (doneCount < nextResolveAt) {
        return;
      }

      const titleOnlyCount = await dependencies.analyzer.getTitleOnlyPersonaCount(params.bookId);
      if (titleOnlyCount <= 0) {
        nextResolveAt += dependencies.incrementalResolveInterval;
        return;
      }

      try {
        await dependencies.analyzer.resolvePersonaTitles(params.bookId, { jobId: params.jobId });
        nextResolveAt += dependencies.incrementalResolveInterval;
      } catch (incrementalResolveError) {
        console.warn(
          "[analysis.runner] incremental.title.resolve.failed",
          JSON.stringify({
            jobId : params.jobId,
            bookId: params.bookId,
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

      if (await params.isCanceled()) {
        return;
      }

      await dependencies.updateChapterStatus(chapter.id, "PROCESSING");

      let chapterSucceeded = false;
      let chapterNeedsReview = false;
      let chapterAttempt = 0;

      while (chapterAttempt <= dependencies.chapterMaxRetries) {
        try {
          const result = await dependencies.analyzer.analyzeChapter(chapter.id, {
            jobId                 : params.jobId,
            externalPersonaMap    : options.externalPersonaMap,
            preloadedLexiconConfig: options.preloadedLexiconConfig,
            runtimeKnowledge      : options.runtimeKnowledge
          });

          const riskThreshold = dependencies.chapterValidationRiskThreshold;
          const isHighRisk =
            result.created.personas >= riskThreshold
            || result.hallucinationCount > 0
            || (result.grayZoneCount ?? 0) > 0;

          if (isHighRisk) {
            const validationResult = await dependencies.runChapterValidation(chapter);
            if (validationResult.needsReview) {
              chapterNeedsReview = true;
              console.warn(
                "[analysis.runner] chapter.validation.needs_review",
                JSON.stringify({
                  jobId     : params.jobId,
                  chapterId : chapter.id,
                  chapterNo : chapter.no,
                  reportId  : validationResult.reportId,
                  errorCount: validationResult.errorCount
                })
              );
            }
          } else {
            console.info(
              "[analysis.runner] chapter.validation.skipped_low_risk",
              JSON.stringify({
                jobId       : params.jobId,
                chapterId   : chapter.id,
                chapterNo   : chapter.no,
                newPersonas : result.created.personas,
                hallucinated: result.hallucinationCount
              })
            );
          }

          completedChapters += 1;
          chapterSucceeded = true;
          console.info(
            "[analysis.runner] chapter.completed",
            JSON.stringify({
              jobId    : params.jobId,
              chapterId: chapter.id,
              chapterNo: chapter.no,
              attempt  : chapterAttempt,
              created  : result.created
            })
          );
          break;
        } catch (chapterError) {
          const isRetryable = dependencies.isChapterRetryableError(chapterError);
          const retriesExhausted = chapterAttempt >= dependencies.chapterMaxRetries;

          if (!isRetryable || retriesExhausted) {
            failedChapters += 1;
            console.error(
              "[analysis.runner] chapter.failed",
              JSON.stringify({
                jobId    : params.jobId,
                chapterId: chapter.id,
                chapterNo: chapter.no,
                attempt  : chapterAttempt,
                isRetryable,
                error    : String(chapterError).slice(0, 500)
              })
            );
            break;
          }

          const waitMs = dependencies.chapterRetryBaseMs * (chapterAttempt + 1);
          console.warn(
            "[analysis.runner] chapter.retry",
            JSON.stringify({
              jobId    : params.jobId,
              chapterId: chapter.id,
              chapterNo: chapter.no,
              attempt  : chapterAttempt + 1,
              waitMs,
              reason   : String(chapterError).slice(0, 200)
            })
          );
          await wait(waitMs);
          chapterAttempt += 1;
        }
      }

      doneCount += 1;
      await dependencies.updateChapterStatus(
        chapter.id,
        chapterSucceeded ? (chapterNeedsReview ? "REVIEW_PENDING" : "SUCCEEDED") : "FAILED"
      );

      await params.onProgress({
        progress     : Math.floor(options.progressBase + (doneCount / params.chapters.length) * options.progressRange),
        stage        : `${options.stageLabel}（已完成${doneCount}/${params.chapters.length}章）`,
        doneCount,
        totalChapters: params.chapters.length
      });

      if (chapterSucceeded) {
        await scheduleIncrementalTitleResolution(chapter.no);
      }
    }
  }

  await Promise.all(Array.from(
    { length: Math.max(1, Math.min(dependencies.chapterConcurrency, params.chapters.length)) },
    () => workerLoop()
  ));
  await resolveChain;

  return {
    completedChapters,
    failedChapters
  };
};

function isSequentialPipelineDependenciesReady(
  dependencies: SequentialPipelineDependenciesInput | undefined
): dependencies is SequentialPipelineDependencies {
  return Boolean(
    dependencies?.analyzer
    && typeof dependencies.updateChapterStatus === "function"
    && typeof dependencies.runChapterValidation === "function"
    && typeof dependencies.isChapterRetryableError === "function"
    && typeof dependencies.chapterConcurrency === "number"
    && typeof dependencies.incrementalResolveInterval === "number"
    && typeof dependencies.chapterMaxRetries === "number"
    && typeof dependencies.chapterRetryBaseMs === "number"
    && typeof dependencies.chapterValidationRiskThreshold === "number"
  );
}

/**
 * 功能：创建按章节顺序解析的 pipeline。
 * 输入：顺序架构所需的章节分析依赖。
 * 输出：可执行的 sequential pipeline 实例。
 * 异常：依赖缺失时在运行阶段抛错。
 * 副作用：无（真正副作用由注入回调承担）。
 */
export function createSequentialPipeline(
  dependencies?: SequentialPipelineDependenciesInput
): AnalysisPipeline {
  async function run(params: PipelineRunParams): Promise<AnalysisPipelineResult> {
    if (!isSequentialPipelineDependenciesReady(dependencies)) {
      throw new Error(SEQUENTIAL_PIPELINE_DEPENDENCY_ERROR);
    }

    // D12: 任务启动时加载运行时知识，传入整个 pipeline
    const runtimeContext = dependencies.loadRuntimeContext
      ? await dependencies.loadRuntimeContext(params.bookId)
      : undefined;

    const result: AnalysisPipelineResult = await runSequentialChapterLoop(params, dependencies, {
      stageLabel            : "实体提取",
      progressBase          : 0,
      progressRange         : 100,
      runtimeKnowledge      : runtimeContext?.runtimeKnowledge,
      preloadedLexiconConfig: runtimeContext?.runtimeKnowledge.lexiconConfig
    });

    return result;
  }

  return {
    architecture: "sequential",
    run
  };
}
