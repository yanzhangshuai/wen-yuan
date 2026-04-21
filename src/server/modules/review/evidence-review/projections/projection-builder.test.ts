import { describe, expect, it, vi } from "vitest";

import {
  PROJECTION_REBUILD_SCOPE_KIND_VALUES,
  buildAcceptedPersonaMapping,
  createProjectionRepository,
  createProjectionBuilder
} from "@/server/modules/review/evidence-review/projections/projection-builder";
import type {
  ConflictFlagProjectionSourceRow,
  EventClaimProjectionSourceRow,
  IdentityResolutionClaimProjectionSourceRow,
  ProjectionChapterSourceRow,
  ProjectionRepository,
  ProjectionRowsByFamily,
  ProjectionPersistenceCounts,
  ProjectionSourcePayload,
  RelationClaimProjectionSourceRow,
  TimeClaimProjectionSourceRow
} from "@/server/modules/review/evidence-review/projections/types";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";
const CHAPTER_ID = "22222222-2222-4222-8222-222222222222";
const CHAPTER_ID_1 = CHAPTER_ID;
const CHAPTER_ID_2 = "23232323-2323-4232-8232-232323232323";
const CLAIM_ID_1 = "33333333-3333-4333-8333-333333333333";
const CLAIM_ID_2 = "44444444-4444-4444-8444-444444444444";
const CLAIM_ID_3 = "45454545-4545-4454-8454-454545454545";
const CLAIM_ID_4 = "46464646-4646-4464-8464-464646464646";
const CANDIDATE_ID_1 = "55555555-5555-4555-8555-555555555555";
const CANDIDATE_ID_2 = "66666666-6666-4666-8666-666666666666";
const CANDIDATE_ID_3 = "77777777-7777-4777-8777-777777777777";
const PERSONA_ID_1 = "88888888-8888-4888-8888-888888888888";
const PERSONA_ID_2 = "99999999-9999-4999-8999-999999999999";
const RUN_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EVENT_ID_1 = CLAIM_ID_1;
const EVENT_ID_2 = CLAIM_ID_2;
const RELATION_ID_1 = CLAIM_ID_3;
const TIME_ID_1 = CLAIM_ID_4;
const CONFLICT_ID_1 = "abababab-abab-4aba-8aba-abababababab";
const NOW = new Date("2026-04-20T00:00:00.000Z");

function identityClaim(
  overrides: Partial<IdentityResolutionClaimProjectionSourceRow> = {}
): IdentityResolutionClaimProjectionSourceRow {
  return {
    id                : CLAIM_ID_1,
    bookId            : BOOK_ID,
    chapterId         : CHAPTER_ID,
    mentionId         : "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    personaCandidateId: CANDIDATE_ID_1,
    resolvedPersonaId : PERSONA_ID_1,
    resolutionKind    : "LINK_EXISTING",
    reviewState       : "ACCEPTED",
    source            : "AI",
    runId             : RUN_ID,
    createdAt         : NOW,
    updatedAt         : NOW,
    ...overrides
  };
}

function eventClaim(
  overrides: Partial<EventClaimProjectionSourceRow> = {}
): EventClaimProjectionSourceRow {
  return {
    id                       : CLAIM_ID_1,
    bookId                   : BOOK_ID,
    chapterId                : CHAPTER_ID,
    subjectPersonaCandidateId: CANDIDATE_ID_1,
    objectPersonaCandidateId : null,
    predicate                : "参加",
    objectText               : "宴会",
    locationText             : null,
    timeHintId               : null,
    eventCategory            : "EVENT",
    narrativeLens            : "SELF",
    evidenceSpanIds          : [],
    confidence               : 0.8,
    reviewState              : "ACCEPTED",
    source                   : "AI",
    runId                    : RUN_ID,
    createdAt                : NOW,
    updatedAt                : NOW,
    ...overrides
  };
}

