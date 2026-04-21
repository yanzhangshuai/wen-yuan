import { describe, expect, it } from "vitest";

import { buildPersonaChapterFacts } from "@/server/modules/review/evidence-review/projections/persona-chapter";
import type {
  ConflictFlagProjectionSourceRow,
  EventClaimProjectionSourceRow,
  ProjectionChapterSourceRow,
  RelationClaimProjectionSourceRow
} from "@/server/modules/review/evidence-review/projections/types";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";
const CHAPTER_ID_1 = "22222222-2222-4222-8222-222222222222";
const CHAPTER_ID_2 = "33333333-3333-4333-8333-333333333333";
const CANDIDATE_ID_1 = "44444444-4444-4444-8444-444444444444";
const CANDIDATE_ID_2 = "55555555-5555-4555-8555-555555555555";
const CANDIDATE_ID_UNMAPPED = "66666666-6666-4666-8666-666666666666";
const PERSONA_ID_1 = "77777777-7777-4777-8777-777777777777";
const PERSONA_ID_2 = "88888888-8888-4888-8888-888888888888";
const RUN_ID = "99999999-9999-4999-8999-999999999999";

const TIME_1 = new Date("2026-04-20T00:00:00.000Z");
const TIME_2 = new Date("2026-04-20T00:00:01.000Z");
const TIME_3 = new Date("2026-04-20T00:00:02.000Z");
const TIME_4 = new Date("2026-04-20T00:00:03.000Z");

function chapter(id: string, no: number): ProjectionChapterSourceRow {
  return { id, bookId: BOOK_ID, no };
}

function eventClaim(
  overrides: Partial<EventClaimProjectionSourceRow> = {}
): EventClaimProjectionSourceRow {
  return {
    id                       : "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    bookId                   : BOOK_ID,
    chapterId                : CHAPTER_ID_1,
    subjectPersonaCandidateId: CANDIDATE_ID_1,
    objectPersonaCandidateId : null,
    predicate                : "参加",
    objectText               : "宴会",
    locationText             : null,
    timeHintId               : null,
    eventCategory            : "EVENT",
    narrativeLens            : "SELF",
    evidenceSpanIds          : [],
    confidence               : 0.9,
    reviewState              : "ACCEPTED",
    source                   : "AI",
    runId                    : RUN_ID,
    createdAt                : TIME_1,
    updatedAt                : TIME_1,
    ...overrides
  };
}

function relationClaim(
  overrides: Partial<RelationClaimProjectionSourceRow> = {}
): RelationClaimProjectionSourceRow {
  return {
    id                      : "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    bookId                  : BOOK_ID,
    chapterId               : CHAPTER_ID_1,
    sourcePersonaCandidateId: CANDIDATE_ID_1,
    targetPersonaCandidateId: CANDIDATE_ID_2,
    relationTypeKey         : "ALLY",
    relationLabel           : "盟友",
    relationTypeSource      : "PRESET",
    direction               : "FORWARD",
    effectiveChapterStart   : null,
    effectiveChapterEnd     : null,
    timeHintId              : null,
    evidenceSpanIds         : [],
    confidence              : 0.8,
    reviewState             : "ACCEPTED",
    source                  : "AI",
    runId                   : RUN_ID,
    createdAt               : TIME_2,
    updatedAt               : TIME_2,
    ...overrides
  };
}

function conflictFlag(
  overrides: Partial<ConflictFlagProjectionSourceRow> = {}
): ConflictFlagProjectionSourceRow {
  return {
    id                        : "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    bookId                    : BOOK_ID,
    chapterId                 : CHAPTER_ID_1,
    runId                     : RUN_ID,
    conflictType              : "RELATION_CONFLICT",
    severity                  : "MEDIUM",
    reason                    : "冲突原因",
    recommendedActionKey      : "KEEP_NEWEST",
    sourceStageKey            : "STAGE_C",
    relatedClaimKind          : "RELATION",
    relatedClaimIds           : [],
    relatedPersonaCandidateIds: [CANDIDATE_ID_1],
    relatedChapterIds         : [CHAPTER_ID_1],
    summary                   : "冲突摘要",
    evidenceSpanIds           : [],
    reviewState               : "ACCEPTED",
    source                    : "RULE",
    reviewedByUserId          : null,
    reviewedAt                : null,
    reviewNote                : null,
    createdAt                 : TIME_3,
    updatedAt                 : TIME_3,
    ...overrides
  };
}

