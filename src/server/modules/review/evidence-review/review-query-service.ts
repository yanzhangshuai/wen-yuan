import { prisma } from "@/server/db/prisma";
import type { ClaimKind } from "@/generated/prisma/enums";
import { REVIEWABLE_CLAIM_FAMILY_VALUES } from "@/server/modules/analysis/claims/claim-schemas";
import type { ReviewableClaimFamily } from "@/server/modules/analysis/claims/claim-schemas";
import { createKnowledgeRepository } from "@/server/modules/knowledge-v2/repository";
import {
  createRelationTypeCatalogLoader,
  type RelationCatalogEntry
} from "@/server/modules/knowledge-v2/relation-types";
import { createReviewAuditService } from "@/server/modules/review/evidence-review/review-audit-service";
import type {
  ReviewPersonaChapterMatrixQueryRequest,
  ReviewRelationEditorQueryRequest
} from "@/server/modules/review/evidence-review/review-api-schemas";
import type {
  ClaimReviewState,
  ClaimSource,
  RelationDirection,
  RelationTypeSource
} from "@/server/modules/review/evidence-review/review-state";

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

export interface PersonaChapterRelationTypeOptionDto {
  relationTypeKey   : string;
  label             : string;
  direction         : RelationDirection;
  relationTypeSource: RelationTypeSource;
  aliasLabels       : string[];
  systemPreset      : boolean;
}

export interface PersonaChapterMatrixPersonaDto {
  personaId                : string;
  displayName              : string;
  aliases                  : string[];
  primaryPersonaCandidateId: string | null;
  personaCandidateIds      : string[];
  firstChapterNo           : number | null;
  totalEventCount          : number;
  totalRelationCount       : number;
  totalConflictCount       : number;
}

export interface PersonaChapterMatrixChapterDto {
  chapterId: string;
  chapterNo: number;
  title    : string;
  label    : string;
}

export interface PersonaChapterMatrixCellDto {
  bookId            : string;
  personaId         : string;
  chapterId         : string;
  chapterNo         : number;
  eventCount        : number;
  relationCount     : number;
  conflictCount     : number;
  reviewStateSummary: Record<string, Record<string, number>>;
  latestUpdatedAt   : string;
}

export interface PersonaChapterMatrixDto {
  bookId             : string;
  personas           : PersonaChapterMatrixPersonaDto[];
  chapters           : PersonaChapterMatrixChapterDto[];
  cells              : PersonaChapterMatrixCellDto[];
  relationTypeOptions: PersonaChapterRelationTypeOptionDto[];
  generatedAt        : string;
}

export type ReviewRelationTypeOptionDto = PersonaChapterRelationTypeOptionDto;

export interface ReviewRelationPersonaOptionDto {
  personaId  : string;
  displayName: string;
  aliases    : string[];
}

export interface ReviewRelationPairWarningsDto {
  directionConflict: boolean;
  intervalConflict : boolean;
}

export interface ReviewRelationPairSummaryDto {
  pairKey           : string;
  leftPersonaId     : string;
  rightPersonaId    : string;
  leftPersonaName   : string;
  rightPersonaName  : string;
  totalClaims       : number;
  activeClaims      : number;
  latestUpdatedAt   : string;
  relationTypeKeys  : string[];
  reviewStateSummary: Record<string, number>;
  warningFlags      : ReviewRelationPairWarningsDto;
}

export interface ReviewRelationClaimListItemDto {
  claimId              : string;
  reviewState          : ClaimReviewState;
  source               : ClaimSource;
  conflictState        : ConflictState;
  relationTypeKey      : string;
  relationLabel        : string;
  relationTypeSource   : RelationTypeSource | null;
  direction            : RelationDirection;
  effectiveChapterStart: number | null;
  effectiveChapterEnd  : number | null;
  chapterId            : string | null;
  chapterLabel         : string | null;
  timeLabel            : string | null;
  evidenceSpanIds      : string[];
}

