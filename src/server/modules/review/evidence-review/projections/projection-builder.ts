import { prisma } from "@/server/db/prisma";
import { isProjectionEligibleReviewState } from "@/server/modules/review/evidence-review/review-state";
import { buildPersonaChapterFacts } from "@/server/modules/review/evidence-review/projections/persona-chapter";
import { buildPersonaTimeFacts, buildTimelineEvents } from "@/server/modules/review/evidence-review/projections/persona-time";
import { buildRelationshipEdges } from "@/server/modules/review/evidence-review/projections/relationships";
import type {
  AcceptedPersonaMapping,
  BuildAcceptedPersonaMappingInput,
  ConflictFlagProjectionSourceRow,
  IdentityResolutionClaimProjectionSourceRow,
  PersonaChapterFactProjectionRow,
  PersonaTimeFactProjectionRow,
  ProjectionChapterSourceRow,
  ProjectionBuilder,
  ProjectionFamily,
  ProjectionRebuildScope,
  ProjectionRepository,
  ProjectionSourcePayload,
  ProjectionPersistenceCounts,
  ProjectionRowsByFamily,
  EventClaimProjectionSourceRow,
  RelationClaimProjectionSourceRow,
  RelationshipEdgeProjectionRow,
  TimeClaimProjectionSourceRow,
  TimelineEventProjectionRow
} from "@/server/modules/review/evidence-review/projections/types";
import { PROJECTION_FAMILY_VALUES } from "@/server/modules/review/evidence-review/projections/types";
import type { Prisma } from "@/generated/prisma/client";

export const PROJECTION_REBUILD_SCOPE_KIND_VALUES = Object.freeze([
  "FULL_BOOK",
  "CHAPTER",
  "PERSONA",
  "TIME_SLICE",
  "RELATION_EDGE",
  "PROJECTION_ONLY"
] as const);

const EMPTY_PROJECTION_ROWS: ProjectionRowsByFamily = Object.freeze({
  persona_chapter_facts: Object.freeze([]),
  persona_time_facts   : Object.freeze([]),
  relationship_edges   : Object.freeze([]),
  timeline_events      : Object.freeze([])
});

type ProjectionDeleteResult = { count: number };

type ProjectionRepositoryClientBase = {
  chapter: {
    findMany(args: Prisma.ChapterFindManyArgs): Promise<ProjectionChapterSourceRow[]>;
  };
  identityResolutionClaim: {
    findMany(args: Prisma.IdentityResolutionClaimFindManyArgs): Promise<IdentityResolutionClaimProjectionSourceRow[]>;
  };
  eventClaim: {
    findMany(args: Prisma.EventClaimFindManyArgs): Promise<EventClaimProjectionSourceRow[]>;
  };
  relationClaim: {
    findMany(args: Prisma.RelationClaimFindManyArgs): Promise<RelationClaimProjectionSourceRow[]>;
  };
  timeClaim: {
    findMany(args: Prisma.TimeClaimFindManyArgs): Promise<TimeClaimProjectionSourceRow[]>;
  };
  conflictFlag: {
    findMany(args: Prisma.ConflictFlagFindManyArgs): Promise<ConflictFlagProjectionSourceRow[]>;
  };
  personaChapterFact: {
    deleteMany(args: Prisma.PersonaChapterFactDeleteManyArgs): Promise<ProjectionDeleteResult>;
    createMany(args: Prisma.PersonaChapterFactCreateManyArgs): Promise<ProjectionDeleteResult>;
  };
  personaTimeFact: {
    deleteMany(args: Prisma.PersonaTimeFactDeleteManyArgs): Promise<ProjectionDeleteResult>;
    createMany(args: Prisma.PersonaTimeFactCreateManyArgs): Promise<ProjectionDeleteResult>;
  };
  relationshipEdge: {
    deleteMany(args: Prisma.RelationshipEdgeDeleteManyArgs): Promise<ProjectionDeleteResult>;
    createMany(args: Prisma.RelationshipEdgeCreateManyArgs): Promise<ProjectionDeleteResult>;
  };
  timelineEvent: {
    deleteMany(args: Prisma.TimelineEventDeleteManyArgs): Promise<ProjectionDeleteResult>;
    createMany(args: Prisma.TimelineEventCreateManyArgs): Promise<ProjectionDeleteResult>;
  };
};

