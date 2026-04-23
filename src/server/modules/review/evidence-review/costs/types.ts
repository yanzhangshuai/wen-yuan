export interface ReviewRunCostTotalsDto {
  promptTokens       : number;
  completionTokens   : number;
  totalTokens        : number;
  estimatedCostMicros: bigint;
  durationMs         : number;
  skippedCount       : number;
}

export interface ReviewRunCostStageDto {
  stageKey           : string;
  status             : string;
  chapterStartNo     : number | null;
  chapterEndNo       : number | null;
  promptTokens       : number;
  completionTokens   : number;
  totalTokens        : number;
  estimatedCostMicros: bigint;
  durationMs         : number;
  skippedCount       : number;
}

export interface ReviewRunCostSummaryDto {
  runId      : string;
  bookId     : string;
  trigger    : string;
  scope      : string;
  rerunReason: string | null;
  totals     : ReviewRunCostTotalsDto;
  stages     : ReviewRunCostStageDto[];
}

export interface ReviewRunCostComparisonDto {
  baseline : ReviewRunCostSummaryDto;
  candidate: ReviewRunCostSummaryDto;
  delta    : ReviewRunCostTotalsDto;
  savings       : {
    totalTokenSavingsPct: number | null;
    costSavingsPct      : number | null;
    durationSavingsPct  : number | null;
  };
  stageCoverage : {
    baselineStageKeys : string[];
    candidateStageKeys: string[];
    skippedStageKeys  : string[];
  };
}