export interface ReviewRelationSelectedPairDto {
  pairKey     : string;
  leftPersona : ReviewRelationPersonaOptionDto;
  rightPersona: ReviewRelationPersonaOptionDto;
  warnings    : ReviewRelationPairWarningsDto;
  claims      : ReviewRelationClaimListItemDto[];
}

export interface ReviewRelationEditorDto {
  bookId             : string;
  personaOptions     : ReviewRelationPersonaOptionDto[];
  relationTypeOptions: ReviewRelationTypeOptionDto[];
  pairSummaries      : ReviewRelationPairSummaryDto[];
  selectedPair       : ReviewRelationSelectedPairDto | null;
  generatedAt        : string;
}

export interface ReviewQueryServiceDependencies {
  relationTypeCatalogLoader?: {
    load(input: {
      bookId     : string;
      bookTypeKey: string | null;
      runId      : string | null;
      mode       : "RUNTIME" | "REVIEW";
    }): Promise<{
      activeEntries: Array<Pick<
        RelationCatalogEntry,
        "relationTypeKey" | "defaultLabel" | "direction" | "relationTypeSource" | "aliasLabels" | "systemPreset"
      >>;
    }>;
  };
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

function normalizeReviewStateSummary(value: unknown): Record<string, Record<string, number>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const normalized: Record<string, Record<string, number>> = {};
  for (const [familyKey, familyValue] of Object.entries(value as Record<string, unknown>)) {
    if (familyValue === null || typeof familyValue !== "object" || Array.isArray(familyValue)) {
      continue;
    }

    const familyCounts: Record<string, number> = {};
    for (const [stateKey, count] of Object.entries(familyValue as Record<string, unknown>)) {
      if (typeof count !== "number" || !Number.isFinite(count) || count <= 0) {
        continue;
      }
      familyCounts[stateKey] = count;
    }

    if (Object.keys(familyCounts).length > 0) {
      normalized[familyKey] = familyCounts;
    }
  }

  return normalized;
}

function matchesMatrixReviewStates(
  summary: Record<string, Record<string, number>>,
  reviewStates?: readonly ClaimReviewState[]
): boolean {
  if (!reviewStates || reviewStates.length === 0) {
    return true;
  }

  return Object.values(summary).some((stateCounts) => (
    reviewStates.some((reviewState) => (stateCounts[reviewState] ?? 0) > 0)
  ));
}

function matchesMatrixConflictState(
  conflictCount: number,
  conflictState?: ConflictState
): boolean {
  if (!conflictState) {
    return true;
  }

  if (conflictState === "ACTIVE") {
    return conflictCount > 0;
  }

  return conflictCount === 0;
}

function toMatrixChapterLabel(chapter: {
  no     : number;
  unit?  : string | null;
  noText?: string | null;
  title  : string;
}): string {
  const prefix = chapter.noText?.trim()
    ? chapter.noText.trim()
    : `第${chapter.no}${chapter.unit?.trim() || "回"}`;

  return `${prefix} ${chapter.title}`.trim();
}

function sortMatrixPersonas(
  left: PersonaChapterMatrixPersonaDto,
  right: PersonaChapterMatrixPersonaDto
): number {
  const leftChapterNo = left.firstChapterNo;
  const rightChapterNo = right.firstChapterNo;

  if (leftChapterNo === null && rightChapterNo !== null) return 1;
  if (leftChapterNo !== null && rightChapterNo === null) return -1;
  if (leftChapterNo !== null && rightChapterNo !== null && leftChapterNo !== rightChapterNo) {
    return leftChapterNo - rightChapterNo;
  }

  const nameCompare = left.displayName.localeCompare(right.displayName);
  if (nameCompare !== 0) return nameCompare;

  return left.personaId.localeCompare(right.personaId);
}

