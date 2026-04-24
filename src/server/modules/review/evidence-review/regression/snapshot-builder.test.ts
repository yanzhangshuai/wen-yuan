import { describe, expect, it } from "vitest";

import {
  buildCurrentReviewRegressionSnapshot,
  buildRunScopedReviewRegressionSnapshot
} from "./snapshot-builder";
import type {
  ReviewRegressionCurrentRows,
  ReviewRegressionRunScopedRows,
  ReviewRegressionSnapshotFixtureContext
} from "./snapshot-repository";
import type { ReviewRegressionFixture } from "./contracts";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";
const CHAPTER_ID = "22222222-2222-4222-8222-222222222222";
const EVENT_ID = "33333333-3333-4333-8333-333333333333";
const RELATION_ID = "34343434-3434-4343-8343-343434343434";
const RELATION_ID_2 = "34444444-3444-4344-8344-344444444444";
const TIME_ID = "35353535-3535-4353-8353-353535353535";
const EVIDENCE_ID = "44444444-4444-4444-8444-444444444444";
const CANDIDATE_ID_1 = "55555555-5555-4555-8555-555555555555";
const CANDIDATE_ID_2 = "56565656-5656-4565-8565-565656565656";
const PERSONA_ID_1 = "66666666-6666-4666-8666-666666666666";
const PERSONA_ID_2 = "67676767-6767-4676-8676-676767676767";
const RUN_ID = "77777777-7777-4777-8777-777777777777";
const UPDATED_AT = new Date("2026-04-22T10:00:00.000Z");

const fixture: ReviewRegressionFixture = {
  fixtureKey   : "rulin-waishi",
  bookTitle    : "儒林外史",
  chapterRange : { startNo: 1, endNo: 1 },
  personas     : [],
  chapterFacts : [],
  relations    : [],
  timeFacts    : [],
  reviewActions: [],
  rerunSamples : []
};

const context: ReviewRegressionSnapshotFixtureContext = {
  fixture,
  book    : { id: BOOK_ID, title: "儒林外史" },
  chapters: [{ id: CHAPTER_ID, bookId: BOOK_ID, no: 1, title: "第一回", content: "第一回正文" }]
};

function currentRows(): ReviewRegressionCurrentRows {
  return {
    personas: [
      { id: PERSONA_ID_2, name: "周进", aliases: ["周先生"] },
      { id: PERSONA_ID_1, name: "范进", aliases: ["范生"] }
    ],
    personaAliases: [
      { personaId: PERSONA_ID_1, aliasText: "范举人" },
      { personaId: PERSONA_ID_2, aliasText: "周学道" }
    ],
    identityResolutionClaims: [identityClaim()],
    eventClaims             : [eventClaim()],
    relationClaims          : [relationClaim()],
    timeClaims              : [timeClaim()],
    conflictFlags           : [],
    personaChapterFacts     : [
      {
        bookId            : BOOK_ID,
        personaId         : PERSONA_ID_1,
        chapterId         : CHAPTER_ID,
        chapterNo         : 1,
        eventCount        : 1,
        relationCount     : 0,
        conflictCount     : 0,
        reviewStateSummary: { EVENT: { ACCEPTED: 1 } },
        latestUpdatedAt   : UPDATED_AT
      }
    ],
    personaTimeFacts: [
      {
        bookId            : BOOK_ID,
        personaId         : PERSONA_ID_1,
        timeLabel         : "第一回",
        timeSortKey       : 1,
        chapterRangeStart : 1,
        chapterRangeEnd   : 1,
        eventCount        : 1,
        relationCount     : 0,
        sourceTimeClaimIds: [TIME_ID]
      }
    ],
    relationshipEdges: [
      {
        bookId               : BOOK_ID,
        sourcePersonaId      : PERSONA_ID_1,
        targetPersonaId      : PERSONA_ID_2,
        relationTypeKey      : "mentor.custom",
        relationLabel        : "师生",
        relationTypeSource   : "CUSTOM",
        direction            : "FORWARD",
        effectiveChapterStart: 1,
        effectiveChapterEnd  : 1,
        sourceClaimIds       : [RELATION_ID],
        latestClaimId        : RELATION_ID
      }
    ],
    timelineEvents: [
      {
        bookId        : BOOK_ID,
        personaId     : PERSONA_ID_1,
        chapterId     : CHAPTER_ID,
        chapterNo     : 1,
        timeLabel     : "第一回",
        eventLabel    : "中举",
        narrativeLens : "SELF",
        sourceClaimIds: [EVENT_ID]
      }
    ],
    evidenceSpans  : [evidenceSpan()],
    chapterSegments: []
  };
}