type ProjectionRepositoryPrismaClient = ProjectionRepositoryClientBase & {
  $transaction<T>(callback: (tx: ProjectionRepositoryClientBase) => Promise<T>): Promise<T>;
};

type ProjectionRepositoryClient = ProjectionRepositoryClientBase & {
  $transaction?: ProjectionRepositoryPrismaClient["$transaction"];
};

type PersonaChapterFactCreateData = Omit<
  PersonaChapterFactProjectionRow,
  "reviewStateSummary"
> & {
  reviewStateSummary: Prisma.InputJsonValue;
};

/**
 * 只基于可投影状态的 identity-resolution claim 生成稳定映射：
 * 同一 candidate 对应多个 accepted persona 时，标记为 ambiguous 且不做猜测。
 */
export function buildAcceptedPersonaMapping(
  input: BuildAcceptedPersonaMappingInput
): AcceptedPersonaMapping {
  const resolvedPersonaIdsByCandidateId = new Map<string, Set<string>>();

  for (const claim of input.identityResolutionClaims) {
    if (!isProjectionEligibleReviewState(claim.reviewState)) continue;
    if (claim.personaCandidateId === null || claim.resolvedPersonaId === null) continue;

    const resolvedPersonaIds =
      resolvedPersonaIdsByCandidateId.get(claim.personaCandidateId) ?? new Set<string>();
    resolvedPersonaIds.add(claim.resolvedPersonaId);
    resolvedPersonaIdsByCandidateId.set(claim.personaCandidateId, resolvedPersonaIds);
  }

  const personaIdByCandidateId = new Map<string, string>();
  const ambiguousCandidateIds: string[] = [];

  for (const [candidateId, resolvedPersonaIds] of resolvedPersonaIdsByCandidateId) {
    const sortedPersonaIds = Array.from(resolvedPersonaIds).sort();
    if (sortedPersonaIds.length === 1) {
      personaIdByCandidateId.set(candidateId, sortedPersonaIds[0]);
      continue;
    }
    if (sortedPersonaIds.length > 1) {
      ambiguousCandidateIds.push(candidateId);
    }
  }

  const ambiguousCandidateIdsSorted = ambiguousCandidateIds.sort();
  const ambiguousCandidateIdSet = new Set(ambiguousCandidateIdsSorted);
  const requiredPersonaCandidateIds = Array.from(
    new Set(input.requiredPersonaCandidateIds ?? [])
  ).sort();
  const unmappedCandidateIds = requiredPersonaCandidateIds.filter((candidateId) => {
    return !personaIdByCandidateId.has(candidateId) && !ambiguousCandidateIdSet.has(candidateId);
  });

  return {
    personaIdByCandidateId,
    unmappedCandidateIds,
    ambiguousCandidateIds: ambiguousCandidateIdsSorted
  };
}

/**
 * 事务化重建指定投影片段：claim/review state 是唯一真相，projection rows 只做可删除读模型。
 */
export function createProjectionBuilder(input: { repository: ProjectionRepository }): ProjectionBuilder {
  async function rebuildProjection(scope: ProjectionRebuildScope) {
    return input.repository.transaction(async (txRepository) => {
      const sourcePayload = await txRepository.loadProjectionSource(scope);
      const rebuiltFamilies = resolveProjectionFamilies(scope);
      const requiredPersonaCandidateIds = collectRequiredPersonaCandidateIds(sourcePayload);
      const personaMapping = buildAcceptedPersonaMapping({
        identityResolutionClaims: sourcePayload.identityResolutionClaims,
        requiredPersonaCandidateIds
      });
      const allRows = buildProjectionRows(sourcePayload, personaMapping, scope);
      const rows = filterRowsForScope(scope, filterRowsForFamilies(rebuiltFamilies, allRows));
      const counts = await txRepository.replaceProjectionRows(scope, rows);

      return {
        counts,
        rebuiltFamilies,
        skipped: {
          unmappedPersonaCandidateIds : personaMapping.unmappedCandidateIds,
          ambiguousPersonaCandidateIds: personaMapping.ambiguousCandidateIds
        }
      };
    });
  }

  return { rebuildProjection };
}

