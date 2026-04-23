import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { EVIDENCE_REVIEW_RERUN_STAGE_KEY_VALUES } from "@/server/modules/analysis/pipelines/evidence-review/rerun-planner";

import type {
  ReviewRunCostStageDto,
  ReviewRunCostSummaryDto,
  ReviewRunCostTotalsDto
} from "@/server/modules/review/evidence-review/costs/types";

type AnalysisRunFindUniqueArgs = {
  where : { id: string };
  select: {
    id                 : true;
    bookId             : true;
    trigger            : true;
    scope              : true;
    startedAt          : true;
    finishedAt         : true;
    promptTokens       : true;
    completionTokens   : true;
    totalTokens        : true;
    estimatedCostMicros: true;
  };
};

type AnalysisStageRunFindManyArgs = {
  where  : { runId: string };
  orderBy: [{ createdAt: "asc" }, { stageKey: "asc" }];
  select: {
    stageKey           : true;
    status             : true;
    chapterStartNo     : true;
    chapterEndNo       : true;
    promptTokens       : true;
    completionTokens   : true;
    totalTokens        : true;
    estimatedCostMicros: true;
    skippedCount       : true;
    startedAt          : true;
    finishedAt         : true;
    createdAt          : true;
  };
};

type AnalysisRunRow = {
  id                 : string;
  bookId             : string;
  trigger            : string;
  scope              : string;
  startedAt          : Date | null;
  finishedAt         : Date | null;
  promptTokens       : number | null;
  completionTokens   : number | null;
  totalTokens        : number | null;
  estimatedCostMicros: bigint | null;
};

type AnalysisStageRunRow = {
  stageKey           : string;
  status             : string;
  chapterStartNo     : number | null;
  chapterEndNo       : number | null;
  promptTokens       : number | null;
  completionTokens   : number | null;
  totalTokens        : number | null;
  estimatedCostMicros: bigint | null;
  skippedCount       : number | null;
  startedAt          : Date | null;
  finishedAt         : Date | null;
  createdAt          : Date;
};

interface AnalysisRunFindUniqueDelegate {
  findUnique(args: AnalysisRunFindUniqueArgs): Promise<AnalysisRunRow | null>;
}

interface AnalysisStageRunFindManyDelegate {
  findMany(args: AnalysisStageRunFindManyArgs): Promise<AnalysisStageRunRow[]>;
}

type ReviewRunCostSummaryServiceClient = {
  analysisRun?     : Partial<AnalysisRunFindUniqueDelegate>;
  analysisStageRun?: Partial<AnalysisStageRunFindManyDelegate>;
};

const DATABASE_STAGE_KEY_BY_CANONICAL_STAGE_KEY = {
  STAGE_0     : "STAGE_0",
  STAGE_A     : "stage_a_extraction",
  STAGE_A_PLUS: "stage_a_plus_knowledge_recall",
  STAGE_B     : "stage_b_identity_resolution",
  STAGE_B5    : "stage_b5_conflict_detection",
  STAGE_C     : "stage_c_fact_attribution",
  STAGE_D     : "STAGE_D"
} as const satisfies Record<(typeof EVIDENCE_REVIEW_RERUN_STAGE_KEY_VALUES)[number], string>;

const CANONICAL_STAGE_KEY_BY_DATABASE_STAGE_KEY = Object.fromEntries(
  Object.entries(DATABASE_STAGE_KEY_BY_CANONICAL_STAGE_KEY).map(([canonicalKey, databaseKey]) => [
    databaseKey,
    canonicalKey
  ])
) as Record<string, (typeof EVIDENCE_REVIEW_RERUN_STAGE_KEY_VALUES)[number]>;

function hasAnalysisRunDelegate(
  client: ReviewRunCostSummaryServiceClient
): client is ReviewRunCostSummaryServiceClient & { analysisRun: AnalysisRunFindUniqueDelegate } {
  return typeof client.analysisRun?.findUnique === "function";
}

function hasAnalysisStageRunDelegate(
  client: ReviewRunCostSummaryServiceClient
): client is ReviewRunCostSummaryServiceClient & { analysisStageRun: AnalysisStageRunFindManyDelegate } {
  return typeof client.analysisStageRun?.findMany === "function";
}

