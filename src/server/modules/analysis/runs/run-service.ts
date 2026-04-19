import type { PrismaClient } from "@/generated/prisma/client";
import { AnalysisJobStatus } from "@/generated/prisma/enums";
import { prisma } from "@/server/db/prisma";

export type AnalysisRunTrigger = "JOB_EXECUTION" | "MANUAL_RETRY" | "SYSTEM_REPAIR" | (string & {});

export interface CreateJobRunInput {
  jobId            : string | null;
  bookId           : string;
  scope            : string;
  trigger          : AnalysisRunTrigger;
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

export interface AnalysisRunService {
  createJobRun(input: CreateJobRunInput): Promise<CreatedAnalysisRun>;
  markCurrentStage(runId: string, stageKey: string | null): Promise<void>;
  summarizeRun(runId: string): Promise<AnalysisRunSummary>;
  succeedRun(runId: string): Promise<void>;
  failRun(runId: string, error: unknown): Promise<void>;
  cancelRun(runId: string): Promise<void>;
}

type AnalysisRunDelegate = NonNullable<PrismaClient["analysisRun"]>;
type RawOutputDelegate = NonNullable<PrismaClient["llmRawOutput"]>;

function hasAnalysisRunDelegate(client: PrismaClient): client is PrismaClient & { analysisRun: AnalysisRunDelegate } {
  return typeof client.analysisRun?.create === "function"
    && typeof client.analysisRun?.update === "function"
    && typeof client.analysisRun?.findFirst === "function";
}

function hasRawOutputDelegate(client: PrismaClient): client is PrismaClient & { llmRawOutput: RawOutputDelegate } {
  return typeof client.llmRawOutput?.aggregate === "function";
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
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

export function createAnalysisRunService(prismaClient: PrismaClient = prisma): AnalysisRunService {
  async function createJobRun(input: CreateJobRunInput): Promise<CreatedAnalysisRun> {
    if (!hasAnalysisRunDelegate(prismaClient)) {
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

  async function markCurrentStage(runId: string, stageKey: string | null): Promise<void> {
    if (!hasAnalysisRunDelegate(prismaClient)) {
      return;
    }

    await prismaClient.analysisRun.update({
      where: { id: runId },
      data : { currentStageKey: stageKey }
    });
  }

  async function summarizeRun(runId: string): Promise<AnalysisRunSummary> {
    if (!hasRawOutputDelegate(prismaClient)) {
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

  async function succeedRun(runId: string): Promise<void> {
    if (!hasAnalysisRunDelegate(prismaClient)) {
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

  async function failRun(runId: string, error: unknown): Promise<void> {
    if (!hasAnalysisRunDelegate(prismaClient)) {
      return;
    }

    const errorMessage = toErrorMessage(error).slice(0, 1000);

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

  async function cancelRun(runId: string): Promise<void> {
    if (!hasAnalysisRunDelegate(prismaClient)) {
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

export const analysisRunService = createAnalysisRunService();
