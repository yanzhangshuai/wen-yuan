import { describe, expect, it } from "vitest";

import {
  buildPersonaTimeFacts,
  buildTimelineEvents
} from "@/server/modules/review/evidence-review/projections/persona-time";
import type {
  EventClaimProjectionSourceRow,
  RelationClaimProjectionSourceRow,
  TimeClaimProjectionSourceRow
} from "@/server/modules/review/evidence-review/projections/types";

const BOOK_ID_1 = "11111111-1111-4111-8111-111111111111";
const BOOK_ID_2 = "12111111-1111-4111-8111-111111111111";
const CHAPTER_ID_1 = "22222222-2222-4222-8222-222222222222";
const CHAPTER_ID_2 = "23222222-2222-4222-8222-222222222222";
const CANDIDATE_ID_1 = "33333333-3333-4333-8333-333333333333";
const CANDIDATE_ID_2 = "34333333-3333-4333-8333-333333333333";
const CANDIDATE_ID_UNMAPPED = "35333333-3333-4333-8333-333333333333";
const PERSONA_ID_1 = "44444444-4444-4444-8444-444444444444";
const PERSONA_ID_2 = "45444444-4444-4444-8444-444444444444";
const RUN_ID = "55555555-5555-4555-8555-555555555555";
const EVENT_ID_1 = "66666666-6666-4666-8666-666666666666";
const EVENT_ID_2 = "67666666-6666-4666-8666-666666666666";
const EVENT_ID_3 = "68666666-6666-4666-8666-666666666666";
const EVENT_ID_4 = "69666666-6666-4666-8666-666666666666";
const EVENT_ID_5 = "70666666-6666-4666-8666-666666666666";
const RELATION_ID_1 = "77777777-7777-4777-8777-777777777777";
const RELATION_ID_2 = "78777777-7777-4777-8777-777777777777";
const TIME_ID_1 = "88888888-8888-4888-8888-888888888888";
const TIME_ID_2 = "89888888-8888-4888-8888-888888888888";
const TIME_ID_REJECTED = "90888888-8888-4888-8888-888888888888";
const TIME_ID_PENDING = "91888888-8888-4888-8888-888888888888";

const TIME_1 = new Date("2026-04-20T00:00:00.000Z");

function eventClaim(
  overrides: Partial<EventClaimProjectionSourceRow> = {}
): EventClaimProjectionSourceRow {
  return {
    id                       : EVENT_ID_1,
    bookId                   : BOOK_ID_1,
    chapterId                : CHAPTER_ID_1,
    subjectPersonaCandidateId: CANDIDATE_ID_1,
    objectPersonaCandidateId : null,
    predicate                : "舌战",
    objectText               : "群儒",
    locationText             : null,
    timeHintId               : TIME_ID_1,
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
    id                      : RELATION_ID_1,
    bookId                  : BOOK_ID_1,
    chapterId               : CHAPTER_ID_1,
    sourcePersonaCandidateId: CANDIDATE_ID_1,
    targetPersonaCandidateId: CANDIDATE_ID_2,
    relationTypeKey         : "ALLY",
    relationLabel           : "盟友",
    relationTypeSource      : "PRESET",
    direction               : "FORWARD",
    effectiveChapterStart   : null,
    effectiveChapterEnd     : null,
    timeHintId              : TIME_ID_1,
    evidenceSpanIds         : [],
    confidence              : 0.9,
    reviewState             : "ACCEPTED",
    source                  : "AI",
    runId                   : RUN_ID,
    createdAt               : TIME_1,
    updatedAt               : TIME_1,
    ...overrides
  };
}

function timeClaim(overrides: Partial<TimeClaimProjectionSourceRow> = {}): TimeClaimProjectionSourceRow {
  return {
    id                 : TIME_ID_1,
    bookId             : BOOK_ID_1,
    chapterId          : CHAPTER_ID_1,
    rawTimeText        : "赤壁之战前",
    timeType           : "RELATIVE",
    normalizedLabel    : "赤壁之战前",
    relativeOrderWeight: 208.1,
    chapterRangeStart  : 43,
    chapterRangeEnd    : 45,
    evidenceSpanIds    : [],
    confidence         : 0.9,
    reviewState        : "ACCEPTED",
    source             : "AI",
    runId              : RUN_ID,
    createdAt          : TIME_1,
    updatedAt          : TIME_1,
    ...overrides
  };
}

