import { describe, expect, it, vi } from "vitest";

import type { ClaimDraftByFamily } from "@/server/modules/analysis/claims/claim-schemas";
import { createStageCPersister } from "@/server/modules/analysis/pipelines/evidence-review/stageC/persister";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";
const RUN_ID = "22222222-2222-4222-8222-222222222222";
const CHAPTER_ID_1 = "33333333-3333-4333-8333-333333333333";
const CHAPTER_ID_2 = "44444444-4444-4444-8444-444444444444";
const EVENT_ID_1 = "55555555-5555-4555-8555-555555555555";
const RELATION_ID_1 = "66666666-6666-4666-8666-666666666666";
const CANDIDATE_ID_1 = "77777777-7777-4777-8777-777777777777";
const CANDIDATE_ID_2 = "88888888-8888-4888-8888-888888888888";
const EVIDENCE_ID_1 = "99999999-9999-4999-8999-999999999999";

function eventDraft(
  overrides: Partial<ClaimDraftByFamily["EVENT"]> = {}
): ClaimDraftByFamily["EVENT"] {
  return {
    claimFamily              : "EVENT",
    bookId                   : BOOK_ID,
    chapterId                : CHAPTER_ID_1,
    runId                    : RUN_ID,
    source                   : "AI",
    confidence               : 0.82,
    reviewState              : "PENDING",
    createdByUserId          : null,
    reviewedByUserId         : null,
    reviewNote               : "STAGE_C: rank=1; score=0.9",
    evidenceSpanIds          : [EVIDENCE_ID_1],
    supersedesClaimId        : null,
    derivedFromClaimId       : EVENT_ID_1,
    subjectMentionId         : null,
    subjectPersonaCandidateId: CANDIDATE_ID_1,
    predicate                : "中举",
    objectText               : null,
    objectPersonaCandidateId : null,
    locationText             : null,
    timeHintId               : null,
    eventCategory            : "EXAM",
    narrativeLens            : "HISTORICAL",
    ...overrides
  };
}

function relationDraft(
  overrides: Partial<ClaimDraftByFamily["RELATION"]> = {}
): ClaimDraftByFamily["RELATION"] {
  return {
    claimFamily             : "RELATION",
    bookId                  : BOOK_ID,
    chapterId               : CHAPTER_ID_1,
    runId                   : RUN_ID,
    source                  : "AI",
    confidence              : 0.76,
    reviewState             : "PENDING",
    createdByUserId         : null,
    reviewedByUserId        : null,
    reviewNote              : "STAGE_C: rank=1:1; score=0.9:0.9",
    evidenceSpanIds         : [EVIDENCE_ID_1],
    supersedesClaimId       : null,
    derivedFromClaimId      : RELATION_ID_1,
    sourceMentionId         : null,
    targetMentionId         : null,
    sourcePersonaCandidateId: CANDIDATE_ID_1,
    targetPersonaCandidateId: CANDIDATE_ID_2,
    relationTypeKey         : "teacher_of",
    relationLabel           : "老师",
    relationTypeSource      : "PRESET",
    direction               : "FORWARD",
    effectiveChapterStart   : 12,
    effectiveChapterEnd     : null,
    timeHintId              : null,
    ...overrides
  };
}

describe("stageC/persister", () => {
  it("replaces derived event and relation rows per scoped chapter", async () => {
    const claimWriteService = {
      writeClaimBatch: vi.fn()
        .mockResolvedValueOnce({ deletedCount: 1, createdCount: 1 })
        .mockResolvedValueOnce({ deletedCount: 2, createdCount: 1 })
    };
    const persister = createStageCPersister({ claimWriteService: claimWriteService as never });

    const result = await persister.persistFactAttributionDrafts({
      bookId          : BOOK_ID,
      runId           : RUN_ID,
      scopedChapterIds: [CHAPTER_ID_1],
      eventDrafts     : [eventDraft()],
      relationDrafts  : [relationDraft()]
    });

    expect(claimWriteService.writeClaimBatch).toHaveBeenCalledWith(expect.objectContaining({
      family: "EVENT",
      scope : expect.objectContaining({
        bookId   : BOOK_ID,
        runId    : RUN_ID,
        stageKey : "stage_c_fact_attribution",
        chapterId: CHAPTER_ID_1
      }),
      drafts: [eventDraft()]
    }));
    expect(claimWriteService.writeClaimBatch).toHaveBeenCalledWith(expect.objectContaining({
      family: "RELATION",
      scope : expect.objectContaining({
        bookId   : BOOK_ID,
        runId    : RUN_ID,
        stageKey : "stage_c_fact_attribution",
        chapterId: CHAPTER_ID_1
      }),
      drafts: [relationDraft()]
    }));
    expect(result).toEqual({ deletedCount: 3, createdCount: 2 });
  });

  it("writes empty family batches for scoped chapters with no drafts", async () => {
    const claimWriteService = {
      writeClaimBatch: vi.fn()
        .mockResolvedValueOnce({ deletedCount: 1, createdCount: 1 })
        .mockResolvedValueOnce({ deletedCount: 2, createdCount: 0 })
        .mockResolvedValueOnce({ deletedCount: 3, createdCount: 0 })
        .mockResolvedValueOnce({ deletedCount: 4, createdCount: 1 })
    };
    const persister = createStageCPersister({ claimWriteService: claimWriteService as never });

    const result = await persister.persistFactAttributionDrafts({
      bookId          : BOOK_ID,
      runId           : RUN_ID,
      scopedChapterIds: [CHAPTER_ID_1, CHAPTER_ID_2],
      eventDrafts     : [eventDraft({ chapterId: CHAPTER_ID_1 })],
      relationDrafts  : [relationDraft({ chapterId: CHAPTER_ID_2 })]
    });

    expect(claimWriteService.writeClaimBatch).toHaveBeenNthCalledWith(1, expect.objectContaining({
      family: "EVENT",
      scope : expect.objectContaining({ chapterId: CHAPTER_ID_1 }),
      drafts: [eventDraft({ chapterId: CHAPTER_ID_1 })]
    }));
    expect(claimWriteService.writeClaimBatch).toHaveBeenNthCalledWith(2, expect.objectContaining({
      family: "RELATION",
      scope : expect.objectContaining({ chapterId: CHAPTER_ID_1 }),
      drafts: []
    }));
    expect(claimWriteService.writeClaimBatch).toHaveBeenNthCalledWith(3, expect.objectContaining({
      family: "EVENT",
      scope : expect.objectContaining({ chapterId: CHAPTER_ID_2 }),
      drafts: []
    }));
    expect(claimWriteService.writeClaimBatch).toHaveBeenNthCalledWith(4, expect.objectContaining({
      family: "RELATION",
      scope : expect.objectContaining({ chapterId: CHAPTER_ID_2 }),
      drafts: [relationDraft({ chapterId: CHAPTER_ID_2 })]
    }));
    expect(result).toEqual({ deletedCount: 10, createdCount: 2 });
  });
});
