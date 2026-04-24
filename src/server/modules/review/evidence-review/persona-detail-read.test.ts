import { describe, expect, it, vi } from "vitest";

import {
  NarrativeLens,
  ProcessingStatus,
  RecordSource,
  RelationDirection,
  RelationTypeSource,
  TimeType
} from "@/generated/prisma/enums";
import { PersonaNotFoundError } from "@/server/modules/personas/errors";
import {
  createReviewPersonaDetailService,
  toLegacyPersonaDetail
} from "@/server/modules/review/evidence-review/persona-detail-read";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";
const CHAPTER_ID_1 = "22222222-2222-4222-8222-222222222222";
const CHAPTER_ID_2 = "23232323-2323-4232-8232-232323232323";
const CHAPTER_ID_3 = "24242424-2424-4242-8242-242424242424";
const PERSONA_ID = "33333333-3333-4333-8333-333333333333";
const COUNTERPART_ID_1 = "34343434-3434-4343-8343-343434343434";
const COUNTERPART_ID_2 = "35353535-3535-4353-8353-353535353535";
const COUNTERPART_ID_3 = "36363636-3636-4363-8363-363636363636";
const EVENT_CLAIM_ID_1 = "37373737-3737-4373-8373-373737373737";
const EVENT_CLAIM_ID_2 = "38383838-3838-4383-8383-383838383838";
const TIME_CLAIM_ID_1 = "39393939-3939-4393-8393-393939393939";
const TIME_CLAIM_ID_2 = "3a3a3a3a-3a3a-43a3-83a3-3a3a3a3a3a3a";
const RELATION_CLAIM_ID_1 = "3b3b3b3b-3b3b-43b3-83b3-3b3b3b3b3b3b";
const RELATION_CLAIM_ID_2 = "3c3c3c3c-3c3c-43c3-83c3-3c3c3c3c3c3c";
const RELATION_CLAIM_ID_3 = "3d3d3d3d-3d3d-43d3-83d3-3d3d3d3d3d3d";
const EVIDENCE_ID_1 = "44444444-4444-4444-8444-444444444444";
const EVIDENCE_ID_2 = "45454545-4545-4454-8454-454545454545";
const EVIDENCE_ID_3 = "46464646-4646-4464-8464-464646464646";
const EVIDENCE_ID_4 = "47474747-4747-4474-8474-474747474747";
const EVIDENCE_ID_5 = "48484848-4848-4484-8484-484848484848";
const EVIDENCE_ID_6 = "49494949-4949-4494-8494-494949494949";
const CANDIDATE_ID_1 = "4a4a4a4a-4a4a-44a4-84a4-4a4a4a4a4a4a";
const CANDIDATE_ID_2 = "4b4b4b4b-4b4b-44b4-84b4-4b4b4b4b4b4b";

type TestRow = Record<string, unknown>;

function serializeComparable(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return JSON.stringify(value) ?? Object.prototype.toString.call(value);
}

function compareNullable(left: unknown, right: unknown): number {
  if (left === right) return 0;
  if (left === null || left === undefined) return -1;
  if (right === null || right === undefined) return 1;
  if (left instanceof Date && right instanceof Date) {
    return left.getTime() - right.getTime();
  }
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }
  if (typeof left === "string" && typeof right === "string") {
    return left.localeCompare(right);
  }

  return serializeComparable(left).localeCompare(serializeComparable(right));
}

function matchesWhere(row: TestRow, where?: Record<string, unknown>): boolean {
  if (!where) return true;

  for (const [key, value] of Object.entries(where)) {
    if (value === undefined) {
      continue;
    }

    if (key === "AND") {
      const conditions = value as Record<string, unknown>[];
      if (!conditions.every((condition) => matchesWhere(row, condition))) {
        return false;
      }
      continue;
    }

    if (key === "OR") {
      const conditions = value as Record<string, unknown>[];
      if (!conditions.some((condition) => matchesWhere(row, condition))) {
        return false;
      }
      continue;
    }

    const fieldValue = row[key];
    if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      !(value instanceof Date)
    ) {
      const condition = value as Record<string, unknown>;

      if ("in" in condition) {
        if (!(condition.in as unknown[]).includes(fieldValue)) {
          return false;
        }
        continue;
      }

      if ("not" in condition) {
        if (fieldValue === condition.not) {
          return false;
        }
        continue;
      }
    }

    if (fieldValue !== value) {
      return false;
    }
  }

  return true;
}

