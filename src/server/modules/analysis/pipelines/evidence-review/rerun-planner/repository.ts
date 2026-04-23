import type { PrismaClient } from "@/generated/prisma/client";
import { AnalysisJobStatus, AnalysisStageRunStatus } from "@/generated/prisma/enums";
import { prisma } from "@/server/db/prisma";

import type { EvidenceReviewRerunStageKey } from "./types";

export interface EvidenceReviewChapterMetadata {
  chapterId: string;
  chapterNo: number;
}

export interface EvidenceReviewSuccessfulRunSummary {
  runId              : string;
  bookId             : string;
  trigger            : string;
  scope              : string;
  promptTokens       : number;
  completionTokens   : number;
  totalTokens        : number;
  estimatedCostMicros: bigint;
  finishedAt         : Date | null;
  createdAt          : Date;
}

export interface EvidenceReviewSuccessfulStageRunSummary {
  stageKey           : EvidenceReviewRerunStageKey;
  databaseStageKey   : string | null;
  inputHash          : string | null;
  outputHash         : string | null;
  chapterStartNo     : number | null;
  chapterEndNo       : number | null;
  skippedCount       : number;
  promptTokens       : number;
  completionTokens   : number;
  totalTokens        : number;
  estimatedCostMicros: bigint;
  attempt            : number;
  startedAt          : Date | null;
  finishedAt         : Date | null;
  createdAt          : Date;
}

type ChapterFindManyArgs = {
  where  : { id: { in: string[] } };
  select : { id: true; no: true };
  orderBy: [{ no: "asc" }, { id: "asc" }];
};

type AnalysisRunFindFirstArgs = {
  where: {
    bookId: string;
    status: AnalysisJobStatus;
  };
  orderBy: [{ finishedAt: "desc" }, { createdAt: "desc" }];
  select: {
    id                 : true;
    bookId             : true;
    trigger            : true;
    scope              : true;
    promptTokens       : true;
    completionTokens   : true;
    totalTokens        : true;
    estimatedCostMicros: true;
    finishedAt         : true;
    createdAt          : true;
  };
};

type AnalysisStageRunFindManyArgs = {
  where: {
    runId   : string;
    status  : AnalysisStageRunStatus;
    stageKey: { in: string[] };
  };
  orderBy: [{ stageKey: "asc" }, { createdAt: "desc" }, { attempt: "desc" }];
  select: {
    stageKey           : true;
    inputHash          : true;
    outputHash         : true;
    chapterStartNo     : true;
    chapterEndNo       : true;
    skippedCount       : true;
    promptTokens       : true;
    completionTokens   : true;
    totalTokens        : true;
    estimatedCostMicros: true;
    attempt            : true;
    startedAt          : true;
    finishedAt         : true;
    createdAt          : true;
  };
};

type ChapterFindManyRow = {
  id: string;
  no: number;
};

type AnalysisRunFindFirstRow = {
  id                 : string;
  bookId             : string;
  trigger            : string;
  scope              : string;
  promptTokens       : number;
  completionTokens   : number;
  totalTokens        : number;
  estimatedCostMicros: bigint;
  finishedAt         : Date | null;
  createdAt          : Date;
};

type AnalysisStageRunFindManyRow = {
  stageKey           : string;
  inputHash          : string | null;
  outputHash         : string | null;
  chapterStartNo     : number | null;
  chapterEndNo       : number | null;
  skippedCount       : number;
  promptTokens       : number;
  completionTokens   : number;
  totalTokens        : number;
  estimatedCostMicros: bigint;
  attempt            : number;
  startedAt          : Date | null;
  finishedAt         : Date | null;
  createdAt          : Date;
};

interface ChapterFindManyDelegate {
  findMany(args: ChapterFindManyArgs): Promise<ChapterFindManyRow[]>;
}

interface AnalysisRunFindFirstDelegate {
  findFirst(args: AnalysisRunFindFirstArgs): Promise<AnalysisRunFindFirstRow | null>;
}

interface AnalysisStageRunFindManyDelegate {
  findMany(args: AnalysisStageRunFindManyArgs): Promise<AnalysisStageRunFindManyRow[]>;
}

type EvidenceReviewRerunRepositoryClient = {
  chapter?         : Partial<ChapterFindManyDelegate>;
  analysisRun?     : Partial<AnalysisRunFindFirstDelegate>;
  analysisStageRun?: Partial<AnalysisStageRunFindManyDelegate>;
};

const DATABASE_STAGE_KEY_BY_RERUN_STAGE_KEY: Record<EvidenceReviewRerunStageKey, string | null> = {
  STAGE_0     : "STAGE_0",
  STAGE_A     : "stage_a_extraction",
  STAGE_A_PLUS: "stage_a_plus_knowledge_recall",
  STAGE_B     : "stage_b_identity_resolution",
  STAGE_B5    : "stage_b5_conflict_detection",
  STAGE_C     : "stage_c_fact_attribution",
  STAGE_D     : null
};

function hasChapterFindManyDelegate(
  client: EvidenceReviewRerunRepositoryClient
): client is EvidenceReviewRerunRepositoryClient & { chapter: ChapterFindManyDelegate } {
  return typeof client.chapter?.findMany === "function";
}

function hasAnalysisRunFindFirstDelegate(
  client: EvidenceReviewRerunRepositoryClient
): client is EvidenceReviewRerunRepositoryClient & { analysisRun: AnalysisRunFindFirstDelegate } {
  return typeof client.analysisRun?.findFirst === "function";
}

function hasAnalysisStageRunFindManyDelegate(
  client: EvidenceReviewRerunRepositoryClient
): client is EvidenceReviewRerunRepositoryClient & { analysisStageRun: AnalysisStageRunFindManyDelegate } {
  return typeof client.analysisStageRun?.findMany === "function";
}

