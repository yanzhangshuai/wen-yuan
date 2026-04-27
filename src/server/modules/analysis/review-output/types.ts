import type { AnalysisArchitecture } from "@/server/modules/analysis/pipelines/types";

export type ReviewOutputProjectionKind = "FULL_BOOK";

export interface ReviewOutputWriteInput {
  architecture: AnalysisArchitecture;
  bookId      : string;
  runId       : string;
  chapterIds  : string[];
  jobId       : string;
  scope       : string;
}

export interface ReviewOutputWriterResult {
  architecture            : AnalysisArchitecture;
  personaCandidates       : number;
  entityMentions          : number;
  eventClaims             : number;
  relationClaims          : number;
  identityResolutionClaims: number;
  timeClaims              : number;
  validatedExistingClaims : number;
}

export interface ReviewOutputProjectionResult {
  kind  : ReviewOutputProjectionKind;
  bookId: string;
  result: unknown;
}

export interface ReviewOutputCoordinatorResult {
  writerResult    : ReviewOutputWriterResult;
  projectionResult: ReviewOutputProjectionResult;
}

export interface AnalysisReviewOutputWriter {
  readonly architecture: AnalysisArchitecture;
  write(input: ReviewOutputWriteInput): Promise<ReviewOutputWriterResult>;
}