/**
 * 创建 Stage D projection repository。默认使用全局 Prisma，测试可传入同形 mock client。
 */
export function createProjectionRepository(
  prismaClient: ProjectionRepositoryClient = prisma
): ProjectionRepository {
  const transactionRunner =
    typeof prismaClient.$transaction === "function"
      ? prismaClient.$transaction.bind(prismaClient)
      : undefined;

  return createRepositoryFromClient(prismaClient, transactionRunner);
}

function createRepositoryFromClient(
  client: ProjectionRepositoryClientBase,
  transactionRunner?: ProjectionRepositoryPrismaClient["$transaction"]
): ProjectionRepository {
  return {
    async transaction<T>(
      callback: (txRepository: ProjectionRepository) => Promise<T>
    ): Promise<T> {
      if (transactionRunner === undefined) {
        return callback(createRepositoryFromClient(client));
      }

      return transactionRunner(async (tx) => callback(createRepositoryFromClient(tx)));
    },
    async loadProjectionSource(scope: ProjectionRebuildScope): Promise<ProjectionSourcePayload> {
      return loadProjectionSource(client, scope);
    },
    async replaceProjectionRows(
      scope: ProjectionRebuildScope,
      rows: ProjectionRowsByFamily
    ): Promise<ProjectionPersistenceCounts> {
      return replaceProjectionRows(client, scope, rows);
    }
  };
}

function buildProjectionRows(
  payload: ProjectionSourcePayload,
  mapping: AcceptedPersonaMapping,
  scope: ProjectionRebuildScope
): ProjectionRowsByFamily {
  const relationshipSelection =
    scope.kind === "RELATION_EDGE"
      ? {
          sourcePersonaId: scope.sourcePersonaId,
          targetPersonaId: scope.targetPersonaId,
          relationTypeKey: scope.relationTypeKey
        }
      : undefined;

  return {
    persona_chapter_facts: buildPersonaChapterFacts({
      chapters              : payload.chapters,
      personaIdByCandidateId: mapping.personaIdByCandidateId,
      eventClaims           : payload.eventClaims,
      relationClaims        : payload.relationClaims,
      conflictFlags         : payload.conflictFlags
    }),
    persona_time_facts: buildPersonaTimeFacts({
      personaIdByCandidateId: mapping.personaIdByCandidateId,
      eventClaims           : payload.eventClaims,
      relationClaims        : payload.relationClaims,
      timeClaims            : payload.timeClaims
    }),
    relationship_edges: buildRelationshipEdges({
      personaIdByCandidateId: mapping.personaIdByCandidateId,
      relationClaims        : payload.relationClaims,
      selection             : relationshipSelection
    }),
    timeline_events: buildTimelineEvents({
      personaIdByCandidateId: mapping.personaIdByCandidateId,
      eventClaims           : payload.eventClaims,
      timeClaims            : payload.timeClaims
    })
  };
}

function resolveProjectionFamilies(scope: ProjectionRebuildScope): readonly ProjectionFamily[] {
  const allowedFamilies = resolveScopeAllowedFamilies(scope);
  const requestedFamilies = scope.projectionFamilies ?? allowedFamilies;
  const allowedFamilySet = new Set<ProjectionFamily>(allowedFamilies);
  const resolvedFamilies = new Set<ProjectionFamily>();

  for (const family of requestedFamilies) {
    if (allowedFamilySet.has(family)) {
      resolvedFamilies.add(family);
    }
  }

  return PROJECTION_FAMILY_VALUES.filter((family) => resolvedFamilies.has(family));
}