function summarizePersonaCells(cells: readonly PersonaChapterMatrixCellDto[]) {
  let firstChapterNo: number | null = null;
  let totalEventCount = 0;
  let totalRelationCount = 0;
  let totalConflictCount = 0;

  for (const cell of cells) {
    if (firstChapterNo === null || cell.chapterNo < firstChapterNo) {
      firstChapterNo = cell.chapterNo;
    }
    totalEventCount += cell.eventCount;
    totalRelationCount += cell.relationCount;
    totalConflictCount += cell.conflictCount;
  }

  return {
    firstChapterNo,
    totalEventCount,
    totalRelationCount,
    totalConflictCount
  };
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

type MatrixChapterRecord = {
  id     : string;
  no     : number;
  title  : string;
  unit?  : string | null;
  noText?: string | null;
};

type MatrixPersonaRecord = {
  id     : string;
  name   : string;
  aliases: string[];
};

type MatrixBookRecord = {
  bookType?: {
    key?: string | null;
  } | null;
} | null;

type PersonaCandidateHint = {
  primaryPersonaCandidateId: string | null;
  personaCandidateIds      : string[];
};

type RelationClaimExtra = {
  sourcePersonaCandidateId: string | null;
  targetPersonaCandidateId: string | null;
  relationTypeKey         : string;
  relationLabel           : string;
  relationTypeSource      : RelationTypeSource | null;
  direction               : RelationDirection;
  effectiveChapterStart   : number | null;
  effectiveChapterEnd     : number | null;
};

type RelationEditorClaimRecord = {
  claimId              : string;
  bookId               : string;
  chapterId            : string | null;
  reviewState          : ClaimReviewState;
  source               : ClaimSource;
  conflictState        : ConflictState;
  createdAt            : Date;
  updatedAt            : Date;
  relationTypeKey      : string;
  relationLabel        : string;
  relationTypeSource   : RelationTypeSource | null;
  direction            : RelationDirection;
  effectiveChapterStart: number | null;
  effectiveChapterEnd  : number | null;
  timeLabel            : string | null;
  evidenceSpanIds      : string[];
  sourcePersonaId      : string;
  targetPersonaId      : string;
  pairKey              : string;
};

async function loadMatrixChapters(
  prismaClient: typeof prisma,
  bookId: string
): Promise<PersonaChapterMatrixChapterDto[]> {
  const rows = await prismaClient.chapter.findMany({
    where  : { bookId, isAbstract: false },
    orderBy: [{ no: "asc" }, { id: "asc" }]
  }) as MatrixChapterRecord[];

  return rows.map((row) => ({
    chapterId: row.id,
    chapterNo: row.no,
    title    : row.title,
    label    : toMatrixChapterLabel(row)
  }));
}

async function loadMatrixPersonaRecords(
  prismaClient: typeof prisma,
  personaIds: readonly string[]
): Promise<Map<string, MatrixPersonaRecord>> {
  const uniquePersonaIds = toUniqueSortedIds(personaIds);
  if (uniquePersonaIds.length === 0) {
    return new Map();
  }

  const rows = await prismaClient.persona.findMany({
    where: { id: { in: uniquePersonaIds } }
  }) as MatrixPersonaRecord[];

  return new Map(rows.map((row) => [row.id, row]));
}

async function loadAcceptedCandidateHintsByPersonaId(
  prismaClient: typeof prisma,
  bookId: string,
  personaIds: readonly string[]
): Promise<Map<string, PersonaCandidateHint>> {
  const uniquePersonaIds = toUniqueSortedIds(personaIds);
  if (uniquePersonaIds.length === 0) {
    return new Map();
  }

  const rows = await prismaClient.identityResolutionClaim.findMany({
    where: {
      bookId,
      reviewState       : "ACCEPTED",
      resolvedPersonaId : { in: uniquePersonaIds },
      personaCandidateId: { not: null }
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }]
  }) as Array<{
    personaCandidateId: string | null;
    resolvedPersonaId : string | null;
  }>;

  const candidateIdsByPersonaId = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.resolvedPersonaId || !row.personaCandidateId) {
      continue;
    }

    const candidateIds = candidateIdsByPersonaId.get(row.resolvedPersonaId) ?? [];
    if (!candidateIds.includes(row.personaCandidateId)) {
      candidateIds.push(row.personaCandidateId);
    }
    candidateIdsByPersonaId.set(row.resolvedPersonaId, candidateIds);
  }

  return new Map(
    Array.from(candidateIdsByPersonaId.entries()).map(([personaId, candidateIds]) => [
      personaId,
      {
        primaryPersonaCandidateId: candidateIds[0] ?? null,
        personaCandidateIds      : candidateIds
      }
    ])
  );
}

