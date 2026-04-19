import { describe, expect, it, vi } from "vitest";

import type {
  ClaimRepository,
  ReviewableClaimSummary
} from "@/server/modules/analysis/claims/claim-repository";
import { createManualOverrideService } from "@/server/modules/analysis/claims/manual-override";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";
const CHAPTER_ID = "22222222-2222-4222-8222-222222222222";
const RUN_ID = "33333333-3333-4333-8333-333333333333";
const EVIDENCE_ID = "44444444-4444-4444-8444-444444444444";
const USER_ID = "55555555-5555-4555-8555-555555555555";
const RELATION_CLAIM_ID = "66666666-6666-4666-8666-666666666666";

const DEFAULT_SUMMARY: ReviewableClaimSummary = {
  id         : RELATION_CLAIM_ID,
  reviewState: "PENDING",
  source     : "AI"
};

interface RepositoryMockPair {
  repository    : ClaimRepository;
  transactionSpy: ReturnType<typeof vi.fn>;
  txRepository  : ClaimRepository;
}

function createRepositoryMock(
  summary: ReviewableClaimSummary | null = DEFAULT_SUMMARY
): RepositoryMockPair {
  const txRepository: ClaimRepository = {
    transaction                     : async <T>(work: (tx: ClaimRepository) => Promise<T>): Promise<T> => work(txRepository),
    replaceClaimFamilyScope         : vi.fn(),
    findReviewableClaimSummary      : vi.fn().mockResolvedValue(summary),
    updateReviewableClaimReviewState: vi.fn().mockResolvedValue({
      id         : summary?.id ?? RELATION_CLAIM_ID,
      reviewState: "EDITED",
      source     : summary?.source ?? "AI"
    }),
    createReviewableClaim: vi.fn().mockResolvedValue({
      id                      : "manual-relation-1",
      bookId                  : BOOK_ID,
      chapterId               : CHAPTER_ID,
      sourceMentionId         : null,
      targetMentionId         : null,
      sourcePersonaCandidateId: null,
      targetPersonaCandidateId: null,
      relationTypeKey         : "political_patron_of",
      relationLabel           : "政治庇护",
      relationTypeSource      : "CUSTOM",
      direction               : "FORWARD",
      effectiveChapterStart   : 12,
      effectiveChapterEnd     : 18,
      timeHintId              : null,
      evidenceSpanIds         : [EVIDENCE_ID],
      confidence              : 1,
      reviewState             : "ACCEPTED",
      source                  : "MANUAL",
      runId                   : RUN_ID,
      supersedesClaimId       : RELATION_CLAIM_ID,
      derivedFromClaimId      : RELATION_CLAIM_ID,
      createdByUserId         : USER_ID,
      reviewedByUserId        : USER_ID,
      reviewNote              : "人工修订"
    })
  };

  const transactionSpy = vi.fn();
  const transaction: ClaimRepository["transaction"] = async <T>(
    work: (tx: ClaimRepository) => Promise<T>
  ): Promise<T> => {
    transactionSpy();
    return work(txRepository);
  };

  const repository: ClaimRepository = {
    transaction,
    replaceClaimFamilyScope         : vi.fn(),
    findReviewableClaimSummary      : vi.fn().mockRejectedValue(new Error("Expected transactional lookup")),
    updateReviewableClaimReviewState: vi.fn().mockRejectedValue(new Error("Expected transactional review update")),
    createReviewableClaim           : vi.fn().mockRejectedValue(new Error("Expected transactional create"))
  };

  return {
    repository,
    transactionSpy,
    txRepository
  };
}