function relationClaim(
  overrides: Partial<RelationClaimProjectionSourceRow> = {}
): RelationClaimProjectionSourceRow {
  return {
    id                      : RELATION_ID_1,
    bookId                  : BOOK_ID,
    chapterId               : CHAPTER_ID_1,
    sourcePersonaCandidateId: CANDIDATE_ID_1,
    targetPersonaCandidateId: CANDIDATE_ID_2,
    relationTypeKey         : "ALLY",
    relationLabel           : "结盟",
    relationTypeSource      : "PRESET",
    direction               : "BIDIRECTIONAL",
    effectiveChapterStart   : 1,
    effectiveChapterEnd     : 1,
    timeHintId              : TIME_ID_1,
    evidenceSpanIds         : [],
    confidence              : 0.8,
    reviewState             : "ACCEPTED",
    source                  : "AI",
    runId                   : RUN_ID,
    createdAt               : NOW,
    updatedAt               : NOW,
    ...overrides
  };
}

function timeClaim(
  overrides: Partial<TimeClaimProjectionSourceRow> = {}
): TimeClaimProjectionSourceRow {
  return {
    id                 : TIME_ID_1,
    bookId             : BOOK_ID,
    chapterId          : CHAPTER_ID_1,
    rawTimeText        : "春日",
    timeType           : "EXPLICIT",
    normalizedLabel    : "春日",
    relativeOrderWeight: 10,
    chapterRangeStart  : 1,
    chapterRangeEnd    : 1,
    evidenceSpanIds    : [],
    confidence         : 0.9,
    reviewState        : "ACCEPTED",
    source             : "AI",
    runId              : RUN_ID,
    createdAt          : NOW,
    updatedAt          : NOW,
    ...overrides
  };
}

function conflictFlag(
  overrides: Partial<ConflictFlagProjectionSourceRow> = {}
): ConflictFlagProjectionSourceRow {
  return {
    id                        : CONFLICT_ID_1,
    bookId                    : BOOK_ID,
    chapterId                 : CHAPTER_ID_1,
    runId                     : RUN_ID,
    conflictType              : "TIMELINE",
    severity                  : "MEDIUM",
    reason                    : "冲突",
    recommendedActionKey      : "REVIEW",
    sourceStageKey            : "STAGE_B5",
    relatedClaimKind          : "EVENT",
    relatedClaimIds           : [EVENT_ID_1],
    relatedPersonaCandidateIds: [CANDIDATE_ID_1],
    relatedChapterIds         : [CHAPTER_ID_1],
    summary                   : "冲突摘要",
    evidenceSpanIds           : [],
    reviewState               : "ACCEPTED",
    source                    : "RULE",
    reviewedByUserId          : null,
    reviewedAt                : null,
    reviewNote                : null,
    createdAt                 : NOW,
    updatedAt                 : NOW,
    ...overrides
  };
}

function chapter(
  overrides: Partial<ProjectionChapterSourceRow> = {}
): ProjectionChapterSourceRow {
  return {
    id    : CHAPTER_ID_1,
    bookId: BOOK_ID,
    no    : 1,
    ...overrides
  };
}

function createRepositoryMock(payload: ProjectionSourcePayload): {
  repository           : ProjectionRepository;
  loadProjectionSource : ReturnType<typeof vi.fn>;
  replaceProjectionRows: ReturnType<typeof vi.fn>;
  transactionMock      : ReturnType<typeof vi.fn>;
} {
  const loadProjectionSource = vi.fn<ProjectionRepository["loadProjectionSource"]>(async () => payload);
  const replaceProjectionRows = vi.fn<ProjectionRepository["replaceProjectionRows"]>(
    async (_scope, rows: ProjectionRowsByFamily) => countPersistedRows(rows)
  );

  const transactionMock = vi.fn();
  const transaction: ProjectionRepository["transaction"] = async <T>(
    callback: (txRepository: ProjectionRepository) => Promise<T>
  ): Promise<T> => {
    transactionMock(callback);
    return callback(repository);
  };
  const repository: ProjectionRepository = {
    transaction,
    loadProjectionSource,
    replaceProjectionRows
  };

  return { repository, loadProjectionSource, replaceProjectionRows, transactionMock };
}

