import { describe, expect, it, vi } from "vitest";

import { createReviewQueryService } from "@/server/modules/review/evidence-review/review-query-service";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";
const CHAPTER_ID_1 = "22222222-2222-4222-8222-222222222222";
const CHAPTER_ID_2 = "23232323-2323-4232-8232-232323232323";
const EVENT_ID_1 = "33333333-3333-4333-8333-333333333333";
const EVENT_ID_2 = "34343434-3434-4343-8343-343434343434";
const EVENT_ID_3 = "35353535-3535-4353-8353-353535353535";
const EVENT_ID_AI = "36363636-3636-4363-8363-363636363636";
const TIME_ID_1 = "37373737-3737-4373-8373-373737373737";
const CONFLICT_ID_1 = "38383838-3838-4383-8383-383838383838";
const CONFLICT_ID_2 = "39393939-3939-4393-8393-393939393939";
const CANDIDATE_ID_1 = "44444444-4444-4444-8444-444444444444";
const CANDIDATE_ID_2 = "45454545-4545-4454-8454-454545454545";
const PERSONA_ID_1 = "55555555-5555-4555-8555-555555555555";
const EVIDENCE_ID_1 = "66666666-6666-4666-8666-666666666666";
const EVIDENCE_ID_2 = "67676767-6767-4676-8676-676767676767";
const AUDIT_ID_1 = "68686868-6868-4686-8686-686868686868";
const AUDIT_ID_2 = "69696969-6969-4696-8696-696969696969";

type TestRow = Record<string, unknown>;

function stringifyComparable(value: unknown): string {
  switch (typeof value) {
    case "undefined":
      return "";
    case "string":
      return value;
    case "number":
    case "bigint":
    case "boolean":
    case "symbol":
      return String(value);
    case "function":
      return value.name || "[function]";
    case "object":
      return value === null ? "" : JSON.stringify(value) ?? "";
  }
}

interface PrismaMockSeed {
  aliasClaims?             : TestRow[];
  eventClaims?             : TestRow[];
  relationClaims?          : TestRow[];
  timeClaims?              : TestRow[];
  identityResolutionClaims?: TestRow[];
  conflictFlags?           : TestRow[];
  evidenceSpans?           : TestRow[];
  reviewAuditLogs?         : TestRow[];
  personaChapterFacts?     : TestRow[];
  personaTimeFacts?        : TestRow[];
  relationshipEdges?       : TestRow[];
  timelineEvents?          : TestRow[];
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
  return stringifyComparable(left).localeCompare(stringifyComparable(right));
}

function applyOrderBy(rows: TestRow[], orderBy: unknown): TestRow[] {
  const orders = Array.isArray(orderBy)
    ? orderBy as Record<string, "asc" | "desc">[]
    : orderBy
      ? [orderBy as Record<string, "asc" | "desc">]
      : [];

  if (orders.length === 0) return rows;

  return [...rows].sort((left, right) => {
    for (const order of orders) {
      for (const [field, direction] of Object.entries(order)) {
        const base = compareNullable(left[field], right[field]);
        if (base !== 0) {
          return direction === "asc" ? base : -base;
        }
      }
    }
    return 0;
  });
}

function matchesWhere(row: TestRow, where?: Record<string, unknown>): boolean {
  if (!where) return true;

  const entries = Object.entries(where);
  for (const [key, value] of entries) {
    if (value === undefined) continue;

    if (key === "AND") {
      const conditions = value as Record<string, unknown>[];
      if (!conditions.every((condition) => matchesWhere(row, condition))) return false;
      continue;
    }
    if (key === "OR") {
      const conditions = value as Record<string, unknown>[];
      if (!conditions.some((condition) => matchesWhere(row, condition))) return false;
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
        const options = condition.in as unknown[];
        if (!options.includes(fieldValue)) return false;
        continue;
      }

      if ("not" in condition) {
        if (fieldValue === condition.not) return false;
        continue;
      }

      if ("hasSome" in condition) {
        const options = condition.hasSome as unknown[];
        const values = Array.isArray(fieldValue) ? fieldValue : [];
        if (!values.some((item) => options.includes(item))) return false;
        continue;
      }

      if ("has" in condition) {
        const values = Array.isArray(fieldValue) ? fieldValue : [];
        if (!values.includes(condition.has)) return false;
        continue;
      }
    }

    if (fieldValue !== value) return false;
  }

  return true;
}

