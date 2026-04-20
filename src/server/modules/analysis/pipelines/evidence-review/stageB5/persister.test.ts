import { describe, expect, it, vi } from "vitest";

import { createStageB5Persister } from "@/server/modules/analysis/pipelines/evidence-review/stageB5/persister";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";
const RUN_ID = "22222222-2222-4222-8222-222222222222";
const CHAPTER_ID_1 = "33333333-3333-4333-8333-333333333333";
const CHAPTER_ID_2 = "44444444-4444-4444-8444-444444444444";
const CLAIM_ID_1 = "55555555-5555-4555-8555-555555555555";
const CLAIM_ID_2 = "66666666-6666-4666-8666-666666666666";
const CLAIM_ID_3 = "77777777-7777-4777-8777-777777777777";
const CANDIDATE_ID_1 = "88888888-8888-4888-8888-888888888888";
const CANDIDATE_ID_2 = "99999999-9999-4999-8999-999999999999";
const EVIDENCE_ID_1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EVIDENCE_ID_2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("stageB5/persister", () => {
  it("clears prior conflict scope and creates each row individually", async () => {
    const repository = {
      transaction            : vi.fn(async (work: (tx: never) => Promise<unknown>) => work(repository as never)),
      replaceClaimFamilyScope: vi.fn().mockResolvedValue({ deletedCount: 3, createdCount: 0 }),
      createReviewableClaim  : vi.fn()
        .mockResolvedValueOnce({ id: "conflict-1" })
        .mockResolvedValueOnce({ id: "conflict-2" })
    };
    const persister = createStageB5Persister({ claimRepository: repository as never });

    const result = await persister.persistConflictDrafts({
      bookId: BOOK_ID,
      runId : RUN_ID,
      drafts: [
        {
          claimFamily               : "CONFLICT_FLAG",
          bookId                    : BOOK_ID,
          chapterId                 : CHAPTER_ID_1,
          runId                     : RUN_ID,
          conflictType              : "ALIAS_CONFLICT",
          severity                  : "HIGH",
          reason                    : "reason-1",
          recommendedActionKey      : "VERIFY_IDENTITY_SPLIT",
          sourceStageKey            : "stage_b_identity_resolution",
          relatedClaimKind          : "IDENTITY_RESOLUTION",
          relatedClaimIds           : [CLAIM_ID_1],
          relatedPersonaCandidateIds: [CANDIDATE_ID_1],
          relatedChapterIds         : [CHAPTER_ID_1],
          summary                   : "summary-1",
          evidenceSpanIds           : [EVIDENCE_ID_1],
          reviewState               : "CONFLICTED",
          source                    : "RULE",
          reviewedByUserId          : null,
          reviewNote                : "STAGE_B5: tags=NEGATIVE_ALIAS_RULE"
        },
        {
          claimFamily               : "CONFLICT_FLAG",
          bookId                    : BOOK_ID,
          chapterId                 : null,
          runId                     : RUN_ID,
          conflictType              : "TIME_ORDER_CONFLICT",
          severity                  : "HIGH",
          reason                    : "reason-2",
          recommendedActionKey      : "VERIFY_TIME_ALIGNMENT",
          sourceStageKey            : "stage_a_extraction",
          relatedClaimKind          : null,
          relatedClaimIds           : [CLAIM_ID_2, CLAIM_ID_3],
          relatedPersonaCandidateIds: [CANDIDATE_ID_2],
          relatedChapterIds         : [
            CHAPTER_ID_1,
            CHAPTER_ID_2
          ],
          summary         : "summary-2",
          evidenceSpanIds : [EVIDENCE_ID_2],
          reviewState     : "CONFLICTED",
          source          : "RULE",
          reviewedByUserId: null,
          reviewNote      : "STAGE_B5: tags=EVENT_TIME_RANGE_MISMATCH"
        }
      ]
    });

    expect(repository.replaceClaimFamilyScope).toHaveBeenCalledWith({
      family: "CONFLICT_FLAG",
      scope : {
        bookId  : BOOK_ID,
        runId   : RUN_ID,
        stageKey: "stage_b5_conflict_detection"
      },
      rows: []
    });
    expect(repository.createReviewableClaim).toHaveBeenCalledTimes(2);
    expect(result.createdCount).toBe(2);
  });
});
