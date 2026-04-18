import type { BookTypeCode, PrismaClient } from "@/generated/prisma/client";
import type { AiProviderClient } from "@/server/providers/ai";
import type {
  AnalysisPipeline,
  AnalysisPipelineResult,
  AnalysisPipelineStageSummary,
  AnalysisPipelineWarning,
  PipelineRunParams
} from "@/server/modules/analysis/pipelines/types";

import { StageAExtractor } from "@/server/modules/analysis/pipelines/threestage/stageA/StageAExtractor";
import { TemporalConsistencyChecker } from "@/server/modules/analysis/pipelines/threestage/stageB5/TemporalConsistencyChecker";
import { StageBResolver } from "@/server/modules/analysis/pipelines/threestage/stageB/StageBResolver";
import { StageCAttributor } from "@/server/modules/analysis/pipelines/threestage/stageC/StageCAttributor";
import type { StageAResult } from "@/server/modules/analysis/pipelines/threestage/stageA/types";
import type { TemporalCheckResult } from "@/server/modules/analysis/pipelines/threestage/stageB5/types";
import type { StageBResult } from "@/server/modules/analysis/pipelines/threestage/stageB/types";
import type { StageCResult } from "@/server/modules/analysis/pipelines/threestage/stageC/types";
import { writeStagePhaseLog } from "@/server/modules/analysis/pipelines/threestage/phaseLogging";

const THREE_STAGE_PIPELINE_DEPENDENCY_ERROR = "ThreeStagePipeline 缺少运行时依赖，无法执行三阶段分析。";
const STAGE_A_COVERAGE_WARNING_RATIO = 0.35;
const STAGE_C_EFFECTIVE_BIO_RATIO = 0.5;

/**
 * Stage A 对外最小契约：三阶段 orchestrator 只依赖 `extract(input)`。
 */
export interface StageAService {
  extract(input: {
    bookId      : string;
    chapterId   : string;
    chapterNo   : number;
    chapterText : string;
    bookTypeCode: BookTypeCode;
    jobId?      : string;
  }): Promise<StageAResult>;
}

/** Stage B.5 对外最小契约：仅依赖 `check(bookId)`。 */
export interface StageB5Service {
  check(bookId: string): Promise<TemporalCheckResult>;
}

/** Stage B 对外最小契约：仅依赖 `resolve({ bookId })`。 */
export interface StageBService {
  resolve(input: { bookId: string }): Promise<StageBResult>;
}

/** Stage C 对外最小契约：仅依赖 `attribute({ bookId, jobId? })`。 */
export interface StageCService {
  attribute(input: { bookId: string; jobId?: string }): Promise<StageCResult>;
}

/**
 * ThreeStagePipeline 运行时依赖。
 *
 * - 必填：`prisma` / `aiClient` / 并发 / 重试参数（与 twopass 口径一致）；
 * - 可选：四个 stage factory 便于测试注入 stub。
 */
export interface ThreeStagePipelineDependencies {
  prisma                  : PrismaClient;
  aiClient                : AiProviderClient;
  chapterConcurrency      : number;
  chapterMaxRetries       : number;
  chapterRetryBaseMs      : number;
  wait?                   : (ms: number) => Promise<void>;
  /** 判断章节错误是否值得重试；缺省时按 Error 消息命中常见瞬时错误关键字。 */
  isChapterRetryableError?: (error: unknown) => boolean;
  stageAFactory?          : (aiClient: AiProviderClient, prisma: PrismaClient) => StageAService;
  stageB5Factory?         : (prisma: PrismaClient) => StageB5Service;
  stageBFactory?          : (aiClient: AiProviderClient, prisma: PrismaClient) => StageBService;
  stageCFactory?          : (aiClient: AiProviderClient, prisma: PrismaClient) => StageCService;
}

type ThreeStagePipelineDependenciesInput = Partial<ThreeStagePipelineDependencies>;

function isThreeStagePipelineDependenciesReady(
  dependencies: ThreeStagePipelineDependenciesInput | undefined
): dependencies is ThreeStagePipelineDependencies {
  return Boolean(
    dependencies?.prisma
    && dependencies.aiClient
    && typeof dependencies.chapterConcurrency === "number"
    && typeof dependencies.chapterMaxRetries === "number"
    && typeof dependencies.chapterRetryBaseMs === "number"
  );
}