describe("buildPersonaChapterFacts", () => {
  it("aggregates accepted event relation and conflict claims into persona chapter rows", () => {
    const rows = buildPersonaChapterFacts({
      chapters              : [chapter(CHAPTER_ID_1, 1), chapter(CHAPTER_ID_2, 2)],
      personaIdByCandidateId: new Map<string, string>([
        [CANDIDATE_ID_1, PERSONA_ID_1],
        [CANDIDATE_ID_2, PERSONA_ID_2]
      ]),
      eventClaims: [
        eventClaim(),
        eventClaim({
          id                       : "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          subjectPersonaCandidateId: CANDIDATE_ID_UNMAPPED
        }),
        eventClaim({
          id         : "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
          reviewState: "PENDING"
        })
      ],
      relationClaims: [
        relationClaim(),
        relationClaim({
          id                      : "ffffffff-ffff-4fff-8fff-ffffffffffff",
          sourcePersonaCandidateId: CANDIDATE_ID_1,
          targetPersonaCandidateId: CANDIDATE_ID_1,
          updatedAt               : TIME_4
        }),
        relationClaim({
          id         : "11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          reviewState: "REJECTED"
        })
      ],
      conflictFlags: [
        conflictFlag(),
        conflictFlag({
          id         : "22222222-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          reviewState: "CONFLICTED"
        })
      ]
    });

    expect(rows).toEqual([
      {
        bookId            : BOOK_ID,
        personaId         : PERSONA_ID_1,
        chapterId         : CHAPTER_ID_1,
        chapterNo         : 1,
        eventCount        : 1,
        relationCount     : 2,
        conflictCount     : 1,
        reviewStateSummary: {
          EVENT   : { ACCEPTED: 1 },
          RELATION: { ACCEPTED: 2 },
          CONFLICT: { ACCEPTED: 1 }
        },
        latestUpdatedAt: TIME_4
      },
      {
        bookId            : BOOK_ID,
        personaId         : PERSONA_ID_2,
        chapterId         : CHAPTER_ID_1,
        chapterNo         : 1,
        eventCount        : 0,
        relationCount     : 1,
        conflictCount     : 0,
        reviewStateSummary: {
          RELATION: { ACCEPTED: 1 }
        },
        latestUpdatedAt: TIME_2
      }
    ]);
  });

  it("falls back to chapterId when conflict relatedChapterIds is empty", () => {
    const rows = buildPersonaChapterFacts({
      chapters              : [chapter(CHAPTER_ID_1, 1), chapter(CHAPTER_ID_2, 2)],
      personaIdByCandidateId: new Map<string, string>([[CANDIDATE_ID_1, PERSONA_ID_1]]),
      eventClaims           : [],
      relationClaims        : [],
      conflictFlags         : [
        conflictFlag({
          chapterId        : CHAPTER_ID_2,
          relatedChapterIds: [],
          relatedClaimKind : null,
          relatedClaimIds  : [],
          updatedAt        : TIME_2
        }),
        conflictFlag({
          id               : "33333333-cccc-4ccc-8ccc-cccccccccccc",
          chapterId        : null,
          relatedChapterIds: [],
          relatedClaimKind : null,
          relatedClaimIds  : []
        })
      ]
    });

    expect(rows).toEqual([
      {
        bookId            : BOOK_ID,
        personaId         : PERSONA_ID_1,
        chapterId         : CHAPTER_ID_2,
        chapterNo         : 2,
        eventCount        : 0,
        relationCount     : 0,
        conflictCount     : 1,
        reviewStateSummary: {
          CONFLICT: { ACCEPTED: 1 }
        },
        latestUpdatedAt: TIME_2
      }
    ]);
  });
});
