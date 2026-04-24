import { describe, expect, it, vi } from "vitest";

import {
  createReviewRegressionSnapshotRepository,
  type ReviewRegressionSnapshotPrismaClient
} from "./snapshot-repository";
import type { ReviewRegressionFixture } from "./contracts";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";
const CHAPTER_ID_1 = "22222222-2222-4222-8222-222222222222";
const CHAPTER_ID_2 = "23232323-2323-4232-8232-232323232323";
const CHAPTER_ID_3 = "24242424-2424-4242-8242-242424242424";
const SEGMENT_ID = "33333333-3333-4333-8333-333333333333";
const EVIDENCE_ID_1 = "44444444-4444-4444-8444-444444444444";
const EVIDENCE_ID_2 = "45454545-4545-4454-8454-454545454545";
const EVENT_ID = "55555555-5555-4555-8555-555555555555";
const RELATION_ID = "56565656-5656-4565-8565-565656565656";
const TIME_ID = "57575757-5757-4575-8575-575757575757";
const CANDIDATE_ID_1 = "66666666-6666-4666-8666-666666666666";
const CANDIDATE_ID_2 = "67676767-6767-4676-8676-676767676767";
const CANDIDATE_ID_3 = "68686868-6868-4686-8686-686868686868";
const PERSONA_ID_1 = "77777777-7777-4777-8777-777777777777";
const PERSONA_ID_2 = "78787878-7878-4787-8787-787878787878";
const PERSONA_ID_3 = "79797979-7979-4797-8797-797979797979";
const RUN_ID = "88888888-8888-4888-8888-888888888888";

const fixture: ReviewRegressionFixture = {
  fixtureKey   : "rulin-waishi",
  bookTitle    : "儒林外史",
  chapterRange : { startNo: 1, endNo: 2 },
  personas     : [],
  chapterFacts : [],
  relations    : [],
  timeFacts    : [],
  reviewActions: [],
  rerunSamples : []
};

type TestRow = Record<string, unknown>;

type TestFindArgs = {
  where? : Record<string, unknown>;
  select?: Record<string, boolean>;
};

function createFindMany(rows: TestRow[]) {
  return vi.fn(async (args?: TestFindArgs) => {
    return rows.filter((row) => matchesWhere(row, args?.where)).map((row) => applySelect(row, args?.select));
  });
}

function createPrismaMock(seed: Record<string, TestRow[]> = {}) {
  const mock = {
    book                   : { findMany: createFindMany(seed.books ?? []) },
    chapter                : { findMany: createFindMany(seed.chapters ?? []) },
    persona                : { findMany: createFindMany(seed.personas ?? []) },
    personaAlias           : { findMany: createFindMany(seed.personaAliases ?? []) },
    identityResolutionClaim: { findMany: createFindMany(seed.identityResolutionClaims ?? []) },
    eventClaim             : { findMany: createFindMany(seed.eventClaims ?? []) },
    relationClaim          : { findMany: createFindMany(seed.relationClaims ?? []) },
    timeClaim              : { findMany: createFindMany(seed.timeClaims ?? []) },
    conflictFlag           : { findMany: createFindMany(seed.conflictFlags ?? []) },
    personaChapterFact     : { findMany: createFindMany(seed.personaChapterFacts ?? []) },
    personaTimeFact        : { findMany: createFindMany(seed.personaTimeFacts ?? []) },
    relationshipEdge       : { findMany: createFindMany(seed.relationshipEdges ?? []) },
    timelineEvent          : { findMany: createFindMany(seed.timelineEvents ?? []) },
    evidenceSpan           : { findMany: createFindMany(seed.evidenceSpans ?? []) },
    chapterSegment         : { findMany: createFindMany(seed.chapterSegments ?? []) }
  };

  return mock as unknown as ReviewRegressionSnapshotPrismaClient & typeof mock;
}

function applySelect(row: TestRow, select?: Record<string, boolean>): TestRow {
  if (select === undefined) return row;

  const selected: TestRow = {};
  for (const [field, enabled] of Object.entries(select)) {
    if (enabled) {
      selected[field] = row[field];
    }
  }
  return selected;
}

function matchesWhere(row: TestRow, where?: Record<string, unknown>): boolean {
  if (where === undefined) return true;

  for (const [field, expected] of Object.entries(where)) {
    if (expected === undefined) continue;
    if (!matchesCondition(row[field], expected)) return false;
  }

  return true;
}

