import type { AnalysisArchitecture } from "@/server/modules/analysis/pipelines/types";
import type {
  AnalysisReviewOutputWriter,
  ReviewOutputCoordinatorResult,
  ReviewOutputWriteInput
} from "@/server/modules/analysis/review-output/types";

export interface ReviewOutputCoordinatorDependencies {
  writers: AnalysisReviewOutputWriter[];
  rebuildProjection(input: { kind: "FULL_BOOK"; bookId: string }): Promise<unknown>;
}

export interface ReviewOutputCoordinator {
  writeReviewOutput(input: ReviewOutputWriteInput): Promise<ReviewOutputCoordinatorResult>;
}

function buildWriterMap(writers: AnalysisReviewOutputWriter[]): Map<AnalysisArchitecture, AnalysisReviewOutputWriter> {
  return new Map(writers.map(writer => [writer.architecture, writer]));
}

export function createReviewOutputCoordinator(
  dependencies: ReviewOutputCoordinatorDependencies
): ReviewOutputCoordinator {
  const writers = buildWriterMap(dependencies.writers);

  return {
    async writeReviewOutput(input) {
      const writer = writers.get(input.architecture);
      if (!writer) {
        throw new Error(`No review output writer registered for architecture ${input.architecture}`);
      }

      const writerResult = await writer.write(input);
      const projectionRawResult = await dependencies.rebuildProjection({
        kind  : "FULL_BOOK",
        bookId: input.bookId
      });

      return {
        writerResult,
        projectionResult: {
          kind  : "FULL_BOOK",
          bookId: input.bookId,
          result: projectionRawResult
        }
      };
    }
  };
}
