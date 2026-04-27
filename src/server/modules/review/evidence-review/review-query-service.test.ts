import { describe, expect, it, vi } from "vitest";

import { createReviewQueryService } from "@/server/modules/review/evidence-review/review-query-service";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";
const CHAPTER_ID_1 = "22222222-2222-4222-8222-222222222222";
const CHAPTER_ID_2 = "23232323-2323-4232-8232-232323232323";
const CHAPTER_ID_3 = "24242424-2424-4242-8242-242424242424";
const EVENT_ID_1 = "33333333-3333-4333-8333-333333333333";
const EVENT_ID_2 = "34343434-3434-4343-8343-343434343434";
const EVENT_ID_3 = "35353535-3535-4353-8353-353535353535";
const EVENT_ID_AI = "36363636-3636-4363-8363-363636363636";
const TIME_ID_1 = "37373737-3737-4373-8373-373737373737";
const TIME_ID_2 = "3a3a3a3a-3a3a-43a3-83a3-3a3a3a3a3a3a";
const TIME_ID_3 = "3b3b3b3b-3b3b-43b3-83b3-3b3b3b3b3b3b";
const TIME_ID_4 = "3c3c3c3c-3c3c-43c3-83c3-3c3c3c3c3c3c";
const TIME_ID_5 = "3d3d3d3d-3d3d-43d3-83d3-3d3d3d3d3d3d";
const CONFLICT_ID_1 = "38383838-3838-4383-8383-383838383838";
const CONFLICT_ID_2 = "39393939-3939-4393-8393-393939393939";
const CANDIDATE_ID_1 = "44444444-4444-4444-8444-444444444444";
const CANDIDATE_ID_2 = "45454545-4545-4454-8454-454545454545";
const CANDIDATE_ID_3 = "46464646-4646-4464-8464-464646464646";
const CANDIDATE_ID_4 = "47474747-4747-4474-8474-474747474747";
const PERSONA_ID_1 = "55555555-5555-4555-8555-555555555555";
const PERSONA_ID_2 = "56565656-5656-4565-8565-565656565656";
const PERSONA_ID_3 = "57575757-5757-4575-8575-575757575757";
const EVIDENCE_ID_1 = "66666666-6666-4666-8666-666666666666";
const EVIDENCE_ID_2 = "67676767-6767-4676-8676-676767676767";
const AUDIT_ID_1 = "68686868-6868-4686-8686-686868686868";
const AUDIT_ID_2 = "69696969-6969-4696-8696-696969696969";
const RELATION_ID_1 = "90909090-9090-4090-8090-909090909090";
const RELATION_ID_2 = "91919191-9191-4191-8191-919191919191";
const RELATION_ID_3 = "92929292-9292-4292-8292-929292929292";
const RELATION_ID_4 = "93939393-9393-4393-8393-939393939393";
const RELATION_ID_5 = "94949494-9494-4494-8494-949494949494";
const RUN_ID_AI = "95959595-9595-4595-8595-959595959595";
const RUN_ID_MANUAL = "96969696-9696-4696-8696-969696969696";
const RUN_ID_MANUAL_PREVIOUS = "97979797-9797-4797-8797-979797979797";
const STAGE_RUN_ID_1 = "98989898-9898-4898-8898-989898989898";
const RAW_OUTPUT_ID_1 = "99999999-9999-4999-8999-999999999999";
const RAW_OUTPUT_ID_2 = "9a9a9a9a-9a9a-49a9-89a9-9a9a9a9a9a9a";

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
  analysisStageRuns?       : TestRow[];
  books?                   : TestRow[];
  chapters?                : TestRow[];
  eventClaims?             : TestRow[];
  relationClaims?          : TestRow[];
  timeClaims?              : TestRow[];
  identityResolutionClaims?: TestRow[];
  conflictFlags?           : TestRow[];
  evidenceSpans?           : TestRow[];
  llmRawOutputs?           : TestRow[];
  personas?                : TestRow[];
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
  const analysisStageRuns = seed.analysisStageRuns ?? [];
  const books = seed.books ?? [];
  const chapters = seed.chapters ?? [];
  const eventClaims = seed.eventClaims ?? [];
  const relationClaims = seed.relationClaims ?? [];
  const timeClaims = seed.timeClaims ?? [];
  const identityResolutionClaims = seed.identityResolutionClaims ?? [];
  const conflictFlags = seed.conflictFlags ?? [];
  const evidenceSpans = seed.evidenceSpans ?? [];
  const llmRawOutputs = seed.llmRawOutputs ?? [];
  const personas = seed.personas ?? [];
  const reviewAuditLogs = seed.reviewAuditLogs ?? [];
  const personaChapterFacts = seed.personaChapterFacts ?? [];
  const personaTimeFacts = seed.personaTimeFacts ?? [];
  const relationshipEdges = seed.relationshipEdges ?? [];
  const timelineEvents = seed.timelineEvents ?? [];

  return {
    aliasClaim             : { findMany: createFindMany(aliasClaims), findUnique: createFindUnique(aliasClaims) },
    analysisStageRun       : { findMany: createFindMany(analysisStageRuns) },
    book                   : { findMany: createFindMany(books), findUnique: createFindUnique(books) },
    chapter                : { findMany: createFindMany(chapters), findUnique: createFindUnique(chapters) },
    eventClaim             : { findMany: createFindMany(eventClaims), findUnique: createFindUnique(eventClaims) },
    relationClaim          : { findMany: createFindMany(relationClaims), findUnique: createFindUnique(relationClaims) },
    timeClaim              : { findMany: createFindMany(timeClaims), findUnique: createFindUnique(timeClaims) },
    identityResolutionClaim: {
      findMany  : createFindMany(identityResolutionClaims),
      findUnique: createFindUnique(identityResolutionClaims)
    },
    conflictFlag      : { findMany: createFindMany(conflictFlags), findUnique: createFindUnique(conflictFlags) },
    evidenceSpan      : { findMany: createFindMany(evidenceSpans) },
    llmRawOutput      : { findMany: createFindMany(llmRawOutputs) },
    persona           : { findMany: createFindMany(personas), findUnique: createFindUnique(personas) },
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
    confidence               : 0.88,
    reviewState              : "PENDING",
    source                   : "AI",
    runId                    : RUN_ID_AI,
    supersedesClaimId        : null,
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
    confidence        : 0.86,
    reviewState       : "ACCEPTED",
    source            : "AI",
    runId             : RUN_ID_AI,
    supersedesClaimId : null,
    derivedFromClaimId: null,
    createdAt         : new Date("2026-04-21T09:00:00.000Z"),
    updatedAt         : new Date("2026-04-21T09:00:00.000Z"),
    ...overrides
  };
}