function matchesCondition(value: unknown, expected: unknown): boolean {
  if (
    expected !== null &&
    typeof expected === "object" &&
    !Array.isArray(expected) &&
    !(expected instanceof Date)
  ) {
    const condition = expected as Record<string, unknown>;
    if ("in" in condition) {
      return Array.isArray(condition.in) && condition.in.includes(value);
    }
    if ("gte" in condition && typeof value === "number" && typeof condition.gte === "number") {
      if (value < condition.gte) return false;
    }
    if ("lte" in condition && typeof value === "number" && typeof condition.lte === "number") {
      if (value > condition.lte) return false;
    }
    return true;
  }

  return value === expected;
}

function baseSeed(): Record<string, TestRow[]> {
  const updatedAt = new Date("2026-04-22T10:00:00.000Z");

  return {
    books   : [{ id: BOOK_ID, title: "儒林外史", deletedAt: null }],
    chapters: [
      { id: CHAPTER_ID_2, bookId: BOOK_ID, no: 2, title: "第二回", content: "第二回正文" },
      { id: CHAPTER_ID_1, bookId: BOOK_ID, no: 1, title: "第一回", content: "第一回正文" }
    ],
    personas: [
      { id: PERSONA_ID_2, name: "周进", aliases: ["周先生"] },
      { id: PERSONA_ID_1, name: "范进", aliases: ["范举人"] }
    ],
    personaAliases: [
      { personaId: PERSONA_ID_1, aliasText: "范老爷" },
      { personaId: PERSONA_ID_2, aliasText: "周学道" }
    ],
    identityResolutionClaims: [
      {
        id                : "identity-1",
        bookId            : BOOK_ID,
        chapterId         : CHAPTER_ID_1,
        mentionId         : "mention-1",
        personaCandidateId: CANDIDATE_ID_1,
        resolvedPersonaId : PERSONA_ID_1,
        resolutionKind    : "MATCH_EXISTING",
        reviewState       : "ACCEPTED",
        source            : "AI",
        runId             : RUN_ID,
        createdAt         : updatedAt,
        updatedAt
      }
    ],
    eventClaims: [
      {
        id                       : EVENT_ID,
        bookId                   : BOOK_ID,
        chapterId                : CHAPTER_ID_1,
        subjectPersonaCandidateId: CANDIDATE_ID_1,
        objectPersonaCandidateId : null,
        predicate                : "中举",
        objectText               : null,
        locationText             : null,
        timeHintId               : TIME_ID,
        eventCategory            : "EVENT",
        narrativeLens            : "SELF",
        evidenceSpanIds          : [EVIDENCE_ID_1],
        confidence               : 0.9,
        reviewState              : "ACCEPTED",
        source                   : "AI",
        runId                    : RUN_ID,
        createdAt                : updatedAt,
        updatedAt
      }
    ],
    relationClaims: [
      {
        id                      : RELATION_ID,
        bookId                  : BOOK_ID,
        chapterId               : CHAPTER_ID_2,
        sourcePersonaCandidateId: CANDIDATE_ID_1,
        targetPersonaCandidateId: CANDIDATE_ID_2,
        relationTypeKey         : "mentor.custom",
        relationLabel           : "师生",
        relationTypeSource      : "CUSTOM",
        direction               : "FORWARD",
        effectiveChapterStart   : 1,
        effectiveChapterEnd     : 2,
        timeHintId              : TIME_ID,
        evidenceSpanIds         : [EVIDENCE_ID_2],
        confidence              : 0.8,
        reviewState             : "ACCEPTED",
        source                  : "AI",
        runId                   : RUN_ID,
        createdAt               : updatedAt,
        updatedAt
      }
    ],
    timeClaims: [
      {
        id                 : TIME_ID,
        bookId             : BOOK_ID,
        chapterId          : CHAPTER_ID_1,
        rawTimeText        : "后来",
        timeType           : "RELATIVE_PHASE",
        normalizedLabel    : "后来",
        relativeOrderWeight: 10,
        chapterRangeStart  : 1,
        chapterRangeEnd    : 2,
        evidenceSpanIds    : [EVIDENCE_ID_1],
        confidence         : 0.7,
        reviewState        : "ACCEPTED",
        source             : "AI",
        runId              : RUN_ID,
        createdAt          : updatedAt,
        updatedAt
      }
    ],
    conflictFlags      : [],
    personaChapterFacts: [
      {
        bookId            : BOOK_ID,
        personaId         : PERSONA_ID_1,
        chapterId         : CHAPTER_ID_1,
        chapterNo         : 1,
        eventCount        : 1,
        relationCount     : 0,
        conflictCount     : 0,
        reviewStateSummary: { EVENT: { ACCEPTED: 1 } },
        latestUpdatedAt   : updatedAt
      }
    ],
    personaTimeFacts: [
      {
        bookId            : BOOK_ID,
        personaId         : PERSONA_ID_1,
        timeLabel         : "后来",
        timeSortKey       : 10,
        chapterRangeStart : 1,
        chapterRangeEnd   : 2,
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
        effectiveChapterEnd  : 2,
        sourceClaimIds       : [RELATION_ID],
        latestClaimId        : RELATION_ID
      }
    ],
    timelineEvents: [
      {
        bookId        : BOOK_ID,
        personaId     : PERSONA_ID_1,
        chapterId     : CHAPTER_ID_1,
        chapterNo     : 1,
        timeLabel     : "后来",
        eventLabel    : "中举",
        narrativeLens : "SELF",
        sourceClaimIds: [EVENT_ID]
      }
    ],
    evidenceSpans: [
      {
        id                 : EVIDENCE_ID_2,
        bookId             : BOOK_ID,
        chapterId          : CHAPTER_ID_2,
        segmentId          : SEGMENT_ID,
        startOffset        : 20,
        endOffset          : 28,
        quotedText         : "周进提携范进",
        normalizedText     : "周进提携范进",
        speakerHint        : null,
        narrativeRegionType: "NARRATION",
        createdAt          : updatedAt
      },
      {
        id                 : EVIDENCE_ID_1,
        bookId             : BOOK_ID,
        chapterId          : CHAPTER_ID_1,
        segmentId          : SEGMENT_ID,
        startOffset        : 4,
        endOffset          : 8,
        quotedText         : "范进中举",
        normalizedText     : "范进中举",
        speakerHint        : null,
        narrativeRegionType: "NARRATION",
        createdAt          : updatedAt
      }
    ],
    chapterSegments: [
      {
        id            : SEGMENT_ID,
        bookId        : BOOK_ID,
        chapterId     : CHAPTER_ID_1,
        runId         : RUN_ID,
        segmentIndex  : 0,
        segmentType   : "NARRATION",
        startOffset   : 0,
        endOffset     : 20,
        text          : "范进中举",
        normalizedText: "范进中举",
        confidence    : 1,
        speakerHint   : null,
        createdAt     : updatedAt
      }
    ]
  };
}

