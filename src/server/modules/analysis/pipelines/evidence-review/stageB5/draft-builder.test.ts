import { describe, expect, it } from "vitest";

import { ConflictSeverity, ConflictType } from "@/generated/prisma/enums";
import { buildStageB5ConflictDrafts } from "@/server/modules/analysis/pipelines/evidence-review/stageB5/draft-builder";

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
const EVIDENCE_ID_3 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

describe("stageB5/draft-builder", () => {
  it("anchors one-chapter conflicts and nulls multi-chapter conflicts", () => {
    const drafts = buildStageB5ConflictDrafts({
      bookId  : BOOK_ID,
      runId   : RUN_ID,
      findings: [
        {
          conflictType              : ConflictType.ALIAS_CONFLICT,
          severity                  : ConflictSeverity.HIGH,
          reason                    : "single chapter",
          summary                   : "单章 alias 冲突",
          recommendedActionKey      : "VERIFY_IDENTITY_SPLIT",
          sourceStageKey            : "stage_b_identity_resolution",
          relatedClaimKind          : "IDENTITY_RESOLUTION",
          relatedClaimIds           : [CLAIM_ID_1],
          relatedPersonaCandidateIds: [CANDIDATE_ID_1],
          relatedChapterIds         : [CHAPTER_ID_1],
          evidenceSpanIds           : [EVIDENCE_ID_1],
          tags                      : ["NEGATIVE_ALIAS_RULE"]
        },
        {
          conflictType              : ConflictType.TIME_ORDER_CONFLICT,
          severity                  : ConflictSeverity.HIGH,
          reason                    : "multi chapter",
          summary                   : "跨章时间冲突",
          recommendedActionKey      : "VERIFY_TIME_ALIGNMENT",
          sourceStageKey            : "stage_a_extraction",
          relatedClaimKind          : null,
          relatedClaimIds           : [CLAIM_ID_2, CLAIM_ID_3],
          relatedPersonaCandidateIds: [CANDIDATE_ID_2],
          relatedChapterIds         : [CHAPTER_ID_1, CHAPTER_ID_2],
          evidenceSpanIds           : [EVIDENCE_ID_2, EVIDENCE_ID_3],
          tags                      : ["EVENT_TIME_RANGE_MISMATCH"]
        }
      ]
    });

    expect(drafts[0]).toMatchObject({
      chapterId           : CHAPTER_ID_1,
      reviewState         : "CONFLICTED",
      source              : "RULE",
      recommendedActionKey: "VERIFY_IDENTITY_SPLIT",
      sourceStageKey      : "stage_b_identity_resolution",
      relatedChapterIds   : [CHAPTER_ID_1]
    });
    expect(drafts[1]?.chapterId).toBeNull();
    expect(drafts[1]?.reviewNote).toContain("EVENT_TIME_RANGE_MISMATCH");
  });
});