function applyOrderBy(rows: TestRow[], orderBy: unknown): TestRow[] {
  const orders = Array.isArray(orderBy)
    ? orderBy as Record<string, "asc" | "desc">[]
    : orderBy
      ? [orderBy as Record<string, "asc" | "desc">]
      : [];

  if (orders.length === 0) {
    return rows;
  }

  return [...rows].sort((left, right) => {
    for (const order of orders) {
      for (const [field, direction] of Object.entries(order)) {
        const compared = compareNullable(left[field], right[field]);
        if (compared !== 0) {
          return direction === "asc" ? compared : -compared;
        }
      }
    }

    return 0;
  });
}

function createFindMany(rows: TestRow[]): ReturnType<typeof vi.fn> {
  return vi.fn(async (args?: { where?: Record<string, unknown>; orderBy?: unknown }) => {
    const filtered = rows.filter((row) => matchesWhere(row, args?.where));
    return applyOrderBy(filtered, args?.orderBy);
  });
}

function createFindFirst(rows: TestRow[]): ReturnType<typeof vi.fn> {
  return vi.fn(async (args?: { where?: Record<string, unknown> }) => {
    return rows.find((row) => matchesWhere(row, args?.where)) ?? null;
  });
}

function createPrismaMock(seed: {
  books?                   : TestRow[];
  chapters?                : TestRow[];
  personas?                : TestRow[];
  identityResolutionClaims?: TestRow[];
  personaChapterFacts?     : TestRow[];
  personaTimeFacts?        : TestRow[];
  relationshipEdges?       : TestRow[];
  timelineEvents?          : TestRow[];
  eventClaims?             : TestRow[];
  relationClaims?          : TestRow[];
  timeClaims?              : TestRow[];
  evidenceSpans?           : TestRow[];
} = {}) {
  return {
    book                   : { findMany: createFindMany(seed.books ?? []) },
    chapter                : { findMany: createFindMany(seed.chapters ?? []) },
    persona                : { findFirst: createFindFirst(seed.personas ?? []), findMany: createFindMany(seed.personas ?? []) },
    identityResolutionClaim: { findMany: createFindMany(seed.identityResolutionClaims ?? []) },
    personaChapterFact     : { findMany: createFindMany(seed.personaChapterFacts ?? []) },
    personaTimeFact        : { findMany: createFindMany(seed.personaTimeFacts ?? []) },
    relationshipEdge       : { findMany: createFindMany(seed.relationshipEdges ?? []) },
    timelineEvent          : { findMany: createFindMany(seed.timelineEvents ?? []) },
    eventClaim             : { findMany: createFindMany(seed.eventClaims ?? []) },
    relationClaim          : { findMany: createFindMany(seed.relationClaims ?? []) },
    timeClaim              : { findMany: createFindMany(seed.timeClaims ?? []) },
    evidenceSpan           : { findMany: createFindMany(seed.evidenceSpans ?? []) }
  };
}