function defaultIsRetryable(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return (
    message.includes("429")
    || message.includes("rate limit")
    || message.includes("timeout")
    || message.includes("temporarily unavailable")
    || message.includes("econnreset")
    || message.includes("network")
    || message.includes("terminated")
    || message.includes("aborted")
    || message.includes("fetch failed")
    || message.includes("socket")
    || message.includes("connection reset")
  );
}

function defaultWait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * 构造三阶段 pipeline。
 *
 * 执行流程：
 * 1. Stage A（每章硬提取）——章节并发 + 重试；进度 0→35%。
 * 2. Stage B.5（时序一致性检查 · 纯 DB）——进度 35→45%。
 * 3. Stage B（全书实体仲裁 · LLM）——进度 45→75%。
 * 4. Stage C（事件归属 · LLM）——进度 75→100%。
 *
 * 取消检查：每章 worker 循环起点 + 每个 Stage 开始前。
 */
export function createThreeStagePipeline(
  dependencies?: ThreeStagePipelineDependenciesInput
): AnalysisPipeline {
  async function run(params: PipelineRunParams): Promise<AnalysisPipelineResult> {
    if (!isThreeStagePipelineDependenciesReady(dependencies)) {
      throw new Error(THREE_STAGE_PIPELINE_DEPENDENCY_ERROR);
    }

    const deps = dependencies;
    const wait = deps.wait ?? defaultWait;
    const isRetryable = deps.isChapterRetryableError ?? defaultIsRetryable;

    const stageA: StageAService = deps.stageAFactory
      ? deps.stageAFactory(deps.aiClient, deps.prisma)
      : new StageAExtractor(deps.aiClient, deps.prisma);
    const stageB5: StageB5Service = deps.stageB5Factory
      ? deps.stageB5Factory(deps.prisma)
      : new TemporalConsistencyChecker(deps.prisma);
    const stageB: StageBService = deps.stageBFactory
      ? deps.stageBFactory(deps.aiClient, deps.prisma)
      : new StageBResolver(deps.aiClient, deps.prisma);
    const stageC: StageCService = deps.stageCFactory
      ? deps.stageCFactory(deps.aiClient, deps.prisma)
      : new StageCAttributor(deps.aiClient, deps.prisma);

    // 读取书籍类型码，Stage A 每章都需要传递。
    const bookRow = await deps.prisma.book.findUnique({
      where : { id: params.bookId },
      select: { id: true, typeCode: true }
    });
    if (!bookRow) {
      throw new Error(`ThreeStagePipeline: 书籍不存在: ${params.bookId}`);
    }
    const bookTypeCode = bookRow.typeCode;

    const totalChapters = params.chapters.length;
    let completedChapters = 0;
    let failedChapters = 0;
    let stageATotalMentions = 0;
    let stageAChaptersWithMentions = 0;
    let stageALowConfidenceChapters = 0;
    const warnings: AnalysisPipelineWarning[] = [];
    const stageSummaries: AnalysisPipelineStageSummary[] = [];

    async function recordStageSummary(input: {
      stage      : string;
      metrics    : Record<string, number | string | boolean | null>;
      durationMs?: number;
      warnings?  : AnalysisPipelineWarning[];
    }): Promise<void> {
      const status: "SUCCESS" | "WARNING" = (input.warnings?.length ?? 0) > 0 ? "WARNING" : "SUCCESS";
      const summary: AnalysisPipelineStageSummary = {
        stage  : input.stage,
        status,
        metrics: input.metrics
      };

      stageSummaries.push(summary);
      await writeStagePhaseLog({
        prisma    : deps.prisma,
        jobId     : params.jobId,
        stage     : input.stage,
        status,
        durationMs: input.durationMs ?? null,
        summary   : input.metrics,
        warnings  : input.warnings
      });
    }

    await params.onProgress({
      progress : 0,
      stage    : `阶段 A 硬提取（0/${totalChapters}章）`,
      doneCount: 0,
      totalChapters
    });

    const pending = [...params.chapters];
    let stageADone = 0;

    async function stageAWorker(): Promise<void> {
      while (true) {
        const chapter = pending.shift();
        if (!chapter) {
          return;
        }
        if (await params.isCanceled()) {
          return;
        }

        // 拉取章节正文（Stage A 需要）。
        const chapterRow = await deps.prisma.chapter.findUnique({
          where : { id: chapter.id },
          select: { id: true, no: true, content: true }
        });
        if (!chapterRow) {
          failedChapters += 1;
          stageADone += 1;
          console.warn(
            "[analysis.runner] stageA.chapter.missing",
            JSON.stringify({ jobId: params.jobId, chapterId: chapter.id })
          );
          await params.onProgress({
            progress : Math.floor((stageADone / totalChapters) * 35),
            stage    : `阶段 A 硬提取（${stageADone}/${totalChapters}章）`,
            doneCount: stageADone,
            totalChapters
          });
          continue;
        }

        let succeeded = false;
        for (let attempt = 0; attempt <= deps.chapterMaxRetries; attempt += 1) {
          try {
            const stageAResult = await stageA.extract({
              bookId     : params.bookId,
              chapterId  : chapterRow.id,
              chapterNo  : chapterRow.no,
              chapterText: chapterRow.content,
              bookTypeCode,
              jobId      : params.jobId
            });
            stageATotalMentions += stageAResult.mentionCount;
            if (stageAResult.mentionCount > 0) {
              stageAChaptersWithMentions += 1;
            }
            if (stageAResult.preprocessorConfidence === "LOW") {
              stageALowConfidenceChapters += 1;
            }
            succeeded = true;
            break;
          } catch (error) {
            if (!isRetryable(error) || attempt >= deps.chapterMaxRetries) {
              console.warn(
                "[analysis.runner] stageA.extract.failed",
                JSON.stringify({
                  jobId    : params.jobId,
                  chapterId: chapter.id,
                  chapterNo: chapter.no,
                  error    : String(error).slice(0, 500)
                })
              );
              break;
            }

            await wait(deps.chapterRetryBaseMs * (attempt + 1));
          }
        }

        if (succeeded) {
          completedChapters += 1;
        } else {
          failedChapters += 1;
        }
        stageADone += 1;
        await params.onProgress({
          progress : Math.floor((stageADone / totalChapters) * 35),
          stage    : `阶段 A 硬提取（${stageADone}/${totalChapters}章）`,
          doneCount: stageADone,
          totalChapters
        });
      }
    }

    const concurrency = Math.max(1, Math.min(deps.chapterConcurrency, totalChapters));
    const stageAStartedAt = Date.now();
    await Promise.all(Array.from({ length: concurrency }, () => stageAWorker()));

    const stageACoverageRatio = totalChapters === 0 ? 0 : stageAChaptersWithMentions / totalChapters;
    const stageAWarnings: AnalysisPipelineWarning[] = [];
    if (totalChapters > 0 && stageACoverageRatio < STAGE_A_COVERAGE_WARNING_RATIO) {
      stageAWarnings.push({
        code   : "STAGE_A_SPARSE_COVERAGE",
        stage  : "STAGE_A",
        message: "Stage A produced persona mentions for too few chapters.",
        details: {
          totalChapters,
          chaptersWithMentions: stageAChaptersWithMentions,
          coverageRatio       : Number(stageACoverageRatio.toFixed(2)),
          totalMentions       : stageATotalMentions
        }
      });
    }
    warnings.push(...stageAWarnings);
    await recordStageSummary({
      stage     : "STAGE_A",
      durationMs: Date.now() - stageAStartedAt,
      metrics   : {
        totalChapters,
        completedChapters,
        failedChapters,
        totalMentions        : stageATotalMentions,
        chaptersWithMentions : stageAChaptersWithMentions,
        lowConfidenceChapters: stageALowConfidenceChapters
      },
      warnings: stageAWarnings
    });

    if (await params.isCanceled()) {
      return { completedChapters, failedChapters, warnings, stageSummaries };
    }

    // Stage B.5
    await params.onProgress({
      progress : 35,
      stage    : "阶段 B.5 时序一致性检查",
      doneCount: stageADone,
      totalChapters
    });
    const stageB5StartedAt = Date.now();
    const stageB5Result = await stageB5.check(params.bookId);
    await recordStageSummary({
      stage     : "STAGE_B5",
      durationMs: Date.now() - stageB5StartedAt,
      metrics   : {
        personasScanned   : stageB5Result.personasScanned,
        suggestionsCreated: stageB5Result.suggestionsCreated,
        suggestionsSkipped: stageB5Result.suggestionsSkipped
      }
    });

    if (await params.isCanceled()) {
      return { completedChapters, failedChapters, warnings, stageSummaries };
    }

    // Stage B
    await params.onProgress({
      progress : 45,
      stage    : "阶段 B 全书实体仲裁",
      doneCount: stageADone,
      totalChapters
    });
    const stageBStartedAt = Date.now();
    const stageBResult = await stageB.resolve({ bookId: params.bookId });
    const promotedGroups = typeof deps.prisma.personaMention?.groupBy === "function"
      ? await deps.prisma.personaMention.groupBy({
        by   : ["promotedPersonaId"],
        where: {
          bookId           : params.bookId,
          promotedPersonaId: { not: null }
        }
      })
      : [];
    const promotedPersonaCount = promotedGroups.length > 0
      ? promotedGroups.length
      : new Set(stageBResult.merges.map((merge) => merge.personaId)).size;
    const stageBWarnings: AnalysisPipelineWarning[] = [];
    if (promotedPersonaCount === 0) {
      stageBWarnings.push({
        code   : "PERSONA_ZERO_AFTER_STAGE_B",
        stage  : "STAGE_B",
        message: "Stage B finished without any promoted personas.",
        details: {
          candidateGroupsTotal: stageBResult.candidateGroupsTotal,
          llmInvocations      : stageBResult.llmInvocations,
          merges              : stageBResult.merges.length,
          suggestions         : stageBResult.suggestions.length
        }
      });
    }
    warnings.push(...stageBWarnings);
    await recordStageSummary({
      stage     : "STAGE_B",
      durationMs: Date.now() - stageBStartedAt,
      metrics   : {
        candidateGroupsTotal: stageBResult.candidateGroupsTotal,
        llmInvocations      : stageBResult.llmInvocations,
        merges              : stageBResult.merges.length,
        suggestions         : stageBResult.suggestions.length,
        b5Consumed          : stageBResult.b5Consumed.length,
        aliasEntryDegraded  : stageBResult.aliasEntryDegraded,
        promotedPersonaCount
      },
      warnings: stageBWarnings
    });

    if (await params.isCanceled()) {
      return { completedChapters, failedChapters, warnings, stageSummaries };
    }

    // Stage C
    await params.onProgress({
      progress : 75,
      stage    : "阶段 C 事件归属",
      doneCount: stageADone,
      totalChapters
    });
    const stageCStartedAt = Date.now();
    const stageCResult = await stageC.attribute({ bookId: params.bookId, jobId: params.jobId });
    const biographyCoverageRatio = promotedPersonaCount === 0
      ? 0
      : stageCResult.effectiveBiographies / promotedPersonaCount;
    const stageCWarnings: AnalysisPipelineWarning[] = [];
    if (promotedPersonaCount > 0 && biographyCoverageRatio < STAGE_C_EFFECTIVE_BIO_RATIO) {
      stageCWarnings.push({
        code   : "STAGE_C_SPARSE_COVERAGE",
        stage  : "STAGE_C",
        message: "Stage C produced too few effective biographies for promoted personas.",
        details: {
          promotedPersonaCount,
          biographiesCreated  : stageCResult.biographiesCreated,
          effectiveBiographies: stageCResult.effectiveBiographies,
          coverageRatio       : Number(biographyCoverageRatio.toFixed(2))
        }
      });
    }
    warnings.push(...stageCWarnings);
    await recordStageSummary({
      stage     : "STAGE_C",
      durationMs: Date.now() - stageCStartedAt,
      metrics   : {
        chaptersProcessed   : stageCResult.chaptersProcessed,
        llmInvocations      : stageCResult.llmInvocations,
        biographiesCreated  : stageCResult.biographiesCreated,
        effectiveBiographies: stageCResult.effectiveBiographies,
        deathChapterUpdates : stageCResult.deathChapterUpdates.length,
        feedbackSuggestions : stageCResult.feedbackSuggestions.length,
        promotedPersonaCount
      },
      warnings: stageCWarnings
    });

    await params.onProgress({
      progress : 100,
      stage    : "三阶段解析完成",
      doneCount: stageADone,
      totalChapters
    });

    return { completedChapters, failedChapters, warnings, stageSummaries };
  }

  return {
    architecture: "threestage",
    run
  };
}