describe("createReviewRegressionSnapshotRepository", () => {
  it("resolves fixture context by book title and chapter range with stable chapter ordering", async () => {
    const prisma = createPrismaMock(baseSeed());
    const repository = createReviewRegressionSnapshotRepository(prisma);

    const context = await repository.resolveFixtureContext(fixture);

    expect(context.book).toEqual({ id: BOOK_ID, title: "儒林外史" });
    expect(context.chapters.map((chapter) => chapter.no)).toEqual([1, 2]);
    expect(prisma.book.findMany.mock.calls[0]?.[0]).toEqual({
      where  : { title: fixture.bookTitle, deletedAt: null },
      select : { id: true, title: true },
      orderBy: [{ id: "asc" }]
    });
    expect(prisma.chapter.findMany.mock.calls[0]?.[0]).toEqual({
      where  : { bookId: BOOK_ID, no: { gte: 1, lte: 2 } },
      select : { id: true, bookId: true, no: true, title: true, content: true },
      orderBy: [{ no: "asc" }, { id: "asc" }]
    });
  });

  it("fails loudly when the fixture book title matches multiple non-deleted books", async () => {
    const seed = baseSeed();
    seed.books = [
      { id: BOOK_ID, title: "儒林外史", deletedAt: null },
      { id: PERSONA_ID_1, title: "儒林外史", deletedAt: null }
    ];
    const repository = createReviewRegressionSnapshotRepository(createPrismaMock(seed));

    await expect(repository.resolveFixtureContext(fixture)).rejects.toThrow(
      "Ambiguous book title for review regression fixture rulin-waishi: 儒林外史 (matched 2 books)"
    );
  });

  it("resolves a duplicated book title when the fixture also provides a unique author", async () => {
    const seed = baseSeed();
    seed.books = [
      { id: BOOK_ID, title: "儒林外史", author: "吴敬梓", deletedAt: null },
      { id: PERSONA_ID_1, title: "儒林外史", author: null, deletedAt: null }
    ];
    const repository = createReviewRegressionSnapshotRepository(createPrismaMock(seed));

    const context = await repository.resolveFixtureContext({
      ...fixture,
      bookAuthor: "吴敬梓"
    });

    expect(context.book).toEqual({ id: BOOK_ID, title: "儒林外史" });
  });

  it("fails loudly when any fixture chapter is missing", async () => {
    const seed = baseSeed();
    seed.chapters = [{ id: CHAPTER_ID_1, bookId: BOOK_ID, no: 1, title: "第一回", content: "第一回正文" }];
    const repository = createReviewRegressionSnapshotRepository(createPrismaMock(seed));

    await expect(repository.resolveFixtureContext(fixture)).rejects.toThrow(
      "Missing chapters for review regression fixture rulin-waishi: 2"
    );
  });

  it("loads accepted current review rows, projection rows, evidence spans, and segments with deterministic sorting", async () => {
    const repository = createReviewRegressionSnapshotRepository(createPrismaMock(baseSeed()));
    const context = await repository.resolveFixtureContext(fixture);

    const rows = await repository.loadCurrentReviewRows(context);

    expect(rows.eventClaims.map((claim) => claim.id)).toEqual([EVENT_ID]);
    expect(rows.relationClaims.map((claim) => claim.id)).toEqual([RELATION_ID]);
    expect(rows.timeClaims.map((claim) => claim.id)).toEqual([TIME_ID]);
    expect(rows.personaChapterFacts.map((row) => row.chapterNo)).toEqual([1]);
    expect(rows.evidenceSpans.map((span) => span.quotedText)).toEqual(["范进中举", "周进提携范进"]);
    expect(rows.chapterSegments.map((segment) => segment.segmentIndex)).toEqual([0]);
  });

  it("scopes current review rows to the fixture chapter range instead of leaking whole-book current truth", async () => {
    const seed = baseSeed();
    seed.personas?.push({ id: PERSONA_ID_3, name: "严贡生", aliases: ["严老爷"] });
    seed.personaAliases?.push({ personaId: PERSONA_ID_3, aliasText: "严监生" });
    seed.identityResolutionClaims?.push({
      id                : "identity-out-of-range",
      bookId            : BOOK_ID,
      chapterId         : CHAPTER_ID_3,
      mentionId         : "mention-3",
      personaCandidateId: CANDIDATE_ID_3,
      resolvedPersonaId : PERSONA_ID_3,
      resolutionKind    : "MATCH_EXISTING",
      reviewState       : "ACCEPTED",
      source            : "AI",
      runId             : RUN_ID,
      createdAt         : new Date("2026-04-22T10:05:00.000Z"),
      updatedAt         : new Date("2026-04-22T10:05:00.000Z")
    });
    seed.personaTimeFacts?.push({
      bookId            : BOOK_ID,
      personaId         : PERSONA_ID_3,
      timeLabel         : "第三回",
      timeSortKey       : 30,
      chapterRangeStart : 3,
      chapterRangeEnd   : 3,
      eventCount        : 1,
      relationCount     : 0,
      sourceTimeClaimIds: ["time-out-of-range"]
    });
    seed.relationshipEdges?.push({
      bookId               : BOOK_ID,
      sourcePersonaId      : PERSONA_ID_3,
      targetPersonaId      : PERSONA_ID_1,
      relationTypeKey      : "rival.custom",
      relationLabel        : "对立",
      relationTypeSource   : "CUSTOM",
      direction            : "FORWARD",
      effectiveChapterStart: 3,
      effectiveChapterEnd  : 3,
      sourceClaimIds       : ["relation-out-of-range"],
      latestClaimId        : "relation-out-of-range"
    });

    const repository = createReviewRegressionSnapshotRepository(createPrismaMock(seed));
    const context = await repository.resolveFixtureContext(fixture);

    const rows = await repository.loadCurrentReviewRows(context);

    expect(rows.identityResolutionClaims.map((claim) => claim.id)).toEqual(["identity-1"]);
    expect(rows.personaTimeFacts.map((row) => row.personaId)).toEqual([PERSONA_ID_1]);
    expect(rows.relationshipEdges.map((row) => row.relationTypeKey)).toEqual(["mentor.custom"]);
    expect(rows.personas.map((persona) => persona.id)).not.toContain(PERSONA_ID_3);
  });

  it("loads run-scoped claim rows by runId without reading current projection tables", async () => {
    const prisma = createPrismaMock(baseSeed());
    const repository = createReviewRegressionSnapshotRepository(prisma);
    const context = await repository.resolveFixtureContext(fixture);

    const rows = await repository.loadRunScopedClaimRows(context, RUN_ID);

    expect(rows.eventClaims).toHaveLength(1);
    expect(rows.relationClaims).toHaveLength(1);
    expect(rows.timeClaims).toHaveLength(1);
    expect(prisma.eventClaim.findMany.mock.calls[0]?.[0]).toEqual(expect.objectContaining({
      where: { bookId: BOOK_ID, runId: RUN_ID, chapterId: { in: [CHAPTER_ID_1, CHAPTER_ID_2] } }
    }));
    expect(prisma.personaChapterFact.findMany.mock.calls).toHaveLength(0);
    expect(prisma.relationshipEdge.findMany.mock.calls).toHaveLength(0);
  });
});
