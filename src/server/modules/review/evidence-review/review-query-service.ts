import { prisma } from "@/server/db/prisma";
import type { ClaimKind } from "@/generated/prisma/enums";
import { REVIEWABLE_CLAIM_FAMILY_VALUES } from "@/server/modules/analysis/claims/claim-schemas";
import type { ReviewableClaimFamily } from "@/server/modules/analysis/claims/claim-schemas";
import { createReviewAuditService } from "@/server/modules/review/evidence-review/review-audit-service";
import type { ClaimReviewState, ClaimSource } from "@/server/modules/review/evidence-review/review-state";

export type ConflictState = "ACTIVE" | "NONE";

export interface ListReviewClaimsInput {
  bookId        : string;
  claimKinds?   : ReviewableClaimFamily[];
  reviewStates? : ClaimReviewState[];
  sources?      : ClaimSource[];
  personaId?    : string;
  chapterId?    : string;
  timeLabel?    : string;
  conflictState?: ConflictState;
  limit?        : number;
  offset?       : number;
}

export interface GetReviewClaimDetailInput {
  bookId   : string;
  claimKind: ReviewableClaimFamily;
  claimId  : string;
}

export interface ReviewClaimListItem {
  claimKind          : ReviewableClaimFamily;
  claimId            : string;
  bookId             : string;
  chapterId          : string | null;
  reviewState        : ClaimReviewState;
  source             : ClaimSource;
  conflictState      : ConflictState;
  createdAt          : Date;
  updatedAt          : Date;
  personaCandidateIds: string[];
  personaIds         : string[];
  timeLabel          : string | null;
  relationTypeKey    : string | null;
  evidenceSpanIds    : string[];
}

type ProjectionSummary = {
  personaChapterFacts: unknown[];
  personaTimeFacts   : unknown[];
  relationshipEdges  : unknown[];
  timelineEvents     : unknown[];
};

type ClaimRowBase = {
  claimKind          : ReviewableClaimFamily;
  id                 : string;
  bookId             : string;
  chapterId          : string | null;
  reviewState        : ClaimReviewState;
  source             : ClaimSource;
  createdAt          : Date;
  updatedAt          : Date;
  evidenceSpanIds    : string[];
  personaCandidateIds: string[];
  relationTypeKey    : string | null;
  timeLabel          : string | null;
  timeHintId         : string | null;
  derivedFromClaimId : string | null;
  extra              : Record<string, unknown>;
};

type ClaimDetailRecord = ReviewClaimListItem & {
  claimKind         : ReviewableClaimFamily;
  id                : string;
  derivedFromClaimId: string | null;
} & Record<string, unknown>;

type ConflictStateMap = ReadonlyMap<string, ConflictState>;
type PersonaIdsByCandidateIdMap = ReadonlyMap<string, readonly string[]>;
type TimeLabelByHintIdMap = ReadonlyMap<string, string>;

function toUniqueSortedIds(ids: ReadonlyArray<string | null | undefined>): string[] {
  return Array.from(
    new Set(ids.filter((id): id is string => typeof id === "string" && id.length > 0))
  ).sort();
}

function resolveConflictState(claimId: string, conflictStateMap: ConflictStateMap): ConflictState {
  return conflictStateMap.get(claimId) ?? "NONE";
}

function resolvePersonaIds(
  candidateIds: readonly string[],
  personaIdsByCandidateId: PersonaIdsByCandidateIdMap
): string[] {
  const personaIds = new Set<string>();
  for (const candidateId of candidateIds) {
    const mapped = personaIdsByCandidateId.get(candidateId);
    if (!mapped) continue;
    for (const personaId of mapped) {
      personaIds.add(personaId);
    }
  }
  return Array.from(personaIds).sort();
}

function resolveTimeLabel(
  row: Pick<ClaimRowBase, "timeLabel" | "timeHintId">,
  timeLabelByHintId: TimeLabelByHintIdMap
): string | null {
  if (row.timeLabel !== null) {
    return row.timeLabel;
  }

  if (row.timeHintId === null) {
    return null;
  }

  return timeLabelByHintId.get(row.timeHintId) ?? null;
}

