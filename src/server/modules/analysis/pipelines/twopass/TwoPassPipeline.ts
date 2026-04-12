import type {
  AnalysisPipeline,
  AnalysisPipelineResult,
  PipelineRunParams
} from "@/server/modules/analysis/pipelines/types";
import type { BookLexiconConfig } from "@/server/modules/analysis/config/lexicon";
import type { ChapterEntityList } from "@/types/analysis";
import {
  runSequentialChapterLoop,
  type SequentialPipelineDependencies,
  type ChapterLoopAnalyzer
} from "@/server/modules/analysis/pipelines/sequential/SequentialPipeline";
import type { GlobalEntityResolverService } from "@/server/modules/analysis/pipelines/twopass/GlobalEntityResolver";

const TWO_PASS_PIPELINE_DEPENDENCY_ERROR = "TwoPassPipeline 缺少运行时依赖，无法执行两遍式分析。";

interface TwoPassRuntimeContext {
  bookTitle              : string;
  preloadedAliasLookup   : Map<string, string>;
  preloadedLexiconConfig?: BookLexiconConfig;
}

/**
 * 功能：定义 two-pass 管线所需的分析器能力。
 * 输入：无（类型声明）。
 * 输出：Pass 1、Pass 2、Pass 3 所需方法集合。
 * 异常：无。
 * 副作用：无。
 */
export interface TwoPassPipelineAnalyzer extends ChapterLoopAnalyzer {
  extractChapterEntities(chapterId: string, context: { jobId: string }): Promise<ChapterEntityList>;
  resolveGlobalEntities: GlobalEntityResolverService["resolveGlobalEntities"];
}

/**
 * 功能：定义 two-pass 管线的运行时依赖。
 * 输入：无（类型声明）。
 * 输出：Pass 1/Pass 2 预加载能力与 Pass 3 共享章节循环依赖。
 * 异常：无。
 * 副作用：无。
 */
export interface TwoPassPipelineDependencies extends Omit<SequentialPipelineDependencies, "analyzer"> {
  analyzer          : TwoPassPipelineAnalyzer;
  loadRuntimeContext: (bookId: string) => Promise<TwoPassRuntimeContext>;
}

type TwoPassPipelineDependenciesInput = Partial<TwoPassPipelineDependencies>;

function isTwoPassPipelineDependenciesReady(
  dependencies: TwoPassPipelineDependenciesInput | undefined
): dependencies is TwoPassPipelineDependencies {
  return Boolean(
    dependencies?.analyzer
    && typeof dependencies.loadRuntimeContext === "function"
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
 * 功能：创建两遍式 pipeline。
 * 输入：two-pass 运行所需依赖。
 * 输出：可执行的 twopass pipeline 实例。
 * 异常：依赖缺失时在运行阶段抛错。
 * 副作用：Pass 1/Pass 2/Pass 3 的数据库写入与 AI 调用由注入依赖承担。
 */
export function createTwoPassPipeline(
  dependencies?: TwoPassPipelineDependenciesInput
): AnalysisPipeline {
  async function run(params: PipelineRunParams): Promise<AnalysisPipelineResult> {
    if (!isTwoPassPipelineDependenciesReady(dependencies)) {
      throw new Error(TWO_PASS_PIPELINE_DEPENDENCY_ERROR);
    }

    const runtimeDependencies: TwoPassPipelineDependencies = dependencies;

    await params.onProgress({
      progress     : 0,
      stage        : `独立实体提取（0/${params.chapters.length}章）`,
      doneCount    : 0,
      totalChapters: params.chapters.length
    });

    const chapterEntityLists: ChapterEntityList[] = [];
    const pending = [...params.chapters];
    const wait = runtimeDependencies.wait ?? ((ms: number) => new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    }));
    let pass1Done = 0;

    async function pass1Worker(): Promise<void> {
      while (true) {
        const chapter = pending.shift();
        if (!chapter) {
          return;
        }
        if (await params.isCanceled()) {
          return;
        }

        for (let attempt = 0; attempt <= runtimeDependencies.chapterMaxRetries; attempt += 1) {
          try {
            const result = await runtimeDependencies.analyzer.extractChapterEntities(chapter.id, { jobId: params.jobId });
            chapterEntityLists.push(result);
            break;
          } catch (error) {
            if (!runtimeDependencies.isChapterRetryableError(error) || attempt >= runtimeDependencies.chapterMaxRetries) {
              console.warn(
                "[analysis.runner] pass1.extract.failed",
                JSON.stringify({
                  jobId    : params.jobId,
                  chapterId: chapter.id,
                  chapterNo: chapter.no,
                  error    : String(error).slice(0, 500)
                })
              );
              break;
            }

            await wait(runtimeDependencies.chapterRetryBaseMs * (attempt + 1));
          }
        }

        pass1Done += 1;
        await params.onProgress({
          progress     : Math.floor((pass1Done / params.chapters.length) * 35),
          stage        : `独立实体提取（${pass1Done}/${params.chapters.length}章）`,
          doneCount    : pass1Done,
          totalChapters: params.chapters.length
        });
      }
    }

    await Promise.all(Array.from(
      { length: Math.max(1, Math.min(runtimeDependencies.chapterConcurrency, params.chapters.length)) },
      () => pass1Worker()
    ));

    if (await params.isCanceled()) {
      return {
        completedChapters: 0,
        failedChapters   : 0
      };
    }

    await params.onProgress({
      progress     : 36,
      stage        : "全局实体消歧",
      doneCount    : pass1Done,
      totalChapters: params.chapters.length
    });

    const runtimeContext = await runtimeDependencies.loadRuntimeContext(params.bookId);
    const { globalPersonaMap } = await runtimeDependencies.analyzer.resolveGlobalEntities(
      params.bookId,
      runtimeContext.bookTitle,
      chapterEntityLists,
      { bookId: params.bookId, jobId: params.jobId },
      runtimeContext.preloadedAliasLookup
    );

    console.info(
      "[analysis.runner] two_pass.completed",
      JSON.stringify({
        jobId       : params.jobId,
        bookId      : params.bookId,
        pass1Results: chapterEntityLists.length,
        globalMap   : globalPersonaMap.size
      })
    );

    await params.onProgress({
      progress     : 40,
      stage        : `详细分析（0/${params.chapters.length}章）`,
      doneCount    : 0,
      totalChapters: params.chapters.length
    });

    const pass3Dependencies: SequentialPipelineDependencies = {
      ...runtimeDependencies,
      analyzer: runtimeDependencies.analyzer
    };

    return await runSequentialChapterLoop(params, pass3Dependencies, {
      stageLabel            : "详细分析",
      progressBase          : 40,
      progressRange         : 60,
      externalPersonaMap    : globalPersonaMap,
      preloadedLexiconConfig: runtimeContext.preloadedLexiconConfig
    });
  }

  return {
    architecture: "twopass",
    run
  };
}