function resolveScopeAllowedFamilies(scope: ProjectionRebuildScope): readonly ProjectionFamily[] {
  switch (scope.kind) {
    case "FULL_BOOK":
    case "PERSONA":
      return PROJECTION_FAMILY_VALUES;
    case "CHAPTER":
      return ["persona_chapter_facts", "timeline_events"];
    case "TIME_SLICE":
      return ["persona_time_facts", "timeline_events"];
    case "RELATION_EDGE":
      return ["relationship_edges"];
    case "PROJECTION_ONLY":
      return scope.projectionFamilies;
  }
}

function filterRowsForFamilies(
  families: readonly ProjectionFamily[],
  rows: ProjectionRowsByFamily
): ProjectionRowsByFamily {
  const familySet = new Set<ProjectionFamily>(families);

  return {
    persona_chapter_facts: familySet.has("persona_chapter_facts")
      ? rows.persona_chapter_facts
      : EMPTY_PROJECTION_ROWS.persona_chapter_facts,
    persona_time_facts: familySet.has("persona_time_facts")
      ? rows.persona_time_facts
      : EMPTY_PROJECTION_ROWS.persona_time_facts,
    relationship_edges: familySet.has("relationship_edges")
      ? rows.relationship_edges
      : EMPTY_PROJECTION_ROWS.relationship_edges,
    timeline_events: familySet.has("timeline_events")
      ? rows.timeline_events
      : EMPTY_PROJECTION_ROWS.timeline_events
  };
}

function filterRowsForScope(
  scope: ProjectionRebuildScope,
  rows: ProjectionRowsByFamily
): ProjectionRowsByFamily {
  switch (scope.kind) {
    case "FULL_BOOK":
    case "PROJECTION_ONLY":
      return rows;
    case "CHAPTER":
      return {
        persona_chapter_facts: rows.persona_chapter_facts.filter((row) => row.chapterId === scope.chapterId),
        persona_time_facts   : rows.persona_time_facts,
        relationship_edges   : rows.relationship_edges,
        timeline_events      : rows.timeline_events.filter((row) => row.chapterId === scope.chapterId)
      };
    case "PERSONA":
      return {
        persona_chapter_facts: rows.persona_chapter_facts.filter((row) => row.personaId === scope.personaId),
        persona_time_facts   : rows.persona_time_facts.filter((row) => row.personaId === scope.personaId),
        relationship_edges   : rows.relationship_edges.filter((row) => {
          return row.sourcePersonaId === scope.personaId || row.targetPersonaId === scope.personaId;
        }),
        timeline_events: rows.timeline_events.filter((row) => row.personaId === scope.personaId)
      };
    case "TIME_SLICE":
      return {
        persona_chapter_facts: rows.persona_chapter_facts,
        persona_time_facts   : rows.persona_time_facts.filter((row) => row.timeLabel === scope.timeLabel),
        relationship_edges   : rows.relationship_edges,
        timeline_events      : rows.timeline_events.filter((row) => row.timeLabel === scope.timeLabel)
      };
    case "RELATION_EDGE":
      return {
        persona_chapter_facts: rows.persona_chapter_facts,
        persona_time_facts   : rows.persona_time_facts,
        relationship_edges   : rows.relationship_edges.filter((row) => {
          if (row.sourcePersonaId !== scope.sourcePersonaId) return false;
          if (row.targetPersonaId !== scope.targetPersonaId) return false;
          if (scope.relationTypeKey !== undefined && row.relationTypeKey !== scope.relationTypeKey) {
            return false;
          }
          return true;
        }),
        timeline_events: rows.timeline_events
      };
  }
}