function toListItem(
  row: ClaimRowBase,
  personaIdsByCandidateId: PersonaIdsByCandidateIdMap,
  conflictStateMap: ConflictStateMap,
  timeLabelByHintId: TimeLabelByHintIdMap
): ReviewClaimListItem {
  return {
    claimKind          : row.claimKind,
    claimId            : row.id,
    bookId             : row.bookId,
    chapterId          : row.chapterId,
    reviewState        : row.reviewState,
    source             : row.source,
    conflictState      : resolveConflictState(row.id, conflictStateMap),
    createdAt          : row.createdAt,
    updatedAt          : row.updatedAt,
    personaCandidateIds: row.personaCandidateIds,
    personaIds         : resolvePersonaIds(row.personaCandidateIds, personaIdsByCandidateId),
    timeLabel          : resolveTimeLabel(row, timeLabelByHintId),
    relationTypeKey    : row.relationTypeKey,
    evidenceSpanIds    : row.evidenceSpanIds
  };
}

function toClaimDetailRecord(
  row: ClaimRowBase,
  personaIdsByCandidateId: PersonaIdsByCandidateIdMap,
  conflictStateMap: ConflictStateMap,
  timeLabelByHintId: TimeLabelByHintIdMap
): ClaimDetailRecord {
  return {
    ...row.extra,
    ...toListItem(row, personaIdsByCandidateId, conflictStateMap, timeLabelByHintId),
    id                : row.id,
    derivedFromClaimId: row.derivedFromClaimId
  };
}

function compareNewestFirst(left: ReviewClaimListItem, right: ReviewClaimListItem): number {
  const createdDiff = right.createdAt.getTime() - left.createdAt.getTime();
  if (createdDiff !== 0) return createdDiff;

  const updatedDiff = right.updatedAt.getTime() - left.updatedAt.getTime();
  if (updatedDiff !== 0) return updatedDiff;

  return right.claimId.localeCompare(left.claimId);
}

function buildClaimWhere(input: ListReviewClaimsInput): Record<string, unknown> {
  return {
    bookId: input.bookId,
    ...(input.reviewStates?.length ? { reviewState: { in: input.reviewStates } } : {}),
    ...(input.sources?.length ? { source: { in: input.sources } } : {}),
    ...(input.chapterId ? { chapterId: input.chapterId } : {})
  };
}

function buildTimeWhere(input: ListReviewClaimsInput): Record<string, unknown> {
  return {
    ...buildClaimWhere(input),
    ...(input.timeLabel ? { normalizedLabel: input.timeLabel } : {})
  };
}

function normalizeOffset(offset?: number): number {
  if (typeof offset !== "number" || Number.isNaN(offset)) return 0;
  return Math.max(0, Math.trunc(offset));
}

function normalizeLimit(limit?: number): number {
  if (typeof limit !== "number" || Number.isNaN(limit)) return 100;
  return Math.max(0, Math.trunc(limit));
}

async function resolveTimeHintIdsForLabel(
  prismaClient: typeof prisma,
  input: ListReviewClaimsInput
): Promise<string[] | null> {
  if (!input.timeLabel) return null;

  const rows = await prismaClient.timeClaim.findMany({
    where : { bookId: input.bookId, normalizedLabel: input.timeLabel },
    select: { id: true }
  });

  return rows.map((row) => row.id);
}

