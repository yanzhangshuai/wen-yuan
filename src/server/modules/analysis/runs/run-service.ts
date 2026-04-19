import type { PrismaClient } from "@/generated/prisma/client";
import { AnalysisJobStatus } from "@/generated/prisma/enums";
import { prisma } from "@/server/db/prisma";

export type AnalysisRunTrigger =
  | "ANALYSIS_JOB"
  | "RETRY_RUN"
  | "RETRY_STAGE"
  | "RETRY_CHAPTER"
  | "PROJECTION_REBUILD";

export interface CreateJobRunInput {
  jobId             : string;
  bookId            : string;
  scope             : string;
  trigger           : AnalysisRunTrigger;
  requestedByUserId?: string | null;
}

export interface CreatedAnalysisRun {
  id: string | null;
}

export interface AnalysisRunSummary {
  promptTokens       : number;
  completionTokens   : number;
  totalTokens        : number;
  estimatedCostMicros: bigint;
}

type AnalysisRunDelegate = NonNullable<PrismaClient["analysisRun"]>;
type RawOutputDelegate = NonNullable<PrismaClient["llmRawOutput"]>;
type AnalysisRunCreateDelegate = Pick<AnalysisRunDelegate, "create">;
type AnalysisRunFindFirstDelegate = Pick<AnalysisRunDelegate, "findFirst">;
type AnalysisRunUpdateDelegate = Pick<AnalysisRunDelegate, "update">;
type AnalysisRunServiceClient = {
  analysisRun? : Partial<AnalysisRunCreateDelegate & AnalysisRunFindFirstDelegate & AnalysisRunUpdateDelegate>;
  llmRawOutput?: Partial<Pick<RawOutputDelegate, "aggregate">>;
};

function hasAnalysisRunCreateDelegate(
  client: AnalysisRunServiceClient
): client is AnalysisRunServiceClient & { analysisRun: AnalysisRunCreateDelegate } {
  return typeof client.analysisRun?.create === "function";
}

function hasAnalysisRunFindFirstDelegate(
  client: AnalysisRunServiceClient
): client is AnalysisRunServiceClient & { analysisRun: AnalysisRunFindFirstDelegate } {
  return typeof client.analysisRun?.findFirst === "function";
}

function hasAnalysisRunUpdateDelegate(
  client: AnalysisRunServiceClient
): client is AnalysisRunServiceClient & { analysisRun: AnalysisRunUpdateDelegate } {
  return typeof client.analysisRun?.update === "function";
}

function hasRawOutputDelegate(
  client: AnalysisRunServiceClient
): client is AnalysisRunServiceClient & { llmRawOutput: Pick<RawOutputDelegate, "aggregate"> } {
  return typeof client.llmRawOutput?.aggregate === "function";
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.slice(0, 1000);
  }
  if (typeof error === "string") {
    return error.slice(0, 1000);
  }

  try {
    const serialized = JSON.stringify(error);
    if (typeof serialized === "string") {
      return serialized.slice(0, 1000);
    }
  } catch {
    // no-op: fallback to String(error)
  }

  return String(error).slice(0, 1000);
}

function normalizeSum(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalizeBigIntSum(value: bigint | number | null | undefined): bigint {
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }
  return BigInt(0);
}

function isUniqueConflict(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const candidate = error as { code?: unknown; message?: unknown };
  if (candidate.code === "P2002") {
    return true;
  }

  return typeof candidate.message === "string"
    && candidate.message.includes("analysis_runs_active_job_identity_uidx");
}