function toRelationTypeOption(
  entry: Pick<
    RelationCatalogEntry,
    "relationTypeKey" | "defaultLabel" | "direction" | "relationTypeSource" | "aliasLabels" | "systemPreset"
  >
): PersonaChapterRelationTypeOptionDto {
  return {
    relationTypeKey   : entry.relationTypeKey,
    label             : entry.defaultLabel,
    direction         : entry.direction,
    relationTypeSource: entry.relationTypeSource,
    aliasLabels       : [...entry.aliasLabels],
    systemPreset      : entry.systemPreset
  };
}

function canLoadDefaultRelationCatalog(prismaClient: typeof prisma): boolean {
  const maybePrisma = prismaClient as unknown as Record<string, unknown>;
  return (
    typeof maybePrisma.book === "object" &&
    maybePrisma.book !== null &&
    typeof maybePrisma.knowledgeItem === "object" &&
    maybePrisma.knowledgeItem !== null &&
    typeof maybePrisma.$transaction === "function"
  );
}

async function resolveBookTypeKey(
  prismaClient: typeof prisma,
  bookId: string
): Promise<string | null> {
  if (!("book" in prismaClient) || typeof prismaClient.book?.findUnique !== "function") {
    return null;
  }

  const book = await prismaClient.book.findUnique({
    where: { id: bookId }
  }) as MatrixBookRecord;

  return book?.bookType?.key ?? null;
}

async function loadMatrixRelationTypeOptions(
  prismaClient: typeof prisma,
  bookId: string,
  dependencies: ReviewQueryServiceDependencies
): Promise<PersonaChapterRelationTypeOptionDto[]> {
  const relationTypeCatalogLoader = dependencies.relationTypeCatalogLoader
    ?? (canLoadDefaultRelationCatalog(prismaClient)
      ? createRelationTypeCatalogLoader({
          knowledgeRepository: createKnowledgeRepository(prismaClient as never)
        })
      : null);

  if (!relationTypeCatalogLoader) {
    return [];
  }

  try {
    const catalog = await relationTypeCatalogLoader.load({
      bookId,
      bookTypeKey: await resolveBookTypeKey(prismaClient, bookId),
      runId      : null,
      mode       : "REVIEW"
    });

    return catalog.activeEntries.map((entry) => toRelationTypeOption(entry));
  } catch {
    return [];
  }
}

function buildRelationPairKey(leftPersonaId: string, rightPersonaId: string): string {
  return leftPersonaId.localeCompare(rightPersonaId) <= 0
    ? `${leftPersonaId}::${rightPersonaId}`
    : `${rightPersonaId}::${leftPersonaId}`;
}

function getRelationPairPersonaIds(pairKey: string): [string, string] {
  const [leftPersonaId, rightPersonaId] = pairKey.split("::");
  return [leftPersonaId ?? "", rightPersonaId ?? ""];
}

function resolveSinglePersonaId(
  candidateId: string | null | undefined,
  personaIdsByCandidateId: PersonaIdsByCandidateIdMap
): string | null {
  if (!candidateId) return null;
  const personaIds = personaIdsByCandidateId.get(candidateId);
  if (!personaIds || personaIds.length !== 1) {
    return null;
  }
  return personaIds[0] ?? null;
}

function isActiveRelationReviewState(reviewState: ClaimReviewState): boolean {
  return reviewState !== "REJECTED";
}