async function loadEventClaimRows(
  prismaClient: typeof prisma,
  input: ListReviewClaimsInput,
  timeHintIds: readonly string[] | null
): Promise<ClaimRowBase[]> {
  const timeHintIdList = timeHintIds === null ? null : [...timeHintIds];

  const rows = await prismaClient.eventClaim.findMany({
    where: {
      ...buildClaimWhere(input),
      ...(timeHintIdList === null
        ? {}
        : timeHintIdList.length > 0
          ? { timeHintId: { in: timeHintIdList } }
          : { id: { in: [] } })
    },
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
      reviewState              : true,
      source                   : true,
      derivedFromClaimId       : true,
      createdAt                : true,
      updatedAt                : true
    }
  });

  return rows.map((row) => ({
    claimKind          : "EVENT",
    id                 : row.id,
    bookId             : row.bookId,
    chapterId          : row.chapterId,
    reviewState        : row.reviewState,
    source             : row.source,
    createdAt          : row.createdAt,
    updatedAt          : row.updatedAt,
    evidenceSpanIds    : row.evidenceSpanIds,
    personaCandidateIds: toUniqueSortedIds([
      row.subjectPersonaCandidateId,
      row.objectPersonaCandidateId
    ]),
    relationTypeKey   : null,
    timeLabel         : null,
    timeHintId        : row.timeHintId,
    derivedFromClaimId: row.derivedFromClaimId,
    extra             : {
      id                       : row.id,
      bookId                   : row.bookId,
      chapterId                : row.chapterId,
      subjectPersonaCandidateId: row.subjectPersonaCandidateId,
      objectPersonaCandidateId : row.objectPersonaCandidateId,
      predicate                : row.predicate,
      objectText               : row.objectText,
      locationText             : row.locationText,
      timeHintId               : row.timeHintId,
      eventCategory            : row.eventCategory,
      narrativeLens            : row.narrativeLens,
      evidenceSpanIds          : row.evidenceSpanIds,
      reviewState              : row.reviewState,
      source                   : row.source,
      derivedFromClaimId       : row.derivedFromClaimId,
      createdAt                : row.createdAt,
      updatedAt                : row.updatedAt
    }
  }));
}

async function loadRelationClaimRows(
  prismaClient: typeof prisma,
  input: ListReviewClaimsInput,
  timeHintIds: readonly string[] | null
): Promise<ClaimRowBase[]> {
  const timeHintIdList = timeHintIds === null ? null : [...timeHintIds];

  const rows = await prismaClient.relationClaim.findMany({
    where: {
      ...buildClaimWhere(input),
      ...(timeHintIdList === null
        ? {}
        : timeHintIdList.length > 0
          ? { timeHintId: { in: timeHintIdList } }
          : { id: { in: [] } })
    },
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
      reviewState             : true,
      source                  : true,
      derivedFromClaimId      : true,
      createdAt               : true,
      updatedAt               : true
    }
  });

  return rows.map((row) => ({
    claimKind          : "RELATION",
    id                 : row.id,
    bookId             : row.bookId,
    chapterId          : row.chapterId,
    reviewState        : row.reviewState,
    source             : row.source,
    createdAt          : row.createdAt,
    updatedAt          : row.updatedAt,
    evidenceSpanIds    : row.evidenceSpanIds,
    personaCandidateIds: toUniqueSortedIds([
      row.sourcePersonaCandidateId,
      row.targetPersonaCandidateId
    ]),
    relationTypeKey   : row.relationTypeKey,
    timeLabel         : null,
    timeHintId        : row.timeHintId,
    derivedFromClaimId: row.derivedFromClaimId,
    extra             : {
      id                      : row.id,
      bookId                  : row.bookId,
      chapterId               : row.chapterId,
      sourcePersonaCandidateId: row.sourcePersonaCandidateId,
      targetPersonaCandidateId: row.targetPersonaCandidateId,
      relationTypeKey         : row.relationTypeKey,
      relationLabel           : row.relationLabel,
      relationTypeSource      : row.relationTypeSource,
      direction               : row.direction,
      effectiveChapterStart   : row.effectiveChapterStart,
      effectiveChapterEnd     : row.effectiveChapterEnd,
      timeHintId              : row.timeHintId,
      evidenceSpanIds         : row.evidenceSpanIds,
      reviewState             : row.reviewState,
      source                  : row.source,
      derivedFromClaimId      : row.derivedFromClaimId,
      createdAt               : row.createdAt,
      updatedAt               : row.updatedAt
    }
  }));
}

