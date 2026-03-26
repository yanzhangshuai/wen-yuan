import { AnalysisJobStatus } from "@/generated/prisma/enums";
import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import {
  AnalysisModelDisabledError,
  AnalysisModelNotFoundError,
  AnalysisScopeInvalidError,
  BookNotFoundError
} from "@/server/modules/books/errors";

/** 允许的解析范围枚举值。 */
export const ANALYSIS_SCOPE_VALUES = ["FULL_BOOK", "CHAPTER_RANGE"] as const;
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
  /** 指定模型 ID；为空时使用书籍当前绑定模型。 */
  aiModelId        ?: string | null;
  /** 解析范围：全书或章节区间。 */
  scope            ?: AnalysisScope;
  /** 章节区间起点（仅 CHAPTER_RANGE 时必填）。 */
  chapterStart     ?: number | null;
  /** 章节区间终点（仅 CHAPTER_RANGE 时必填）。 */
  chapterEnd       ?: number | null;
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
  /** 实际生效解析范围。 */
  scope           : AnalysisScope;
  /** 实际生效区间起点。 */
  chapterStart    : number | null;
  /** 实际生效区间终点。 */
  chapterEnd      : number | null;
  /** 实际生效覆盖策略。 */
  overrideStrategy: AnalysisOverrideStrategy;
  /** 是否保留历史。 */
  keepHistory     : boolean;
  /** 本次任务使用模型 ID。 */
  aiModelId       : string | null;
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
 * 校验并标准化章节范围。
 */
function resolveChapterRange(
  scope: AnalysisScope,
  chapterStart: number | null | undefined,
  chapterEnd: number | null | undefined
): { chapterStart: number | null; chapterEnd: number | null } {
  if (scope === "FULL_BOOK") {
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
        id       : true,
        aiModelId: true
      }
    });

    if (!book) {
      throw new BookNotFoundError(bookId);
    }

    const scope = resolveScope(input.scope);
    const overrideStrategy = resolveOverrideStrategy(input.overrideStrategy);
    const keepHistory = resolveKeepHistory(input.keepHistory);
    const range = resolveChapterRange(scope, input.chapterStart, input.chapterEnd);
    const selectedModelId = input.aiModelId ?? book.aiModelId ?? null;

    if (selectedModelId) {
      const model = await prismaClient.aiModel.findUnique({
        where : { id: selectedModelId },
        select: {
          id       : true,
          isEnabled: true
        }
      });

      if (!model) {
        throw new AnalysisModelNotFoundError(selectedModelId);
      }

      if (!model.isEnabled) {
        throw new AnalysisModelDisabledError(selectedModelId);
      }
    }

    const [job, updatedBook] = await prismaClient.$transaction([
      prismaClient.analysisJob.create({
        data: {
          bookId      : book.id,
          aiModelId   : selectedModelId,
          status      : AnalysisJobStatus.QUEUED,
          scope,
          chapterStart: range.chapterStart,
          chapterEnd  : range.chapterEnd,
          overrideStrategy,
          keepHistory
        },
        select: {
          id              : true,
          status          : true,
          scope           : true,
          chapterStart    : true,
          chapterEnd      : true,
          overrideStrategy: true,
          keepHistory     : true
        }
      }),
      prismaClient.book.update({
        where: { id: book.id },
        data : {
          aiModelId    : selectedModelId,
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
      })
    ]);

    return {
      bookId          : book.id,
      jobId           : job.id,
      status          : job.status,
      scope           : scope,
      chapterStart    : job.chapterStart,
      chapterEnd      : job.chapterEnd,
      overrideStrategy: (job.overrideStrategy ?? "DRAFT_ONLY") as AnalysisOverrideStrategy,
      keepHistory     : job.keepHistory,
      aiModelId       : selectedModelId,
      bookStatus      : updatedBook.status,
      parseProgress   : updatedBook.parseProgress,
      parseStage      : updatedBook.parseStage
    };
  }

  return { startBookAnalysis };
}

export const { startBookAnalysis } = createStartBookAnalysisService();
export {
  AnalysisModelDisabledError,
  AnalysisModelNotFoundError,
  AnalysisScopeInvalidError,
  BookNotFoundError
} from "@/server/modules/books/errors";