function createFindMany(rows: TestRow[]): ReturnType<typeof vi.fn> {
  return vi.fn(async (args?: { where?: Record<string, unknown>; orderBy?: unknown }) => {
    const filtered = rows.filter((row) => matchesWhere(row, args?.where));
    return applyOrderBy(filtered, args?.orderBy);
  });
}

function createFindUnique(rows: TestRow[]): ReturnType<typeof vi.fn> {
  return vi.fn(async (args: { where: { id: string } }) => {
    return rows.find((row) => row.id === args.where.id) ?? null;
  });
}

function createPrismaMock(seed: PrismaMockSeed = {}) {
  const aliasClaims = seed.aliasClaims ?? [];
  const eventClaims = seed.eventClaims ?? [];
  const relationClaims = seed.relationClaims ?? [];
  const timeClaims = seed.timeClaims ?? [];
  const identityResolutionClaims = seed.identityResolutionClaims ?? [];
  const conflictFlags = seed.conflictFlags ?? [];
  const evidenceSpans = seed.evidenceSpans ?? [];
  const reviewAuditLogs = seed.reviewAuditLogs ?? [];
  const personaChapterFacts = seed.personaChapterFacts ?? [];
  const personaTimeFacts = seed.personaTimeFacts ?? [];
  const relationshipEdges = seed.relationshipEdges ?? [];
  const timelineEvents = seed.timelineEvents ?? [];

  return {
    aliasClaim             : { findMany: createFindMany(aliasClaims), findUnique: createFindUnique(aliasClaims) },
    eventClaim             : { findMany: createFindMany(eventClaims), findUnique: createFindUnique(eventClaims) },
    relationClaim          : { findMany: createFindMany(relationClaims), findUnique: createFindUnique(relationClaims) },
    timeClaim              : { findMany: createFindMany(timeClaims), findUnique: createFindUnique(timeClaims) },
    identityResolutionClaim: {
      findMany  : createFindMany(identityResolutionClaims),
      findUnique: createFindUnique(identityResolutionClaims)
    },
    conflictFlag      : { findMany: createFindMany(conflictFlags), findUnique: createFindUnique(conflictFlags) },
    evidenceSpan      : { findMany: createFindMany(evidenceSpans) },
    reviewAuditLog    : { findMany: createFindMany(reviewAuditLogs) },
    personaChapterFact: { findMany: createFindMany(personaChapterFacts) },
    personaTimeFact   : { findMany: createFindMany(personaTimeFacts) },
    relationshipEdge  : { findMany: createFindMany(relationshipEdges) },
    timelineEvent     : { findMany: createFindMany(timelineEvents) }
  };
}

function eventClaim(overrides: Partial<TestRow> = {}): TestRow {
  return {
    id                       : EVENT_ID_1,
    bookId                   : BOOK_ID,
    chapterId                : CHAPTER_ID_1,
    subjectPersonaCandidateId: CANDIDATE_ID_1,
    objectPersonaCandidateId : null,
    predicate                : "赴试",
    objectText               : "乡试",
    locationText             : null,
    timeHintId               : TIME_ID_1,
    eventCategory            : "EVENT",
    narrativeLens            : "SELF",
    evidenceSpanIds          : [EVIDENCE_ID_1],
    reviewState              : "PENDING",
    source                   : "AI",
    derivedFromClaimId       : null,
    createdAt                : new Date("2026-04-21T10:00:00.000Z"),
    updatedAt                : new Date("2026-04-21T10:00:00.000Z"),
    ...overrides
  };
}