async function loadAliasClaimRows(
  prismaClient: typeof prisma,
  input: ListReviewClaimsInput
): Promise<ClaimRowBase[]> {
  const rows = await prismaClient.aliasClaim.findMany({
    where : buildClaimWhere(input),
    select: {
      id                      : true,
      bookId                  : true,
      chapterId               : true,
      aliasText               : true,
      aliasType               : true,
      claimKind               : true,
      personaCandidateId      : true,
      targetPersonaCandidateId: true,
      evidenceSpanIds         : true,
      reviewState             : true,
      source                  : true,
      derivedFromClaimId      : true,
      createdAt               : true,
      updatedAt               : true
    }
  });

  return rows.map((row) => ({
    claimKind          : "ALIAS",
    id                 : row.id,
    bookId             : row.bookId,
    chapterId          : row.chapterId,
    reviewState        : row.reviewState,
    source             : row.source,
    createdAt          : row.createdAt,
    updatedAt          : row.updatedAt,
    evidenceSpanIds    : row.evidenceSpanIds,
    personaCandidateIds: toUniqueSortedIds([
      row.personaCandidateId,
      row.targetPersonaCandidateId
    ]),
    relationTypeKey   : null,
    timeLabel         : null,
    timeHintId        : null,
    derivedFromClaimId: row.derivedFromClaimId,
    extra             : {
      id                      : row.id,
      bookId                  : row.bookId,
      chapterId               : row.chapterId,
      aliasText               : row.aliasText,
      aliasType               : row.aliasType,
      claimKind               : row.claimKind,
      personaCandidateId      : row.personaCandidateId,
      targetPersonaCandidateId: row.targetPersonaCandidateId,
      evidenceSpanIds         : row.evidenceSpanIds,
      reviewState             : row.reviewState,
      source                  : row.source,
      derivedFromClaimId      : row.derivedFromClaimId,
      createdAt               : row.createdAt,
      updatedAt               : row.updatedAt
    }
  }));
}

async function loadTimeClaimRows(
  prismaClient: typeof prisma,
  input: ListReviewClaimsInput
): Promise<ClaimRowBase[]> {
  const rows = await prismaClient.timeClaim.findMany({
    where : buildTimeWhere(input),
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
      reviewState        : true,
      source             : true,
      derivedFromClaimId : true,
      createdAt          : true,
      updatedAt          : true
    }
  });

  return rows.map((row) => ({
    claimKind          : "TIME",
    id                 : row.id,
    bookId             : row.bookId,
    chapterId          : row.chapterId,
    reviewState        : row.reviewState,
    source             : row.source,
    createdAt          : row.createdAt,
    updatedAt          : row.updatedAt,
    evidenceSpanIds    : row.evidenceSpanIds,
    personaCandidateIds: [],
    relationTypeKey    : null,
    timeLabel          : row.normalizedLabel,
    timeHintId         : null,
    derivedFromClaimId : row.derivedFromClaimId,
    extra              : {
      id                 : row.id,
      bookId             : row.bookId,
      chapterId          : row.chapterId,
      rawTimeText        : row.rawTimeText,
      timeType           : row.timeType,
      normalizedLabel    : row.normalizedLabel,
      relativeOrderWeight: row.relativeOrderWeight,
      chapterRangeStart  : row.chapterRangeStart,
      chapterRangeEnd    : row.chapterRangeEnd,
      evidenceSpanIds    : row.evidenceSpanIds,
      reviewState        : row.reviewState,
      source             : row.source,
      derivedFromClaimId : row.derivedFromClaimId,
      createdAt          : row.createdAt,
      updatedAt          : row.updatedAt
    }
  }));
}