function runScopedRows(): ReviewRegressionRunScopedRows {
  return {
    personas                : currentRows().personas,
    personaAliases          : currentRows().personaAliases,
    identityResolutionClaims: [
      identityClaim({
        id                : "identity-1",
        personaCandidateId: CANDIDATE_ID_1,
        resolvedPersonaId : PERSONA_ID_1
      }),
      identityClaim({
        id                : "identity-2",
        personaCandidateId: CANDIDATE_ID_2,
        resolvedPersonaId : PERSONA_ID_2
      })
    ],
    eventClaims    : [eventClaim()],
    relationClaims : [relationClaim()],
    timeClaims     : [timeClaim()],
    conflictFlags  : [],
    evidenceSpans  : [evidenceSpan()],
    chapterSegments: []
  };
}

function identityClaim(overrides: Partial<ReviewRegressionRunScopedRows["identityResolutionClaims"][number]> = {}) {
  return {
    id                : "identity-1",
    bookId            : BOOK_ID,
    chapterId         : CHAPTER_ID,
    mentionId         : "mention-1",
    personaCandidateId: CANDIDATE_ID_1,
    resolvedPersonaId : PERSONA_ID_1,
    resolutionKind    : "MATCH_EXISTING",
    reviewState       : "ACCEPTED",
    source            : "AI",
    runId             : RUN_ID,
    createdAt         : UPDATED_AT,
    updatedAt         : UPDATED_AT,
    ...overrides
  } satisfies ReviewRegressionRunScopedRows["identityResolutionClaims"][number];
}

function eventClaim(overrides: Partial<ReviewRegressionRunScopedRows["eventClaims"][number]> = {}) {
  return {
    id                       : EVENT_ID,
    bookId                   : BOOK_ID,
    chapterId                : CHAPTER_ID,
    subjectPersonaCandidateId: CANDIDATE_ID_1,
    objectPersonaCandidateId : null,
    predicate                : "中举",
    objectText               : null,
    locationText             : null,
    timeHintId               : TIME_ID,
    eventCategory            : "EVENT",
    narrativeLens            : "SELF",
    evidenceSpanIds          : [EVIDENCE_ID],
    confidence               : 0.9,
    reviewState              : "ACCEPTED",
    source                   : "AI",
    runId                    : RUN_ID,
    createdAt                : UPDATED_AT,
    updatedAt                : UPDATED_AT,
    ...overrides
  } satisfies ReviewRegressionRunScopedRows["eventClaims"][number];
}

function relationClaim(overrides: Partial<ReviewRegressionRunScopedRows["relationClaims"][number]> = {}) {
  return {
    id                      : RELATION_ID,
    bookId                  : BOOK_ID,
    chapterId               : CHAPTER_ID,
    sourcePersonaCandidateId: CANDIDATE_ID_1,
    targetPersonaCandidateId: CANDIDATE_ID_2,
    relationTypeKey         : "mentor.custom",
    relationLabel           : "师生",
    relationTypeSource      : "CUSTOM",
    direction               : "FORWARD",
    effectiveChapterStart   : 1,
    effectiveChapterEnd     : 1,
    timeHintId              : TIME_ID,
    evidenceSpanIds         : [EVIDENCE_ID],
    confidence              : 0.8,
    reviewState             : "ACCEPTED",
    source                  : "AI",
    runId                   : RUN_ID,
    createdAt               : UPDATED_AT,
    updatedAt               : UPDATED_AT,
    ...overrides
  } satisfies ReviewRegressionRunScopedRows["relationClaims"][number];
}

function timeClaim(overrides: Partial<ReviewRegressionRunScopedRows["timeClaims"][number]> = {}) {
  return {
    id                 : TIME_ID,
    bookId             : BOOK_ID,
    chapterId          : CHAPTER_ID,
    rawTimeText        : "第一回",
    timeType           : "CHAPTER_ORDER",
    normalizedLabel    : "第一回",
    relativeOrderWeight: 1,
    chapterRangeStart  : 1,
    chapterRangeEnd    : 1,
    evidenceSpanIds    : [EVIDENCE_ID],
    confidence         : 0.7,
    reviewState        : "ACCEPTED",
    source             : "AI",
    runId              : RUN_ID,
    createdAt          : UPDATED_AT,
    updatedAt          : UPDATED_AT,
    ...overrides
  } satisfies ReviewRegressionRunScopedRows["timeClaims"][number];
}