function collectRequiredPersonaCandidateIds(payload: ProjectionSourcePayload): readonly string[] {
  const required = new Set<string>();

  for (const eventClaim of payload.eventClaims) {
    if (!isProjectionEligibleReviewState(eventClaim.reviewState)) continue;
    addNullableCandidateId(required, eventClaim.subjectPersonaCandidateId);
    addNullableCandidateId(required, eventClaim.objectPersonaCandidateId);
  }

  for (const relationClaim of payload.relationClaims) {
    if (!isProjectionEligibleReviewState(relationClaim.reviewState)) continue;
    addNullableCandidateId(required, relationClaim.sourcePersonaCandidateId);
    addNullableCandidateId(required, relationClaim.targetPersonaCandidateId);
  }

  for (const conflictFlag of payload.conflictFlags) {
    if (!isProjectionEligibleReviewState(conflictFlag.reviewState)) continue;
    for (const candidateId of conflictFlag.relatedPersonaCandidateIds) {
      required.add(candidateId);
    }
  }

  return Array.from(required).sort();
}

function addNullableCandidateId(required: Set<string>, candidateId: string | null): void {
  if (candidateId !== null) {
    required.add(candidateId);
  }
}

async function loadProjectionSource(
  client: ProjectionRepositoryClientBase,
  scope: ProjectionRebuildScope
): Promise<ProjectionSourcePayload> {
  const [
    chapters,
    identityResolutionClaims,
    eventClaims,
    relationClaims,
    timeClaims,
    conflictFlags
  ] = await Promise.all([
    client.chapter.findMany({
      where  : { bookId: scope.bookId },
      select : { id: true, bookId: true, no: true },
      orderBy: { no: "asc" }
    }),
    client.identityResolutionClaim.findMany({
      where : { bookId: scope.bookId, reviewState: "ACCEPTED" },
      select: {
        id                : true,
        bookId            : true,
        chapterId         : true,
        mentionId         : true,
        personaCandidateId: true,
        resolvedPersonaId : true,
        resolutionKind    : true,
        reviewState       : true,
        source            : true,
        runId             : true,
        createdAt         : true,
        updatedAt         : true
      }
    }),
    client.eventClaim.findMany({
      where : buildEventClaimWhere(scope),
      select: {
        id                       : true,
        bookId                   : true,
        chapterId                : true,
        subjectPersonaCandidateId: true,
        objectPersonaCandidateId : true,
        predicate                : true,
        objectText               : true,
        locationText             : true,
        timeHintId               : true,
        eventCategory            : true,
        narrativeLens            : true,
        evidenceSpanIds          : true,
        confidence               : true,
        reviewState              : true,
        source                   : true,
        runId                    : true,
        createdAt                : true,
        updatedAt                : true
      }
    }),
    client.relationClaim.findMany({
      where : buildRelationClaimWhere(scope),
      select: {
        id                      : true,
        bookId                  : true,
        chapterId               : true,
        sourcePersonaCandidateId: true,
        targetPersonaCandidateId: true,
        relationTypeKey         : true,
        relationLabel           : true,
        relationTypeSource      : true,
        direction               : true,
        effectiveChapterStart   : true,
        effectiveChapterEnd     : true,
        timeHintId              : true,
        evidenceSpanIds         : true,
        confidence              : true,
        reviewState             : true,
        source                  : true,
        runId                   : true,
        createdAt               : true,
        updatedAt               : true
      }
    }),
    client.timeClaim.findMany({
      where : buildTimeClaimWhere(scope),
      select: {
        id                 : true,
        bookId             : true,
        chapterId          : true,
        rawTimeText        : true,
        timeType           : true,
        normalizedLabel    : true,
        relativeOrderWeight: true,
        chapterRangeStart  : true,
        chapterRangeEnd    : true,
        evidenceSpanIds    : true,
        confidence         : true,
        reviewState        : true,
        source             : true,
        runId              : true,
        createdAt          : true,
        updatedAt          : true
      }
    }),
    client.conflictFlag.findMany({
      where : buildConflictFlagWhere(scope),
      select: {
        id                        : true,
        bookId                    : true,
        chapterId                 : true,
        runId                     : true,
        conflictType              : true,
        severity                  : true,
        reason                    : true,
        recommendedActionKey      : true,
        sourceStageKey            : true,
        relatedClaimKind          : true,
        relatedClaimIds           : true,
        relatedPersonaCandidateIds: true,
        relatedChapterIds         : true,
        summary                   : true,
        evidenceSpanIds           : true,
        reviewState               : true,
        source                    : true,
        reviewedByUserId          : true,
        reviewedAt                : true,
        reviewNote                : true,
        createdAt                 : true,
        updatedAt                 : true
      }
    })
  ]);

  return {
    chapters,
    identityResolutionClaims,
    eventClaims,
    relationClaims,
    timeClaims,
    conflictFlags
  };
}