function relationClaim(overrides: Partial<TestRow> = {}): TestRow {
  return {
    id                      : RELATION_ID_1,
    bookId                  : BOOK_ID,
    chapterId               : CHAPTER_ID_1,
    sourcePersonaCandidateId: CANDIDATE_ID_1,
    targetPersonaCandidateId: CANDIDATE_ID_2,
    relationTypeKey         : "teacher_of",
    relationLabel           : "师生",
    relationTypeSource      : "PRESET",
    direction               : "FORWARD",
    effectiveChapterStart   : 1,
    effectiveChapterEnd     : 3,
    timeHintId              : TIME_ID_1,
    evidenceSpanIds         : [EVIDENCE_ID_1],
    confidence              : 0.91,
    reviewState             : "PENDING",
    source                  : "AI",
    runId                   : RUN_ID_AI,
    supersedesClaimId       : null,
    derivedFromClaimId      : null,
    createdAt               : new Date("2026-04-21T10:00:00.000Z"),
    updatedAt               : new Date("2026-04-21T12:00:00.000Z"),
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

function bookRecord(overrides: Partial<TestRow> = {}): TestRow {
  return {
    id      : BOOK_ID,
    title   : "测试书籍",
    bookType: { key: "CLASSICAL_NOVEL" },
    ...overrides
  };
}

function chapter(overrides: Partial<TestRow> = {}): TestRow {
  return {
    id        : CHAPTER_ID_1,
    bookId    : BOOK_ID,
    no        : 1,
    unit      : "回",
    noText    : null,
    title     : "第一回",
    isAbstract: false,
    ...overrides
  };
}

function persona(overrides: Partial<TestRow> = {}): TestRow {
  return {
    id     : PERSONA_ID_1,
    name   : "Alpha",
    aliases: [],
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
    confidence         : 0.9,
    reviewState        : "ACCEPTED",
    source             : "AI",
    runId              : RUN_ID_AI,
    supersedesClaimId  : null,
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

function llmRawOutput(overrides: Partial<TestRow> = {}): TestRow {
  return {
    id                 : RAW_OUTPUT_ID_1,
    runId              : RUN_ID_AI,
    stageRunId         : STAGE_RUN_ID_1,
    bookId             : BOOK_ID,
    chapterId          : CHAPTER_ID_1,
    provider           : "openai",
    model              : "gpt-5.4-mini",
    requestPayload     : { prompt: "..." },
    responseText       : "  提取到范进赴试，并标注时间为春日。  ",
    responseJson       : { claims: [{ id: EVENT_ID_AI }] },
    parseError         : null,
    schemaError        : null,
    discardReason      : null,
    promptTokens       : 120,
    completionTokens   : 80,
    totalTokens        : 200,
    estimatedCostMicros: BigInt(12_345),
    durationMs         : 1200,
    createdAt          : new Date("2026-04-21T08:30:00.000Z"),
    ...overrides
  };
}

function analysisStageRun(overrides: Partial<TestRow> = {}): TestRow {
  return {
    id                 : STAGE_RUN_ID_1,
    runId              : RUN_ID_AI,
    bookId             : BOOK_ID,
    chapterId          : CHAPTER_ID_1,
    stageKey           : "stage_b2",
    status             : "SUCCEEDED",
    attempt            : 1,
    inputHash          : null,
    outputHash         : null,
    inputCount         : 1,
    outputCount        : 1,
    skippedCount       : 0,
    failureCount       : 0,
    errorClass         : null,
    errorMessage       : null,
    promptTokens       : 120,
    completionTokens   : 80,
    totalTokens        : 200,
    estimatedCostMicros: BigInt(12_345),
    chapterStartNo     : 1,
    chapterEndNo       : 1,
    startedAt          : new Date("2026-04-21T08:28:00.000Z"),
    finishedAt         : new Date("2026-04-21T08:30:00.000Z"),
    createdAt          : new Date("2026-04-21T08:27:00.000Z"),
    ...overrides
  };
}

function auditLog(overrides: Partial<TestRow> = {}): TestRow {
  return {
    id             : AUDIT_ID_1,
    bookId         : BOOK_ID,
    claimKind      : "EVENT",
    claimId        : EVENT_ID_1,
    action         : "ACCEPT",
    actorUserId    : "reviewer-1",
    note           : null,
    evidenceSpanIds: [],
    createdAt      : new Date("2026-04-21T09:00:00.000Z"),
    beforeState    : { reviewState: "PENDING" },
    afterState     : { reviewState: "ACCEPTED" },
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
  it("builds persona-chapter matrix summaries with chapter coverage, candidate hints, and relation options", async () => {
    const relationTypeCatalogLoader = {
      load: vi.fn().mockResolvedValue({
        activeEntries: [{
          relationTypeKey   : "friend_of",
          defaultLabel      : "朋友",
          direction         : "BIDIRECTIONAL",
          relationTypeSource: "PRESET",
          aliasLabels       : ["友人"],
          systemPreset      : true
        }]
      })
    };
    const prismaMock = createPrismaMock({
      books   : [bookRecord()],
      chapters: [
        chapter({ id: CHAPTER_ID_1, no: 1, title: "初登场" }),
        chapter({ id: CHAPTER_ID_2, no: 2, title: "再会" }),
        chapter({ id: CHAPTER_ID_3, no: 3, title: "空章" }),
        chapter({ id: "79797979-7979-4797-8797-797979797979", no: 99, title: "总纲", isAbstract: true })
      ],
      personas: [
        persona({ id: PERSONA_ID_1, name: "Alpha", aliases: ["甲"] }),
        persona({ id: PERSONA_ID_2, name: "Beta", aliases: ["乙"] })
      ],
      personaChapterFacts: [
        personaChapterFact({
          id                : "80808080-8080-4808-8808-808080808080",
          personaId         : PERSONA_ID_1,
          chapterId         : CHAPTER_ID_1,
          chapterNo         : 1,
          eventCount        : 2,
          relationCount     : 1,
          conflictCount     : 1,
          latestUpdatedAt   : new Date("2026-04-21T11:10:00.000Z"),
          reviewStateSummary: {
            EVENT   : { ACCEPTED: 1, PENDING: 1 },
            RELATION: { EDITED: 1 }
          }
        }),
        personaChapterFact({
          id                : "81818181-8181-4818-8818-818181818181",
          personaId         : PERSONA_ID_1,
          chapterId         : CHAPTER_ID_2,
          chapterNo         : 2,
          eventCount        : 1,
          relationCount     : 0,
          conflictCount     : 0,
          latestUpdatedAt   : new Date("2026-04-21T11:20:00.000Z"),
          reviewStateSummary: {
            EVENT: { DEFERRED: 1 }
          }
        }),
        personaChapterFact({
          id                : "82828282-8282-4828-8828-828282828282",
          personaId         : PERSONA_ID_2,
          chapterId         : CHAPTER_ID_2,
          chapterNo         : 2,
          eventCount        : 0,
          relationCount     : 2,
          conflictCount     : 0,
          latestUpdatedAt   : new Date("2026-04-21T11:30:00.000Z"),
          reviewStateSummary: {
            RELATION: { PENDING: 2 }
          }
        })
      ],
      identityResolutionClaims: [
        identityClaim({
          personaCandidateId: CANDIDATE_ID_1,
          resolvedPersonaId : PERSONA_ID_1,
          createdAt         : new Date("2026-04-21T08:00:00.000Z")
        }),
        identityClaim({
          id                : "83838383-8383-4838-8838-838383838383",
          personaCandidateId: CANDIDATE_ID_2,
          resolvedPersonaId : PERSONA_ID_1,
          createdAt         : new Date("2026-04-21T08:30:00.000Z")
        }),
        identityClaim({
          id                : "84848484-8484-4848-8848-848484848484",
          personaCandidateId: CANDIDATE_ID_3,
          resolvedPersonaId : PERSONA_ID_2,
          createdAt         : new Date("2026-04-21T09:00:00.000Z")
        })
      ]
    });
    const service = createReviewQueryService(prismaMock as never, {
      relationTypeCatalogLoader: relationTypeCatalogLoader as never
    });

    const result = await service.getPersonaChapterMatrix({ bookId: BOOK_ID });

    expect(result.bookId).toBe(BOOK_ID);
    expect(result.chapters).toEqual([
      {
        chapterId: CHAPTER_ID_1,
        chapterNo: 1,
        title    : "初登场",
        label    : "第1回 初登场"
      },
      {
        chapterId: CHAPTER_ID_2,
        chapterNo: 2,
        title    : "再会",
        label    : "第2回 再会"
      },
      {
        chapterId: CHAPTER_ID_3,
        chapterNo: 3,
        title    : "空章",
        label    : "第3回 空章"
      }
    ]);
    expect(result.personas).toEqual([
      {
        personaId                : PERSONA_ID_1,
        displayName              : "Alpha",
        aliases                  : ["甲"],
        primaryPersonaCandidateId: CANDIDATE_ID_1,
        personaCandidateIds      : [CANDIDATE_ID_1, CANDIDATE_ID_2],
        firstChapterNo           : 1,
        totalEventCount          : 3,
        totalRelationCount       : 1,
        totalConflictCount       : 1
      },
      {
        personaId                : PERSONA_ID_2,
        displayName              : "Beta",
        aliases                  : ["乙"],
        primaryPersonaCandidateId: CANDIDATE_ID_3,
        personaCandidateIds      : [CANDIDATE_ID_3],
        firstChapterNo           : 2,
        totalEventCount          : 0,
        totalRelationCount       : 2,
        totalConflictCount       : 0
      }
    ]);
    expect(result.cells).toEqual([
      expect.objectContaining({
        bookId            : BOOK_ID,
        personaId         : PERSONA_ID_1,
        chapterId         : CHAPTER_ID_1,
        chapterNo         : 1,
        eventCount        : 2,
        relationCount     : 1,
        conflictCount     : 1,
        reviewStateSummary: {
          EVENT   : { ACCEPTED: 1, PENDING: 1 },
          RELATION: { EDITED: 1 }
        },
        latestUpdatedAt: "2026-04-21T11:10:00.000Z"
      }),
      expect.objectContaining({
        personaId         : PERSONA_ID_1,
        chapterId         : CHAPTER_ID_2,
        eventCount        : 1,
        relationCount     : 0,
        conflictCount     : 0,
        reviewStateSummary: {
          EVENT: { DEFERRED: 1 }
        },
        latestUpdatedAt: "2026-04-21T11:20:00.000Z"
      }),
      expect.objectContaining({
        personaId         : PERSONA_ID_2,
        chapterId         : CHAPTER_ID_2,
        eventCount        : 0,
        relationCount     : 2,
        conflictCount     : 0,
        reviewStateSummary: {
          RELATION: { PENDING: 2 }
        },
        latestUpdatedAt: "2026-04-21T11:30:00.000Z"
      })
    ]);
    expect(result.relationTypeOptions).toEqual([{
      relationTypeKey   : "friend_of",
      label             : "朋友",
      direction         : "BIDIRECTIONAL",
      relationTypeSource: "PRESET",
      aliasLabels       : ["友人"],
      systemPreset      : true
    }]);
    expect(result.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(relationTypeCatalogLoader.load).toHaveBeenCalledWith({
      bookId     : BOOK_ID,
      bookTypeKey: "CLASSICAL_NOVEL",
      runId      : null,
      mode       : "REVIEW"
    });
  });

  it("filters matrix results by persona, chapter, review state, and conflict state", async () => {
    const prismaMock = createPrismaMock({
      chapters: [
        chapter({ id: CHAPTER_ID_1, no: 1, title: "初登场" }),
        chapter({ id: CHAPTER_ID_2, no: 2, title: "再会" }),
        chapter({ id: CHAPTER_ID_3, no: 3, title: "空章" })
      ],
      personas: [
        persona({ id: PERSONA_ID_1, name: "Alpha" }),
        persona({ id: PERSONA_ID_2, name: "Beta" })
      ],
      personaChapterFacts: [
        personaChapterFact({
          personaId         : PERSONA_ID_1,
          chapterId         : CHAPTER_ID_1,
          chapterNo         : 1,
          conflictCount     : 1,
          reviewStateSummary: { EVENT: { PENDING: 1 } }
        }),
        personaChapterFact({
          id                : "85858585-8585-4858-8858-858585858585",
          personaId         : PERSONA_ID_1,
          chapterId         : CHAPTER_ID_2,
          chapterNo         : 2,
          conflictCount     : 0,
          reviewStateSummary: { EVENT: { ACCEPTED: 1 } }
        }),
        personaChapterFact({
          id                : "86868686-8686-4868-8868-868686868686",
          personaId         : PERSONA_ID_2,
          chapterId         : CHAPTER_ID_2,
          chapterNo         : 2,
          conflictCount     : 0,
          reviewStateSummary: { RELATION: { DEFERRED: 1 } }
        })
      ]
    });
    const service = createReviewQueryService(prismaMock as never);

    const personaFiltered = await service.getPersonaChapterMatrix({
      bookId   : BOOK_ID,
      personaId: PERSONA_ID_1
    });
    expect(personaFiltered.personas.map((item) => item.personaId)).toEqual([PERSONA_ID_1]);
    expect(personaFiltered.cells.every((item) => item.personaId === PERSONA_ID_1)).toBe(true);

    const chapterFiltered = await service.getPersonaChapterMatrix({
      bookId   : BOOK_ID,
      chapterId: CHAPTER_ID_2
    });
    expect(chapterFiltered.cells.map((item) => item.chapterId)).toEqual([CHAPTER_ID_2, CHAPTER_ID_2]);

    const reviewStateFiltered = await service.getPersonaChapterMatrix({
      bookId      : BOOK_ID,
      reviewStates: ["DEFERRED"]
    });
    expect(reviewStateFiltered.personas.map((item) => item.personaId)).toEqual([PERSONA_ID_2]);
    expect(reviewStateFiltered.cells).toEqual([
      expect.objectContaining({
        personaId: PERSONA_ID_2,
        chapterId: CHAPTER_ID_2
      })
    ]);

    const conflictFiltered = await service.getPersonaChapterMatrix({
      bookId       : BOOK_ID,
      conflictState: "ACTIVE"
    });
    expect(conflictFiltered.personas.map((item) => item.personaId)).toEqual([PERSONA_ID_1]);
    expect(conflictFiltered.cells).toEqual([
      expect.objectContaining({
        personaId    : PERSONA_ID_1,
        chapterId    : CHAPTER_ID_1,
        conflictCount: 1
      })
    ]);
  });

  it("applies persona pagination without dropping chapter metadata", async () => {
    const prismaMock = createPrismaMock({
      chapters: [
        chapter({ id: CHAPTER_ID_1, no: 1, title: "初登场" }),
        chapter({ id: CHAPTER_ID_2, no: 2, title: "再会" }),
        chapter({ id: CHAPTER_ID_3, no: 3, title: "空章" })
      ],
      personas: [
        persona({ id: PERSONA_ID_1, name: "Alpha" }),
        persona({ id: PERSONA_ID_2, name: "Beta" })
      ],
      personaChapterFacts: [
        personaChapterFact({ personaId: PERSONA_ID_1, chapterId: CHAPTER_ID_1, chapterNo: 1 }),
        personaChapterFact({
          id       : "87878787-8787-4878-8878-878787878787",
          personaId: PERSONA_ID_2,
          chapterId: CHAPTER_ID_2,
          chapterNo: 2
        })
      ]
    });
    const service = createReviewQueryService(prismaMock as never);

    const result = await service.getPersonaChapterMatrix({
      bookId        : BOOK_ID,
      limitPersonas : 1,
      offsetPersonas: 1
    });

    expect(result.personas).toHaveLength(1);
    expect(result.personas[0]?.personaId).toBe(PERSONA_ID_2);
    expect(result.cells).toEqual([
      expect.objectContaining({
        personaId: PERSONA_ID_2,
        chapterId: CHAPTER_ID_2
      })
    ]);
    expect(result.chapters.map((item) => item.chapterId)).toEqual([
      CHAPTER_ID_1,
      CHAPTER_ID_2,
      CHAPTER_ID_3
    ]);
  });

  it("returns empty matrix summaries and relation type options when dependencies are unavailable", async () => {
    const service = createReviewQueryService(createPrismaMock({
      chapters: [
        chapter({ id: CHAPTER_ID_1, no: 1, title: "初登场" }),
        chapter({ id: CHAPTER_ID_2, no: 2, title: "再会" })
      ]
    }) as never);

    const result = await service.getPersonaChapterMatrix({ bookId: BOOK_ID });

    expect(result.personas).toEqual([]);
    expect(result.cells).toEqual([]);
    expect(result.chapters).toEqual([
      {
        chapterId: CHAPTER_ID_1,
        chapterNo: 1,
        title    : "初登场",
        label    : "第1回 初登场"
      },
      {
        chapterId: CHAPTER_ID_2,
        chapterNo: 2,
        title    : "再会",
        label    : "第2回 再会"
      }
    ]);
    expect(result.relationTypeOptions).toEqual([]);
  });

  it("returns personas from persona chapter facts without reading legacy profiles", async () => {
    // Arrange: three personas are seeded, but only Alpha (PERSONA_ID_1) and
    // Beta (PERSONA_ID_2) have projection rows in persona_chapter_facts.
    // Ghost (PERSONA_ID_3) has no projection row — it must be absent from the
    // result, which is the definitive proof that the service derives its
    // persona list from projection rows rather than from the personas table.
    const profileFindMany = vi.fn();

    const prismaMock = {
      ...createPrismaMock({
        chapters: [
          chapter({ id: CHAPTER_ID_1, no: 1, title: "初登场" })
        ],
        personas: [
          persona({ id: PERSONA_ID_1, name: "Alpha", aliases: ["甲"] }),
          persona({ id: PERSONA_ID_2, name: "Beta",  aliases: ["乙"] }),
          persona({ id: PERSONA_ID_3, name: "Ghost", aliases: [] })
        ],
        personaChapterFacts: [
          personaChapterFact({
            id       : "fa000001-0000-4000-8000-000000000001",
            personaId: PERSONA_ID_1,
            chapterId: CHAPTER_ID_1,
            chapterNo: 1
          }),
          personaChapterFact({
            id       : "fa000002-0000-4000-8000-000000000002",
            personaId: PERSONA_ID_2,
            chapterId: CHAPTER_ID_1,
            chapterNo: 1
          })
          // PERSONA_ID_3 ("Ghost") intentionally has no projection row.
        ]
      }),
      // Supplemental guard: legacy profile table must never be consulted.
      profile: { findMany: profileFindMany, findUnique: profileFindMany }
    };

    const service = createReviewQueryService(prismaMock as never);

    // Act
    const result = await service.getPersonaChapterMatrix({ bookId: BOOK_ID });

    // Primary assertion: only projection-backed personas appear.
    const returnedIds = result.personas.map((p) => p.personaId).sort();
    expect(returnedIds).toEqual([PERSONA_ID_1, PERSONA_ID_2].sort());
    // Ghost persona must be absent — proves source is persona_chapter_facts.
    expect(returnedIds).not.toContain(PERSONA_ID_3);

    // DisplayName is resolved from the linked persona row.
    const alpha = result.personas.find((p) => p.personaId === PERSONA_ID_1);
    const beta  = result.personas.find((p) => p.personaId === PERSONA_ID_2);
    expect(alpha?.displayName).toBe("Alpha");
    expect(beta?.displayName).toBe("Beta");

    // Supplemental: legacy profile table was never touched.
    expect(profileFindMany).not.toHaveBeenCalled();
  });

  it("builds persona-time matrix summaries with stable time groups and linked chapter metadata", async () => {
    const prismaMock = createPrismaMock({
      chapters: [
        chapter({ id: CHAPTER_ID_1, no: 1, title: "初登场" }),
        chapter({ id: CHAPTER_ID_2, no: 2, title: "赤壁战前" }),
        chapter({ id: CHAPTER_ID_3, no: 3, title: "赤壁战后" })
      ],
      personas: [
        persona({ id: PERSONA_ID_1, name: "Alpha", aliases: ["甲"] }),
        persona({ id: PERSONA_ID_2, name: "Beta", aliases: ["乙"] })
      ],
      identityResolutionClaims: [
        identityClaim({ personaCandidateId: CANDIDATE_ID_1, resolvedPersonaId: PERSONA_ID_1 }),
        identityClaim({
          id                : "9b9b9b9b-9b9b-49b9-89b9-9b9b9b9b9b9b",
          personaCandidateId: CANDIDATE_ID_2,
          resolvedPersonaId : PERSONA_ID_1,
          createdAt         : new Date("2026-04-21T08:10:00.000Z")
        }),
        identityClaim({
          id                : "9c9c9c9c-9c9c-49c9-89c9-9c9c9c9c9c9c",
          personaCandidateId: CANDIDATE_ID_3,
          resolvedPersonaId : PERSONA_ID_2,
          createdAt         : new Date("2026-04-21T08:20:00.000Z")
        })
      ],
      timeClaims: [
        timeClaim({
          id                 : TIME_ID_1,
          chapterId          : CHAPTER_ID_1,
          rawTimeText        : "春日",
          timeType           : "RELATIVE_PHASE",
          normalizedLabel    : "春日",
          relativeOrderWeight: 10,
          chapterRangeStart  : 1,
          chapterRangeEnd    : 1
        }),
        timeClaim({
          id                 : TIME_ID_2,
          chapterId          : CHAPTER_ID_1,
          rawTimeText        : "初春",
          timeType           : "RELATIVE_PHASE",
          normalizedLabel    : "春日",
          relativeOrderWeight: 10,
          chapterRangeStart  : 1,
          chapterRangeEnd    : 1,
          updatedAt          : new Date("2026-04-21T08:05:00.000Z")
        }),
        timeClaim({
          id                 : TIME_ID_3,
          chapterId          : CHAPTER_ID_2,
          rawTimeText        : "赤壁之战前",
          timeType           : "NAMED_EVENT",
          normalizedLabel    : "赤壁之战前",
          relativeOrderWeight: 20,
          chapterRangeStart  : 2,
          chapterRangeEnd    : 3
        }),
        timeClaim({
          id                 : TIME_ID_4,
          chapterId          : CHAPTER_ID_3,
          rawTimeText        : "建安十三年",
          timeType           : "HISTORICAL_YEAR",
          normalizedLabel    : "建安十三年",
          relativeOrderWeight: 30,
          chapterRangeStart  : 3,
          chapterRangeEnd    : 3
        }),
        timeClaim({
          id                 : TIME_ID_5,
          chapterId          : CHAPTER_ID_1,
          rawTimeText        : "早春",
          timeType           : "RELATIVE_PHASE",
          normalizedLabel    : "早春",
          relativeOrderWeight: 5,
          chapterRangeStart  : 1,
          chapterRangeEnd    : 1
        })
      ],
      personaTimeFacts: [
        personaTimeFact({
          personaId         : PERSONA_ID_1,
          timeLabel         : "春日",
          timeSortKey       : 10,
          chapterRangeStart : 1,
          chapterRangeEnd   : 1,
          eventCount        : 2,
          relationCount     : 1,
          sourceTimeClaimIds: [TIME_ID_2, TIME_ID_1],
          updatedAt         : new Date("2026-04-21T11:40:00.000Z")
        }),
        personaTimeFact({
          id                : "9d9d9d9d-9d9d-49d9-89d9-9d9d9d9d9d9d",
          personaId         : PERSONA_ID_1,
          timeLabel         : "建安十三年",
          timeSortKey       : 30,
          chapterRangeStart : 3,
          chapterRangeEnd   : 3,
          eventCount        : 1,
          relationCount     : 0,
          sourceTimeClaimIds: [TIME_ID_4],
          updatedAt         : new Date("2026-04-21T11:50:00.000Z")
        }),
        personaTimeFact({
          id                : "9e9e9e9e-9e9e-49e9-89e9-9e9e9e9e9e9e",
          personaId         : PERSONA_ID_2,
          timeLabel         : "早春",
          timeSortKey       : 5,
          chapterRangeStart : 1,
          chapterRangeEnd   : 1,
          eventCount        : 1,
          relationCount     : 0,
          sourceTimeClaimIds: [TIME_ID_5],
          updatedAt         : new Date("2026-04-21T11:20:00.000Z")
        }),
        personaTimeFact({
          id                : "9f9f9f9f-9f9f-49f9-89f9-9f9f9f9f9f9f",
          personaId         : PERSONA_ID_2,
          timeLabel         : "赤壁之战前",
          timeSortKey       : 20,
          chapterRangeStart : 2,
          chapterRangeEnd   : 3,
          eventCount        : 0,
          relationCount     : 2,
          sourceTimeClaimIds: [TIME_ID_3],
          updatedAt         : new Date("2026-04-21T11:45:00.000Z")
        })
      ]
    });
    const service = createReviewQueryService(prismaMock as never);

    const result = await service.getPersonaTimeMatrix({ bookId: BOOK_ID });

    expect(result.bookId).toBe(BOOK_ID);
    expect(result.timeGroups.map((group) => group.timeType)).toEqual([
      "CHAPTER_ORDER",
      "RELATIVE_PHASE",
      "NAMED_EVENT",
      "HISTORICAL_YEAR",
      "BATTLE_PHASE",
      "UNCERTAIN"
    ]);
    expect(result.timeGroups.map((group) => group.defaultCollapsed)).toEqual([
      true,
      false,
      true,
      true,
      true,
      true
    ]);
    expect(result.personas).toEqual([
      expect.objectContaining({
        personaId          : PERSONA_ID_2,
        displayName        : "Beta",
        aliases            : ["乙"],
        firstTimeSortKey   : 5,
        totalEventCount    : 1,
        totalRelationCount : 2,
        totalTimeClaimCount: 2
      }),
      expect.objectContaining({
        personaId          : PERSONA_ID_1,
        displayName        : "Alpha",
        aliases            : ["甲"],
        firstTimeSortKey   : 10,
        totalEventCount    : 3,
        totalRelationCount : 1,
        totalTimeClaimCount: 3
      })
    ]);

    const relativePhaseGroup = result.timeGroups[1];
    expect(relativePhaseGroup?.slices.map((slice) => slice.normalizedLabel)).toEqual(["早春", "春日"]);

    const springSlice = relativePhaseGroup?.slices.find((slice) => slice.normalizedLabel === "春日");
    expect(springSlice).toEqual(expect.objectContaining({
      timeType          : "RELATIVE_PHASE",
      rawLabels         : ["初春", "春日"],
      timeSortKey       : 10,
      chapterRangeStart : 1,
      chapterRangeEnd   : 1,
      sourceTimeClaimIds: [TIME_ID_1, TIME_ID_2],
      linkedChapters    : [{
        chapterId: CHAPTER_ID_1,
        chapterNo: 1,
        label    : "第1回 初登场"
      }]
    }));

    const namedEventSlice = result.timeGroups[2]?.slices[0];
    expect(namedEventSlice).toEqual(expect.objectContaining({
      normalizedLabel: "赤壁之战前",
      rawLabels      : ["赤壁之战前"],
      linkedChapters : [
        {
          chapterId: CHAPTER_ID_2,
          chapterNo: 2,
          label    : "第2回 赤壁战前"
        },
        {
          chapterId: CHAPTER_ID_3,
          chapterNo: 3,
          label    : "第3回 赤壁战后"
        }
      ]
    }));

    expect(result.cells).toEqual([
      expect.objectContaining({
        personaId         : PERSONA_ID_2,
        normalizedLabel   : "早春",
        eventCount        : 1,
        relationCount     : 0,
        timeClaimCount    : 1,
        sourceTimeClaimIds: [TIME_ID_5]
      }),
      expect.objectContaining({
        personaId         : PERSONA_ID_2,
        normalizedLabel   : "赤壁之战前",
        eventCount        : 0,
        relationCount     : 2,
        timeClaimCount    : 1,
        sourceTimeClaimIds: [TIME_ID_3],
        timeKey           : namedEventSlice?.timeKey
      }),
      expect.objectContaining({
        personaId         : PERSONA_ID_1,
        normalizedLabel   : "春日",
        eventCount        : 2,
        relationCount     : 1,
        timeClaimCount    : 2,
        sourceTimeClaimIds: [TIME_ID_1, TIME_ID_2],
        timeKey           : springSlice?.timeKey
      }),
      expect.objectContaining({
        personaId         : PERSONA_ID_1,
        normalizedLabel   : "建安十三年",
        eventCount        : 1,
        relationCount     : 0,
        timeClaimCount    : 1,
        sourceTimeClaimIds: [TIME_ID_4]
      })
    ]);
    expect(result.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("filters persona-time matrix by persona and time type while keeping group order stable", async () => {
    const prismaMock = createPrismaMock({
      chapters: [
        chapter({ id: CHAPTER_ID_1, no: 1, title: "初登场" }),
        chapter({ id: CHAPTER_ID_2, no: 2, title: "赤壁战前" }),
        chapter({ id: CHAPTER_ID_3, no: 3, title: "赤壁战后" })
      ],
      personas: [
        persona({ id: PERSONA_ID_1, name: "Alpha" }),
        persona({ id: PERSONA_ID_2, name: "Beta" })
      ],
      identityResolutionClaims: [
        identityClaim({ personaCandidateId: CANDIDATE_ID_1, resolvedPersonaId: PERSONA_ID_1 }),
        identityClaim({
          id                : "a0a0a0a0-a0a0-40a0-80a0-a0a0a0a0a0a0",
          personaCandidateId: CANDIDATE_ID_3,
          resolvedPersonaId : PERSONA_ID_2
        })
      ],
      timeClaims: [
        timeClaim({
          id                 : TIME_ID_3,
          chapterId          : CHAPTER_ID_2,
          rawTimeText        : "赤壁之战前",
          timeType           : "NAMED_EVENT",
          normalizedLabel    : "赤壁之战前",
          relativeOrderWeight: 20,
          chapterRangeStart  : 2,
          chapterRangeEnd    : 3
        }),
        timeClaim({
          id                 : TIME_ID_4,
          chapterId          : CHAPTER_ID_3,
          rawTimeText        : "建安十三年",
          timeType           : "HISTORICAL_YEAR",
          normalizedLabel    : "建安十三年",
          relativeOrderWeight: 30,
          chapterRangeStart  : 3,
          chapterRangeEnd    : 3
        })
      ],
      personaTimeFacts: [
        personaTimeFact({
          personaId         : PERSONA_ID_1,
          timeLabel         : "建安十三年",
          timeSortKey       : 30,
          chapterRangeStart : 3,
          chapterRangeEnd   : 3,
          sourceTimeClaimIds: [TIME_ID_4]
        }),
        personaTimeFact({
          id                : "a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1",
          personaId         : PERSONA_ID_2,
          timeLabel         : "赤壁之战前",
          timeSortKey       : 20,
          chapterRangeStart : 2,
          chapterRangeEnd   : 3,
          sourceTimeClaimIds: [TIME_ID_3]
        })
      ]
    });
    const service = createReviewQueryService(prismaMock as never);

    const result = await service.getPersonaTimeMatrix({
      bookId   : BOOK_ID,
      personaId: PERSONA_ID_1,
      timeTypes: ["HISTORICAL_YEAR"]
    });

    expect(result.personas.map((persona) => persona.personaId)).toEqual([PERSONA_ID_1]);
    expect(result.cells).toEqual([
      expect.objectContaining({
        personaId         : PERSONA_ID_1,
        normalizedLabel   : "建安十三年",
        sourceTimeClaimIds: [TIME_ID_4]
      })
    ]);
    expect(result.timeGroups.map((group) => ({
      timeType: group.timeType,
      slices  : group.slices.map((slice) => slice.normalizedLabel)
    }))).toEqual([
      { timeType: "CHAPTER_ORDER", slices: [] },
      { timeType: "RELATIVE_PHASE", slices: [] },
      { timeType: "NAMED_EVENT", slices: [] },
      { timeType: "HISTORICAL_YEAR", slices: ["建安十三年"] },
      { timeType: "BATTLE_PHASE", slices: [] },
      { timeType: "UNCERTAIN", slices: [] }
    ]);
  });

  it("returns empty persona-time matrix groups when no projection rows are available", async () => {
    const service = createReviewQueryService(createPrismaMock({
      chapters: [chapter({ id: CHAPTER_ID_1, no: 1, title: "初登场" })]
    }) as never);

    const result = await service.getPersonaTimeMatrix({ bookId: BOOK_ID });

    expect(result.personas).toEqual([]);
    expect(result.cells).toEqual([]);
    expect(result.timeGroups).toEqual([
      { timeType: "CHAPTER_ORDER", label: "章节顺序", defaultCollapsed: true, slices: [] },
      { timeType: "RELATIVE_PHASE", label: "相对阶段", defaultCollapsed: true, slices: [] },
      { timeType: "NAMED_EVENT", label: "事件节点", defaultCollapsed: true, slices: [] },
      { timeType: "HISTORICAL_YEAR", label: "历史年份", defaultCollapsed: true, slices: [] },
      { timeType: "BATTLE_PHASE", label: "战役阶段", defaultCollapsed: true, slices: [] },
      { timeType: "UNCERTAIN", label: "未定时间", defaultCollapsed: true, slices: [] }
    ]);
  });

  it("builds relation editor pair summaries with stable unordered pairs, warnings, and selected pair claims", async () => {
    const relationTypeCatalogLoader = {
      load: vi.fn().mockResolvedValue({
        activeEntries: [
          {
            relationTypeKey   : "teacher_of",
            defaultLabel      : "师生",
            direction         : "FORWARD",
            relationTypeSource: "PRESET",
            aliasLabels       : ["师徒"],
            systemPreset      : true
          },
          {
            relationTypeKey   : "enemy_of",
            defaultLabel      : "敌对",
            direction         : "BIDIRECTIONAL",
            relationTypeSource: "PRESET",
            aliasLabels       : [],
            systemPreset      : true
          }
        ]
      })
    };
    const prismaMock = createPrismaMock({
      books   : [bookRecord()],
      personas: [
        persona({ id: PERSONA_ID_1, name: "Alpha", aliases: ["甲"] }),
        persona({ id: PERSONA_ID_2, name: "Beta", aliases: ["乙"] }),
        persona({ id: PERSONA_ID_3, name: "Gamma", aliases: ["丙"] })
      ],
      relationClaims: [
        relationClaim({
          id                      : RELATION_ID_1,
          sourcePersonaCandidateId: CANDIDATE_ID_1,
          targetPersonaCandidateId: CANDIDATE_ID_2,
          relationTypeKey         : "teacher_of",
          relationLabel           : "师生",
          direction               : "FORWARD",
          effectiveChapterStart   : 1,
          effectiveChapterEnd     : 3,
          reviewState             : "PENDING",
          updatedAt               : new Date("2026-04-21T12:00:00.000Z")
        }),
        relationClaim({
          id                      : RELATION_ID_2,
          chapterId               : CHAPTER_ID_2,
          sourcePersonaCandidateId: CANDIDATE_ID_2,
          targetPersonaCandidateId: CANDIDATE_ID_1,
          relationTypeKey         : "custom_patron_of",
          relationLabel           : "提携",
          relationTypeSource      : "CUSTOM",
          direction               : "REVERSE",
          effectiveChapterStart   : 2,
          effectiveChapterEnd     : 5,
          reviewState             : "ACCEPTED",
          source                  : "MANUAL",
          updatedAt               : new Date("2026-04-21T11:00:00.000Z")
        }),
        relationClaim({
          id                      : RELATION_ID_3,
          chapterId               : CHAPTER_ID_2,
          sourcePersonaCandidateId: CANDIDATE_ID_1,
          targetPersonaCandidateId: CANDIDATE_ID_3,
          relationTypeKey         : "enemy_of",
          relationLabel           : "敌对",
          direction               : "BIDIRECTIONAL",
          effectiveChapterStart   : 6,
          effectiveChapterEnd     : 6,
          reviewState             : "DEFERRED",
          updatedAt               : new Date("2026-04-21T11:30:00.000Z")
        }),
        relationClaim({
          id                      : RELATION_ID_4,
          chapterId               : CHAPTER_ID_3,
          sourcePersonaCandidateId: CANDIDATE_ID_2,
          targetPersonaCandidateId: CANDIDATE_ID_3,
          relationTypeKey         : "ally_of",
          relationLabel           : "同盟",
          direction               : "BIDIRECTIONAL",
          effectiveChapterStart   : 7,
          effectiveChapterEnd     : 8,
          reviewState             : "DEFERRED",
          updatedAt               : new Date("2026-04-21T11:30:00.000Z")
        }),
        relationClaim({
          id                      : RELATION_ID_5,
          sourcePersonaCandidateId: CANDIDATE_ID_4,
          targetPersonaCandidateId: CANDIDATE_ID_2,
          relationTypeKey         : "ghost_of",
          relationLabel           : "未解析",
          updatedAt               : new Date("2026-04-21T13:00:00.000Z")
        })
      ],
      identityResolutionClaims: [
        identityClaim({ personaCandidateId: CANDIDATE_ID_1, resolvedPersonaId: PERSONA_ID_1 }),
        identityClaim({
          id                : "95959595-9595-4595-8595-959595959595",
          personaCandidateId: CANDIDATE_ID_2,
          resolvedPersonaId : PERSONA_ID_2
        }),
        identityClaim({
          id                : "96969696-9696-4696-8696-969696969696",
          personaCandidateId: CANDIDATE_ID_3,
          resolvedPersonaId : PERSONA_ID_3
        })
      ],
      conflictFlags: [
        conflictFlag({
          id             : CONFLICT_ID_1,
          relatedClaimIds: [RELATION_ID_1]
        })
      ]
    });
    const service = createReviewQueryService(prismaMock as never, {
      relationTypeCatalogLoader: relationTypeCatalogLoader as never
    });

    const result = await service.getRelationEditorView({
      bookId       : BOOK_ID,
      personaId    : PERSONA_ID_1,
      pairPersonaId: PERSONA_ID_2
    });

    expect(result.personaOptions).toEqual([
      { personaId: PERSONA_ID_1, displayName: "Alpha", aliases: ["甲"] },
      { personaId: PERSONA_ID_2, displayName: "Beta", aliases: ["乙"] },
      { personaId: PERSONA_ID_3, displayName: "Gamma", aliases: ["丙"] }
    ]);
    expect(result.relationTypeOptions).toEqual([
      {
        relationTypeKey   : "teacher_of",
        label             : "师生",
        direction         : "FORWARD",
        relationTypeSource: "PRESET",
        aliasLabels       : ["师徒"],
        systemPreset      : true
      },
      {
        relationTypeKey   : "enemy_of",
        label             : "敌对",
        direction         : "BIDIRECTIONAL",
        relationTypeSource: "PRESET",
        aliasLabels       : [],
        systemPreset      : true
      }
    ]);
    expect(result.pairSummaries.map((item) => item.pairKey)).toEqual([
      `${PERSONA_ID_1}::${PERSONA_ID_2}`,
      `${PERSONA_ID_1}::${PERSONA_ID_3}`
    ]);
    expect(result.pairSummaries[0]).toMatchObject({
      pairKey           : `${PERSONA_ID_1}::${PERSONA_ID_2}`,
      leftPersonaId     : PERSONA_ID_1,
      rightPersonaId    : PERSONA_ID_2,
      leftPersonaName   : "Alpha",
      rightPersonaName  : "Beta",
      totalClaims       : 2,
      activeClaims      : 2,
      relationTypeKeys  : ["custom_patron_of", "teacher_of"],
      reviewStateSummary: {
        ACCEPTED: 1,
        PENDING : 1
      },
      warningFlags: {
        directionConflict: true,
        intervalConflict : true
      }
    });
    expect(result.selectedPair).toMatchObject({
      pairKey    : `${PERSONA_ID_1}::${PERSONA_ID_2}`,
      leftPersona: {
        personaId  : PERSONA_ID_1,
        displayName: "Alpha",
        aliases    : ["甲"]
      },
      rightPersona: {
        personaId  : PERSONA_ID_2,
        displayName: "Beta",
        aliases    : ["乙"]
      },
      warnings: {
        directionConflict: true,
        intervalConflict : true
      }
    });
    expect(result.selectedPair?.claims).toEqual([
      expect.objectContaining({
        claimId              : RELATION_ID_1,
        relationTypeKey      : "teacher_of",
        relationLabel        : "师生",
        direction            : "FORWARD",
        reviewState          : "PENDING",
        conflictState        : "ACTIVE",
        effectiveChapterStart: 1,
        effectiveChapterEnd  : 3
      }),
      expect.objectContaining({
        claimId              : RELATION_ID_2,
        relationTypeKey      : "custom_patron_of",
        relationLabel        : "提携",
        direction            : "REVERSE",
        reviewState          : "ACCEPTED",
        conflictState        : "NONE",
        effectiveChapterStart: 2,
        effectiveChapterEnd  : 5
      })
    ]);
    expect(relationTypeCatalogLoader.load).toHaveBeenCalledWith({
      bookId     : BOOK_ID,
      bookTypeKey: "CLASSICAL_NOVEL",
      runId      : null,
      mode       : "REVIEW"
    });
  });

  it("filters and paginates relation editor pairs without dropping filter metadata", async () => {
    const relationTypeCatalogLoader = {
      load: vi.fn().mockResolvedValue({
        activeEntries: [{
          relationTypeKey   : "teacher_of",
          defaultLabel      : "师生",
          direction         : "FORWARD",
          relationTypeSource: "PRESET",
          aliasLabels       : ["师徒"],
          systemPreset      : true
        }]
      })
    };
    const prismaMock = createPrismaMock({
      books   : [bookRecord()],
      personas: [
        persona({ id: PERSONA_ID_1, name: "Alpha" }),
        persona({ id: PERSONA_ID_2, name: "Beta" }),
        persona({ id: PERSONA_ID_3, name: "Gamma" })
      ],
      relationClaims: [
        relationClaim({
          id                      : RELATION_ID_1,
          sourcePersonaCandidateId: CANDIDATE_ID_1,
          targetPersonaCandidateId: CANDIDATE_ID_2,
          relationTypeKey         : "teacher_of",
          reviewState             : "PENDING",
          updatedAt               : new Date("2026-04-21T12:00:00.000Z")
        }),
        relationClaim({
          id                      : RELATION_ID_2,
          sourcePersonaCandidateId: CANDIDATE_ID_1,
          targetPersonaCandidateId: CANDIDATE_ID_3,
          relationTypeKey         : "enemy_of",
          relationLabel           : "敌对",
          direction               : "BIDIRECTIONAL",
          reviewState             : "DEFERRED",
          updatedAt               : new Date("2026-04-21T11:30:00.000Z")
        }),
        relationClaim({
          id                      : RELATION_ID_3,
          sourcePersonaCandidateId: CANDIDATE_ID_2,
          targetPersonaCandidateId: CANDIDATE_ID_3,
          relationTypeKey         : "teacher_of",
          reviewState             : "ACCEPTED",
          updatedAt               : new Date("2026-04-21T11:00:00.000Z")
        })
      ],
      identityResolutionClaims: [
        identityClaim({ personaCandidateId: CANDIDATE_ID_1, resolvedPersonaId: PERSONA_ID_1 }),
        identityClaim({
          id                : "97979797-9797-4797-8797-979797979797",
          personaCandidateId: CANDIDATE_ID_2,
          resolvedPersonaId : PERSONA_ID_2
        }),
        identityClaim({
          id                : "98989898-9898-4898-8898-989898989898",
          personaCandidateId: CANDIDATE_ID_3,
          resolvedPersonaId : PERSONA_ID_3
        })
      ],
      conflictFlags: [
        conflictFlag({
          id             : CONFLICT_ID_1,
          relatedClaimIds: [RELATION_ID_1]
        })
      ]
    });
    const service = createReviewQueryService(prismaMock as never, {
      relationTypeCatalogLoader: relationTypeCatalogLoader as never
    });

    const teacherOnly = await service.getRelationEditorView({
      bookId          : BOOK_ID,
      relationTypeKeys: ["teacher_of"]
    });
    expect(teacherOnly.pairSummaries.map((item) => item.pairKey)).toEqual([
      `${PERSONA_ID_1}::${PERSONA_ID_2}`,
      `${PERSONA_ID_2}::${PERSONA_ID_3}`
    ]);

    const pendingOnly = await service.getRelationEditorView({
      bookId      : BOOK_ID,
      reviewStates: ["PENDING"]
    });
    expect(pendingOnly.pairSummaries.map((item) => item.pairKey)).toEqual([
      `${PERSONA_ID_1}::${PERSONA_ID_2}`
    ]);

    const activeConflictOnly = await service.getRelationEditorView({
      bookId       : BOOK_ID,
      conflictState: "ACTIVE"
    });
    expect(activeConflictOnly.pairSummaries.map((item) => item.pairKey)).toEqual([
      `${PERSONA_ID_1}::${PERSONA_ID_2}`
    ]);

    const paged = await service.getRelationEditorView({
      bookId     : BOOK_ID,
      limitPairs : 1,
      offsetPairs: 1
    });
    expect(paged.pairSummaries).toHaveLength(1);
    expect(paged.pairSummaries[0]?.pairKey).toBe(`${PERSONA_ID_1}::${PERSONA_ID_3}`);
    expect(paged.relationTypeOptions).toEqual([{
      relationTypeKey   : "teacher_of",
      label             : "师生",
      direction         : "FORWARD",
      relationTypeSource: "PRESET",
      aliasLabels       : ["师徒"],
      systemPreset      : true
    }]);

    const halfSelected = await service.getRelationEditorView({
      bookId   : BOOK_ID,
      personaId: PERSONA_ID_1
    });
    expect(halfSelected.selectedPair).toBeNull();
  });

  it("returns deterministic empty relation editor options when no catalog dependency is available", async () => {
    const prismaMock = createPrismaMock({
      relationClaims: [
        relationClaim({
          id                      : RELATION_ID_1,
          sourcePersonaCandidateId: CANDIDATE_ID_1,
          targetPersonaCandidateId: CANDIDATE_ID_2
        })
      ],
      personas: [
        persona({ id: PERSONA_ID_1, name: "Alpha" }),
        persona({ id: PERSONA_ID_2, name: "Beta" })
      ],
      identityResolutionClaims: [
        identityClaim({ personaCandidateId: CANDIDATE_ID_1, resolvedPersonaId: PERSONA_ID_1 }),
        identityClaim({
          id                : "99999999-9999-4999-8999-999999999999",
          personaCandidateId: CANDIDATE_ID_2,
          resolvedPersonaId : PERSONA_ID_2
        })
      ]
    });
    const service = createReviewQueryService(prismaMock as never);

    const result = await service.getRelationEditorView({ bookId: BOOK_ID });

    expect(result.pairSummaries.map((item) => item.pairKey)).toEqual([
      `${PERSONA_ID_1}::${PERSONA_ID_2}`
    ]);
    expect(result.relationTypeOptions).toEqual([]);
  });

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

  it("returns typed claim detail with evidence labels, ai summary, curated audit diffs, and audit-first version diff", async () => {
    const prismaMock = createPrismaMock({
      chapters: [
        chapter({ id: CHAPTER_ID_1, no: 1, title: "初登场" }),
        chapter({ id: CHAPTER_ID_2, no: 2, title: "再会" })
      ],
      eventClaims: [
        eventClaim({
          id                : EVENT_ID_1,
          source            : "MANUAL",
          reviewState       : "ACCEPTED",
          predicate         : "中举",
          objectText        : "省试",
          runId             : RUN_ID_MANUAL,
          confidence        : 0.64,
          supersedesClaimId : EVENT_ID_2,
          derivedFromClaimId: EVENT_ID_2,
          evidenceSpanIds   : [EVIDENCE_ID_1, EVIDENCE_ID_2]
        }),
        eventClaim({
          id                : EVENT_ID_2,
          source            : "MANUAL",
          reviewState       : "EDITED",
          predicate         : "赴试",
          objectText        : "乡试",
          runId             : RUN_ID_MANUAL_PREVIOUS,
          confidence        : 0.59,
          supersedesClaimId : EVENT_ID_AI,
          derivedFromClaimId: EVENT_ID_AI
        }),
        eventClaim({
          id                : EVENT_ID_AI,
          source            : "AI",
          reviewState       : "ACCEPTED",
          predicate         : "赴试",
          objectText        : "乡试",
          runId             : RUN_ID_AI,
          confidence        : 0.88,
          supersedesClaimId : null,
          derivedFromClaimId: null
        })
      ],
      timeClaims              : [timeClaim({ id: TIME_ID_1, normalizedLabel: "春日" })],
      identityResolutionClaims: [identityClaim({ reviewState: "ACCEPTED" })],
      evidenceSpans           : [
        evidenceSpan({
          id                 : EVIDENCE_ID_1,
          chapterId          : CHAPTER_ID_2,
          startOffset        : 20,
          quotedText         : "证据二",
          normalizedText     : "证据二",
          speakerHint        : "叙事",
          narrativeRegionType: "NARRATIVE"
        }),
        evidenceSpan({
          id                 : EVIDENCE_ID_2,
          chapterId          : CHAPTER_ID_1,
          startOffset        : 10,
          quotedText         : "证据一",
          normalizedText     : "证据一",
          speakerHint        : "张乡绅",
          narrativeRegionType: "DIALOGUE_CONTENT"
        })
      ],
      llmRawOutputs: [
        llmRawOutput(),
        llmRawOutput({
          id           : RAW_OUTPUT_ID_2,
          stageRunId   : null,
          chapterId    : CHAPTER_ID_2,
          provider     : "fallback-provider",
          model        : "fallback-model",
          responseJson : null,
          responseText : "不应被优先选中的其他章节输出。",
          parseError   : "parse failed",
          discardReason: "MISMATCHED_CHAPTER"
        })
      ],
      analysisStageRuns: [
        analysisStageRun()
      ],
      reviewAuditLogs: [
        auditLog({
          id       : AUDIT_ID_1,
          action   : "ACCEPT",
          createdAt: new Date("2026-04-21T09:00:00.000Z")
        }),
        auditLog({
          id             : AUDIT_ID_2,
          action         : "EDIT",
          actorUserId    : "reviewer-2",
          note           : "补充省试对象",
          evidenceSpanIds: [EVIDENCE_ID_1, EVIDENCE_ID_2],
          createdAt      : new Date("2026-04-21T10:00:00.000Z"),
          beforeState    : {
            predicate      : "赴试",
            objectText     : "乡试",
            evidenceSpanIds: [EVIDENCE_ID_1],
            ignoredKey     : "before"
          },
          afterState: {
            predicate      : "中举",
            objectText     : "省试",
            evidenceSpanIds: [EVIDENCE_ID_1, EVIDENCE_ID_2],
            ignoredKey     : "after"
          }
        })
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
      claim: expect.objectContaining({
        id                : EVENT_ID_1,
        claimKind         : "EVENT",
        source            : "MANUAL",
        runId             : RUN_ID_MANUAL,
        confidence        : 0.64,
        supersedesClaimId : EVENT_ID_2,
        derivedFromClaimId: EVENT_ID_2
      }),
      basisClaim: expect.objectContaining({
        id        : EVENT_ID_AI,
        source    : "AI",
        runId     : RUN_ID_AI,
        confidence: 0.88
      }),
      aiSummary: expect.objectContaining({
        basisClaimId  : EVENT_ID_AI,
        basisClaimKind: "EVENT",
        source        : "AI",
        runId         : RUN_ID_AI,
        confidence    : 0.88,
        rawOutput     : expect.objectContaining({
          stageKey         : "stage_b2",
          provider         : "openai",
          model            : "gpt-5.4-mini",
          hasStructuredJson: true,
          parseError       : null,
          schemaError      : null,
          discardReason    : null,
          responseExcerpt  : "提取到范进赴试，并标注时间为春日。"
        })
      }),
      projectionSummary: expect.objectContaining({
        personaChapterFacts: [expect.objectContaining({ chapterId: CHAPTER_ID_1, personaId: PERSONA_ID_1 })],
        personaTimeFacts   : [expect.objectContaining({ timeLabel: "春日", personaId: PERSONA_ID_1 })],
        timelineEvents     : [expect.objectContaining({ chapterId: CHAPTER_ID_1, personaId: PERSONA_ID_1 })]
      }),
      auditHistory: [
        expect.objectContaining({
          id         : AUDIT_ID_2,
          action     : "EDIT",
          actorUserId: "reviewer-2",
          note       : "补充省试对象",
          fieldDiffs : expect.arrayContaining([
            expect.objectContaining({
              fieldKey  : "predicate",
              beforeText: "赴试",
              afterText : "中举"
            }),
            expect.objectContaining({
              fieldKey  : "objectText",
              beforeText: "乡试",
              afterText : "省试"
            })
          ])
        }),
        expect.objectContaining({ id: AUDIT_ID_1, action: "ACCEPT" })
      ],
      versionDiff: expect.objectContaining({
        versionSource     : "AUDIT_EDIT",
        supersedesClaimId : EVENT_ID_2,
        derivedFromClaimId: EVENT_ID_2,
        fieldDiffs        : expect.arrayContaining([
          expect.objectContaining({
            fieldKey  : "predicate",
            beforeText: "赴试",
            afterText : "中举"
          })
        ])
      })
    });
    expect(detail?.evidence).toEqual([
      expect.objectContaining({
        id                 : EVIDENCE_ID_2,
        chapterId          : CHAPTER_ID_1,
        chapterLabel       : "第1回 初登场",
        startOffset        : 10,
        quotedText         : "证据一",
        normalizedText     : "证据一",
        speakerHint        : "张乡绅",
        narrativeRegionType: "DIALOGUE_CONTENT"
      }),
      expect.objectContaining({
        id                 : EVIDENCE_ID_1,
        chapterId          : CHAPTER_ID_2,
        chapterLabel       : "第2回 再会",
        startOffset        : 20,
        quotedText         : "证据二",
        normalizedText     : "证据二",
        speakerHint        : "叙事",
        narrativeRegionType: "NARRATIVE"
      })
    ]);
    expect(prismaMock.reviewAuditLog.findMany).toHaveBeenCalledWith({
      where  : { claimKind: "EVENT", claimId: EVENT_ID_1 },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }]
    });
  });

  it("falls back to manual lineage diff when no edit audit is available", async () => {
    const prismaMock = createPrismaMock({
      eventClaims: [
        eventClaim({
          id                : EVENT_ID_1,
          source            : "MANUAL",
          predicate         : "中举",
          objectText        : "省试",
          runId             : RUN_ID_MANUAL,
          confidence        : 0.72,
          supersedesClaimId : EVENT_ID_AI,
          derivedFromClaimId: EVENT_ID_AI,
          evidenceSpanIds   : [EVIDENCE_ID_1, EVIDENCE_ID_2]
        }),
        eventClaim({
          id                : EVENT_ID_AI,
          source            : "AI",
          predicate         : "赴试",
          objectText        : "乡试",
          runId             : RUN_ID_AI,
          confidence        : 0.88,
          supersedesClaimId : null,
          derivedFromClaimId: null,
          evidenceSpanIds   : [EVIDENCE_ID_1]
        })
      ],
      timeClaims              : [timeClaim({ id: TIME_ID_1, normalizedLabel: "春日" })],
      identityResolutionClaims: [identityClaim({ reviewState: "ACCEPTED" })],
      reviewAuditLogs         : []
    });
    const service = createReviewQueryService(prismaMock as never);

    const detail = await service.getClaimDetail({
      bookId   : BOOK_ID,
      claimKind: "EVENT",
      claimId  : EVENT_ID_1
    });

    expect(detail?.versionDiff).toEqual(expect.objectContaining({
      versionSource     : "MANUAL_LINEAGE",
      supersedesClaimId : EVENT_ID_AI,
      derivedFromClaimId: EVENT_ID_AI,
      fieldDiffs        : expect.arrayContaining([
        expect.objectContaining({
          fieldKey  : "predicate",
          beforeText: "赴试",
          afterText : "中举"
        }),
        expect.objectContaining({
          fieldKey  : "objectText",
          beforeText: "乡试",
          afterText : "省试"
        })
      ])
    }));
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