function toNumber(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function toBigInt(value: bigint | null | undefined): bigint {
  return typeof value === "bigint" ? value : BigInt(0);
}

function toDurationMs(startedAt: Date | null, finishedAt: Date | null): number {
  if (startedAt === null || finishedAt === null) {
    return 0;
  }

  return Math.max(0, finishedAt.getTime() - startedAt.getTime());
}

function normalizeStageKey(stageKey: string): string {
  return CANONICAL_STAGE_KEY_BY_DATABASE_STAGE_KEY[stageKey] ?? stageKey;
}

function toStageDto(row: AnalysisStageRunRow): ReviewRunCostStageDto {
  const promptTokens = toNumber(row.promptTokens);
  const completionTokens = toNumber(row.completionTokens);
  const totalTokens = Math.max(toNumber(row.totalTokens), promptTokens + completionTokens);

  return {
    stageKey           : normalizeStageKey(row.stageKey),
    status             : row.status,
    chapterStartNo     : row.chapterStartNo,
    chapterEndNo       : row.chapterEndNo,
    promptTokens,
    completionTokens,
    totalTokens,
    estimatedCostMicros: toBigInt(row.estimatedCostMicros),
    durationMs         : toDurationMs(row.startedAt, row.finishedAt),
    skippedCount       : toNumber(row.skippedCount)
  };
}

function sumStageTotals(stages: ReviewRunCostStageDto[]): ReviewRunCostTotalsDto {
  return stages.reduce<ReviewRunCostTotalsDto>((totals, stage) => ({
    promptTokens       : totals.promptTokens + stage.promptTokens,
    completionTokens   : totals.completionTokens + stage.completionTokens,
    totalTokens        : totals.totalTokens + stage.totalTokens,
    estimatedCostMicros: totals.estimatedCostMicros + stage.estimatedCostMicros,
    durationMs         : totals.durationMs + stage.durationMs,
    skippedCount       : totals.skippedCount + stage.skippedCount
  }), {
    promptTokens       : 0,
    completionTokens   : 0,
    totalTokens        : 0,
    estimatedCostMicros: BigInt(0),
    durationMs         : 0,
    skippedCount       : 0
  });
}

function hasRunUsage(totals: Pick<ReviewRunCostTotalsDto, "promptTokens" | "completionTokens" | "totalTokens" | "estimatedCostMicros">): boolean {
  return totals.promptTokens > 0
    || totals.completionTokens > 0
    || totals.totalTokens > 0
    || totals.estimatedCostMicros > BigInt(0);
}

function deriveRerunReason(
  trigger: string,
  scope: string,
  stages: ReviewRunCostStageDto[]
): string | null {
  const canonicalCoverage = new Set(
    stages
      .map((stage) => stage.stageKey)
      .filter((stageKey): stageKey is (typeof EVIDENCE_REVIEW_RERUN_STAGE_KEY_VALUES)[number] =>
        EVIDENCE_REVIEW_RERUN_STAGE_KEY_VALUES.includes(
          stageKey as (typeof EVIDENCE_REVIEW_RERUN_STAGE_KEY_VALUES)[number]
        )
      )
  );

  const hasLocalExtraction = canonicalCoverage.has("STAGE_0")
    || canonicalCoverage.has("STAGE_A")
    || canonicalCoverage.has("STAGE_A_PLUS");
  const hasResolution = canonicalCoverage.has("STAGE_B")
    || canonicalCoverage.has("STAGE_B5")
    || canonicalCoverage.has("STAGE_C");

  if (
    trigger === "PROJECTION_REBUILD"
    && (scope === "PROJECTION_ONLY" || canonicalCoverage.size === 0 || !hasLocalExtraction)
    && !hasResolution
  ) {
    return "Projection-only rebuild";
  }

  if (trigger === "RETRY_CHAPTER" && hasLocalExtraction && hasResolution) {
    return "Chapter-local extraction + full-book resolution";
  }

  return null;
}

/**
 * 用于在 review admin 成本接口中明确区分“run 不存在”和“统计失败”。
 */
export class ReviewRunCostSummaryNotFoundError extends Error {
  constructor(readonly runId: string) {
    super(`Review run not found: ${runId}`);
    this.name = "ReviewRunCostSummaryNotFoundError";
  }
}

/**
 * 汇总单个 evidence-review run 的成本、耗时与阶段覆盖，供 admin rerun/cost 控制面复用。
 */
export function createReviewRunCostSummaryService(
  prismaClient: ReviewRunCostSummaryServiceClient | PrismaClient = prisma
) {
  async function getSummary(runId: string): Promise<ReviewRunCostSummaryDto> {
    if (!hasAnalysisRunDelegate(prismaClient)) {
      throw new ReviewRunCostSummaryNotFoundError(runId);
    }

    const run = await prismaClient.analysisRun.findUnique({
      where : { id: runId },
      select: {
        id                 : true,
        bookId             : true,
        trigger            : true,
        scope              : true,
        startedAt          : true,
        finishedAt         : true,
        promptTokens       : true,
        completionTokens   : true,
        totalTokens        : true,
        estimatedCostMicros: true
      }
    });

    if (run === null) {
      throw new ReviewRunCostSummaryNotFoundError(runId);
    }

    const stageRows = hasAnalysisStageRunDelegate(prismaClient)
      ? await prismaClient.analysisStageRun.findMany({
        where  : { runId },
        orderBy: [{ createdAt: "asc" }, { stageKey: "asc" }],
        select : {
          stageKey           : true,
          status             : true,
          chapterStartNo     : true,
          chapterEndNo       : true,
          promptTokens       : true,
          completionTokens   : true,
          totalTokens        : true,
          estimatedCostMicros: true,
          skippedCount       : true,
          startedAt          : true,
          finishedAt         : true,
          createdAt          : true
        }
      })
      : [];

    const stages = stageRows.map(toStageDto);
    const stageTotals = sumStageTotals(stages);
    const runPromptTokens = toNumber(run.promptTokens);
    const runCompletionTokens = toNumber(run.completionTokens);
    const runTotals = {
      promptTokens       : runPromptTokens,
      completionTokens   : runCompletionTokens,
      totalTokens        : Math.max(toNumber(run.totalTokens), runPromptTokens + runCompletionTokens),
      estimatedCostMicros: toBigInt(run.estimatedCostMicros)
    };
    const totals = hasRunUsage(runTotals)
      ? {
        ...runTotals,
        durationMs  : toDurationMs(run.startedAt, run.finishedAt) || stageTotals.durationMs,
        skippedCount: stageTotals.skippedCount
      }
      : {
        ...stageTotals,
        durationMs: toDurationMs(run.startedAt, run.finishedAt) || stageTotals.durationMs
      };

    return {
      runId      : run.id,
      bookId     : run.bookId,
      trigger    : run.trigger,
      scope      : run.scope,
      rerunReason: deriveRerunReason(run.trigger, run.scope, stages),
      totals,
      stages
    };
  }

  return { getSummary };
}

export const reviewRunCostSummaryService = createReviewRunCostSummaryService();