function identityClaim(overrides: Partial<TestRow> = {}): TestRow {
  return {
    id                : "71717171-7171-4717-8717-717171717171",
    bookId            : BOOK_ID,
    chapterId         : null,
    mentionId         : "72727272-7272-4727-8727-727272727272",
    personaCandidateId: CANDIDATE_ID_1,
    resolvedPersonaId : PERSONA_ID_1,
    resolutionKind    : "RESOLVES_TO",
    evidenceSpanIds   : [EVIDENCE_ID_1],
    reviewState       : "ACCEPTED",
    source            : "AI",
    derivedFromClaimId: null,
    createdAt         : new Date("2026-04-21T09:00:00.000Z"),
    updatedAt         : new Date("2026-04-21T09:00:00.000Z"),
    ...overrides
  };
}

function conflictFlag(overrides: Partial<TestRow> = {}): TestRow {
  return {
    id                        : CONFLICT_ID_1,
    bookId                    : BOOK_ID,
    chapterId                 : CHAPTER_ID_1,
    runId                     : "73737373-7373-4737-8737-737373737373",
    conflictType              : "LOW_EVIDENCE_CLAIM",
    severity                  : "HIGH",
    reason                    : "冲突",
    recommendedActionKey      : "REVIEW",
    sourceStageKey            : "stage_b5",
    relatedClaimKind          : "EVENT",
    relatedClaimIds           : [EVENT_ID_1],
    relatedPersonaCandidateIds: [CANDIDATE_ID_1],
    relatedChapterIds         : [CHAPTER_ID_1],
    summary                   : "冲突摘要",
    evidenceSpanIds           : [EVIDENCE_ID_1],
    reviewState               : "CONFLICTED",
    source                    : "RULE",
    createdAt                 : new Date("2026-04-21T10:30:00.000Z"),
    updatedAt                 : new Date("2026-04-21T10:30:00.000Z"),
    ...overrides
  };
}

function timeClaim(overrides: Partial<TestRow> = {}): TestRow {
  return {
    id                 : TIME_ID_1,
    bookId             : BOOK_ID,
    chapterId          : CHAPTER_ID_1,
    rawTimeText        : "春日",
    timeType           : "RELATIVE_PHASE",
    normalizedLabel    : "春日",
    relativeOrderWeight: 1,
    chapterRangeStart  : 1,
    chapterRangeEnd    : 1,
    evidenceSpanIds    : [EVIDENCE_ID_2],
    reviewState        : "ACCEPTED",
    source             : "AI",
    derivedFromClaimId : null,
    createdAt          : new Date("2026-04-21T08:00:00.000Z"),
    updatedAt          : new Date("2026-04-21T08:00:00.000Z"),
    ...overrides
  };
}

function evidenceSpan(overrides: Partial<TestRow> = {}): TestRow {
  return {
    id            : EVIDENCE_ID_1,
    bookId        : BOOK_ID,
    chapterId     : CHAPTER_ID_2,
    startOffset   : 50,
    endOffset     : 70,
    quotedText    : "范进去应考",
    normalizedText: "范进去应考",
    createdAt     : new Date("2026-04-21T07:00:00.000Z"),
    ...overrides
  };
}

function auditLog(overrides: Partial<TestRow> = {}): TestRow {
  return {
    id         : AUDIT_ID_1,
    bookId     : BOOK_ID,
    claimKind  : "EVENT",
    claimId    : EVENT_ID_1,
    action     : "ACCEPT",
    createdAt  : new Date("2026-04-21T09:00:00.000Z"),
    beforeState: { reviewState: "PENDING" },
    afterState : { reviewState: "ACCEPTED" },
    ...overrides
  };
}

function personaChapterFact(overrides: Partial<TestRow> = {}): TestRow {
  return {
    id                : "74747474-7474-4747-8747-747474747474",
    bookId            : BOOK_ID,
    personaId         : PERSONA_ID_1,
    chapterId         : CHAPTER_ID_1,
    chapterNo         : 1,
    eventCount        : 2,
    relationCount     : 0,
    conflictCount     : 1,
    latestUpdatedAt   : new Date("2026-04-21T11:00:00.000Z"),
    reviewStateSummary: {
      EVENT: { ACCEPTED: 1, PENDING: 1 }
    },
    createdAt: new Date("2026-04-21T11:00:00.000Z"),
    updatedAt: new Date("2026-04-21T11:00:00.000Z"),
    ...overrides
  };
}

