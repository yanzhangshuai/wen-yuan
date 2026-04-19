import { Prisma } from "@/generated/prisma/client";
import { AnalysisStageRunStatus } from "@/generated/prisma/enums";
import { prisma } from "@/server/db/prisma";

export type StageRunErrorClass =
  | "RETRYABLE_PROVIDER"
  | "PROVIDER_EXHAUSTED"
  | "PARSE_ERROR"
  | "SCHEMA_VALIDATION"
  | "CANCELED"
  | "UNKNOWN";

export interface StartStageRunInput {
  runId          : string | null;
  bookId         : string;
  chapterId?     : string | null;
  stageKey       : string;
  attempt?       : number;
  inputHash?     : string | null;
  inputCount?    : number;
  chapterStartNo?: number | null;
  chapterEndNo?  : number | null;
}

export interface SucceedStageRunInput {
  outputHash?         : string | null;
  outputCount?        : number;
  skippedCount?       : number;
  promptTokens?       : number | null;
  completionTokens?   : number | null;
  estimatedCostMicros?: bigint | null;
}

export interface RecordRawOutputInput {
  runId               : string | null;
  stageRunId?         : string | null;
  bookId              : string;
  chapterId?          : string | null;
  provider            : string;
  model               : string;
  requestPayload      : Prisma.InputJsonValue;
  responseText        : string;
  responseJson?       : Prisma.InputJsonValue | null;
  parseError?         : string | null;
  schemaError?        : string | null;
  discardReason?      : string | null;
  promptTokens?       : number | null;
  completionTokens?   : number | null;
  durationMs?         : number | null;
  estimatedCostMicros?: bigint | null;
}

export interface FailedStageRunInput {
  failureCount?: number;
  errorClass?  : StageRunErrorClass;
}

type StageRunCreateArgs = {
  data: {
    runId         : string;
    bookId        : string;
    chapterId     : string | null;
    stageKey      : string;
    status        : AnalysisStageRunStatus;
    attempt       : number;
    inputHash     : string | null;
    inputCount    : number;
    chapterStartNo: number | null;
    chapterEndNo  : number | null;
    startedAt     : Date;
    finishedAt    : null;
  };
  select: { id: true };
};

type StageRunUpdateArgs = {
  where: { id: string };
  data : Record<string, unknown>;
};

type RawOutputCreateArgs = {
  data: {
    runId              : string;
    stageRunId         : string | null;
    bookId             : string;
    chapterId          : string | null;
    provider           : string;
    model              : string;
    requestPayload     : Prisma.InputJsonValue;
    responseText       : string;
    responseJson       : Prisma.InputJsonValue | null;
    parseError         : string | null;
    schemaError        : string | null;
    discardReason      : string | null;
    promptTokens       : number | null;
    completionTokens   : number | null;
    totalTokens        : number | null;
    estimatedCostMicros: bigint | null;
    durationMs         : number | null;
  };
  select: { id: true };
};

interface StageRunCreateDelegate {
  create(args: StageRunCreateArgs): Promise<{ id: string }>;
}

interface StageRunUpdateDelegate {
  update(args: StageRunUpdateArgs): Promise<unknown>;
}

interface RawOutputCreateDelegate {
  create(args: RawOutputCreateArgs): Promise<{ id: string }>;
}

type AnalysisStageRunServiceClient = {
  analysisStageRun?: Partial<StageRunCreateDelegate & StageRunUpdateDelegate>;
  llmRawOutput?    : Partial<RawOutputCreateDelegate>;
};

const defaultAnalysisStageRunServiceClient: AnalysisStageRunServiceClient = {
  analysisStageRun: {
    create: async (args) => prisma.analysisStageRun.create(args),
    update: async (args) => prisma.analysisStageRun.update(args)
  },
  llmRawOutput: {
    create: async (args) => prisma.llmRawOutput.create({
      ...args,
      data: {
        ...args.data,
        responseJson: args.data.responseJson ?? Prisma.DbNull
      }
    })
  }
};

function hasStageRunCreateDelegate(
  client: AnalysisStageRunServiceClient
): client is AnalysisStageRunServiceClient & { analysisStageRun: StageRunCreateDelegate } {
  return typeof client.analysisStageRun?.create === "function";
}

function hasStageRunUpdateDelegate(
  client: AnalysisStageRunServiceClient
): client is AnalysisStageRunServiceClient & { analysisStageRun: StageRunUpdateDelegate } {
  return typeof client.analysisStageRun?.update === "function";
}