function computeRelationWarnings(
  claims: readonly RelationEditorClaimRecord[]
): ReviewRelationPairWarningsDto {
  const activeClaims = claims.filter((claim) => isActiveRelationReviewState(claim.reviewState));
  if (activeClaims.length < 2) {
    return {
      directionConflict: false,
      intervalConflict : false
    };
  }

  const directionConflict = new Set(activeClaims.map((claim) => claim.direction)).size > 1;
  const intervalConflict = new Set(activeClaims.map((claim) => (
    `${claim.effectiveChapterStart ?? "null"}:${claim.effectiveChapterEnd ?? "null"}`
  ))).size > 1;

  return {
    directionConflict,
    intervalConflict
  };
}

function sortRelationPairs(
  left: ReviewRelationPairSummaryDto,
  right: ReviewRelationPairSummaryDto
): number {
  const updatedDiff = Date.parse(right.latestUpdatedAt) - Date.parse(left.latestUpdatedAt);
  if (updatedDiff !== 0) {
    return updatedDiff;
  }

  const leftLabel = `${left.leftPersonaName} / ${left.rightPersonaName}`;
  const rightLabel = `${right.leftPersonaName} / ${right.rightPersonaName}`;
  const labelDiff = leftLabel.localeCompare(rightLabel);
  if (labelDiff !== 0) {
    return labelDiff;
  }

  return left.pairKey.localeCompare(right.pairKey);
}

function toRelationPersonaOption(
  personaId: string,
  personaRecordsById: ReadonlyMap<string, MatrixPersonaRecord>
): ReviewRelationPersonaOptionDto {
  const personaRecord = personaRecordsById.get(personaId);
  return {
    personaId,
    displayName: personaRecord?.name ?? personaId,
    aliases    : [...(personaRecord?.aliases ?? [])]
  };
}

function matchesRelationEditorFilters(
  claim: RelationEditorClaimRecord,
  input: ReviewRelationEditorQueryRequest
): boolean {
  if (input.personaId && claim.sourcePersonaId !== input.personaId && claim.targetPersonaId !== input.personaId) {
    return false;
  }

  if (input.relationTypeKeys?.length && !input.relationTypeKeys.includes(claim.relationTypeKey)) {
    return false;
  }

  if (input.conflictState && claim.conflictState !== input.conflictState) {
    return false;
  }

  return true;
}

function toRelationPairSummary(
  pairKey: string,
  claims: readonly RelationEditorClaimRecord[],
  personaRecordsById: ReadonlyMap<string, MatrixPersonaRecord>
): ReviewRelationPairSummaryDto {
  const [leftPersonaId, rightPersonaId] = getRelationPairPersonaIds(pairKey);
  const leftPersona = toRelationPersonaOption(leftPersonaId, personaRecordsById);
  const rightPersona = toRelationPersonaOption(rightPersonaId, personaRecordsById);
  const latestUpdatedAt = claims.reduce(
    (latest, claim) => (claim.updatedAt.getTime() > latest.getTime() ? claim.updatedAt : latest),
    claims[0]?.updatedAt ?? new Date(0)
  );
  const reviewStateSummary: Record<string, number> = {};
  for (const claim of claims) {
    reviewStateSummary[claim.reviewState] = (reviewStateSummary[claim.reviewState] ?? 0) + 1;
  }

  return {
    pairKey,
    leftPersonaId,
    rightPersonaId,
    leftPersonaName : leftPersona.displayName,
    rightPersonaName: rightPersona.displayName,
    totalClaims     : claims.length,
    activeClaims    : claims.filter((claim) => isActiveRelationReviewState(claim.reviewState)).length,
    latestUpdatedAt : latestUpdatedAt.toISOString(),
    relationTypeKeys: toUniqueSortedIds(claims.map((claim) => claim.relationTypeKey)),
    reviewStateSummary,
    warningFlags    : computeRelationWarnings(claims)
  };
}

