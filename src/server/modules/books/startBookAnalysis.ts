import { AnalysisJobStatus } from "@/generated/prisma/enums";
import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import {
  AnalysisModelDisabledError,
  AnalysisModelNotFoundError,
  AnalysisScopeInvalidError,
  BookNotFoundError
} from "@/server/modules/books/errors";

export const ANALYSIS_SCOPE_VALUES = ["FULL_BOOK", "CHAPTER_RANGE"] as const;
export type AnalysisScope = (typeof ANALYSIS_SCOPE_VALUES)[number];

export interface StartBookAnalysisInput {
  aiModelId   ?: string | null;
  scope       ?: AnalysisScope;
  chapterStart?: number | null;
  chapterEnd  ?: number | null;
}

export interface StartBookAnalysisResult {
  bookId      : string;
  jobId       : string;
  status      : AnalysisJobStatus;
  scope       : AnalysisScope;
  chapterStart: number | null;
  chapterEnd  : number | null;
  aiModelId   : string | null;
  bookStatus  : string;
  parseProgress: number;
  parseStage  : string | null;
}

function resolveScope(inputScope: string | undefined): AnalysisScope {
  if (!inputScope) {
    return "FULL_BOOK";
  }

  if ((ANALYSIS_SCOPE_VALUES as readonly string[]).includes(inputScope)) {
    return inputScope as AnalysisScope;
  }

  throw new AnalysisScopeInvalidError("解析范围不合法");
}

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
  async function startBookAnalysis(
    bookId: string,
    input: StartBookAnalysisInput = {}
  ): Promise<StartBookAnalysisResult> {
    const book = await prismaClient.book.findUnique({
      where : { id: bookId },
      select: {
        id      : true,
        aiModelId: true
      }
    });

    if (!book) {
      throw new BookNotFoundError(bookId);
    }

    const scope = resolveScope(input.scope);
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
          chapterEnd  : range.chapterEnd
        },
        select: {
          id          : true,
          status      : true,
          scope       : true,
          chapterStart: true,
          chapterEnd  : true
        }
      }),
      prismaClient.book.update({
        where: { id: book.id },
        data : {
          aiModelId   : selectedModelId,
          status      : "PROCESSING",
          parseProgress: 0,
          parseStage  : "文本清洗",
          errorLog    : null
        },
        select: {
          status       : true,
          parseProgress: true,
          parseStage   : true
        }
      })
    ]);

    return {
      bookId       : book.id,
      jobId        : job.id,
      status       : job.status,
      scope        : scope,
      chapterStart : job.chapterStart,
      chapterEnd   : job.chapterEnd,
      aiModelId    : selectedModelId,
      bookStatus   : updatedBook.status,
      parseProgress: updatedBook.parseProgress,
      parseStage   : updatedBook.parseStage
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
