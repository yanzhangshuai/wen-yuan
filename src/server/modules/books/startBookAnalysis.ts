/**
 * =============================================================================
 * 文件定位（服务层：创建书籍分析任务）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/server/modules/books/startBookAnalysis.ts`
 *
 * 模块职责：
 * - 将“解析范围 + 模型策略 + 覆盖策略”转换为可执行的分析任务记录；
 * - 负责业务合法性判断（范围参数互斥/边界）与任务初始化。
 *
 * 在链路中的位置：
 * - 上游：`POST /api/books/:id/analyze`；
 * - 下游：分析任务表与后续 `runAnalysisJob` 执行器。
 *
 * 为什么这里做范围校验：
 * - 解析范围决定下游清理/重跑范围，校验失败若放到执行期会造成资源浪费与状态污染；
 * - 因此“scope 与章节参数匹配关系”是业务规则，不是技术实现细节。
 * =============================================================================
 */
import { AnalysisJobStatus } from "@/generated/prisma/enums";
import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import type { StrategyStagesDto } from "@/server/modules/analysis/dto/modelStrategy";
import { AnalysisScopeInvalidError, BookNotFoundError } from "@/server/modules/books/errors";
import {
  ANALYSIS_ARCHITECTURE_VALUES,
  type AnalysisArchitecture
} from "@/types/analysis-pipeline";

/** 允许的解析范围枚举值。 */
export const ANALYSIS_SCOPE_VALUES = ["FULL_BOOK", "CHAPTER_RANGE", "CHAPTER_LIST"] as const;
/** 解析范围类型。 */
export type AnalysisScope = (typeof ANALYSIS_SCOPE_VALUES)[number];
/** 允许的重解析覆盖策略枚举值。 */
export const ANALYSIS_OVERRIDE_STRATEGY_VALUES = ["DRAFT_ONLY", "ALL_DRAFTS"] as const;
/** 重解析覆盖策略类型。 */
export type AnalysisOverrideStrategy = (typeof ANALYSIS_OVERRIDE_STRATEGY_VALUES)[number];

/**
 * 启动解析任务输入。
 */
export interface StartBookAnalysisInput {
  /** 任务级阶段模型配置（覆盖 Book/GLOBAL 配置）。 */
  modelStrategy    ?: StrategyStagesDto | null;
  /** 解析架构：顺序或两遍式；为空时尝试继承最近一次任务。 */
  architecture     ?: AnalysisArchitecture;
  /** 解析范围：全书或章节区间。 */
  scope            ?: AnalysisScope;
  /** 章节区间起点（仅 CHAPTER_RANGE 时必填）。 */
  chapterStart     ?: number | null;
  /** 章节区间终点（仅 CHAPTER_RANGE 时必填）。 */
  chapterEnd       ?: number | null;
  /** 指定章节编号列表（仅 CHAPTER_LIST 时必填）。 */
  chapterIndices   ?: number[];
  /** 覆盖策略。 */
  overrideStrategy ?: AnalysisOverrideStrategy;
  /** 是否保留历史版本。 */
  keepHistory      ?: boolean;
}

/**
 * 启动解析任务结果。
 */
export interface StartBookAnalysisResult {
  /** 书籍 ID。 */
  bookId          : string;
  /** 任务 ID。 */
  jobId           : string;
  /** 任务状态（初始为 QUEUED）。 */
  status          : AnalysisJobStatus;
  /** 实际生效解析架构。 */
  architecture    : AnalysisArchitecture;
  /** 实际生效解析范围。 */
  scope           : AnalysisScope;
  /** 实际生效区间起点。 */
  chapterStart    : number | null;
  /** 实际生效区间终点。 */
  chapterEnd      : number | null;
  /** 实际生效章节局列表（CHAPTER_LIST 时）。 */
  chapterIndices  : number[];
  /** 实际生效覆盖策略。 */
  overrideStrategy: AnalysisOverrideStrategy;
  /** 是否保留历史。 */
  keepHistory     : boolean;
  /** 书籍状态（已切换为 PROCESSING）。 */
  bookStatus      : string;
  /** 解析进度（重置为 0）。 */
  parseProgress   : number;
  /** 当前阶段（初始化为“文本清洗”）。 */
  parseStage      : string | null;
}