function personaTimeFact(overrides: Partial<TestRow> = {}): TestRow {
  return {
    id                : "75757575-7575-4757-8757-757575757575",
    bookId            : BOOK_ID,
    personaId         : PERSONA_ID_1,
    timeLabel         : "春日",
    timeSortKey       : 1,
    chapterRangeStart : 1,
    chapterRangeEnd   : 1,
    eventCount        : 1,
    relationCount     : 0,
    sourceTimeClaimIds: [TIME_ID_1],
    createdAt         : new Date("2026-04-21T11:30:00.000Z"),
    updatedAt         : new Date("2026-04-21T11:30:00.000Z"),
    ...overrides
  };
}

function timelineEvent(overrides: Partial<TestRow> = {}): TestRow {
  return {
    id            : "76767676-7676-4767-8767-767676767676",
    bookId        : BOOK_ID,
    personaId     : PERSONA_ID_1,
    chapterId     : CHAPTER_ID_1,
    chapterNo     : 1,
    timeLabel     : "春日",
    eventLabel    : "赴试",
    narrativeLens : "SELF",
    sourceClaimIds: [EVENT_ID_1],
    createdAt     : new Date("2026-04-21T12:00:00.000Z"),
    updatedAt     : new Date("2026-04-21T12:00:00.000Z"),
    ...overrides
  };
}

