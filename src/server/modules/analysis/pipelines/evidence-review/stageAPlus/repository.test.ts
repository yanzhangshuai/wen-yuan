import { describe, expect, it, vi } from "vitest";

import { createStageAPlusRepository } from "@/server/modules/analysis/pipelines/evidence-review/stageAPlus/repository";

describe("Stage A+ repository", () => {
  it("reads only root Stage A AI relation claims for a chapter", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const repository = createStageAPlusRepository({
      relationClaim: { findMany }
    });

    await repository.listStageARelationClaims({
      bookId   : "11111111-1111-4111-8111-111111111111",
      chapterId: "22222222-2222-4222-8222-222222222222",
      runId    : "33333333-3333-4333-8333-333333333333"
    });

    expect(findMany).toHaveBeenCalledWith({
      where: {
        bookId            : "11111111-1111-4111-8111-111111111111",
        chapterId         : "22222222-2222-4222-8222-222222222222",
        runId             : "33333333-3333-4333-8333-333333333333",
        source            : "AI",
        derivedFromClaimId: null
      },
      orderBy: { createdAt: "asc" },
      select : {
        id                      : true,
        bookId                  : true,
        chapterId               : true,
        sourceMentionId         : true,
        targetMentionId         : true,
        sourcePersonaCandidateId: true,
        targetPersonaCandidateId: true,
        relationTypeKey         : true,
        relationLabel           : true,
        relationTypeSource      : true,
        direction               : true,
        effectiveChapterStart   : true,
        effectiveChapterEnd     : true,
        timeHintId              : true,
        evidenceSpanIds         : true,
        confidence              : true
      }
    });
  });
});