async function loadIdentityResolutionClaimRows(
  prismaClient: typeof prisma,
  input: ListReviewClaimsInput
): Promise<ClaimRowBase[]> {
  const rows = await prismaClient.identityResolutionClaim.findMany({
    where : buildClaimWhere(input),
    select: {
      id                : true,
      bookId            : true,
      chapterId         : true,
      mentionId         : true,
      personaCandidateId: true,
      resolvedPersonaId : true,
      resolutionKind    : true,
      rationale         : true,
      evidenceSpanIds   : true,
      reviewState       : true,
      source            : true,
      derivedFromClaimId: true,
      createdAt         : true,
      updatedAt         : true
    }
  });

  return rows.map((row) => ({
    claimKind          : "IDENTITY_RESOLUTION",
    id                 : row.id,
    bookId             : row.bookId,
    chapterId          : row.chapterId,
    reviewState        : row.reviewState,
    source             : row.source,
    createdAt          : row.createdAt,
    updatedAt          : row.updatedAt,
    evidenceSpanIds    : row.evidenceSpanIds,
    personaCandidateIds: toUniqueSortedIds([row.personaCandidateId]),
    relationTypeKey    : null,
    timeLabel          : null,
    timeHintId         : null,
    derivedFromClaimId : row.derivedFromClaimId,
    extra              : {
      id                : row.id,
      bookId            : row.bookId,
      chapterId         : row.chapterId,
      mentionId         : row.mentionId,
      personaCandidateId: row.personaCandidateId,
      resolvedPersonaId : row.resolvedPersonaId,
      resolutionKind    : row.resolutionKind,
      rationale         : row.rationale,
      evidenceSpanIds   : row.evidenceSpanIds,
      reviewState       : row.reviewState,
      source            : row.source,
      derivedFromClaimId: row.derivedFromClaimId,
      createdAt         : row.createdAt,
      updatedAt         : row.updatedAt
    }
  }));
}

async function loadConflictFlagRows(
  prismaClient: typeof prisma,
  input: ListReviewClaimsInput
): Promise<ClaimRowBase[]> {
  const rows = await prismaClient.conflictFlag.findMany({
    where : buildClaimWhere(input),
    select: {
      id                        : true,
      bookId                    : true,
      chapterId                 : true,
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
      createdAt                 : true,
      updatedAt                 : true
    }
  });

  return rows.map((row) => ({
    claimKind          : "CONFLICT_FLAG",
    id                 : row.id,
    bookId             : row.bookId,
    chapterId          : row.chapterId,
    reviewState        : row.reviewState,
    source             : row.source,
    createdAt          : row.createdAt,
    updatedAt          : row.updatedAt,
    evidenceSpanIds    : row.evidenceSpanIds,
    personaCandidateIds: toUniqueSortedIds(row.relatedPersonaCandidateIds),
    relationTypeKey    : null,
    timeLabel          : null,
    timeHintId         : null,
    derivedFromClaimId : null,
    extra              : {
      id                        : row.id,
      bookId                    : row.bookId,
      chapterId                 : row.chapterId,
      conflictType              : row.conflictType,
      severity                  : row.severity,
      reason                    : row.reason,
      recommendedActionKey      : row.recommendedActionKey,
      sourceStageKey            : row.sourceStageKey,
      relatedClaimKind          : row.relatedClaimKind,
      relatedClaimIds           : row.relatedClaimIds,
      relatedPersonaCandidateIds: row.relatedPersonaCandidateIds,
      relatedChapterIds         : row.relatedChapterIds,
      summary                   : row.summary,
      evidenceSpanIds           : row.evidenceSpanIds,
      reviewState               : row.reviewState,
      source                    : row.source,
      createdAt                 : row.createdAt,
      updatedAt                 : row.updatedAt
    }
  }));
}

async function loadClaimRowsByFamily(
  prismaClient: typeof prisma,
  input: ListReviewClaimsInput,
  claimKinds: readonly ReviewableClaimFamily[]
): Promise<ClaimRowBase[]> {
  const timeHintIds = await resolveTimeHintIdsForLabel(prismaClient, input);
  const rows: ClaimRowBase[] = [];

  for (const claimKind of claimKinds) {
    switch (claimKind) {
      case "ALIAS":
        rows.push(...await loadAliasClaimRows(prismaClient, input));
        break;
      case "EVENT":
        rows.push(...await loadEventClaimRows(prismaClient, input, timeHintIds));
        break;
      case "RELATION":
        rows.push(...await loadRelationClaimRows(prismaClient, input, timeHintIds));
        break;
      case "TIME":
        rows.push(...await loadTimeClaimRows(prismaClient, input));
        break;
      case "IDENTITY_RESOLUTION":
        rows.push(...await loadIdentityResolutionClaimRows(prismaClient, input));
        break;
      case "CONFLICT_FLAG":
        rows.push(...await loadConflictFlagRows(prismaClient, input));
        break;
    }
  }

  return rows;
}