describe("createReviewPersonaDetailService", () => {
  it("throws PersonaNotFoundError when the persona does not exist", async () => {
    const service = createReviewPersonaDetailService(createPrismaMock() as never);

    await expect(service.getReviewPersonaDetail(PERSONA_ID)).rejects.toBeInstanceOf(PersonaNotFoundError);
  });

  it("returns stable projection-backed facts, time slices, and relations with evidence", async () => {
    const service = createReviewPersonaDetailService(createPrismaMock({
      books: [
        {
          id   : BOOK_ID,
          title: "三国演义"
        }
      ],
      chapters: [
        { id: CHAPTER_ID_1, bookId: BOOK_ID, no: 1, title: "孙策借兵" },
        { id: CHAPTER_ID_2, bookId: BOOK_ID, no: 2, title: "江东定策" },
        { id: CHAPTER_ID_3, bookId: BOOK_ID, no: 3, title: "赤壁大战" }
      ],
      personas: [
        {
          id          : PERSONA_ID,
          name        : "周瑜",
          aliases     : ["公瑾"],
          gender      : "男",
          hometown    : "庐江",
          nameType    : "NAMED",
          recordSource: RecordSource.AI,
          confidence  : 0.93,
          status      : "CONFIRMED",
          deletedAt   : null
        },
        { id: COUNTERPART_ID_1, name: "孙策" },
        { id: COUNTERPART_ID_2, name: "曹操" },
        { id: COUNTERPART_ID_3, name: "周泰" }
      ],
      identityResolutionClaims: [
        {
          bookId            : BOOK_ID,
          reviewState       : "ACCEPTED",
          resolvedPersonaId : PERSONA_ID,
          personaCandidateId: CANDIDATE_ID_1,
          createdAt         : new Date("2026-04-20T00:00:00.000Z")
        },
        {
          bookId            : BOOK_ID,
          reviewState       : "ACCEPTED",
          resolvedPersonaId : PERSONA_ID,
          personaCandidateId: CANDIDATE_ID_2,
          createdAt         : new Date("2026-04-21T00:00:00.000Z")
        }
      ],
      personaChapterFacts: [
        {
          id                : "chapter-fact-2",
          bookId            : BOOK_ID,
          personaId         : PERSONA_ID,
          chapterId         : CHAPTER_ID_3,
          chapterNo         : 3,
          eventCount        : 1,
          relationCount     : 2,
          conflictCount     : 0,
          reviewStateSummary: {},
          latestUpdatedAt   : new Date("2026-04-23T00:00:00.000Z")
        },
        {
          id                : "chapter-fact-1",
          bookId            : BOOK_ID,
          personaId         : PERSONA_ID,
          chapterId         : CHAPTER_ID_1,
          chapterNo         : 1,
          eventCount        : 1,
          relationCount     : 1,
          conflictCount     : 1,
          reviewStateSummary: {},
          latestUpdatedAt   : new Date("2026-04-22T00:00:00.000Z")
        }
      ],
      timelineEvents: [
        {
          id            : "timeline-2",
          bookId        : BOOK_ID,
          personaId     : PERSONA_ID,
          chapterId     : CHAPTER_ID_3,
          chapterNo     : 3,
          timeLabel     : "建安十三年冬",
          eventLabel    : "赤壁鏖兵",
          narrativeLens : NarrativeLens.HISTORICAL,
          sourceClaimIds: [EVENT_CLAIM_ID_2]
        },
        {
          id            : "timeline-1",
          bookId        : BOOK_ID,
          personaId     : PERSONA_ID,
          chapterId     : CHAPTER_ID_1,
          chapterNo     : 1,
          timeLabel     : null,
          eventLabel    : "结识孙策",
          narrativeLens : NarrativeLens.HISTORICAL,
          sourceClaimIds: [EVENT_CLAIM_ID_1]
        }
      ],
      eventClaims: [
        {
          id             : EVENT_CLAIM_ID_1,
          bookId         : BOOK_ID,
          chapterId      : CHAPTER_ID_1,
          eventCategory  : "SOCIAL",
          locationText   : "吴郡",
          evidenceSpanIds: [EVIDENCE_ID_1],
          reviewState    : "ACCEPTED",
          source         : "MANUAL",
          createdAt      : new Date("2026-04-20T00:00:00.000Z"),
          updatedAt      : new Date("2026-04-20T00:00:00.000Z")
        },
        {
          id             : EVENT_CLAIM_ID_2,
          bookId         : BOOK_ID,
          chapterId      : CHAPTER_ID_3,
          eventCategory  : "EVENT",
          locationText   : "赤壁",
          evidenceSpanIds: [EVIDENCE_ID_2],
          reviewState    : "ACCEPTED",
          source         : "AI",
          createdAt      : new Date("2026-04-21T00:00:00.000Z"),
          updatedAt      : new Date("2026-04-21T00:00:00.000Z")
        }
      ],
      personaTimeFacts: [
        {
          id                : "time-fact-2",
          bookId            : BOOK_ID,
          personaId         : PERSONA_ID,
          timeLabel         : "少年时",
          timeSortKey       : null,
          chapterRangeStart : 1,
          chapterRangeEnd   : 1,
          eventCount        : 1,
          relationCount     : 0,
          sourceTimeClaimIds: [TIME_CLAIM_ID_2]
        },
        {
          id                : "time-fact-1",
          bookId            : BOOK_ID,
          personaId         : PERSONA_ID,
          timeLabel         : "建安十三年冬",
          timeSortKey       : 13,
          chapterRangeStart : 3,
          chapterRangeEnd   : 3,
          eventCount        : 1,
          relationCount     : 2,
          sourceTimeClaimIds: [TIME_CLAIM_ID_1]
        }
      ],
      timeClaims: [
        {
          id                 : TIME_CLAIM_ID_1,
          bookId             : BOOK_ID,
          chapterId          : CHAPTER_ID_3,
          normalizedLabel    : "建安十三年冬",
          timeType           : TimeType.HISTORICAL_YEAR,
          relativeOrderWeight: 13,
          chapterRangeStart  : 3,
          chapterRangeEnd    : 3,
          evidenceSpanIds    : [EVIDENCE_ID_3],
          reviewState        : "ACCEPTED",
          source             : "AI",
          createdAt          : new Date("2026-04-21T00:00:00.000Z"),
          updatedAt          : new Date("2026-04-21T00:00:00.000Z")
        },
        {
          id                 : TIME_CLAIM_ID_2,
          bookId             : BOOK_ID,
          chapterId          : CHAPTER_ID_1,
          normalizedLabel    : "少年时",
          timeType           : TimeType.RELATIVE_PHASE,
          relativeOrderWeight: null,
          chapterRangeStart  : 1,
          chapterRangeEnd    : 1,
          evidenceSpanIds    : [EVIDENCE_ID_4],
          reviewState        : "ACCEPTED",
          source             : "AI",
          createdAt          : new Date("2026-04-20T00:00:00.000Z"),
          updatedAt          : new Date("2026-04-20T00:00:00.000Z")
        }
      ],
      relationshipEdges: [
        {
          id                   : "relation-edge-3",
          bookId               : BOOK_ID,
          sourcePersonaId      : PERSONA_ID,
          targetPersonaId      : COUNTERPART_ID_3,
          relationTypeKey      : "custom:alliance",
          relationLabel        : "",
          relationTypeSource   : RelationTypeSource.CUSTOM,
          direction            : RelationDirection.UNDIRECTED,
          effectiveChapterStart: null,
          effectiveChapterEnd  : null,
          sourceClaimIds       : [RELATION_CLAIM_ID_3],
          latestClaimId        : RELATION_CLAIM_ID_3
        },
        {
          id                   : "relation-edge-2",
          bookId               : BOOK_ID,
          sourcePersonaId      : COUNTERPART_ID_2,
          targetPersonaId      : PERSONA_ID,
          relationTypeKey      : "custom:rival",
          relationLabel        : "宿敌",
          relationTypeSource   : RelationTypeSource.CUSTOM,
          direction            : RelationDirection.BIDIRECTIONAL,
          effectiveChapterStart: 2,
          effectiveChapterEnd  : 3,
          sourceClaimIds       : [RELATION_CLAIM_ID_2],
          latestClaimId        : RELATION_CLAIM_ID_2
        },
        {
          id                   : "relation-edge-1",
          bookId               : BOOK_ID,
          sourcePersonaId      : PERSONA_ID,
          targetPersonaId      : COUNTERPART_ID_1,
          relationTypeKey      : "sworn-brother",
          relationLabel        : "义盟",
          relationTypeSource   : RelationTypeSource.PRESET,
          direction            : RelationDirection.BIDIRECTIONAL,
          effectiveChapterStart: 1,
          effectiveChapterEnd  : 2,
          sourceClaimIds       : [RELATION_CLAIM_ID_1],
          latestClaimId        : RELATION_CLAIM_ID_1
        }
      ],
      relationClaims: [
        {
          id                   : RELATION_CLAIM_ID_1,
          bookId               : BOOK_ID,
          chapterId            : CHAPTER_ID_1,
          relationTypeKey      : "sworn-brother",
          relationLabel        : "义盟",
          evidenceSpanIds      : [EVIDENCE_ID_5],
          reviewState          : "ACCEPTED",
          source               : "MANUAL",
          effectiveChapterStart: 1,
          effectiveChapterEnd  : 2,
          createdAt            : new Date("2026-04-20T00:00:00.000Z"),
          updatedAt            : new Date("2026-04-20T00:00:00.000Z")
        },
        {
          id                   : RELATION_CLAIM_ID_2,
          bookId               : BOOK_ID,
          chapterId            : CHAPTER_ID_2,
          relationTypeKey      : "custom:rival",
          relationLabel        : "宿敌",
          evidenceSpanIds      : [EVIDENCE_ID_6],
          reviewState          : "ACCEPTED",
          source               : "AI",
          effectiveChapterStart: 2,
          effectiveChapterEnd  : 3,
          createdAt            : new Date("2026-04-21T00:00:00.000Z"),
          updatedAt            : new Date("2026-04-21T00:00:00.000Z")
        },
        {
          id                   : RELATION_CLAIM_ID_3,
          bookId               : BOOK_ID,
          chapterId            : CHAPTER_ID_3,
          relationTypeKey      : "custom:alliance",
          relationLabel        : "",
          evidenceSpanIds      : [EVIDENCE_ID_2],
          reviewState          : "ACCEPTED",
          source               : "MANUAL",
          effectiveChapterStart: null,
          effectiveChapterEnd  : null,
          createdAt            : new Date("2026-04-22T00:00:00.000Z"),
          updatedAt            : new Date("2026-04-22T00:00:00.000Z")
        }
      ],
      evidenceSpans: [
        { id: EVIDENCE_ID_1, quotedText: "孙策称公瑾为知己" },
        { id: EVIDENCE_ID_2, quotedText: "火攻已定" },
        { id: EVIDENCE_ID_3, quotedText: "其时建安十三年冬" },
        { id: EVIDENCE_ID_4, quotedText: "少时即知兵法" },
        { id: EVIDENCE_ID_5, quotedText: "同心并力" },
        { id: EVIDENCE_ID_6, quotedText: "曹公深忌公瑾" }
      ]
    }) as never);

    const detail = await service.getReviewPersonaDetail(PERSONA_ID);

    expect(detail.primaryPersonaCandidateId).toBe(CANDIDATE_ID_1);
    expect(detail.personaCandidateIds).toEqual([CANDIDATE_ID_1, CANDIDATE_ID_2]);
    expect(detail.summary).toEqual({
      firstChapterNo     : 1,
      firstTimeSortKey   : 13,
      totalConflictCount : 1,
      totalEventCount    : 2,
      totalRelationCount : 3,
      totalTimeClaimCount: 2
    });
    expect(detail.chapterFacts.map((fact) => ({
      chapterNo       : fact.chapterNo,
      factLabel       : fact.factLabel,
      evidenceSnippets: fact.evidenceSnippets
    }))).toEqual([
      {
        chapterNo       : 1,
        factLabel       : "结识孙策",
        evidenceSnippets: ["孙策称公瑾为知己"]
      },
      {
        chapterNo       : 3,
        factLabel       : "赤壁鏖兵",
        evidenceSnippets: ["火攻已定"]
      }
    ]);
    expect(detail.timeFacts.map((fact) => ({
      normalizedLabel  : fact.normalizedLabel,
      timeSortKey      : fact.timeSortKey,
      chapterRangeStart: fact.chapterRangeStart,
      chapterRangeEnd  : fact.chapterRangeEnd,
      evidenceSnippets : fact.evidenceSnippets
    }))).toEqual([
      {
        normalizedLabel  : "建安十三年冬",
        timeSortKey      : 13,
        chapterRangeStart: 3,
        chapterRangeEnd  : 3,
        evidenceSnippets : ["其时建安十三年冬"]
      },
      {
        normalizedLabel  : "少年时",
        timeSortKey      : null,
        chapterRangeStart: 1,
        chapterRangeEnd  : 1,
        evidenceSnippets : ["少时即知兵法"]
      }
    ]);
    expect(detail.relations.map((relation) => ({
      counterpartDisplayName: relation.counterpartDisplayName,
      relationTypeKey       : relation.relationTypeKey,
      direction             : relation.direction,
      effectiveChapterStart : relation.effectiveChapterStart,
      effectiveChapterEnd   : relation.effectiveChapterEnd,
      evidenceSnippets      : relation.evidenceSnippets
    }))).toEqual([
      {
        counterpartDisplayName: "孙策",
        relationTypeKey       : "sworn-brother",
        direction             : "outgoing",
        effectiveChapterStart : 1,
        effectiveChapterEnd   : 2,
        evidenceSnippets      : ["同心并力"]
      },
      {
        counterpartDisplayName: "曹操",
        relationTypeKey       : "custom:rival",
        direction             : "incoming",
        effectiveChapterStart : 2,
        effectiveChapterEnd   : 3,
        evidenceSnippets      : ["曹公深忌公瑾"]
      },
      {
        counterpartDisplayName: "周泰",
        relationTypeKey       : "custom:alliance",
        direction             : "outgoing",
        effectiveChapterStart : null,
        effectiveChapterEnd   : null,
        evidenceSnippets      : ["火攻已定"]
      }
    ]);

    const legacyDetail = toLegacyPersonaDetail(detail);

    expect(legacyDetail.status).toBe(ProcessingStatus.VERIFIED);
    expect(legacyDetail.profiles).toEqual([
      {
        profileId    : `projection:${BOOK_ID}`,
        bookId       : BOOK_ID,
        bookTitle    : "三国演义",
        localName    : "周瑜",
        localSummary : null,
        officialTitle: null,
        localTags    : [],
        ironyIndex   : 0
      }
    ]);
    expect(legacyDetail.timeline.map((item) => ({
      chapterId   : item.chapterId,
      chapterNo   : item.chapterNo,
      category    : item.category,
      event       : item.event,
      location    : item.location,
      recordSource: item.recordSource,
      status      : item.status
    }))).toEqual([
      {
        chapterId   : CHAPTER_ID_1,
        chapterNo   : 1,
        category    : "SOCIAL",
        event       : "结识孙策",
        location    : "吴郡",
        recordSource: RecordSource.MANUAL,
        status      : ProcessingStatus.VERIFIED
      },
      {
        chapterId   : CHAPTER_ID_3,
        chapterNo   : 3,
        category    : "EVENT",
        event       : "赤壁鏖兵",
        location    : "赤壁",
        recordSource: RecordSource.AI,
        status      : ProcessingStatus.VERIFIED
      }
    ]);
    expect(legacyDetail.relationships.map((item) => ({
      counterpartName      : item.counterpartName,
      type                 : item.type,
      direction            : item.direction,
      effectiveChapterStart: item.chapterNo,
      evidence             : item.evidence
    }))).toEqual([
      {
        counterpartName      : "孙策",
        type                 : "义盟",
        direction            : "outgoing",
        effectiveChapterStart: 1,
        evidence             : "同心并力"
      },
      {
        counterpartName      : "曹操",
        type                 : "宿敌",
        direction            : "incoming",
        effectiveChapterStart: 2,
        evidence             : "曹公深忌公瑾"
      },
      {
        counterpartName      : "周泰",
        type                 : "custom:alliance",
        direction            : "outgoing",
        effectiveChapterStart: 3,
        evidence             : "火攻已定"
      }
    ]);
  });

  it("returns an empty projection view when the persona has no accepted facts yet", async () => {
    const service = createReviewPersonaDetailService(createPrismaMock({
      personas: [
        {
          id          : PERSONA_ID,
          name        : "周瑜",
          aliases     : [],
          gender      : null,
          hometown    : null,
          nameType    : "NAMED",
          recordSource: RecordSource.AI,
          confidence  : 0.8,
          status      : "CANDIDATE",
          deletedAt   : null
        }
      ]
    }) as never);

    const detail = await service.getReviewPersonaDetail(PERSONA_ID);

    expect(detail.chapterFacts).toEqual([]);
    expect(detail.timeFacts).toEqual([]);
    expect(detail.relations).toEqual([]);
    expect(toLegacyPersonaDetail(detail).profiles).toEqual([]);
  });
});