function createMutableRepositoryMock(initialPayload: ProjectionSourcePayload): {
  repository   : ProjectionRepository;
  persistedRows: ProjectionRowsByFamily;
  removeEventClaim(eventId: string): void;
} {
  let payload = initialPayload;
  let persistedRows: ProjectionRowsByFamily = {
    persona_chapter_facts: [],
    persona_time_facts   : [],
    relationship_edges   : [],
    timeline_events      : []
  };

  const repository: ProjectionRepository = {
    async transaction<T>(callback: (txRepository: ProjectionRepository) => Promise<T>): Promise<T> {
      return callback(repository);
    },
    async loadProjectionSource(): Promise<ProjectionSourcePayload> {
      return payload;
    },
    async replaceProjectionRows(
      _scope,
      rows: ProjectionRowsByFamily
    ): Promise<ProjectionPersistenceCounts> {
      persistedRows = rows;
      return countPersistedRows(rows);
    }
  };

  return {
    repository,
    get persistedRows() {
      return persistedRows;
    },
    removeEventClaim(eventId: string) {
      payload = {
        ...payload,
        eventClaims: payload.eventClaims.filter((eventClaim) => eventClaim.id !== eventId)
      };
    }
  };
}

function createPrismaClientMock() {
  const client = {
    chapter                : { findMany: vi.fn(async () => []) },
    identityResolutionClaim: { findMany: vi.fn(async () => []) },
    eventClaim             : { findMany: vi.fn(async () => []) },
    relationClaim          : { findMany: vi.fn(async () => []) },
    timeClaim              : { findMany: vi.fn(async () => []) },
    conflictFlag           : { findMany: vi.fn(async () => []) },
    personaChapterFact     : {
      deleteMany: vi.fn(async () => ({ count: 0 })),
      createMany: vi.fn(async () => ({ count: 0 }))
    },
    personaTimeFact: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
      createMany: vi.fn(async () => ({ count: 0 }))
    },
    relationshipEdge: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
      createMany: vi.fn(async () => ({ count: 0 }))
    },
    timelineEvent: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
      createMany: vi.fn(async () => ({ count: 0 }))
    }
  };

  return {
    ...client,
    $transaction: vi.fn(async <T>(callback: (tx: typeof client) => Promise<T>) => callback(client))
  };
}

function countPersistedRows(rows: ProjectionRowsByFamily): ProjectionPersistenceCounts {
  return {
    deleted: 0,
    created:
      rows.persona_chapter_facts.length +
      rows.persona_time_facts.length +
      rows.relationship_edges.length +
      rows.timeline_events.length
  };
}

function payloadWithAcceptedEventForUnmappedCandidate(): ProjectionSourcePayload {
  return {
    identityResolutionClaims: [],
    eventClaims             : [eventClaim({ subjectPersonaCandidateId: CANDIDATE_ID_1 })],
    relationClaims          : [],
    timeClaims              : [],
    conflictFlags           : [],
    chapters                : []
  };
}

function payloadWithAcceptedResolvedFacts(): ProjectionSourcePayload {
  return {
    identityResolutionClaims: [
      identityClaim({ id: CLAIM_ID_1, personaCandidateId: CANDIDATE_ID_1, resolvedPersonaId: PERSONA_ID_1 }),
      identityClaim({
        id                : CLAIM_ID_2,
        mentionId         : "cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd",
        personaCandidateId: CANDIDATE_ID_2,
        resolvedPersonaId : PERSONA_ID_2
      })
    ],
    eventClaims: [
      eventClaim({
        id                       : EVENT_ID_1,
        chapterId                : CHAPTER_ID_1,
        subjectPersonaCandidateId: CANDIDATE_ID_1,
        predicate                : "参加",
        objectText               : "宴会",
        timeHintId               : TIME_ID_1
      }),
      eventClaim({
        id                       : EVENT_ID_2,
        chapterId                : CHAPTER_ID_2,
        subjectPersonaCandidateId: CANDIDATE_ID_2,
        predicate                : "离开",
        objectText               : "京城",
        timeHintId               : null
      })
    ],
    relationClaims: [
      relationClaim({
        id                      : RELATION_ID_1,
        chapterId               : CHAPTER_ID_1,
        sourcePersonaCandidateId: CANDIDATE_ID_1,
        targetPersonaCandidateId: CANDIDATE_ID_2,
        timeHintId              : TIME_ID_1
      })
    ],
    timeClaims   : [timeClaim()],
    conflictFlags: [conflictFlag()],
    chapters     : [chapter(), chapter({ id: CHAPTER_ID_2, no: 2 })]
  };
}