function evidenceSpan(): ReviewRegressionRunScopedRows["evidenceSpans"][number] {
  return {
    id                 : EVIDENCE_ID,
    bookId             : BOOK_ID,
    chapterId          : CHAPTER_ID,
    segmentId          : "segment-1",
    startOffset        : 0,
    endOffset          : 4,
    quotedText         : "范进中举",
    normalizedText     : "范进中举",
    speakerHint        : null,
    narrativeRegionType: "NARRATION",
    createdAt          : UPDATED_AT
  };
}

describe("buildCurrentReviewRegressionSnapshot", () => {
  it("builds a canonical current review snapshot with natural keys, evidence snippets, and no DB ids", () => {
    const snapshot = buildCurrentReviewRegressionSnapshot(context, currentRows());

    expect(snapshot).toEqual({
      fixtureKey  : "rulin-waishi",
      bookTitle   : "儒林外史",
      chapterRange: { startNo: 1, endNo: 1 },
      personas    : [
        { personaName: "范进", aliases: ["范举人", "范生"] },
        { personaName: "周进", aliases: ["周先生", "周学道"] }
      ],
      chapterFacts: [
        { personaName: "范进", chapterNo: 1, factLabel: "中举", evidenceSnippets: ["范进中举"] }
      ],
      relations: [
        {
          sourcePersonaName    : "范进",
          targetPersonaName    : "周进",
          relationTypeKey      : "mentor.custom",
          direction            : "FORWARD",
          effectiveChapterStart: 1,
          effectiveChapterEnd  : 1,
          evidenceSnippets     : ["范进中举"]
        }
      ],
      timeFacts: [
        {
          personaName      : "范进",
          normalizedLabel  : "第一回",
          timeSortKey      : 1,
          chapterRangeStart: 1,
          chapterRangeEnd  : 1,
          evidenceSnippets : ["范进中举"]
        }
      ]
    });
    expect(JSON.stringify(snapshot)).not.toContain(PERSONA_ID_1);
  });

  it("sorts relations by the full natural key including effective chapter window", () => {
    const rows = currentRows();
    rows.relationClaims = [
      relationClaim({
        id                   : RELATION_ID_2,
        effectiveChapterStart: 2,
        effectiveChapterEnd  : 3
      }),
      relationClaim({
        id                   : RELATION_ID,
        effectiveChapterStart: 1,
        effectiveChapterEnd  : 1
      })
    ];
    rows.relationshipEdges = [
      {
        bookId               : BOOK_ID,
        sourcePersonaId      : PERSONA_ID_1,
        targetPersonaId      : PERSONA_ID_2,
        relationTypeKey      : "mentor.custom",
        relationLabel        : "师生",
        relationTypeSource   : "CUSTOM",
        direction            : "FORWARD",
        effectiveChapterStart: 2,
        effectiveChapterEnd  : 3,
        sourceClaimIds       : [RELATION_ID_2],
        latestClaimId        : RELATION_ID_2
      },
      {
        bookId               : BOOK_ID,
        sourcePersonaId      : PERSONA_ID_1,
        targetPersonaId      : PERSONA_ID_2,
        relationTypeKey      : "mentor.custom",
        relationLabel        : "师生",
        relationTypeSource   : "CUSTOM",
        direction            : "FORWARD",
        effectiveChapterStart: 1,
        effectiveChapterEnd  : 1,
        sourceClaimIds       : [RELATION_ID],
        latestClaimId        : RELATION_ID
      }
    ];

    const snapshot = buildCurrentReviewRegressionSnapshot(context, rows);

    expect(snapshot.relations.map((relation) => ({
      start: relation.effectiveChapterStart,
      end  : relation.effectiveChapterEnd
    }))).toEqual([
      { start: 1, end: 1 },
      { start: 2, end: 3 }
    ]);
  });
});

describe("buildRunScopedReviewRegressionSnapshot", () => {
  it("rebuilds a canonical run snapshot through projection helpers and keeps relationTypeKey unchanged", () => {
    const snapshot = buildRunScopedReviewRegressionSnapshot(context, runScopedRows());

    expect(snapshot.personas.map((persona) => persona.personaName)).toEqual(["范进", "周进"]);
    expect(snapshot.chapterFacts).toEqual([
      { personaName: "范进", chapterNo: 1, factLabel: "中举", evidenceSnippets: ["范进中举"] }
    ]);
    expect(snapshot.relations[0]?.relationTypeKey).toBe("mentor.custom");
    expect(snapshot.timeFacts[0]).toEqual({
      personaName      : "范进",
      normalizedLabel  : "第一回",
      timeSortKey      : 1,
      chapterRangeStart: 1,
      chapterRangeEnd  : 1,
      evidenceSnippets : ["范进中举"]
    });
  });
});
