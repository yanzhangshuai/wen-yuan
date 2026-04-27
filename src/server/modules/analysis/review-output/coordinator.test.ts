import { describe, expect, it, vi } from "vitest";

import { createReviewOutputCoordinator } from "@/server/modules/analysis/review-output/coordinator";
import type { AnalysisReviewOutputWriter } from "@/server/modules/analysis/review-output/types";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";
const RUN_ID = "22222222-2222-4222-8222-222222222222";
const JOB_ID = "33333333-3333-4333-8333-333333333333";
const CHAPTER_ID = "44444444-4444-4444-8444-444444444444";

function makeWriter(architecture: "sequential" | "threestage"): {
  writer: AnalysisReviewOutputWriter;
  write : ReturnType<typeof vi.fn>;
} {
  const write = vi.fn().mockResolvedValue({
    architecture,
    personaCandidates       : 1,
    entityMentions          : architecture === "sequential" ? 1 : 0,
    eventClaims             : 1,
    relationClaims          : 0,
    identityResolutionClaims: 1,
    timeClaims              : 1,
    validatedExistingClaims : architecture === "threestage" ? 3 : 0
  });

  return {
    writer: {
      architecture,
      write
    },
    write
  };
}

describe("createReviewOutputCoordinator", () => {
  it("runs the selected architecture writer then rebuilds FULL_BOOK projection", async () => {
    const sequentialWriter = makeWriter("sequential");
    const projection = vi.fn().mockResolvedValue({ personaChapterFacts: 1 });
    const coordinator = createReviewOutputCoordinator({
      writers          : [sequentialWriter.writer],
      rebuildProjection: projection
    });

    const result = await coordinator.writeReviewOutput({
      architecture: "sequential",
      bookId      : BOOK_ID,
      runId       : RUN_ID,
      chapterIds  : [CHAPTER_ID],
      jobId       : JOB_ID,
      scope       : "CHAPTER_RANGE"
    });

    expect(sequentialWriter.write).toHaveBeenCalledWith({
      architecture: "sequential",
      bookId      : BOOK_ID,
      runId       : RUN_ID,
      chapterIds  : [CHAPTER_ID],
      jobId       : JOB_ID,
      scope       : "CHAPTER_RANGE"
    });
    expect(projection).toHaveBeenCalledWith({ kind: "FULL_BOOK", bookId: BOOK_ID });
    expect(result.projectionResult).toEqual({
      kind  : "FULL_BOOK",
      bookId: BOOK_ID,
      result: { personaChapterFacts: 1 }
    });
  });

  it("fails before projection when no writer is registered for the architecture", async () => {
    const projection = vi.fn();
    const coordinator = createReviewOutputCoordinator({
      writers          : [],
      rebuildProjection: projection
    });

    await expect(coordinator.writeReviewOutput({
      architecture: "threestage",
      bookId      : BOOK_ID,
      runId       : RUN_ID,
      chapterIds  : [CHAPTER_ID],
      jobId       : JOB_ID,
      scope       : "FULL_BOOK"
    })).rejects.toThrow("No review output writer registered for architecture threestage");
    expect(projection).not.toHaveBeenCalled();
  });

  it("does not rebuild projection when the writer fails", async () => {
    const writer = makeWriter("threestage");
    writer.write.mockRejectedValueOnce(new Error("missing claims"));
    const projection = vi.fn();
    const coordinator = createReviewOutputCoordinator({
      writers          : [writer.writer],
      rebuildProjection: projection
    });

    await expect(coordinator.writeReviewOutput({
      architecture: "threestage",
      bookId      : BOOK_ID,
      runId       : RUN_ID,
      chapterIds  : [CHAPTER_ID],
      jobId       : JOB_ID,
      scope       : "FULL_BOOK"
    })).rejects.toThrow("missing claims");
    expect(projection).not.toHaveBeenCalled();
  });
});