async function loadAcceptedPersonaIdsByCandidateId(
  prismaClient: typeof prisma,
  bookId: string,
  personaCandidateIds: readonly string[]
): Promise<PersonaIdsByCandidateIdMap> {
  const candidateIds = toUniqueSortedIds(personaCandidateIds);
  if (candidateIds.length === 0) {
    return new Map();
  }

  const rows = await prismaClient.identityResolutionClaim.findMany({
    where: {
      bookId,
      reviewState       : "ACCEPTED",
      personaCandidateId: { in: candidateIds },
      resolvedPersonaId : { not: null }
    },
    select: {
      personaCandidateId: true,
      resolvedPersonaId : true
    }
  });

  // 与 projection builder 保持一致：同一 candidate 若被多个 accepted persona 指向，视为歧义，不映射到任何 persona。
  const resolvedPersonaIdsByCandidateId = new Map<string, Set<string>>();
  for (const row of rows) {
    if (row.personaCandidateId === null || row.resolvedPersonaId === null) continue;
    const personaIds = resolvedPersonaIdsByCandidateId.get(row.personaCandidateId) ?? new Set<string>();
    personaIds.add(row.resolvedPersonaId);
    resolvedPersonaIdsByCandidateId.set(row.personaCandidateId, personaIds);
  }

  const map = new Map<string, readonly string[]>();
  for (const [candidateId, personaIds] of resolvedPersonaIdsByCandidateId.entries()) {
    if (personaIds.size !== 1) continue;
    map.set(candidateId, Array.from(personaIds).sort());
  }

  return map;
}

async function loadTimeLabelsByHintId(
  prismaClient: typeof prisma,
  bookId: string,
  timeHintIds: readonly string[]
): Promise<TimeLabelByHintIdMap> {
  const uniqueTimeHintIds = toUniqueSortedIds(timeHintIds);
  if (uniqueTimeHintIds.length === 0) {
    return new Map();
  }

  const rows = await prismaClient.timeClaim.findMany({
    where: {
      bookId,
      id: { in: uniqueTimeHintIds }
    },
    select: {
      id             : true,
      normalizedLabel: true
    }
  });

  return new Map(rows.map((row) => [row.id, row.normalizedLabel]));
}

async function loadConflictStateMap(
  prismaClient: typeof prisma,
  bookId: string,
  claimIds: readonly string[]
): Promise<ConflictStateMap> {
  const uniqueClaimIds = toUniqueSortedIds(claimIds);
  if (uniqueClaimIds.length === 0) {
    return new Map();
  }

  const flags = await prismaClient.conflictFlag.findMany({
    where: {
      bookId,
      reviewState    : { not: "REJECTED" },
      relatedClaimIds: { hasSome: uniqueClaimIds }
    },
    select: {
      relatedClaimIds: true
    }
  });

  const stateByClaimId = new Map<string, ConflictState>();
  const allowedClaimIds = new Set(uniqueClaimIds);
  for (const flag of flags) {
    for (const relatedClaimId of flag.relatedClaimIds) {
      if (!allowedClaimIds.has(relatedClaimId)) continue;
      stateByClaimId.set(relatedClaimId, "ACTIVE");
    }
  }

  return stateByClaimId;
}

function extractCandidateIds(rows: readonly ClaimRowBase[]): string[] {
  const ids: string[] = [];
  for (const row of rows) {
    ids.push(...row.personaCandidateIds);
  }
  return ids;
}