/**
 * 解析并校验 scope。
 */
function resolveScope(inputScope: string | undefined): AnalysisScope {
  if (!inputScope) {
    return "FULL_BOOK";
  }

  if ((ANALYSIS_SCOPE_VALUES as readonly string[]).includes(inputScope)) {
    return inputScope as AnalysisScope;
  }

  throw new AnalysisScopeInvalidError("解析范围不合法");
}

/**
 * 解析并校验重解析覆盖策略。
 */
function resolveOverrideStrategy(
  inputOverrideStrategy: string | undefined
): AnalysisOverrideStrategy {
  if (!inputOverrideStrategy) {
    return "DRAFT_ONLY";
  }

  if ((ANALYSIS_OVERRIDE_STRATEGY_VALUES as readonly string[]).includes(inputOverrideStrategy)) {
    return inputOverrideStrategy as AnalysisOverrideStrategy;
  }

  throw new AnalysisScopeInvalidError("重解析覆盖策略不合法");
}

/**
 * 标准化 keepHistory 输入。
 */
function resolveKeepHistory(keepHistory: boolean | undefined): boolean {
  return Boolean(keepHistory);
}

/**
 * 解析并校验解析架构。
 */
function resolveArchitectureInput(
  inputArchitecture: string | undefined
): AnalysisArchitecture | undefined {
  if (!inputArchitecture) {
    return undefined;
  }

  if ((ANALYSIS_ARCHITECTURE_VALUES as readonly string[]).includes(inputArchitecture)) {
    return inputArchitecture as AnalysisArchitecture;
  }

  throw new AnalysisScopeInvalidError("解析架构不合法");
}

/**
 * 校验并标准化指定章节列表。
 */
function resolveChapterList(
  scope: AnalysisScope,
  chapterIndices: number[] | undefined
): number[] {
  if (scope !== "CHAPTER_LIST") {
    return [];
  }

  if (!chapterIndices || chapterIndices.length === 0) {
    throw new AnalysisScopeInvalidError("指定章节解析需要提供至少一个章节编号");
  }

  for (const idx of chapterIndices) {
    if (!Number.isInteger(idx) || idx < 0) {
      throw new AnalysisScopeInvalidError("章节编号必须为非负整数");
    }
  }

  return [...new Set(chapterIndices)].sort((a, b) => a - b);
}

/**
 * 校验并标准化章节范围。
 */
function resolveChapterRange(
  scope: AnalysisScope,
  chapterStart: number | null | undefined,
  chapterEnd: number | null | undefined
): { chapterStart: number | null; chapterEnd: number | null } {
  if (scope === "FULL_BOOK" || scope === "CHAPTER_LIST") {
    return {
      chapterStart: null,
      chapterEnd  : null
    };
  }

  if (chapterStart == null || chapterEnd == null) {
    throw new AnalysisScopeInvalidError("章节范围解析需要提供整数起止章节");
  }

  if (!Number.isInteger(chapterStart) || !Number.isInteger(chapterEnd)) {
    throw new AnalysisScopeInvalidError("章节范围解析需要提供整数起止章节");
  }

  const normalizedChapterStart = Number(chapterStart);
  const normalizedChapterEnd = Number(chapterEnd);

  if (normalizedChapterStart <= 0 || normalizedChapterEnd <= 0 || normalizedChapterStart > normalizedChapterEnd) {
    throw new AnalysisScopeInvalidError("章节范围不合法");
  }

  return {
    chapterStart: normalizedChapterStart,
    chapterEnd  : normalizedChapterEnd
  };
}