export function createAnalysisRunService(prismaClient: AnalysisRunServiceClient = prisma) {
  async function findExistingRunningJobRun(input: CreateJobRunInput): Promise<CreatedAnalysisRun | null> {
    if (!hasAnalysisRunFindFirstDelegate(prismaClient)) {
      return null;
    }

    const existing = await prismaClient.analysisRun.findFirst({
        where: {
          jobId  : input.jobId,
          bookId : input.bookId,
          trigger: input.trigger,
          scope  : input.scope,
          status : AnalysisJobStatus.RUNNING
        },
        orderBy: { createdAt: "desc" },
        select : { id: true }
      });

    return existing === null ? null : { id: existing.id };
  }

  async function createJobRun(input: CreateJobRunInput): Promise<CreatedAnalysisRun> {
    if (!hasAnalysisRunCreateDelegate(prismaClient)) {
      return { id: null };
    }

    const existing = await findExistingRunningJobRun(input);
    if (existing !== null) {
      return existing;
    }

    try {
      const created = await prismaClient.analysisRun.create({
        data: {
          jobId            : input.jobId,
          bookId           : input.bookId,
          trigger          : input.trigger,
          scope            : input.scope,
          requestedByUserId: input.requestedByUserId ?? null,
          status           : AnalysisJobStatus.RUNNING,
          startedAt        : new Date(),
          finishedAt       : null,
          currentStageKey  : null,
          errorMessage     : null
        },
        select: { id: true }
      });

      return { id: created.id };
    } catch (error) {
      if (isUniqueConflict(error)) {
        const conflicting = await findExistingRunningJobRun(input);
        if (conflicting !== null) {
          return conflicting;
        }
      }

      throw error;
    }
  }

  async function markCurrentStage(runId: string | null, stageKey: string | null): Promise<void> {
    if (runId === null || !hasAnalysisRunUpdateDelegate(prismaClient)) {
      return;
    }

    await prismaClient.analysisRun.update({
      where: { id: runId },
      data : { currentStageKey: stageKey }
    });
  }

  async function summarizeRun(runId: string | null): Promise<AnalysisRunSummary> {
    if (runId === null || !hasRawOutputDelegate(prismaClient)) {
      return {
        promptTokens       : 0,
        completionTokens   : 0,
        totalTokens        : 0,
        estimatedCostMicros: BigInt(0)
      };
    }

    const aggregated = await prismaClient.llmRawOutput.aggregate({
      where: { runId },
      _sum : {
        promptTokens       : true,
        completionTokens   : true,
        totalTokens        : true,
        estimatedCostMicros: true
      }
    });

    return {
      promptTokens       : normalizeSum(aggregated._sum.promptTokens),
      completionTokens   : normalizeSum(aggregated._sum.completionTokens),
      totalTokens        : normalizeSum(aggregated._sum.totalTokens),
      estimatedCostMicros: normalizeBigIntSum(aggregated._sum.estimatedCostMicros)
    };
  }

  async function succeedRun(runId: string | null): Promise<void> {
    if (runId === null || !hasAnalysisRunUpdateDelegate(prismaClient)) {
      return;
    }

    const summary = await summarizeRun(runId);

    await prismaClient.analysisRun.update({
      where: { id: runId },
      data : {
        status             : AnalysisJobStatus.SUCCEEDED,
        currentStageKey    : null,
        errorMessage       : null,
        finishedAt         : new Date(),
        promptTokens       : summary.promptTokens,
        completionTokens   : summary.completionTokens,
        totalTokens        : summary.totalTokens,
        estimatedCostMicros: summary.estimatedCostMicros
      }
    });
  }

  async function failRun(runId: string | null, error: unknown): Promise<void> {
    if (runId === null || !hasAnalysisRunUpdateDelegate(prismaClient)) {
      return;
    }

    const summary = await summarizeRun(runId);
    const errorMessage = toErrorMessage(error);

    await prismaClient.analysisRun.update({
      where: { id: runId },
      data : {
        status             : AnalysisJobStatus.FAILED,
        currentStageKey    : null,
        finishedAt         : new Date(),
        errorMessage,
        promptTokens       : summary.promptTokens,
        completionTokens   : summary.completionTokens,
        totalTokens        : summary.totalTokens,
        estimatedCostMicros: summary.estimatedCostMicros
      }
    });
  }

  async function cancelRun(runId: string | null): Promise<void> {
    if (runId === null || !hasAnalysisRunUpdateDelegate(prismaClient)) {
      return;
    }

    const summary = await summarizeRun(runId);

    await prismaClient.analysisRun.update({
      where: { id: runId },
      data : {
        status             : AnalysisJobStatus.CANCELED,
        currentStageKey    : null,
        errorMessage       : null,
        finishedAt         : new Date(),
        promptTokens       : summary.promptTokens,
        completionTokens   : summary.completionTokens,
        totalTokens        : summary.totalTokens,
        estimatedCostMicros: summary.estimatedCostMicros
      }
    });
  }

  return {
    createJobRun,
    markCurrentStage,
    summarizeRun,
    succeedRun,
    failRun,
    cancelRun
  };
}

export type AnalysisRunService = ReturnType<typeof createAnalysisRunService>;

export const analysisRunService = createAnalysisRunService();