describe("buildPersonaTimeFacts", () => {
  it("aggregates accepted timed events and relations for resolved personas and skips invalid claims", () => {
    const rows = buildPersonaTimeFacts({
      personaIdByCandidateId: new Map<string, string>([
        [CANDIDATE_ID_1, PERSONA_ID_1],
        [CANDIDATE_ID_2, PERSONA_ID_2]
      ]),
      eventClaims: [
        eventClaim(),
        eventClaim({ id: EVENT_ID_2, subjectPersonaCandidateId: CANDIDATE_ID_UNMAPPED }),
        eventClaim({ id: EVENT_ID_3, reviewState: "PENDING" }),
        eventClaim({ id: EVENT_ID_4, timeHintId: TIME_ID_REJECTED }),
        eventClaim({ id: EVENT_ID_5, timeHintId: TIME_ID_PENDING })
      ],
      relationClaims: [
        relationClaim(),
        relationClaim({ id: RELATION_ID_2, reviewState: "REJECTED" })
      ],
      timeClaims: [
        timeClaim(),
        timeClaim({ id: TIME_ID_REJECTED, reviewState: "REJECTED" }),
        timeClaim({ id: TIME_ID_PENDING, reviewState: "PENDING" })
      ]
    });

    expect(rows).toEqual([
      {
        bookId            : BOOK_ID_1,
        personaId         : PERSONA_ID_1,
        timeLabel         : "赤壁之战前",
        timeSortKey       : 208.1,
        chapterRangeStart : 43,
        chapterRangeEnd   : 45,
        eventCount        : 1,
        relationCount     : 1,
        sourceTimeClaimIds: [TIME_ID_1]
      },
      {
        bookId            : BOOK_ID_1,
        personaId         : PERSONA_ID_2,
        timeLabel         : "赤壁之战前",
        timeSortKey       : 208.1,
        chapterRangeStart : 43,
        chapterRangeEnd   : 45,
        eventCount        : 0,
        relationCount     : 1,
        sourceTimeClaimIds: [TIME_ID_1]
      }
    ]);
  });

  it("keeps sourceTimeClaimIds unique and sorted and sorts rows stably", () => {
    const rows = buildPersonaTimeFacts({
      personaIdByCandidateId: new Map<string, string>([
        [CANDIDATE_ID_1, PERSONA_ID_1],
        [CANDIDATE_ID_2, PERSONA_ID_2]
      ]),
      eventClaims: [
        eventClaim({ id: EVENT_ID_1, timeHintId: TIME_ID_2 }),
        eventClaim({ id: EVENT_ID_2, timeHintId: TIME_ID_1 }),
        eventClaim({ id: EVENT_ID_3, bookId: BOOK_ID_2, timeHintId: TIME_ID_1 })
      ],
      relationClaims: [
        relationClaim({ id: RELATION_ID_1, timeHintId: TIME_ID_2 }),
        relationClaim({ id: RELATION_ID_2, timeHintId: TIME_ID_1 })
      ],
      timeClaims: [
        timeClaim({ id: TIME_ID_2, normalizedLabel: "更早", relativeOrderWeight: 100, chapterRangeStart: 1, chapterRangeEnd: 2 }),
        timeClaim({ id: TIME_ID_1, normalizedLabel: "更晚", relativeOrderWeight: 200, chapterRangeStart: 3, chapterRangeEnd: 4 })
      ]
    });

    expect(rows).toEqual([
      {
        bookId            : BOOK_ID_1,
        personaId         : PERSONA_ID_1,
        timeLabel         : "更早",
        timeSortKey       : 100,
        chapterRangeStart : 1,
        chapterRangeEnd   : 2,
        eventCount        : 1,
        relationCount     : 1,
        sourceTimeClaimIds: [TIME_ID_2]
      },
      {
        bookId            : BOOK_ID_1,
        personaId         : PERSONA_ID_1,
        timeLabel         : "更晚",
        timeSortKey       : 200,
        chapterRangeStart : 3,
        chapterRangeEnd   : 4,
        eventCount        : 1,
        relationCount     : 1,
        sourceTimeClaimIds: [TIME_ID_1]
      },
      {
        bookId            : BOOK_ID_1,
        personaId         : PERSONA_ID_2,
        timeLabel         : "更早",
        timeSortKey       : 100,
        chapterRangeStart : 1,
        chapterRangeEnd   : 2,
        eventCount        : 0,
        relationCount     : 1,
        sourceTimeClaimIds: [TIME_ID_2]
      },
      {
        bookId            : BOOK_ID_1,
        personaId         : PERSONA_ID_2,
        timeLabel         : "更晚",
        timeSortKey       : 200,
        chapterRangeStart : 3,
        chapterRangeEnd   : 4,
        eventCount        : 0,
        relationCount     : 1,
        sourceTimeClaimIds: [TIME_ID_1]
      }
    ]);
  });

  it("does not merge different tuples when normalizedLabel contains pipe characters", () => {
    const bookA = "book-A";
    const bookB = "book-A|persona-A";
    const personaA = "persona-A";
    const personaB = "label-A";
    const labelA = "label-A|label-B";
    const labelB = "label-B";
    const timeIdA = "time-A";
    const timeIdB = "time-B";

    const rows = buildPersonaTimeFacts({
      personaIdByCandidateId: new Map<string, string>([
        [CANDIDATE_ID_1, personaA],
        [CANDIDATE_ID_2, personaB]
      ]),
      eventClaims: [
        eventClaim({
          id                       : EVENT_ID_1,
          bookId                   : bookA,
          subjectPersonaCandidateId: CANDIDATE_ID_1,
          timeHintId               : timeIdA
        }),
        eventClaim({
          id                       : EVENT_ID_2,
          bookId                   : bookB,
          subjectPersonaCandidateId: CANDIDATE_ID_2,
          timeHintId               : timeIdB
        })
      ],
      relationClaims: [],
      timeClaims    : [
        timeClaim({
          id                 : timeIdA,
          bookId             : bookA,
          normalizedLabel    : labelA,
          relativeOrderWeight: 1,
          chapterRangeStart  : 2,
          chapterRangeEnd    : 3
        }),
        timeClaim({
          id                 : timeIdB,
          bookId             : bookB,
          normalizedLabel    : labelB,
          relativeOrderWeight: 1,
          chapterRangeStart  : 2,
          chapterRangeEnd    : 3
        })
      ]
    });

    expect(rows).toEqual([
      {
        bookId            : bookA,
        personaId         : personaA,
        timeLabel         : labelA,
        timeSortKey       : 1,
        chapterRangeStart : 2,
        chapterRangeEnd   : 3,
        eventCount        : 1,
        relationCount     : 0,
        sourceTimeClaimIds: [timeIdA]
      },
      {
        bookId            : bookB,
        personaId         : personaB,
        timeLabel         : labelB,
        timeSortKey       : 1,
        chapterRangeStart : 2,
        chapterRangeEnd   : 3,
        eventCount        : 1,
        relationCount     : 0,
        sourceTimeClaimIds: [timeIdB]
      }
    ]);
  });

  it("skips event and relation claims when accepted timeHint points to a different book", () => {
    const rows = buildPersonaTimeFacts({
      personaIdByCandidateId: new Map<string, string>([
        [CANDIDATE_ID_1, PERSONA_ID_1],
        [CANDIDATE_ID_2, PERSONA_ID_2]
      ]),
      eventClaims: [
        eventClaim({
          id        : EVENT_ID_1,
          bookId    : BOOK_ID_1,
          timeHintId: TIME_ID_2
        })
      ],
      relationClaims: [
        relationClaim({
          id        : RELATION_ID_1,
          bookId    : BOOK_ID_1,
          timeHintId: TIME_ID_2
        })
      ],
      timeClaims: [
        timeClaim({
          id    : TIME_ID_2,
          bookId: BOOK_ID_2
        })
      ]
    });

    expect(rows).toEqual([]);
  });
});

