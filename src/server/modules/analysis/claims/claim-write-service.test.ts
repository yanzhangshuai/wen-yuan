import { describe, expect, it, vi } from "vitest";

import { BioCategory, NarrativeLens, TimeType } from "@/generated/prisma/enums";
import { createClaimWriteService } from "@/server/modules/analysis/claims/claim-write-service";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";
const CHAPTER_ID = "22222222-2222-4222-8222-222222222222";
const RUN_ID = "33333333-3333-4333-8333-333333333333";
const EVIDENCE_ID = "44444444-4444-4444-8444-444444444444";

describe("claim write service", () => {
  it("validates and writes a chapter-scoped event batch through the repository contract", async () => {
    const repository = {
      replaceClaimFamilyScope: vi.fn().mockResolvedValue({ deletedCount: 1, createdCount: 1 })
    };
    const service = createClaimWriteService(repository);

    await expect(service.writeClaimBatch({
      family: "EVENT",
      scope : {
        bookId   : BOOK_ID,
        chapterId: CHAPTER_ID,
        runId    : RUN_ID,
        stageKey : "stage_a_extraction"
      },
      drafts: [
        {
          claimFamily              : "EVENT",
          bookId                   : BOOK_ID,
          chapterId                : CHAPTER_ID,
          subjectMentionId         : null,
          subjectPersonaCandidateId: null,
          predicate                : "中举",
          objectText               : null,
          objectPersonaCandidateId : null,
          locationText             : null,
          timeHintId               : null,
          eventCategory            : BioCategory.EXAM,
          narrativeLens            : NarrativeLens.SELF,
          evidenceSpanIds          : [EVIDENCE_ID],
          confidence               : 0.93,
          reviewState              : "PENDING",
          source                   : "AI",
          runId                    : RUN_ID,
          supersedesClaimId        : null,
          derivedFromClaimId       : null,
          createdByUserId          : null,
          reviewedByUserId         : null,
          reviewNote               : null
        }
      ]
    })).resolves.toEqual({ deletedCount: 1, createdCount: 1 });

    expect(repository.replaceClaimFamilyScope).toHaveBeenCalledWith({
      family: "EVENT",
      scope : {
        bookId   : BOOK_ID,
        chapterId: CHAPTER_ID,
        runId    : RUN_ID,
        stageKey : "stage_a_extraction"
      },
      rows: [
        expect.objectContaining({
          predicate: "中举",
          source   : "AI"
        })
      ]
    });
  });

  it("rejects missing evidence before the repository is touched", async () => {
    const repository = {
      replaceClaimFamilyScope: vi.fn()
    };
    const service = createClaimWriteService(repository);

    await expect(service.writeClaimBatch({
      family: "TIME",
      scope : {
        bookId   : BOOK_ID,
        chapterId: CHAPTER_ID,
        runId    : RUN_ID,
        stageKey : "stage_a_extraction"
      },
      drafts: [
        {
          claimFamily        : "TIME",
          bookId             : BOOK_ID,
          chapterId          : CHAPTER_ID,
          rawTimeText        : "次日",
          timeType           : TimeType.RELATIVE_PHASE,
          normalizedLabel    : "次日",
          relativeOrderWeight: 2,
          chapterRangeStart  : 3,
          chapterRangeEnd    : 3,
          evidenceSpanIds    : [],
          confidence         : 0.8,
          reviewState        : "PENDING",
          source             : "AI",
          runId              : RUN_ID,
          supersedesClaimId  : null,
          derivedFromClaimId : null,
          createdByUserId    : null,
          reviewedByUserId   : null,
          reviewNote         : null
        }
      ]
    })).rejects.toThrowError();

    expect(repository.replaceClaimFamilyScope).not.toHaveBeenCalled();
  });

  it("accepts custom relation keys without converting them into enums", async () => {
    const repository = {
      replaceClaimFamilyScope: vi.fn().mockResolvedValue({ deletedCount: 0, createdCount: 1 })
    };
    const service = createClaimWriteService(repository);

    await service.writeClaimBatch({
      family: "RELATION",
      scope : {
        bookId   : BOOK_ID,
        chapterId: CHAPTER_ID,
        runId    : RUN_ID,
        stageKey : "stage_a_plus_knowledge_recall"
      },
      drafts: [
        {
          claimFamily             : "RELATION",
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
          effectiveChapterStart   : null,
          effectiveChapterEnd     : null,
          timeHintId              : null,
          evidenceSpanIds         : [EVIDENCE_ID],
          confidence              : 0.74,
          reviewState             : "PENDING",
          source                  : "RULE",
          runId                   : RUN_ID,
          supersedesClaimId       : null,
          derivedFromClaimId      : null,
          createdByUserId         : null,
          reviewedByUserId        : null,
          reviewNote              : null
        }
      ]
    });

    expect(repository.replaceClaimFamilyScope).toHaveBeenCalledWith({
      family: "RELATION",
      scope : {
        bookId   : BOOK_ID,
        chapterId: CHAPTER_ID,
        runId    : RUN_ID,
        stageKey : "stage_a_plus_knowledge_recall"
      },
      rows: [
        expect.objectContaining({
          relationTypeKey: "political_patron_of",
          relationLabel  : "政治庇护"
        })
      ]
    });
  });

  it("uses empty batches to clear stale machine rows during reruns", async () => {
    const repository = {
      replaceClaimFamilyScope: vi.fn().mockResolvedValue({ deletedCount: 3, createdCount: 0 })
    };
    const service = createClaimWriteService(repository);

    await expect(service.writeClaimBatch({
      family: "TIME",
      scope : {
        bookId   : BOOK_ID,
        chapterId: CHAPTER_ID,
        runId    : RUN_ID,
        stageKey : "stage_c_fact_attribution"
      },
      drafts: []
    })).resolves.toEqual({ deletedCount: 3, createdCount: 0 });

    expect(repository.replaceClaimFamilyScope).toHaveBeenCalledWith({
      family: "TIME",
      scope : {
        bookId   : BOOK_ID,
        chapterId: CHAPTER_ID,
        runId    : RUN_ID,
        stageKey : "stage_c_fact_attribution"
      },
      rows: []
    });
  });

  it.each([
    {
      label       : "bookId mismatches scope",
      scope       : { bookId: "99999999-9999-4999-8999-999999999999", chapterId: CHAPTER_ID, runId: RUN_ID, stageKey: "stage_a_extraction" as const },
      expectedText: "Claim batch bookId mismatch"
    },
    {
      label       : "runId mismatches scope",
      scope       : { bookId: BOOK_ID, chapterId: CHAPTER_ID, runId: "99999999-9999-4999-8999-999999999999", stageKey: "stage_a_extraction" as const },
      expectedText: "Claim batch runId mismatch"
    },
    {
      label       : "chapterId mismatches scope",
      scope       : { bookId: BOOK_ID, chapterId: "99999999-9999-4999-8999-999999999999", runId: RUN_ID, stageKey: "stage_a_extraction" as const },
      expectedText: "Claim batch chapterId mismatch"
    }
  ])("rejects drafts when $label", async ({ scope, expectedText }) => {
    const repository = {
      replaceClaimFamilyScope: vi.fn()
    };
    const service = createClaimWriteService(repository);

    await expect(service.writeClaimBatch({
      family: "EVENT",
      scope,
      drafts: [
        {
          claimFamily              : "EVENT",
          bookId                   : BOOK_ID,
          chapterId                : CHAPTER_ID,
          subjectMentionId         : null,
          subjectPersonaCandidateId: null,
          predicate                : "中举",
          objectText               : null,
          objectPersonaCandidateId : null,
          locationText             : null,
          timeHintId               : null,
          eventCategory            : BioCategory.EXAM,
          narrativeLens            : NarrativeLens.SELF,
          evidenceSpanIds          : [EVIDENCE_ID],
          confidence               : 0.93,
          reviewState              : "PENDING",
          source                   : "AI",
          runId                    : RUN_ID,
          supersedesClaimId        : null,
          derivedFromClaimId       : null,
          createdByUserId          : null,
          reviewedByUserId         : null,
          reviewNote               : null
        }
      ]
    })).rejects.toThrowError(expectedText);

    expect(repository.replaceClaimFamilyScope).not.toHaveBeenCalled();
  });

  it("rejects MANUAL drafts from pipeline writes", async () => {
    const repository = {
      replaceClaimFamilyScope: vi.fn()
    };
    const service = createClaimWriteService(repository);

    await expect(service.writeClaimBatch({
      family: "EVENT",
      scope : {
        bookId   : BOOK_ID,
        chapterId: CHAPTER_ID,
        runId    : RUN_ID,
        stageKey : "stage_a_extraction"
      },
      drafts: [
        {
          claimFamily              : "EVENT",
          bookId                   : BOOK_ID,
          chapterId                : CHAPTER_ID,
          subjectMentionId         : null,
          subjectPersonaCandidateId: null,
          predicate                : "中举",
          objectText               : null,
          objectPersonaCandidateId : null,
          locationText             : null,
          timeHintId               : null,
          eventCategory            : BioCategory.EXAM,
          narrativeLens            : NarrativeLens.SELF,
          evidenceSpanIds          : [EVIDENCE_ID],
          confidence               : 1,
          reviewState              : "PENDING",
          source                   : "MANUAL",
          runId                    : RUN_ID,
          supersedesClaimId        : null,
          derivedFromClaimId       : null,
          createdByUserId          : "66666666-6666-4666-8666-666666666666",
          reviewedByUserId         : null,
          reviewNote               : "人工补录"
        }
      ]
    })).rejects.toThrowError("Pipeline claim writes must not use MANUAL source for EVENT");

    expect(repository.replaceClaimFamilyScope).not.toHaveBeenCalled();
  });
});