export function createStartBookAnalysisService(
  prismaClient: PrismaClient = prisma
) {
  /**
   * 功能：创建并入队一本书的解析任务。
   * 输入：书籍 ID + 任务参数（模型/范围/覆盖策略等）。
   * 输出：任务创建结果 + 书籍状态更新快照。
   * 异常：
   * - `BookNotFoundError`：书籍不存在；
   * - `AnalysisScopeInvalidError`：范围参数不合法；
   * - `AnalysisModelNotFoundError`：模型不存在；
   * - `AnalysisModelDisabledError`：模型未启用。
   * 副作用：
   * - 写入 `analysisJob`；
   * - 更新 `book` 到 `PROCESSING` 并重置进度阶段。
   */
  async function startBookAnalysis(
    bookId: string,
    input: StartBookAnalysisInput = {}
  ): Promise<StartBookAnalysisResult> {
    const book = await prismaClient.book.findFirst({
      where: {
        id       : bookId,
        deletedAt: null
      },
      select: {
        id: true
      }
    });

    if (!book) {
      throw new BookNotFoundError(bookId);
    }

    const scope = resolveScope(input.scope);
    const requestedArchitecture = resolveArchitectureInput(input.architecture);
    const overrideStrategy = resolveOverrideStrategy(input.overrideStrategy);
    const keepHistory = resolveKeepHistory(input.keepHistory);
    const range = resolveChapterRange(scope, input.chapterStart, input.chapterEnd);
    const chapterIndices = resolveChapterList(scope, input.chapterIndices);
    const latestJob = requestedArchitecture
      ? null
      : await prismaClient.analysisJob.findFirst({
        where  : { bookId: book.id },
        orderBy: { createdAt: "desc" },
        select : { architecture: true }
      });
    const architecture = requestedArchitecture ?? (latestJob?.architecture === "twopass" ? "twopass" : "sequential");

    const chapterCount = await prismaClient.chapter.count({
      where: scope === "CHAPTER_RANGE"
        ? {
          bookId: book.id,
          no    : {
            gte: range.chapterStart ?? 1,
            lte: range.chapterEnd ?? Number.MAX_SAFE_INTEGER
          }
        }
        : scope === "CHAPTER_LIST"
          ? {
            bookId: book.id,
            no    : { in: chapterIndices }
          }
          : { bookId: book.id }
    });
    if (chapterCount === 0) {
      throw new AnalysisScopeInvalidError("请先确认章节后再启动解析");
    }

    const [job, updatedBook] = await prismaClient.$transaction(async (tx) => {
      const createdJob = await tx.analysisJob.create({
        data: {
          bookId      : book.id,
          status      : AnalysisJobStatus.QUEUED,
          architecture,
          scope,
          chapterStart: range.chapterStart,
          chapterEnd  : range.chapterEnd,
          chapterIndices,
          overrideStrategy,
          keepHistory
        },
        select: {
          id              : true,
          status          : true,
          architecture    : true,
          scope           : true,
          chapterStart    : true,
          chapterEnd      : true,
          chapterIndices  : true,
          overrideStrategy: true,
          keepHistory     : true
        }
      });

      if (input.modelStrategy) {
        await tx.modelStrategyConfig.create({
          data: {
            scope : "JOB",
            jobId : createdJob.id,
            stages: input.modelStrategy
          }
        });
      }

      const nextBook = await tx.book.update({
        where: { id: book.id },
        data : {
          status       : "PROCESSING",
          parseProgress: 0,
          parseStage   : "文本清洗",
          errorLog     : null
        },
        select: {
          status       : true,
          parseProgress: true,
          parseStage   : true
        }
      });

      return [createdJob, nextBook] as const;
    });

    return {
      bookId          : book.id,
      jobId           : job.id,
      status          : job.status,
      architecture    : architecture,
      scope           : scope,
      chapterStart    : job.chapterStart,
      chapterEnd      : job.chapterEnd,
      chapterIndices  : job.chapterIndices,
      overrideStrategy: (job.overrideStrategy ?? "DRAFT_ONLY") as AnalysisOverrideStrategy,
      keepHistory     : job.keepHistory,
      bookStatus      : updatedBook.status,
      parseProgress   : updatedBook.parseProgress,
      parseStage      : updatedBook.parseStage
    };
  }

  return { startBookAnalysis };
}

export const { startBookAnalysis } = createStartBookAnalysisService();
export { ANALYSIS_ARCHITECTURE_VALUES };
export {
  AnalysisScopeInvalidError,
  BookNotFoundError
} from "@/server/modules/books/errors";