describe("projection builder task-1 contracts", () => {
  it("maps accepted identity-resolution claims to final persona ids", () => {
    const mapping = buildAcceptedPersonaMapping({
      identityResolutionClaims: [
        identityClaim({ personaCandidateId: CANDIDATE_ID_1, resolvedPersonaId: PERSONA_ID_1 }),
        identityClaim({
          id                : CLAIM_ID_2,
          personaCandidateId: CANDIDATE_ID_2,
          resolvedPersonaId : PERSONA_ID_2,
          reviewState       : "PENDING"
        })
      ],
      requiredPersonaCandidateIds: [CANDIDATE_ID_1, CANDIDATE_ID_2]
    });

    expect(mapping.personaIdByCandidateId.get(CANDIDATE_ID_1)).toBe(PERSONA_ID_1);
    expect(mapping.unmappedCandidateIds).toEqual([CANDIDATE_ID_2]);
    expect(mapping.ambiguousCandidateIds).toEqual([]);
  });

  it("skips candidates with multiple accepted final personas instead of guessing", () => {
    const mapping = buildAcceptedPersonaMapping({
      identityResolutionClaims: [
        identityClaim({ personaCandidateId: CANDIDATE_ID_3, resolvedPersonaId: PERSONA_ID_1 }),
        identityClaim({
          id                : CLAIM_ID_2,
          personaCandidateId: CANDIDATE_ID_3,
          resolvedPersonaId : PERSONA_ID_2
        })
      ],
      requiredPersonaCandidateIds: [CANDIDATE_ID_3]
    });

    expect(mapping.personaIdByCandidateId.has(CANDIDATE_ID_3)).toBe(false);
    expect(mapping.unmappedCandidateIds).toEqual([]);
    expect(mapping.ambiguousCandidateIds).toEqual([CANDIDATE_ID_3]);
  });

  it("exports all rebuild scope modes needed by local projection rebuilds", () => {
    expect(PROJECTION_REBUILD_SCOPE_KIND_VALUES).toEqual([
      "FULL_BOOK",
      "CHAPTER",
      "PERSONA",
      "TIME_SLICE",
      "RELATION_EDGE",
      "PROJECTION_ONLY"
    ]);
  });

  it("returns skipped persona-candidate ids when rebuilding with unmapped accepted facts", async () => {
    const { repository, replaceProjectionRows } = createRepositoryMock(
      payloadWithAcceptedEventForUnmappedCandidate()
    );
    const builder = createProjectionBuilder({ repository });
    const scope = { kind: "FULL_BOOK", bookId: BOOK_ID } as const;

    const result = await builder.rebuildProjection(scope);

    expect(result.skipped.unmappedPersonaCandidateIds).toEqual([CANDIDATE_ID_1]);
    expect(result.skipped.ambiguousPersonaCandidateIds).toEqual([]);
    expect(replaceProjectionRows).toHaveBeenCalledTimes(1);
    expect(replaceProjectionRows).toHaveBeenCalledWith(scope, {
      persona_chapter_facts: [],
      persona_time_facts   : [],
      relationship_edges   : [],
      timeline_events      : []
    });
  });
});

