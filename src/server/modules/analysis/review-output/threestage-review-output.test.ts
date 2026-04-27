import { describe, expect, it, vi } from "vitest";

import { createThreeStageReviewOutputWriter } from "@/server/modules/analysis/review-output/threestage-review-output";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";
const RUN_ID = "22222222-2222-4222-8222-222222222222";
const JOB_ID = "33333333-3333-4333-8333-333333333333";
const CHAPTER_ID = "44444444-4444-4444-8444-444444444444";

function makePrismaMock(counts: {
  personaCandidates?       : number;
  eventClaims?             : number;
  relationClaims?          : number;
  timeClaims?              : number;
  identityResolutionClaims?: number;
}) {
  return {
    personaCandidate       : { count: vi.fn().mockResolvedValue(counts.personaCandidates ?? 1) },
    eventClaim             : { count: vi.fn().mockResolvedValue(counts.eventClaims ?? 1) },
    relationClaim          : { count: vi.fn().mockResolvedValue(counts.relationClaims ?? 1) },
    timeClaim              : { count: vi.fn().mockResolvedValue(counts.timeClaims ?? 1) },
    identityResolutionClaim: { count: vi.fn().mockResolvedValue(counts.identityResolutionClaims ?? 1) }
  };
}

describe("createThreeStageReviewOutputWriter", () => {
  it("validates existing claim-first output for threestage jobs", async () => {
    const prismaMock = makePrismaMock({});
    const writer = createThreeStageReviewOutputWriter(prismaMock as never);

    const result = await writer.write({
      architecture: "threestage",
      bookId      : BOOK_ID,
      runId       : RUN_ID,
      chapterIds  : [CHAPTER_ID],
      jobId       : JOB_ID,
      scope       : "FULL_BOOK"
    });

    expect(result).toEqual({
      architecture            : "threestage",
      personaCandidates       : 1,
      entityMentions          : 0,
      eventClaims             : 1,
      relationClaims          : 1,
      identityResolutionClaims: 1,
      timeClaims              : 1,
      validatedExistingClaims : 4
    });
    expect(prismaMock.personaCandidate.count).toHaveBeenCalledWith({
      where: { bookId: BOOK_ID, runId: RUN_ID }
    });
    expect(prismaMock.identityResolutionClaim.count).toHaveBeenCalledWith({
      where: { bookId: BOOK_ID, runId: RUN_ID }
    });
  });

  it("fails when threestage produced no identity resolution claims", async () => {
    const writer = createThreeStageReviewOutputWriter(makePrismaMock({
      identityResolutionClaims: 0
    }) as never);

    await expect(writer.write({
      architecture: "threestage",
      bookId      : BOOK_ID,
      runId       : RUN_ID,
      chapterIds  : [CHAPTER_ID],
      jobId       : JOB_ID,
      scope       : "FULL_BOOK"
    })).rejects.toThrow("ThreeStage review output is missing identity_resolution_claims");
  });
});