async function resolveTimeLabelForClaim(
  prismaClient: typeof prisma,
  claim: ClaimRowBase
): Promise<string | null> {
  if (claim.timeLabel !== null) return claim.timeLabel;
  if (claim.timeHintId === null) return null;

  const hint = await prismaClient.timeClaim.findUnique({
    where : { id: claim.timeHintId },
    select: { normalizedLabel: true, bookId: true }
  });

  if (!hint || hint.bookId !== claim.bookId) return null;
  return hint.normalizedLabel;
}

async function loadSingleClaim(
  prismaClient: typeof prisma,
  input: GetReviewClaimDetailInput
): Promise<ClaimRowBase | null> {
  const listInput: ListReviewClaimsInput = {
    bookId    : input.bookId,
    claimKinds: [input.claimKind]
  };
  const rows = await loadClaimRowsByFamily(prismaClient, listInput, [input.claimKind]);
  return rows.find((row) => row.id === input.claimId) ?? null;
}

async function findBasisClaim(
  prismaClient: typeof prisma,
  claim: ClaimRowBase
): Promise<ClaimRowBase | null> {
  if (claim.source !== "MANUAL") {
    return claim;
  }

  const visitedClaimIds = new Set<string>([claim.id]);
  let current = claim;

  while (current.source === "MANUAL" && current.derivedFromClaimId !== null) {
    const nextClaim = await loadSingleClaim(prismaClient, {
      bookId   : claim.bookId,
      claimKind: claim.claimKind,
      claimId  : current.derivedFromClaimId
    });
    if (nextClaim === null) return null;
    if (visitedClaimIds.has(nextClaim.id)) return null;

    if (nextClaim.source !== "MANUAL") {
      return nextClaim;
    }

    visitedClaimIds.add(nextClaim.id);
    current = nextClaim;
  }

  return null;
}

async function loadProjectionSummary(
  prismaClient: typeof prisma,
  claim: ClaimRowBase,
  personaIds: readonly string[],
  resolvedTimeLabel: string | null
): Promise<ProjectionSummary> {
  const summary: ProjectionSummary = {
    personaChapterFacts: [],
    personaTimeFacts   : [],
    relationshipEdges  : [],
    timelineEvents     : []
  };

  const chapterId = claim.chapterId;
  const hasPersona = personaIds.length > 0;
  const bookId = claim.bookId;
  const personaIdList = [...personaIds];

  if (chapterId !== null && hasPersona) {
    summary.personaChapterFacts = await prismaClient.personaChapterFact.findMany({
      where: {
        bookId,
        chapterId,
        personaId: { in: personaIdList }
      }
    });
  }

  if (resolvedTimeLabel !== null) {
    summary.personaTimeFacts = await prismaClient.personaTimeFact.findMany({
      where: {
        bookId,
        timeLabel: resolvedTimeLabel,
        ...(hasPersona ? { personaId: { in: personaIdList } } : {})
      }
    });
  }

  if (claim.claimKind === "RELATION" && hasPersona) {
    summary.relationshipEdges = await prismaClient.relationshipEdge.findMany({
      where: {
        bookId,
        relationTypeKey: claim.relationTypeKey ?? undefined,
        OR             : [
          { sourcePersonaId: { in: personaIdList } },
          { targetPersonaId: { in: personaIdList } }
        ]
      }
    });
  }

  if (chapterId !== null) {
    summary.timelineEvents = await prismaClient.timelineEvent.findMany({
      where: {
        bookId,
        chapterId,
        ...(hasPersona ? { personaId: { in: personaIdList } } : {})
      }
    });
  } else if (resolvedTimeLabel !== null) {
    summary.timelineEvents = await prismaClient.timelineEvent.findMany({
      where: {
        bookId,
        timeLabel: resolvedTimeLabel,
        ...(hasPersona ? { personaId: { in: personaIdList } } : {})
      }
    });
  }

  return summary;
}