describe("manual override service", () => {
  it("creates an accepted manual relation claim and marks the original as edited", async () => {
    const { repository, transactionSpy, txRepository } = createRepositoryMock();
    const service = createManualOverrideService(repository);

    const result = await service.createManualOverride({
      family         : "RELATION",
      originalClaimId: RELATION_CLAIM_ID,
      actorUserId    : USER_ID,
      reviewNote     : "人工修订",
      draft          : {
        bookId                  : BOOK_ID,
        chapterId               : CHAPTER_ID,
        sourceMentionId         : null,
        targetMentionId         : null,
        sourcePersonaCandidateId: null,
        targetPersonaCandidateId: null,
        relationTypeKey         : "political_patron_of",
        relationLabel           : "政治庇护",
        relationTypeSource      : "CUSTOM",
        direction               : "FORWARD",
        effectiveChapterStart   : 12,
        effectiveChapterEnd     : 18,
        timeHintId              : null,
        evidenceSpanIds         : [EVIDENCE_ID],
        confidence              : 1,
        runId                   : RUN_ID
      }
    });

    expect(result).toEqual({
      originalClaimId: RELATION_CLAIM_ID,
      manualClaimId  : "manual-relation-1"
    });
    expect(transactionSpy).toHaveBeenCalledTimes(1);
    expect(txRepository.findReviewableClaimSummary).toHaveBeenCalledWith(
      "RELATION",
      RELATION_CLAIM_ID
    );
    expect(repository.findReviewableClaimSummary).not.toHaveBeenCalled();
    expect(txRepository.updateReviewableClaimReviewState).toHaveBeenCalledWith(
      expect.objectContaining({
        family     : "RELATION",
        claimId    : RELATION_CLAIM_ID,
        reviewState: "EDITED"
      })
    );
    expect(repository.updateReviewableClaimReviewState).not.toHaveBeenCalled();
    expect(txRepository.createReviewableClaim).toHaveBeenCalledWith(
      "RELATION",
      expect.objectContaining({
        source            : "MANUAL",
        reviewState       : "ACCEPTED",
        supersedesClaimId : RELATION_CLAIM_ID,
        derivedFromClaimId: RELATION_CLAIM_ID,
        createdByUserId   : USER_ID,
        reviewedByUserId  : USER_ID
      })
    );
    expect(repository.createReviewableClaim).not.toHaveBeenCalled();
  });

  it("rejects overrides when the original claim cannot transition to edited", async () => {
    const { repository } = createRepositoryMock({
      id         : RELATION_CLAIM_ID,
      reviewState: "REJECTED",
      source     : "AI"
    });
    const service = createManualOverrideService(repository);

    await expect(service.createManualOverride({
      family         : "RELATION",
      originalClaimId: RELATION_CLAIM_ID,
      actorUserId    : USER_ID,
      reviewNote     : "人工修订",
      draft          : {
        bookId                  : BOOK_ID,
        chapterId               : CHAPTER_ID,
        sourceMentionId         : null,
        targetMentionId         : null,
        sourcePersonaCandidateId: null,
        targetPersonaCandidateId: null,
        relationTypeKey         : "political_patron_of",
        relationLabel           : "政治庇护",
        relationTypeSource      : "CUSTOM",
        direction               : "FORWARD",
        effectiveChapterStart   : 12,
        effectiveChapterEnd     : 18,
        timeHintId              : null,
        evidenceSpanIds         : [EVIDENCE_ID],
        confidence              : 1,
        runId                   : RUN_ID
      }
    })).rejects.toThrowError("Claim review state cannot transition from REJECTED to EDITED");
  });

  it("defaults reviewNote to null when the actor does not provide one", async () => {
    const { repository, txRepository } = createRepositoryMock();
    const service = createManualOverrideService(repository);

    await service.createManualOverride({
      family         : "RELATION",
      originalClaimId: RELATION_CLAIM_ID,
      actorUserId    : USER_ID,
      draft          : {
        bookId                  : BOOK_ID,
        chapterId               : CHAPTER_ID,
        sourceMentionId         : null,
        targetMentionId         : null,
        sourcePersonaCandidateId: null,
        targetPersonaCandidateId: null,
        relationTypeKey         : "political_patron_of",
        relationLabel           : "政治庇护",
        relationTypeSource      : "CUSTOM",
        direction               : "FORWARD",
        effectiveChapterStart   : 12,
        effectiveChapterEnd     : 18,
        timeHintId              : null,
        evidenceSpanIds         : [EVIDENCE_ID],
        confidence              : 1,
        runId                   : RUN_ID
      }
    });

    expect(txRepository.updateReviewableClaimReviewState).toHaveBeenCalledWith(
      expect.objectContaining({
        reviewNote: null
      })
    );
    expect(txRepository.createReviewableClaim).toHaveBeenCalledWith(
      "RELATION",
      expect.objectContaining({
        reviewNote: null
      })
    );
  });

  it("rejects overrides when the original claim does not exist", async () => {
    const { repository } = createRepositoryMock(null);
    const service = createManualOverrideService(repository);

    await expect(service.createManualOverride({
      family         : "TIME",
      originalClaimId: "time-404",
      actorUserId    : USER_ID,
      reviewNote     : "人工修订",
      draft          : {
        bookId             : BOOK_ID,
        chapterId          : CHAPTER_ID,
        rawTimeText        : "次日",
        timeType           : "RELATIVE_PHASE",
        normalizedLabel    : "次日",
        relativeOrderWeight: 2,
        chapterRangeStart  : 3,
        chapterRangeEnd    : 3,
        evidenceSpanIds    : [EVIDENCE_ID],
        confidence         : 1,
        runId              : RUN_ID
      }
    })).rejects.toThrowError("Original claim time-404 was not found in family TIME");
  });

  it("rejects claim families that do not support manual overrides", async () => {
    const { repository } = createRepositoryMock();
    const service = createManualOverrideService(repository);

    await expect(service.createManualOverride({
      family         : "CONFLICT_FLAG" as never,
      originalClaimId: RELATION_CLAIM_ID,
      actorUserId    : USER_ID,
      draft          : {} as never
    })).rejects.toThrowError("Claim family CONFLICT_FLAG does not support manual overrides");
  });
});