describe("buildTimelineEvents", () => {
  it("builds accepted timeline events with chapter, time, label and source claim id", () => {
    const rows = buildTimelineEvents({
      personaIdByCandidateId: new Map<string, string>([[CANDIDATE_ID_1, PERSONA_ID_1]]),
      eventClaims           : [
        eventClaim({ id: EVENT_ID_1 }),
        eventClaim({ id: EVENT_ID_2, reviewState: "EDITED" }),
        eventClaim({ id: EVENT_ID_3, timeHintId: TIME_ID_REJECTED }),
        eventClaim({ id: EVENT_ID_4, timeHintId: TIME_ID_PENDING }),
        eventClaim({ id: EVENT_ID_5, objectText: "   " })
      ],
      timeClaims: [
        timeClaim(),
        timeClaim({ id: TIME_ID_REJECTED, reviewState: "REJECTED" }),
        timeClaim({ id: TIME_ID_PENDING, reviewState: "PENDING" })
      ]
    });

    expect(rows).toEqual([
      {
        bookId        : BOOK_ID_1,
        personaId     : PERSONA_ID_1,
        chapterId     : CHAPTER_ID_1,
        chapterNo     : 43,
        timeLabel     : "赤壁之战前",
        eventLabel    : "舌战",
        narrativeLens : "SELF",
        sourceClaimIds: [EVENT_ID_5]
      },
      {
        bookId        : BOOK_ID_1,
        personaId     : PERSONA_ID_1,
        chapterId     : CHAPTER_ID_1,
        chapterNo     : 43,
        timeLabel     : "赤壁之战前",
        eventLabel    : "舌战：群儒",
        narrativeLens : "SELF",
        sourceClaimIds: [EVENT_ID_1]
      }
    ]);
  });

  it("sorts timeline rows by book persona time chapter label and source claim id", () => {
    const rows = buildTimelineEvents({
      personaIdByCandidateId: new Map<string, string>([
        [CANDIDATE_ID_1, PERSONA_ID_1],
        [CANDIDATE_ID_2, PERSONA_ID_2]
      ]),
      eventClaims: [
        eventClaim({ id: EVENT_ID_3, chapterId: CHAPTER_ID_2, subjectPersonaCandidateId: CANDIDATE_ID_2, timeHintId: TIME_ID_2, predicate: "B", objectText: "1" }),
        eventClaim({ id: EVENT_ID_2, chapterId: CHAPTER_ID_1, subjectPersonaCandidateId: CANDIDATE_ID_2, timeHintId: TIME_ID_2, predicate: "A", objectText: "1" }),
        eventClaim({ id: EVENT_ID_1, chapterId: CHAPTER_ID_1, subjectPersonaCandidateId: CANDIDATE_ID_1, timeHintId: TIME_ID_1, predicate: "A", objectText: "2" }),
        eventClaim({ id: EVENT_ID_4, chapterId: CHAPTER_ID_1, subjectPersonaCandidateId: CANDIDATE_ID_1, timeHintId: TIME_ID_1, predicate: "A", objectText: "2", bookId: BOOK_ID_2 })
      ],
      timeClaims: [
        timeClaim({ id: TIME_ID_1, normalizedLabel: "T1", relativeOrderWeight: 1, chapterRangeStart: 1 }),
        timeClaim({ id: TIME_ID_2, normalizedLabel: "T2", relativeOrderWeight: 2, chapterRangeStart: 2 })
      ]
    });

    expect(rows.map((row) => row.sourceClaimIds[0])).toEqual([
      EVENT_ID_1,
      EVENT_ID_2,
      EVENT_ID_3
    ]);
  });

  it("skips timeline events when accepted timeHint points to a different book", () => {
    const rows = buildTimelineEvents({
      personaIdByCandidateId: new Map<string, string>([[CANDIDATE_ID_1, PERSONA_ID_1]]),
      eventClaims           : [
        eventClaim({
          id        : EVENT_ID_1,
          bookId    : BOOK_ID_1,
          timeHintId: TIME_ID_2
        })
      ],
      timeClaims: [
        timeClaim({
          id    : TIME_ID_2,
          bookId: BOOK_ID_2
        })
      ]
    });

    expect(rows).toEqual([]);
  });
});