export function createReviewQueryService(prismaClient: typeof prisma = prisma) {
  async function listClaims(input: ListReviewClaimsInput): Promise<{ items: ReviewClaimListItem[]; total: number }> {
    const claimKinds = input.claimKinds?.length
      ? input.claimKinds
      : REVIEWABLE_CLAIM_FAMILY_VALUES;
    const claimRows = await loadClaimRowsByFamily(prismaClient, input, claimKinds);
    const timeLabelByHintId = await loadTimeLabelsByHintId(
      prismaClient,
      input.bookId,
      claimRows.flatMap((row) => (row.timeHintId === null ? [] : [row.timeHintId]))
    );
    const conflictStateMap = await loadConflictStateMap(
      prismaClient,
      input.bookId,
      claimRows.map((row) => row.id)
    );
    const personaIdsByCandidateId = await loadAcceptedPersonaIdsByCandidateId(
      prismaClient,
      input.bookId,
      extractCandidateIds(claimRows)
    );

    const filteredRows = claimRows
      .map((row) => toListItem(row, personaIdsByCandidateId, conflictStateMap, timeLabelByHintId))
      .filter((item) => {
        if (input.personaId && !item.personaIds.includes(input.personaId)) return false;
        if (input.conflictState && item.conflictState !== input.conflictState) return false;
        return true;
      })
      .sort(compareNewestFirst);

    const offset = normalizeOffset(input.offset);
    const limit = normalizeLimit(input.limit);

    return {
      items: filteredRows.slice(offset, offset + limit),
      total: filteredRows.length
    };
  }

  async function getClaimDetail(input: GetReviewClaimDetailInput): Promise<{
    claim            : ClaimDetailRecord;
    evidence         : unknown[];
    basisClaim       : ClaimDetailRecord | null;
    projectionSummary: ProjectionSummary;
    auditHistory     : unknown[];
  } | null> {
    const claim = await loadSingleClaim(prismaClient, input);
    if (claim === null) return null;

    const basisClaimRow = await findBasisClaim(prismaClient, claim);
    const candidateIds = extractCandidateIds(basisClaimRow === null ? [claim] : [claim, basisClaimRow]);
    const personaIdsByCandidateId = await loadAcceptedPersonaIdsByCandidateId(
      prismaClient,
      input.bookId,
      candidateIds
    );
    const conflictStateMap = await loadConflictStateMap(prismaClient, input.bookId, [claim.id]);
    const timeLabelByHintId = await loadTimeLabelsByHintId(
      prismaClient,
      input.bookId,
      [
        ...(claim.timeHintId === null ? [] : [claim.timeHintId]),
        ...(basisClaimRow?.timeHintId === null || basisClaimRow === null ? [] : [basisClaimRow.timeHintId])
      ]
    );
    const claimDetail = toClaimDetailRecord(
      claim,
      personaIdsByCandidateId,
      conflictStateMap,
      timeLabelByHintId
    );
    const basisClaim = basisClaimRow
      ? toClaimDetailRecord(
          basisClaimRow,
          personaIdsByCandidateId,
          await loadConflictStateMap(prismaClient, input.bookId, [basisClaimRow.id]),
          timeLabelByHintId
        )
      : null;

    const evidence = claim.evidenceSpanIds.length === 0
      ? []
      : await prismaClient.evidenceSpan.findMany({
          where  : { id: { in: claim.evidenceSpanIds }, bookId: input.bookId },
          orderBy: [{ chapterId: "asc" }, { startOffset: "asc" }]
        });
    const auditHistory = await createReviewAuditService(prismaClient).listAuditTrail({
      claimKind: claim.claimKind as ClaimKind,
      claimId  : claim.id
    });
    const timeLabel = await resolveTimeLabelForClaim(prismaClient, claim);
    const personaIds = resolvePersonaIds(claim.personaCandidateIds, personaIdsByCandidateId);
    const projectionSummary = await loadProjectionSummary(
      prismaClient,
      claim,
      personaIds,
      timeLabel
    );

    return {
      claim: claimDetail,
      evidence,
      basisClaim,
      projectionSummary,
      auditHistory
    };
  }

  return { listClaims, getClaimDetail };
}

export const reviewQueryService = createReviewQueryService();