function hasRawOutputCreateDelegate(
  client: AnalysisStageRunServiceClient
): client is AnalysisStageRunServiceClient & { llmRawOutput: RawOutputCreateDelegate } {
  return typeof client.llmRawOutput?.create === "function";
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

function toErrorSearchText(error: unknown): string {
  return toErrorMessage(error).toLowerCase();
}

function toTotalTokens(promptTokens?: number | null, completionTokens?: number | null): number {
  return (promptTokens ?? 0) + (completionTokens ?? 0);
}

function toNullableTotalTokens(promptTokens?: number | null, completionTokens?: number | null): number | null {
  if (promptTokens == null && completionTokens == null) {
    return null;
  }

  return toTotalTokens(promptTokens, completionTokens);
}

export function classifyStageRunError(error: unknown): StageRunErrorClass {
  const message = toErrorSearchText(error);

  if (message.includes("canceled") || message.includes("cancelled")) {
    return "CANCELED";
  }
  if (message.includes("schema") || message.includes("validation")) {
    return "SCHEMA_VALIDATION";
  }
  if (message.includes("json") || message.includes("parse")) {
    return "PARSE_ERROR";
  }
  if (message.includes("exhausted") || message.includes("fallback")) {
    return "PROVIDER_EXHAUSTED";
  }
  if (
    message.includes("429")
    || message.includes("rate limit")
    || message.includes("timeout")
    || message.includes("temporarily unavailable")
    || message.includes("econnreset")
    || message.includes("network")
    || message.includes("fetch failed")
    || message.includes("socket")
  ) {
    return "RETRYABLE_PROVIDER";
  }

  return "UNKNOWN";
}

export function createAnalysisStageRunService(
  prismaClient: AnalysisStageRunServiceClient = defaultAnalysisStageRunServiceClient
) {
  async function startStageRun(input: StartStageRunInput): Promise<{ id: string | null }> {
    if (input.runId === null || !hasStageRunCreateDelegate(prismaClient)) {
      return { id: null };
    }

    const created = await prismaClient.analysisStageRun.create({
      data: {
        runId         : input.runId,
        bookId        : input.bookId,
        chapterId     : input.chapterId ?? null,
        stageKey      : input.stageKey,
        status        : AnalysisStageRunStatus.RUNNING,
        attempt       : input.attempt ?? 1,
        inputHash     : input.inputHash ?? null,
        inputCount    : input.inputCount ?? 0,
        chapterStartNo: input.chapterStartNo ?? null,
        chapterEndNo  : input.chapterEndNo ?? null,
        startedAt     : new Date(),
        finishedAt    : null
      },
      select: { id: true }
    });

    return { id: created.id };
  }

  async function succeedStageRun(stageRunId: string | null, input: SucceedStageRunInput = {}): Promise<void> {
    if (stageRunId === null || !hasStageRunUpdateDelegate(prismaClient)) {
      return;
    }

    const promptTokens = input.promptTokens ?? 0;
    const completionTokens = input.completionTokens ?? 0;

    await prismaClient.analysisStageRun.update({
      where: { id: stageRunId },
      data : {
        status             : AnalysisStageRunStatus.SUCCEEDED,
        outputHash         : input.outputHash ?? null,
        outputCount        : input.outputCount ?? 0,
        skippedCount       : input.skippedCount ?? 0,
        failureCount       : 0,
        errorClass         : null,
        errorMessage       : null,
        promptTokens,
        completionTokens,
        totalTokens        : toTotalTokens(promptTokens, completionTokens),
        estimatedCostMicros: input.estimatedCostMicros ?? BigInt(0),
        finishedAt         : new Date()
      }
    });
  }

  async function failStageRun(
    stageRunId: string | null,
    error: unknown,
    input: FailedStageRunInput = {}
  ): Promise<void> {
    if (stageRunId === null || !hasStageRunUpdateDelegate(prismaClient)) {
      return;
    }

    await prismaClient.analysisStageRun.update({
      where: { id: stageRunId },
      data : {
        status      : AnalysisStageRunStatus.FAILED,
        failureCount: input.failureCount ?? 1,
        errorClass  : input.errorClass ?? classifyStageRunError(error),
        errorMessage: toErrorMessage(error),
        finishedAt  : new Date()
      }
    });
  }

  async function skipStageRun(stageRunId: string | null, skippedCount = 1): Promise<void> {
    if (stageRunId === null || !hasStageRunUpdateDelegate(prismaClient)) {
      return;
    }

    await prismaClient.analysisStageRun.update({
      where: { id: stageRunId },
      data : {
        status    : AnalysisStageRunStatus.SKIPPED,
        skippedCount,
        finishedAt: new Date()
      }
    });
  }

  async function recordRawOutput(input: RecordRawOutputInput): Promise<{ id: string | null }> {
    if (input.runId === null || !hasRawOutputCreateDelegate(prismaClient)) {
      return { id: null };
    }

    const created = await prismaClient.llmRawOutput.create({
      data: {
        runId              : input.runId,
        stageRunId         : input.stageRunId ?? null,
        bookId             : input.bookId,
        chapterId          : input.chapterId ?? null,
        provider           : input.provider,
        model              : input.model,
        requestPayload     : input.requestPayload,
        responseText       : input.responseText,
        responseJson       : input.responseJson ?? null,
        parseError         : input.parseError ?? null,
        schemaError        : input.schemaError ?? null,
        discardReason      : input.discardReason ?? null,
        promptTokens       : input.promptTokens ?? null,
        completionTokens   : input.completionTokens ?? null,
        totalTokens        : toNullableTotalTokens(input.promptTokens, input.completionTokens),
        estimatedCostMicros: input.estimatedCostMicros ?? null,
        durationMs         : input.durationMs ?? null
      },
      select: { id: true }
    });

    return { id: created.id };
  }

  return {
    startStageRun,
    succeedStageRun,
    failStageRun,
    skipStageRun,
    recordRawOutput
  };
}

export type AnalysisStageRunService = ReturnType<typeof createAnalysisStageRunService>;

export const analysisStageRunService = createAnalysisStageRunService();