describe("createReviewQueryService", () => {
  it("lists claims by persona/chapter/kind/state/conflict and pages after newest-first sort", async () => {
    const prismaMock = createPrismaMock({
      eventClaims: [
        eventClaim({
          id       : EVENT_ID_1,
          createdAt: new Date("2026-04-21T08:00:00.000Z"),
          updatedAt: new Date("2026-04-21T08:00:00.000Z")
        }),
        eventClaim({
          id       : EVENT_ID_2,
          createdAt: new Date("2026-04-21T09:00:00.000Z"),
          updatedAt: new Date("2026-04-21T09:00:00.000Z")
        }),
        eventClaim({
          id       : EVENT_ID_3,
          chapterId: CHAPTER_ID_2
        })
      ],
      identityResolutionClaims: [
        identityClaim({ personaCandidateId: CANDIDATE_ID_1, resolvedPersonaId: PERSONA_ID_1, reviewState: "ACCEPTED" }),
        identityClaim({ id: "88888888-8888-4888-8888-888888888888", personaCandidateId: CANDIDATE_ID_2, resolvedPersonaId: PERSONA_ID_1, reviewState: "PENDING" })
      ],
      timeClaims   : [timeClaim({ id: TIME_ID_1, normalizedLabel: "春日" })],
      conflictFlags: [
        conflictFlag({ relatedClaimIds: [EVENT_ID_1] }),
        conflictFlag({ id: CONFLICT_ID_2, relatedClaimIds: [EVENT_ID_2] }),
        conflictFlag({ id: "89898989-8989-4898-8898-898989898989", relatedClaimIds: [EVENT_ID_3], reviewState: "REJECTED" })
      ]
    });
    const service = createReviewQueryService(prismaMock as never);

    const result = await service.listClaims({
      bookId       : BOOK_ID,
      claimKinds   : ["EVENT"],
      reviewStates : ["PENDING"],
      sources      : ["AI"],
      personaId    : PERSONA_ID_1,
      chapterId    : CHAPTER_ID_1,
      timeLabel    : "春日",
      conflictState: "ACTIVE",
      limit        : 1,
      offset       : 1
    });

    expect(result.total).toBe(2);
    expect(result.items).toEqual([
      expect.objectContaining({
        claimKind          : "EVENT",
        claimId            : EVENT_ID_1,
        chapterId          : CHAPTER_ID_1,
        reviewState        : "PENDING",
        source             : "AI",
        conflictState      : "ACTIVE",
        personaCandidateIds: [CANDIDATE_ID_1],
        personaIds         : [PERSONA_ID_1],
        timeLabel          : "春日",
        relationTypeKey    : null,
        evidenceSpanIds    : [EVIDENCE_ID_1]
      })
    ]);
  });

  it("returns detail with evidence, audit history, projection summary, and nearest non-manual basis claim", async () => {
    const prismaMock = createPrismaMock({
      eventClaims: [
        eventClaim({
          id                : EVENT_ID_1,
          source            : "MANUAL",
          reviewState       : "ACCEPTED",
          derivedFromClaimId: EVENT_ID_2,
          evidenceSpanIds   : [EVIDENCE_ID_1, EVIDENCE_ID_2]
        }),
        eventClaim({
          id                : EVENT_ID_2,
          source            : "MANUAL",
          reviewState       : "EDITED",
          derivedFromClaimId: EVENT_ID_AI
        }),
        eventClaim({
          id                : EVENT_ID_AI,
          source            : "AI",
          reviewState       : "ACCEPTED",
          derivedFromClaimId: null
        })
      ],
      timeClaims              : [timeClaim({ id: TIME_ID_1, normalizedLabel: "春日" })],
      identityResolutionClaims: [identityClaim({ reviewState: "ACCEPTED" })],
      evidenceSpans           : [
        evidenceSpan({ id: EVIDENCE_ID_1, chapterId: CHAPTER_ID_2, startOffset: 20, quotedText: "证据二" }),
        evidenceSpan({ id: EVIDENCE_ID_2, chapterId: CHAPTER_ID_1, startOffset: 10, quotedText: "证据一" })
      ],
      reviewAuditLogs: [
        auditLog({ id: AUDIT_ID_1, action: "ACCEPT", createdAt: new Date("2026-04-21T09:00:00.000Z") }),
        auditLog({ id: AUDIT_ID_2, action: "EDIT", createdAt: new Date("2026-04-21T10:00:00.000Z") })
      ],
      personaChapterFacts: [personaChapterFact({ chapterId: CHAPTER_ID_1 })],
      personaTimeFacts   : [personaTimeFact({ timeLabel: "春日" })],
      timelineEvents     : [timelineEvent({ chapterId: CHAPTER_ID_1, timeLabel: "春日" })]
    });
    const service = createReviewQueryService(prismaMock as never);

    const detail = await service.getClaimDetail({
      bookId   : BOOK_ID,
      claimKind: "EVENT",
      claimId  : EVENT_ID_1
    });

    expect(detail).not.toBeNull();
    expect(detail).toMatchObject({
      claim            : expect.objectContaining({ id: EVENT_ID_1, claimKind: "EVENT", source: "MANUAL" }),
      basisClaim       : expect.objectContaining({ id: EVENT_ID_AI, source: "AI" }),
      projectionSummary: expect.objectContaining({
        personaChapterFacts: [expect.objectContaining({ chapterId: CHAPTER_ID_1, personaId: PERSONA_ID_1 })],
        personaTimeFacts   : [expect.objectContaining({ timeLabel: "春日", personaId: PERSONA_ID_1 })],
        timelineEvents     : [expect.objectContaining({ chapterId: CHAPTER_ID_1, personaId: PERSONA_ID_1 })]
      }),
      auditHistory: [
        expect.objectContaining({ id: AUDIT_ID_2, action: "EDIT" }),
        expect.objectContaining({ id: AUDIT_ID_1, action: "ACCEPT" })
      ]
    });
    const evidence = detail?.evidence as Array<{ id: string }> | undefined;
    expect(evidence?.map((item) => item.id)).toEqual([EVIDENCE_ID_2, EVIDENCE_ID_1]);
    expect(prismaMock.reviewAuditLog.findMany).toHaveBeenCalledWith({
      where  : { claimKind: "EVENT", claimId: EVENT_ID_1 },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }]
    });
  });

  it("returns null when target claim is missing", async () => {
    const service = createReviewQueryService(createPrismaMock() as never);

    const detail = await service.getClaimDetail({
      bookId   : BOOK_ID,
      claimKind: "EVENT",
      claimId  : EVENT_ID_1
    });

    expect(detail).toBeNull();
  });
});
