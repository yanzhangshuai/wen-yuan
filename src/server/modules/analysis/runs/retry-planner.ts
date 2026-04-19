import { AnalysisStageRunStatus } from "@/generated/prisma/enums";
import { prisma } from "@/server/db/prisma";

export type RetryKind = "NONE" | "RUN" | "STAGE" | "CHAPTER" | "PROJECTION";

export interface RetryPlanItem {
  stageKey               : string;
  chapterId              : string | null;
  chapterStartNo         : number | null;
  chapterEndNo           : number | null;
  nextAttempt            : number;
  preservePreviousOutputs: boolean;
}

export interface RetryPlan {
  retryKind: RetryKind;
  runId    : string;
  bookId?  : string;
  reason?  : string;
  items    : RetryPlanItem[];
}

interface FailedStageRunRow {
  stageKey      : string;
  chapterId     : string | null;
  attempt       : number;
  chapterStartNo: number | null;
  chapterEndNo  : number | null;
}

type FailedStageRunFindManyArgs = {
  where: {
    runId : string;
    status: AnalysisStageRunStatus;
  };
  orderBy: [
    { stageKey: "asc" },
    { chapterStartNo: "asc" },
    { createdAt: "asc" }
  ];
  select: {
    stageKey      : true;
    chapterId     : true;
    attempt       : true;
    chapterStartNo: true;
    chapterEndNo  : true;
  };
};

interface AnalysisStageRunFindManyDelegate {
  findMany(args: FailedStageRunFindManyArgs): Promise<FailedStageRunRow[]>;
}

type AnalysisRetryPlannerClient = {
  analysisStageRun?: Partial<AnalysisStageRunFindManyDelegate>;
};

interface ProjectionRebuildInput {
  runId : string;
  bookId: string;
  reason: string;
}

function hasStageRunFindManyDelegate(
  client: AnalysisRetryPlannerClient
): client is AnalysisRetryPlannerClient & { analysisStageRun: AnalysisStageRunFindManyDelegate } {
  return typeof client.analysisStageRun?.findMany === "function";
}

function classifyRetryKind(rows: FailedStageRunRow[]): RetryKind {
  if (rows.length === 0) {
    return "NONE";
  }

  const onlyChapterScopedStageA = rows.every(
    (row) => row.stageKey === "STAGE_A" && row.chapterId !== null
  );
  if (onlyChapterScopedStageA) {
    return "CHAPTER";
  }

  const onlyKnownStages = rows.every((row) => row.stageKey.startsWith("STAGE_"));
  return onlyKnownStages ? "STAGE" : "RUN";
}

function toRetryPlanItems(rows: FailedStageRunRow[]): RetryPlanItem[] {
  return rows.map((row) => ({
    stageKey               : row.stageKey,
    chapterId              : row.chapterId,
    chapterStartNo         : row.chapterStartNo,
    chapterEndNo           : row.chapterEndNo,
    nextAttempt            : row.attempt + 1,
    preservePreviousOutputs: row.stageKey !== "STAGE_A"
  }));
}

/**
 * 根据失败的 stage run 记录推导最小重试范围。
 * 这里保留最小 delegate contract，便于测试或轻量调用方只注入 `findMany`。
 */
export function createAnalysisRetryPlanner(
  prismaClient: AnalysisRetryPlannerClient = prisma
) {
  async function loadFailedStageRuns(runId: string): Promise<FailedStageRunRow[]> {
    if (!hasStageRunFindManyDelegate(prismaClient)) {
      return [];
    }

    return prismaClient.analysisStageRun.findMany({
      where: {
        runId,
        status: AnalysisStageRunStatus.FAILED
      },
      orderBy: [
        { stageKey: "asc" },
        { chapterStartNo: "asc" },
        { createdAt: "asc" }
      ],
      select: {
        stageKey      : true,
        chapterId     : true,
        attempt       : true,
        chapterStartNo: true,
        chapterEndNo  : true
      }
    });
  }

  async function planRunRetry(runId: string): Promise<RetryPlan> {
    const failedStageRuns = await loadFailedStageRuns(runId);

    return {
      retryKind: classifyRetryKind(failedStageRuns),
      runId,
      items    : toRetryPlanItems(failedStageRuns)
    };
  }

  function planProjectionRebuild(input: ProjectionRebuildInput): Promise<RetryPlan> {
    return Promise.resolve({
      retryKind: "PROJECTION",
      runId    : input.runId,
      bookId   : input.bookId,
      reason   : input.reason,
      items    : [
        {
          stageKey               : "STAGE_D",
          chapterId              : null,
          chapterStartNo         : null,
          chapterEndNo           : null,
          nextAttempt            : 1,
          preservePreviousOutputs: true
        }
      ]
    });
  }

  return {
    planRunRetry,
    planProjectionRebuild
  };
}

export type AnalysisRetryPlanner = ReturnType<typeof createAnalysisRetryPlanner>;
export const analysisRetryPlanner = createAnalysisRetryPlanner();
