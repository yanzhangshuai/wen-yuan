import { describe, expect, it, vi } from "vitest";

import { createStageAPlusClaimPersister } from "@/server/modules/analysis/pipelines/evidence-review/stageAPlus/claim-persister";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";
const CHAPTER_ID = "22222222-2222-4222-8222-222222222222";
const RUN_ID = "33333333-3333-4333-8333-333333333333";
const EVIDENCE_ID = "44444444-4444-4444-8444-444444444444";

describe("Stage A+ claim persister", () => {
  it("writes mention, alias, and relation batches through the claim write service", async () => {
    const writeClaimBatch = vi.fn()
      .mockResolvedValueOnce({ deletedCount: 0, createdCount: 1 })
      .mockResolvedValueOnce({ deletedCount: 0, createdCount: 1 })
      .mockResolvedValueOnce({ deletedCount: 0, createdCount: 1 });
    const persister = createStageAPlusClaimPersister({
      claimWriteService: { writeClaimBatch }
    });

    const result = await persister.persistStageAPlusClaims({
      scope: {
        bookId   : BOOK_ID,
        chapterId: CHAPTER_ID,
        runId    : RUN_ID,
        stageKey : "stage_a_plus_knowledge_recall"
      },
      recallOutput: {
        mentionDrafts: [
          {
            claimFamily              : "ENTITY_MENTION",
            bookId                   : BOOK_ID,
            chapterId                : CHAPTER_ID,
            runId                    : RUN_ID,
            source                   : "RULE",
            confidence               : 0.9,
            surfaceText              : "范老爷",
            mentionKind              : "TITLE_ONLY",
            identityClaim            : null,
            aliasTypeHint            : "TITLE",
            speakerPersonaCandidateId: null,
            suspectedResolvesTo      : null,
            evidenceSpanId           : EVIDENCE_ID
          }
        ],
        aliasDrafts: [
          {
            claimFamily             : "ALIAS",
            bookId                  : BOOK_ID,
            chapterId               : CHAPTER_ID,
            runId                   : RUN_ID,
            source                  : "RULE",
            reviewState             : "PENDING",
            createdByUserId         : null,
            reviewedByUserId        : null,
            reviewNote              : null,
            supersedesClaimId       : null,
            derivedFromClaimId      : null,
            evidenceSpanIds         : [EVIDENCE_ID],
            confidence              : 0.9,
            aliasText               : "范老爷",
            aliasType               : "TITLE",
            personaCandidateId      : null,
            targetPersonaCandidateId: null,
            claimKind               : "TITLE_OF"
          }
        ],
        relationDrafts: [
          {
            claimFamily             : "RELATION",
            bookId                  : BOOK_ID,
            chapterId               : CHAPTER_ID,
            runId                   : RUN_ID,
            source                  : "RULE",
            reviewState             : "PENDING",
            createdByUserId         : null,
            reviewedByUserId        : null,
            reviewNote              : null,
            supersedesClaimId       : null,
            derivedFromClaimId      : "55555555-5555-4555-8555-555555555555",
            evidenceSpanIds         : [EVIDENCE_ID],
            confidence              : 0.9,
            sourceMentionId         : null,
            targetMentionId         : null,
            sourcePersonaCandidateId: null,
            targetPersonaCandidateId: null,
            relationTypeKey         : "teacher_of",
            relationLabel           : "门生",
            relationTypeSource      : "PRESET",
            direction               : "FORWARD",
            effectiveChapterStart   : null,
            effectiveChapterEnd     : null,
            timeHintId              : null
          }
        ],
        discardRecords  : [],
        knowledgeItemIds: ["kb-1"]
      }
    });

    expect(result.persistedCounts).toEqual({ mentions: 1, aliases: 1, relations: 1 });
    expect(writeClaimBatch).toHaveBeenCalledTimes(3);
    expect(writeClaimBatch).toHaveBeenNthCalledWith(1, expect.objectContaining({ family: "ENTITY_MENTION" }));
    expect(writeClaimBatch).toHaveBeenNthCalledWith(2, expect.objectContaining({ family: "ALIAS" }));
    expect(writeClaimBatch).toHaveBeenNthCalledWith(3, expect.objectContaining({ family: "RELATION" }));
  });

  it("clears stale Stage A+ rows with empty batches", async () => {
    const writeClaimBatch = vi.fn().mockResolvedValue({ deletedCount: 2, createdCount: 0 });
    const persister = createStageAPlusClaimPersister({
      claimWriteService: { writeClaimBatch }
    });

    await persister.persistStageAPlusClaims({
      scope: {
        bookId   : BOOK_ID,
        chapterId: CHAPTER_ID,
        runId    : RUN_ID,
        stageKey : "stage_a_plus_knowledge_recall"
      },
      recallOutput: {
        mentionDrafts   : [],
        aliasDrafts     : [],
        relationDrafts  : [],
        discardRecords  : [],
        knowledgeItemIds: []
      }
    });

    expect(writeClaimBatch).toHaveBeenCalledTimes(3);
  });
});