describe("projection builder task-5 orchestration", () => {
  it("full-book rebuild deletes and recreates all projection families for one book", async () => {
    const { repository, replaceProjectionRows, transactionMock } = createRepositoryMock(
      payloadWithAcceptedResolvedFacts()
    );
    const builder = createProjectionBuilder({ repository });

    const result = await builder.rebuildProjection({ kind: "FULL_BOOK", bookId: BOOK_ID });

    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(replaceProjectionRows).toHaveBeenCalledWith(
      { kind: "FULL_BOOK", bookId: BOOK_ID },
      expect.objectContaining({
        persona_chapter_facts: expect.arrayContaining([
          expect.objectContaining({ personaId: PERSONA_ID_1, chapterId: CHAPTER_ID_1 })
        ]),
        persona_time_facts: expect.arrayContaining([
          expect.objectContaining({ personaId: PERSONA_ID_1, timeLabel: "春日" })
        ]),
        relationship_edges: expect.arrayContaining([
          expect.objectContaining({
            sourcePersonaId: PERSONA_ID_1,
            targetPersonaId: PERSONA_ID_2,
            relationTypeKey: "ALLY"
          })
        ]),
        timeline_events: expect.arrayContaining([
          expect.objectContaining({ personaId: PERSONA_ID_1, chapterId: CHAPTER_ID_1 })
        ])
      })
    );
    expect(result.counts.created).toBeGreaterThan(0);
    expect(result.rebuiltFamilies).toEqual([
      "persona_chapter_facts",
      "persona_time_facts",
      "relationship_edges",
      "timeline_events"
    ]);
  });

  it("chapter rebuild only persists chapter-scoped projection families", async () => {
    const { repository, replaceProjectionRows } = createRepositoryMock(payloadWithAcceptedResolvedFacts());
    const builder = createProjectionBuilder({ repository });

    await builder.rebuildProjection({
      kind     : "CHAPTER",
      bookId   : BOOK_ID,
      chapterId: CHAPTER_ID_1,
      chapterNo: 1
    });

    expect(replaceProjectionRows).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "CHAPTER", chapterId: CHAPTER_ID_1 }),
      expect.objectContaining({
        persona_chapter_facts: expect.arrayContaining([
          expect.objectContaining({ chapterId: CHAPTER_ID_1 })
        ]),
        persona_time_facts: [],
        relationship_edges: [],
        timeline_events   : expect.arrayContaining([
          expect.objectContaining({ chapterId: CHAPTER_ID_1 })
        ])
      })
    );

    const persistedRows = replaceProjectionRows.mock.calls[0]?.[1] as ProjectionRowsByFamily;
    expect(persistedRows.persona_chapter_facts.every((row) => row.chapterId === CHAPTER_ID_1)).toBe(true);
    expect(persistedRows.timeline_events.every((row) => row.chapterId === CHAPTER_ID_1)).toBe(true);
  });

  it("repository reads accepted claim tables and does not read legacy truth tables", async () => {
    const client = createPrismaClientMock();
    const repository = createProjectionRepository(
      client as NonNullable<Parameters<typeof createProjectionRepository>[0]>
    );

    await repository.loadProjectionSource({ kind: "FULL_BOOK", bookId: BOOK_ID });

    expect(client.eventClaim.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ bookId: BOOK_ID, reviewState: "ACCEPTED" })
      })
    );
    expect(client.relationClaim.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ bookId: BOOK_ID, reviewState: "ACCEPTED" })
      })
    );
    expect((client as Record<string, unknown>).biographyRecord).toBeUndefined();
    expect((client as Record<string, unknown>).relationship).toBeUndefined();
  });

  it("local rebuild after simulated review mutation changes only affected projection output", async () => {
    const repository = createMutableRepositoryMock(payloadWithAcceptedResolvedFacts());
    const builder = createProjectionBuilder({ repository: repository.repository });

    const firstResult = await builder.rebuildProjection({
      kind     : "PERSONA",
      bookId   : BOOK_ID,
      personaId: PERSONA_ID_1
    });
    repository.removeEventClaim(EVENT_ID_1);
    const secondResult = await builder.rebuildProjection({
      kind     : "PERSONA",
      bookId   : BOOK_ID,
      personaId: PERSONA_ID_1
    });

    expect(firstResult.counts.created).toBeGreaterThan(secondResult.counts.created);
    expect(repository.persistedRows.persona_chapter_facts.every((row) => row.personaId === PERSONA_ID_1)).toBe(
      true
    );
    expect(repository.persistedRows.persona_time_facts.every((row) => row.personaId === PERSONA_ID_1)).toBe(true);
    expect(repository.persistedRows.timeline_events.every((row) => row.personaId === PERSONA_ID_1)).toBe(true);
    expect(
      repository.persistedRows.relationship_edges.every((row) => {
        return row.sourcePersonaId === PERSONA_ID_1 || row.targetPersonaId === PERSONA_ID_1;
      })
    ).toBe(true);
  });
});
