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

function hasAnalysisRunCreateDelegate(
  client: PrismaClient
): client is PrismaClient & { analysisRun: Pick<AnalysisRunDelegate, "create"> } {
  return typeof client.analysisRun?.create === "function";
}

function hasAnalysisRunUpdateDelegate(
  client: PrismaClient
): client is PrismaClient & { analysisRun: Pick<AnalysisRunDelegate, "update"> } {
  return typeof client.analysisRun?.update === "function";
}

function hasRawOutputDelegate(client: PrismaClient): client is PrismaClient & { llmRawOutput: RawOutputDelegate } {
  return typeof client.llmRawOutput?.aggregate === "function";
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.slice(0, 1000);
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

export function createAnalysisRunService(prismaClient: PrismaClient = prisma) {
  async function createJobRun(input: CreateJobRunInput): Promise<CreatedAnalysisRun> {
    if (!hasAnalysisRunCreateDelegate(prismaClient)) {
      return { id: null };
    }

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

    const errorMessage = toErrorMessage(error);

    await prismaClient.analysisRun.update({
      where: { id: runId },
      data : {
        status         : AnalysisJobStatus.FAILED,
        currentStageKey: null,
        finishedAt     : new Date(),
        errorMessage
      }
    });
  }

  async function cancelRun(runId: string | null): Promise<void> {
    if (runId === null || !hasAnalysisRunUpdateDelegate(prismaClient)) {
      return;
    }

    await prismaClient.analysisRun.update({
      where: { id: runId },
      data : {
        status         : AnalysisJobStatus.CANCELED,
        currentStageKey: null,
        errorMessage   : null,
        finishedAt     : new Date()
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
