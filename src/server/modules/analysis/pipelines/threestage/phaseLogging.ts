import type { PrismaClient } from "@/generated/prisma/client";
import type {
  AnalysisPipelineStageSummary,
  AnalysisPipelineWarning
} from "@/server/modules/analysis/pipelines/types";

interface WriteStagePhaseLogInput {
  prisma     : PrismaClient;
  jobId      : string;
  stage      : string;
  status     : "SUCCESS" | "WARNING";
  durationMs?: number | null;
  summary    : Record<string, number | string | boolean | null>;
  warnings?  : AnalysisPipelineWarning[];
}

function truncateLogPayload(value: string): string {
  return value.length <= 1000 ? value : value.slice(0, 1000);
}

export function buildStageSummaryLogMessage(
  summary: AnalysisPipelineStageSummary,
  warnings: readonly AnalysisPipelineWarning[] = []
): string {
  return truncateLogPayload(JSON.stringify({
    metrics : summary.metrics,
    warnings: warnings.map((warning) => ({
      code   : warning.code,
      message: warning.message
    }))
  }));
}

export async function writeStagePhaseLog(input: WriteStagePhaseLogInput): Promise<void> {
  if (typeof input.prisma.analysisPhaseLog?.create !== "function") {
    return;
  }

  const summary: AnalysisPipelineStageSummary = {
    stage  : input.stage,
    status : input.status,
    metrics: input.summary
  };

  await input.prisma.analysisPhaseLog.create({
    data: {
      jobId           : input.jobId,
      chapterId       : null,
      stage           : input.stage,
      modelId         : null,
      modelSource     : "SYSTEM",
      isFallback      : false,
      promptTokens    : null,
      completionTokens: null,
      durationMs      : input.durationMs ?? null,
      status          : input.status,
      errorMessage    : buildStageSummaryLogMessage(summary, input.warnings ?? []),
      chunkIndex      : null
    }
  });
}
