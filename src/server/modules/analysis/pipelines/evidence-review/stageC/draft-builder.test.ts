import { describe, expect, it } from "vitest";

import { buildStageCFactAttributionDrafts } from "@/server/modules/analysis/pipelines/evidence-review/stageC/draft-builder";
import type {
  StageCConflictFlagRow,
  StageCEventClaimRow,
  StageCPersonaCandidateRow,
  StageCRelationClaimRow,
  StageCRepositoryPayload,
  StageCTimeClaimRow
} from "@/server/modules/analysis/pipelines/evidence-review/stageC/types";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";
const RUN_ID = "22222222-2222-4222-8222-222222222222";
const CHAPTER_ID_1 = "33333333-3333-4333-8333-333333333333";
const EVENT_ID_1 = "44444444-4444-4444-8444-444444444444";
const RELATION_ID_1 = "55555555-5555-4555-8555-555555555555";
const TIME_ID_1 = "66666666-6666-4666-8666-666666666666";
const CANDIDATE_ID_1 = "77777777-7777-4777-8777-777777777777";
const CANDIDATE_ID_2 = "88888888-8888-4888-8888-888888888888";
const EVIDENCE_ID_1 = "99999999-9999-4999-8999-999999999999";
const CONFLICT_ID_1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function candidate(
  overrides: Partial<StageCPersonaCandidateRow> = {}
): StageCPersonaCandidateRow {
  return {
    id                : CANDIDATE_ID_1,
    bookId            : BOOK_ID,
    runId             : RUN_ID,
    canonicalLabel    : "范进",
    firstSeenChapterNo: 1,
    lastSeenChapterNo : 20,
    mentionCount      : 8,
    evidenceScore     : 0.9,
    ...overrides
  };
}

function eventClaim(overrides: Partial<StageCEventClaimRow> = {}): StageCEventClaimRow {
  return {
    id                       : EVENT_ID_1,
    bookId                   : BOOK_ID,
    chapterId                : CHAPTER_ID_1,
    chapterNo                : 12,
    runId                    : RUN_ID,
    subjectMentionId         : null,
    subjectPersonaCandidateId: CANDIDATE_ID_1,
    predicate                : "中举",
    objectText               : null,
    objectPersonaCandidateId : null,
    locationText             : null,
    timeHintId               : null,
    eventCategory            : "EXAM",
    narrativeLens            : "HISTORICAL",
    evidenceSpanIds          : [EVIDENCE_ID_1],
    confidence               : 0.82,
    reviewState              : "PENDING",
    source                   : "AI",
    derivedFromClaimId       : null,
    reviewNote               : null,
    ...overrides
  };
}

function relationClaim(
  overrides: Partial<StageCRelationClaimRow> = {}
): StageCRelationClaimRow {
  return {
    id                      : RELATION_ID_1,
    bookId                  : BOOK_ID,
    chapterId               : CHAPTER_ID_1,
    chapterNo               : 12,
    runId                   : RUN_ID,
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
    evidenceSpanIds         : [EVIDENCE_ID_1],
    confidence              : 0.76,
    reviewState             : "PENDING",
    source                  : "AI",
    derivedFromClaimId      : null,
    reviewNote              : null,
    ...overrides
  };
}

function timeClaim(overrides: Partial<StageCTimeClaimRow> = {}): StageCTimeClaimRow {
  return {
    id                 : TIME_ID_1,
    bookId             : BOOK_ID,
    chapterId          : CHAPTER_ID_1,
    chapterNo          : 12,
    runId              : RUN_ID,
    rawTimeText        : "后来",
    timeType           : "RELATIVE_PHASE",
    normalizedLabel    : "后来",
    relativeOrderWeight: 12,
    chapterRangeStart  : 12,
    chapterRangeEnd    : null,
    evidenceSpanIds    : [EVIDENCE_ID_1],
    confidence         : 0.7,
    reviewState        : "PENDING",
    source             : "AI",
    derivedFromClaimId : null,
    reviewNote         : null,
    ...overrides
  };
}

function conflictFlag(
  overrides: Partial<StageCConflictFlagRow> = {}
): StageCConflictFlagRow {
  return {
    id                        : CONFLICT_ID_1,
    bookId                    : BOOK_ID,
    chapterId                 : CHAPTER_ID_1,
    runId                     : RUN_ID,
    conflictType              : "ALIAS_CONFLICT",
    severity                  : "HIGH",
    relatedClaimKind          : "EVENT",
    relatedClaimIds           : [],
    relatedPersonaCandidateIds: [],
    relatedChapterIds         : [CHAPTER_ID_1],
    evidenceSpanIds           : [EVIDENCE_ID_1],
    reviewState               : "CONFLICTED",
    source                    : "RULE",
    ...overrides
  };
}

function payloadWith(
  overrides: Partial<StageCRepositoryPayload> = {}
): StageCRepositoryPayload {
  return {
    personaCandidates: [
      candidate({ id: CANDIDATE_ID_1 }),
      candidate({ id: CANDIDATE_ID_2, canonicalLabel: "张静斋" })
    ],
    eventClaims   : [],
    relationClaims: [],
    timeClaims    : [],
    conflictFlags : [],
    ...overrides
  };
}

describe("stageC/draft-builder", () => {
  it("creates derived event drafts for each preserved subject alternative", () => {
    const bundle = buildStageCFactAttributionDrafts({
      bookId : BOOK_ID,
      runId  : RUN_ID,
      payload: payloadWith({
        eventClaims: [eventClaim({ subjectPersonaCandidateId: CANDIDATE_ID_1, timeHintId: TIME_ID_1 })],
        timeClaims : [timeClaim({ id: TIME_ID_1 })]
      })
    });

    expect(bundle.eventDrafts).toEqual([
      expect.objectContaining({
        claimFamily              : "EVENT",
        derivedFromClaimId       : EVENT_ID_1,
        subjectPersonaCandidateId: CANDIDATE_ID_1,
        timeHintId               : TIME_ID_1,
        reviewState              : "PENDING"
      })
    ]);
  });

  it("creates relation drafts for source and target attribution alternatives", () => {
    const bundle = buildStageCFactAttributionDrafts({
      bookId : BOOK_ID,
      runId  : RUN_ID,
      payload: payloadWith({
        relationClaims: [
          relationClaim({
            sourcePersonaCandidateId: CANDIDATE_ID_1,
            targetPersonaCandidateId: CANDIDATE_ID_2
          })
        ]
      })
    });

    expect(bundle.relationDrafts).toEqual([
      expect.objectContaining({
        claimFamily             : "RELATION",
        derivedFromClaimId      : RELATION_ID_1,
        sourcePersonaCandidateId: CANDIDATE_ID_1,
        targetPersonaCandidateId: CANDIDATE_ID_2
      })
    ]);
  });

  it("marks derived drafts conflicted when conflict flags touch the root claim", () => {
    const bundle = buildStageCFactAttributionDrafts({
      bookId : BOOK_ID,
      runId  : RUN_ID,
      payload: payloadWith({
        eventClaims  : [eventClaim({ subjectPersonaCandidateId: CANDIDATE_ID_1 })],
        conflictFlags: [conflictFlag({ relatedClaimIds: [EVENT_ID_1] })]
      })
    });

    expect(bundle.eventDrafts[0]).toEqual(expect.objectContaining({
      reviewState: "CONFLICTED",
      reviewNote : expect.stringContaining("conflictFlagIds")
    }));
  });
});