function uniqueStageKeys(stageKeys: readonly EvidenceReviewRerunStageKey[]): EvidenceReviewRerunStageKey[] {
  return Array.from(new Set(stageKeys));
}

export function createEvidenceReviewRerunRepository(
  prismaClient: EvidenceReviewRerunRepositoryClient | PrismaClient = prisma
) {
  async function listChapterMetadata(chapterIds: string[]): Promise<EvidenceReviewChapterMetadata[]> {
    if (chapterIds.length === 0 || !hasChapterFindManyDelegate(prismaClient)) {
      return [];
    }

    const rows = await prismaClient.chapter.findMany({
      where : { id: { in: chapterIds } },
      select: {
        id: true,
        no: true
      },
      orderBy: [
        { no: "asc" },
        { id: "asc" }
      ]
    });

    return rows
      .map((row) => ({
        chapterId: row.id,
        chapterNo: row.no
      }))
      .sort((left, right) => left.chapterNo - right.chapterNo || left.chapterId.localeCompare(right.chapterId));
  }

  async function findLatestSuccessfulRun(
    bookId: string
  ): Promise<EvidenceReviewSuccessfulRunSummary | null> {
    if (!hasAnalysisRunFindFirstDelegate(prismaClient)) {
      return null;
    }

    const row = await prismaClient.analysisRun.findFirst({
      where: {
        bookId,
        status: AnalysisJobStatus.SUCCEEDED
      },
      orderBy: [
        { finishedAt: "desc" },
        { createdAt: "desc" }
      ],
      select: {
        id                 : true,
        bookId             : true,
        trigger            : true,
        scope              : true,
        promptTokens       : true,
        completionTokens   : true,
        totalTokens        : true,
        estimatedCostMicros: true,
        finishedAt         : true,
        createdAt          : true
      }
    });

    if (row === null) {
      return null;
    }

    return {
      runId              : row.id,
      bookId             : row.bookId,
      trigger            : row.trigger,
      scope              : row.scope,
      promptTokens       : row.promptTokens,
      completionTokens   : row.completionTokens,
      totalTokens        : row.totalTokens,
      estimatedCostMicros: row.estimatedCostMicros,
      finishedAt         : row.finishedAt,
      createdAt          : row.createdAt
    };
  }

  async function listLatestSuccessfulStageRuns(
    runId: string,
    stageKeys: EvidenceReviewRerunStageKey[]
  ): Promise<EvidenceReviewSuccessfulStageRunSummary[]> {
    const requestedStageKeys = uniqueStageKeys(stageKeys);
    const databaseStageKeys = requestedStageKeys
      .map((stageKey) => DATABASE_STAGE_KEY_BY_RERUN_STAGE_KEY[stageKey])
      .filter((stageKey): stageKey is string => stageKey !== null);

    if (databaseStageKeys.length === 0 || !hasAnalysisStageRunFindManyDelegate(prismaClient)) {
      return [];
    }

    const rows = await prismaClient.analysisStageRun.findMany({
      where: {
        runId,
        status  : AnalysisStageRunStatus.SUCCEEDED,
        stageKey: {
          in: databaseStageKeys
        }
      },
      orderBy: [
        { stageKey: "asc" },
        { createdAt: "desc" },
        { attempt: "desc" }
      ],
      select: {
        stageKey           : true,
        inputHash          : true,
        outputHash         : true,
        chapterStartNo     : true,
        chapterEndNo       : true,
        skippedCount       : true,
        promptTokens       : true,
        completionTokens   : true,
        totalTokens        : true,
        estimatedCostMicros: true,
        attempt            : true,
        startedAt          : true,
        finishedAt         : true,
        createdAt          : true
      }
    });

    const controlStageKeyByDatabaseStageKey = new Map<string, EvidenceReviewRerunStageKey>(
      requestedStageKeys.flatMap((stageKey) => {
        const databaseStageKey = DATABASE_STAGE_KEY_BY_RERUN_STAGE_KEY[stageKey];
        return databaseStageKey === null ? [] : [[databaseStageKey, stageKey] as const];
      })
    );
    const latestRowByStageKey = new Map<EvidenceReviewRerunStageKey, AnalysisStageRunFindManyRow>();

    for (const row of rows) {
      const controlStageKey = controlStageKeyByDatabaseStageKey.get(row.stageKey);
      if (!controlStageKey || latestRowByStageKey.has(controlStageKey)) {
        continue;
      }

      latestRowByStageKey.set(controlStageKey, row);
    }

    return requestedStageKeys.flatMap((stageKey) => {
      const row = latestRowByStageKey.get(stageKey);
      const databaseStageKey = DATABASE_STAGE_KEY_BY_RERUN_STAGE_KEY[stageKey];

      if (!row || databaseStageKey === null) {
        return [];
      }

      return [{
        stageKey,
        databaseStageKey,
        inputHash          : row.inputHash,
        outputHash         : row.outputHash,
        chapterStartNo     : row.chapterStartNo,
        chapterEndNo       : row.chapterEndNo,
        skippedCount       : row.skippedCount,
        promptTokens       : row.promptTokens,
        completionTokens   : row.completionTokens,
        totalTokens        : row.totalTokens,
        estimatedCostMicros: row.estimatedCostMicros,
        attempt            : row.attempt,
        startedAt          : row.startedAt,
        finishedAt         : row.finishedAt,
        createdAt          : row.createdAt
      }];
    });
  }

  return {
    listChapterMetadata,
    findLatestSuccessfulRun,
    listLatestSuccessfulStageRuns
  };
}

export type EvidenceReviewRerunRepository = ReturnType<typeof createEvidenceReviewRerunRepository>;
export const evidenceReviewRerunRepository = createEvidenceReviewRerunRepository();