function toRelationClaimListItem(
  claim: RelationEditorClaimRecord,
  chapterLabelById: ReadonlyMap<string, string>
): ReviewRelationClaimListItemDto {
  return {
    claimId              : claim.claimId,
    reviewState          : claim.reviewState,
    source               : claim.source,
    conflictState        : claim.conflictState,
    relationTypeKey      : claim.relationTypeKey,
    relationLabel        : claim.relationLabel,
    relationTypeSource   : claim.relationTypeSource,
    direction            : claim.direction,
    effectiveChapterStart: claim.effectiveChapterStart,
    effectiveChapterEnd  : claim.effectiveChapterEnd,
    chapterId            : claim.chapterId,
    chapterLabel         : claim.chapterId ? (chapterLabelById.get(claim.chapterId) ?? null) : null,
    timeLabel            : claim.timeLabel,
    evidenceSpanIds      : [...claim.evidenceSpanIds]
  };
}

async function loadChapterLabelsById(
  prismaClient: typeof prisma,
  bookId: string,
  chapterIds: readonly string[]
): Promise<Map<string, string>> {
  const uniqueChapterIds = toUniqueSortedIds(chapterIds);
  if (uniqueChapterIds.length === 0) {
    return new Map();
  }

  const rows = await prismaClient.chapter.findMany({
    where: {
      bookId,
      id        : { in: uniqueChapterIds },
      isAbstract: false
    },
    orderBy: [{ no: "asc" }, { id: "asc" }]
  }) as MatrixChapterRecord[];

  return new Map(rows.map((row) => [row.id, toMatrixChapterLabel(row)]));
}

async function loadRelationEditorClaims(
  prismaClient: typeof prisma,
  input: ReviewRelationEditorQueryRequest
): Promise<RelationEditorClaimRecord[]> {
  const relationRows = await loadRelationClaimRows(prismaClient, {
    bookId      : input.bookId,
    reviewStates: input.reviewStates
  }, null);

  const timeLabelByHintId = await loadTimeLabelsByHintId(
    prismaClient,
    input.bookId,
    relationRows.flatMap((row) => (row.timeHintId === null ? [] : [row.timeHintId]))
  );
  const conflictStateMap = await loadConflictStateMap(
    prismaClient,
    input.bookId,
    relationRows.map((row) => row.id)
  );
  const personaIdsByCandidateId = await loadAcceptedPersonaIdsByCandidateId(
    prismaClient,
    input.bookId,
    extractCandidateIds(relationRows)
  );

  return relationRows.flatMap((row) => {
    const relationExtra = row.extra as RelationClaimExtra;
    const sourcePersonaId = resolveSinglePersonaId(
      relationExtra.sourcePersonaCandidateId,
      personaIdsByCandidateId
    );
    const targetPersonaId = resolveSinglePersonaId(
      relationExtra.targetPersonaCandidateId,
      personaIdsByCandidateId
    );

    if (!sourcePersonaId || !targetPersonaId || sourcePersonaId === targetPersonaId) {
      return [];
    }

    const claim: RelationEditorClaimRecord = {
      claimId              : row.id,
      bookId               : row.bookId,
      chapterId            : row.chapterId,
      reviewState          : row.reviewState,
      source               : row.source,
      conflictState        : resolveConflictState(row.id, conflictStateMap),
      createdAt            : row.createdAt,
      updatedAt            : row.updatedAt,
      relationTypeKey      : relationExtra.relationTypeKey,
      relationLabel        : relationExtra.relationLabel,
      relationTypeSource   : relationExtra.relationTypeSource,
      direction            : relationExtra.direction,
      effectiveChapterStart: relationExtra.effectiveChapterStart,
      effectiveChapterEnd  : relationExtra.effectiveChapterEnd,
      timeLabel            : resolveTimeLabel(row, timeLabelByHintId),
      evidenceSpanIds      : [...row.evidenceSpanIds],
      sourcePersonaId,
      targetPersonaId,
      pairKey              : buildRelationPairKey(sourcePersonaId, targetPersonaId)
    };

    return matchesRelationEditorFilters(claim, input) ? [claim] : [];
  });
}