function buildEventClaimWhere(scope: ProjectionRebuildScope): Prisma.EventClaimWhereInput {
  const where: Prisma.EventClaimWhereInput = { bookId: scope.bookId, reviewState: "ACCEPTED" };
  if (scope.kind === "CHAPTER") {
    where.chapterId = scope.chapterId;
  }
  return where;
}

function buildRelationClaimWhere(scope: ProjectionRebuildScope): Prisma.RelationClaimWhereInput {
  const where: Prisma.RelationClaimWhereInput = { bookId: scope.bookId, reviewState: "ACCEPTED" };
  if (scope.kind === "CHAPTER") {
    where.chapterId = scope.chapterId;
  }
  if (scope.kind === "RELATION_EDGE" && scope.relationTypeKey !== undefined) {
    where.relationTypeKey = scope.relationTypeKey;
  }
  return where;
}

function buildTimeClaimWhere(scope: ProjectionRebuildScope): Prisma.TimeClaimWhereInput {
  const where: Prisma.TimeClaimWhereInput = { bookId: scope.bookId, reviewState: "ACCEPTED" };
  if (scope.kind === "CHAPTER") {
    where.chapterId = scope.chapterId;
  }
  if (scope.kind === "TIME_SLICE") {
    where.normalizedLabel = scope.timeLabel;
  }
  return where;
}

function buildConflictFlagWhere(scope: ProjectionRebuildScope): Prisma.ConflictFlagWhereInput {
  const where: Prisma.ConflictFlagWhereInput = { bookId: scope.bookId, reviewState: "ACCEPTED" };
  if (scope.kind === "CHAPTER") {
    where.OR = [
      { chapterId: scope.chapterId },
      { relatedChapterIds: { has: scope.chapterId } }
    ];
  }
  return where;
}

async function replaceProjectionRows(
  client: ProjectionRepositoryClientBase,
  scope: ProjectionRebuildScope,
  rows: ProjectionRowsByFamily
): Promise<ProjectionPersistenceCounts> {
  const familySet = new Set<ProjectionFamily>(resolveProjectionFamilies(scope));
  let deleted = 0;
  let created = 0;

  if (familySet.has("persona_chapter_facts")) {
    const deletedRows = await client.personaChapterFact.deleteMany({
      where: buildPersonaChapterDeleteWhere(scope)
    });
    deleted += deletedRows.count;
    if (rows.persona_chapter_facts.length > 0) {
      const createdRows = await client.personaChapterFact.createMany({
        data: toPersonaChapterFactCreateData(rows.persona_chapter_facts)
      });
      created += createdRows.count;
    }
  }

  if (familySet.has("persona_time_facts")) {
    const deletedRows = await client.personaTimeFact.deleteMany({
      where: buildPersonaTimeDeleteWhere(scope)
    });
    deleted += deletedRows.count;
    if (rows.persona_time_facts.length > 0) {
      const createdRows = await client.personaTimeFact.createMany({
        data: toPersonaTimeFactCreateData(rows.persona_time_facts)
      });
      created += createdRows.count;
    }
  }

  if (familySet.has("relationship_edges")) {
    const deletedRows = await client.relationshipEdge.deleteMany({
      where: buildRelationshipEdgeDeleteWhere(scope)
    });
    deleted += deletedRows.count;
    if (rows.relationship_edges.length > 0) {
      const createdRows = await client.relationshipEdge.createMany({
        data: toRelationshipEdgeCreateData(rows.relationship_edges)
      });
      created += createdRows.count;
    }
  }

  if (familySet.has("timeline_events")) {
    const deletedRows = await client.timelineEvent.deleteMany({
      where: buildTimelineEventDeleteWhere(scope)
    });
    deleted += deletedRows.count;
    if (rows.timeline_events.length > 0) {
      const createdRows = await client.timelineEvent.createMany({
        data: toTimelineEventCreateData(rows.timeline_events)
      });
      created += createdRows.count;
    }
  }

  return { deleted, created };
}