export function createReviewQueryService(
  prismaClient: typeof prisma = prisma,
  dependencies: ReviewQueryServiceDependencies = {}
) {
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

  async function getPersonaChapterMatrix(
    input: ReviewPersonaChapterMatrixQueryRequest
  ): Promise<PersonaChapterMatrixDto> {
    const chapters = await loadMatrixChapters(prismaClient, input.bookId);

    const rows = await prismaClient.personaChapterFact.findMany({
      where: {
        bookId: input.bookId,
        ...(input.personaId ? { personaId: input.personaId } : {}),
        ...(input.chapterId ? { chapterId: input.chapterId } : {})
      },
      orderBy: [
        { chapterNo: "asc" },
        { personaId: "asc" },
        { chapterId: "asc" }
      ]
    }) as Array<{
      bookId            : string;
      personaId         : string;
      chapterId         : string;
      chapterNo         : number;
      eventCount        : number;
      relationCount     : number;
      conflictCount     : number;
      reviewStateSummary: unknown;
      latestUpdatedAt   : Date;
    }>;

    const filteredCells = rows
      .map((row) => ({
        bookId            : row.bookId,
        personaId         : row.personaId,
        chapterId         : row.chapterId,
        chapterNo         : row.chapterNo,
        eventCount        : row.eventCount,
        relationCount     : row.relationCount,
        conflictCount     : row.conflictCount,
        reviewStateSummary: normalizeReviewStateSummary(row.reviewStateSummary),
        latestUpdatedAt   : row.latestUpdatedAt.toISOString()
      }))
      .filter((row) => matchesMatrixReviewStates(row.reviewStateSummary, input.reviewStates))
      .filter((row) => matchesMatrixConflictState(row.conflictCount, input.conflictState));

    const personaIds = toUniqueSortedIds(filteredCells.map((row) => row.personaId));
    const personaRecordsById = await loadMatrixPersonaRecords(prismaClient, personaIds);
    const candidateHintsByPersonaId = await loadAcceptedCandidateHintsByPersonaId(
      prismaClient,
      input.bookId,
      personaIds
    );

    const personaMap = new Map<string, PersonaChapterMatrixPersonaDto>();
    for (const personaId of personaIds) {
      const personaRecord = personaRecordsById.get(personaId);
      const personaCells = filteredCells.filter((row) => row.personaId === personaId);
      const summary = summarizePersonaCells(personaCells);
      const candidateHint = candidateHintsByPersonaId.get(personaId);

      personaMap.set(personaId, {
        personaId,
        displayName              : personaRecord?.name ?? personaId,
        aliases                  : [...(personaRecord?.aliases ?? [])],
        primaryPersonaCandidateId: candidateHint?.primaryPersonaCandidateId ?? null,
        personaCandidateIds      : [...(candidateHint?.personaCandidateIds ?? [])],
        firstChapterNo           : summary.firstChapterNo,
        totalEventCount          : summary.totalEventCount,
        totalRelationCount       : summary.totalRelationCount,
        totalConflictCount       : summary.totalConflictCount
      });
    }

    const sortedPersonas = Array.from(personaMap.values()).sort(sortMatrixPersonas);
    const personaOffset = normalizeOffset(input.offsetPersonas);
    const pagedPersonas = typeof input.limitPersonas === "number"
      ? sortedPersonas.slice(personaOffset, personaOffset + normalizeLimit(input.limitPersonas))
      : sortedPersonas.slice(personaOffset);
    const pagedPersonaIds = new Set(pagedPersonas.map((persona) => persona.personaId));
    const personaOrder = new Map(pagedPersonas.map((persona, index) => [persona.personaId, index]));
    const cells = filteredCells
      .filter((row) => pagedPersonaIds.has(row.personaId))
      .sort((left, right) => {
        const leftPersonaOrder = personaOrder.get(left.personaId) ?? Number.MAX_SAFE_INTEGER;
        const rightPersonaOrder = personaOrder.get(right.personaId) ?? Number.MAX_SAFE_INTEGER;
        if (leftPersonaOrder !== rightPersonaOrder) {
          return leftPersonaOrder - rightPersonaOrder;
        }
        if (left.chapterNo !== right.chapterNo) {
          return left.chapterNo - right.chapterNo;
        }
        return left.chapterId.localeCompare(right.chapterId);
      });

    return {
      bookId             : input.bookId,
      personas           : pagedPersonas,
      chapters,
      cells,
      relationTypeOptions: await loadMatrixRelationTypeOptions(prismaClient, input.bookId, dependencies),
      generatedAt        : new Date().toISOString()
    };
  }

  async function getRelationEditorView(
    input: ReviewRelationEditorQueryRequest
  ): Promise<ReviewRelationEditorDto> {
    const relationClaims = await loadRelationEditorClaims(prismaClient, input);
    const pairClaimsMap = new Map<string, RelationEditorClaimRecord[]>();
    for (const claim of relationClaims) {
      const claims = pairClaimsMap.get(claim.pairKey) ?? [];
      claims.push(claim);
      pairClaimsMap.set(claim.pairKey, claims);
    }

    const personaIds = toUniqueSortedIds(
      Array.from(pairClaimsMap.keys()).flatMap((pairKey) => getRelationPairPersonaIds(pairKey))
    );
    const personaRecordsById = await loadMatrixPersonaRecords(prismaClient, personaIds);
    const personaOptions = personaIds
      .map((personaId) => toRelationPersonaOption(personaId, personaRecordsById))
      .sort((left, right) => {
        const nameDiff = left.displayName.localeCompare(right.displayName);
        if (nameDiff !== 0) {
          return nameDiff;
        }
        return left.personaId.localeCompare(right.personaId);
      });

    const allPairSummaries = Array.from(pairClaimsMap.entries())
      .map(([pairKey, claims]) => toRelationPairSummary(pairKey, claims, personaRecordsById))
      .sort(sortRelationPairs);
    const pairOffset = normalizeOffset(input.offsetPairs);
    const pairSummaries = typeof input.limitPairs === "number"
      ? allPairSummaries.slice(pairOffset, pairOffset + normalizeLimit(input.limitPairs))
      : allPairSummaries.slice(pairOffset);

    let selectedPair: ReviewRelationSelectedPairDto | null = null;
    if (input.personaId && input.pairPersonaId) {
      const selectedPairKey = buildRelationPairKey(input.personaId, input.pairPersonaId);
      const selectedClaims = pairClaimsMap.get(selectedPairKey) ?? [];
      if (selectedClaims.length > 0) {
        const chapterLabelById = await loadChapterLabelsById(
          prismaClient,
          input.bookId,
          selectedClaims.flatMap((claim) => (claim.chapterId ? [claim.chapterId] : []))
        );
        const [leftPersonaId, rightPersonaId] = getRelationPairPersonaIds(selectedPairKey);
        selectedPair = {
          pairKey     : selectedPairKey,
          leftPersona : toRelationPersonaOption(leftPersonaId, personaRecordsById),
          rightPersona: toRelationPersonaOption(rightPersonaId, personaRecordsById),
          warnings    : computeRelationWarnings(selectedClaims),
          claims      : [...selectedClaims]
            .sort((left, right) => {
              const updatedDiff = right.updatedAt.getTime() - left.updatedAt.getTime();
              if (updatedDiff !== 0) {
                return updatedDiff;
              }

              const createdDiff = right.createdAt.getTime() - left.createdAt.getTime();
              if (createdDiff !== 0) {
                return createdDiff;
              }

              return right.claimId.localeCompare(left.claimId);
            })
            .map((claim) => toRelationClaimListItem(claim, chapterLabelById))
        };
      }
    }

    return {
      bookId             : input.bookId,
      personaOptions,
      relationTypeOptions: await loadMatrixRelationTypeOptions(prismaClient, input.bookId, dependencies),
      pairSummaries,
      selectedPair,
      generatedAt        : new Date().toISOString()
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

  return { listClaims, getClaimDetail, getPersonaChapterMatrix, getRelationEditorView };
}

export const reviewQueryService = createReviewQueryService();