function toPersonaChapterFactCreateData(
  rows: readonly PersonaChapterFactProjectionRow[]
): PersonaChapterFactCreateData[] {
  return rows.map((row) => ({
    ...row,
    reviewStateSummary: row.reviewStateSummary
  }));
}

function toPersonaTimeFactCreateData(
  rows: readonly PersonaTimeFactProjectionRow[]
): Prisma.PersonaTimeFactCreateManyInput[] {
  return rows.map((row) => ({
    ...row,
    sourceTimeClaimIds: [...row.sourceTimeClaimIds]
  }));
}

function toRelationshipEdgeCreateData(
  rows: readonly RelationshipEdgeProjectionRow[]
): Prisma.RelationshipEdgeCreateManyInput[] {
  return rows.map((row) => ({
    ...row,
    sourceClaimIds: [...row.sourceClaimIds]
  }));
}

function toTimelineEventCreateData(
  rows: readonly TimelineEventProjectionRow[]
): Prisma.TimelineEventCreateManyInput[] {
  return rows.map((row) => ({
    ...row,
    sourceClaimIds: [...row.sourceClaimIds]
  }));
}

function buildPersonaChapterDeleteWhere(scope: ProjectionRebuildScope): Prisma.PersonaChapterFactWhereInput {
  switch (scope.kind) {
    case "CHAPTER":
      return { bookId: scope.bookId, chapterId: scope.chapterId };
    case "PERSONA":
      return { bookId: scope.bookId, personaId: scope.personaId };
    default:
      return { bookId: scope.bookId };
  }
}

function buildPersonaTimeDeleteWhere(scope: ProjectionRebuildScope): Prisma.PersonaTimeFactWhereInput {
  switch (scope.kind) {
    case "PERSONA":
      return { bookId: scope.bookId, personaId: scope.personaId };
    case "TIME_SLICE":
      return { bookId: scope.bookId, timeLabel: scope.timeLabel };
    default:
      return { bookId: scope.bookId };
  }
}

function buildRelationshipEdgeDeleteWhere(scope: ProjectionRebuildScope): Prisma.RelationshipEdgeWhereInput {
  switch (scope.kind) {
    case "PERSONA":
      return {
        bookId: scope.bookId,
        OR    : [{ sourcePersonaId: scope.personaId }, { targetPersonaId: scope.personaId }]
      };
    case "RELATION_EDGE":
      return {
        bookId         : scope.bookId,
        sourcePersonaId: scope.sourcePersonaId,
        targetPersonaId: scope.targetPersonaId,
        ...(scope.relationTypeKey === undefined ? {} : { relationTypeKey: scope.relationTypeKey })
      };
    default:
      return { bookId: scope.bookId };
  }
}

function buildTimelineEventDeleteWhere(scope: ProjectionRebuildScope): Prisma.TimelineEventWhereInput {
  switch (scope.kind) {
    case "CHAPTER":
      return { bookId: scope.bookId, chapterId: scope.chapterId };
    case "PERSONA":
      return { bookId: scope.bookId, personaId: scope.personaId };
    case "TIME_SLICE":
      return { bookId: scope.bookId, timeLabel: scope.timeLabel };
    default:
      return { bookId: scope.bookId };
  }
}
