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
  ReviewPersonaTimeMatrixQueryRequest,
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

export interface ReviewClaimEvidenceSpanDto {
  id                 : string;
  chapterId          : string;
  chapterLabel       : string | null;
  startOffset        : number | null;
  endOffset          : number | null;
  quotedText         : string;
  normalizedText     : string;
  speakerHint        : string | null;
  narrativeRegionType: string | null;
  createdAt          : string | null;
}

export interface ReviewClaimFieldDiffDto {
  fieldKey  : string;
  fieldLabel: string;
  beforeText: string | null;
  afterText : string | null;
}

export interface ReviewClaimAuditHistoryItemDto {
  id             : string;
  action         : string;
  actorUserId    : string | null;
  note           : string | null;
  evidenceSpanIds: string[];
  createdAt      : string | null;
  beforeState    : Record<string, unknown> | null;
  afterState     : Record<string, unknown> | null;
  fieldDiffs     : ReviewClaimFieldDiffDto[];
}

export interface ReviewClaimRawOutputSummaryDto {
  stageKey         : string | null;
  provider         : string | null;
  model            : string | null;
  createdAt        : string | null;
  responseExcerpt  : string | null;
  hasStructuredJson: boolean;
  parseError       : string | null;
  schemaError      : string | null;
  discardReason    : string | null;
}

export interface ReviewClaimAiBasisSummaryDto {
  basisClaimId  : string | null;
  basisClaimKind: ReviewableClaimFamily | null;
  source        : ClaimSource | null;
  runId         : string | null;
  confidence    : number | null;
  summaryLines  : string[];
  rawOutput     : ReviewClaimRawOutputSummaryDto | null;
}

export interface ReviewClaimVersionDiffDto {
  versionSource     : "AUDIT_EDIT" | "MANUAL_LINEAGE" | "NONE";
  supersedesClaimId : string | null;
  derivedFromClaimId: string | null;
  fieldDiffs        : ReviewClaimFieldDiffDto[];
}

export interface ReviewClaimDetailDto {
  claim            : ClaimDetailRecord;
  evidence         : ReviewClaimEvidenceSpanDto[];
  basisClaim       : ClaimDetailRecord | null;
  aiSummary        : ReviewClaimAiBasisSummaryDto | null;
  projectionSummary: ProjectionSummary;
  auditHistory     : ReviewClaimAuditHistoryItemDto[];
  versionDiff      : ReviewClaimVersionDiffDto | null;
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

export type ReviewTimeAxisType =
  | "CHAPTER_ORDER"
  | "RELATIVE_PHASE"
  | "NAMED_EVENT"
  | "HISTORICAL_YEAR"
  | "BATTLE_PHASE"
  | "UNCERTAIN";

export interface PersonaTimeMatrixPersonaDto {
  personaId                : string;
  displayName              : string;
  aliases                  : string[];
  primaryPersonaCandidateId: string | null;
  personaCandidateIds      : string[];
  firstTimeSortKey         : number | null;
  totalEventCount          : number;
  totalRelationCount       : number;
  totalTimeClaimCount      : number;
}

export interface PersonaTimeSliceLinkedChapterDto {
  chapterId: string;
  chapterNo: number;
  label    : string;
}

export interface PersonaTimeSliceDto {
  timeKey           : string;
  timeType          : ReviewTimeAxisType;
  normalizedLabel   : string;
  rawLabels         : string[];
  timeSortKey       : number | null;
  chapterRangeStart : number | null;
  chapterRangeEnd   : number | null;
  linkedChapters    : PersonaTimeSliceLinkedChapterDto[];
  sourceTimeClaimIds: string[];
}

export interface PersonaTimeAxisGroupDto {
  timeType        : ReviewTimeAxisType;
  label           : string;
  defaultCollapsed: boolean;
  slices          : PersonaTimeSliceDto[];
}

export interface PersonaTimeMatrixCellDto {
  bookId            : string;
  personaId         : string;
  timeKey           : string;
  normalizedLabel   : string;
  eventCount        : number;
  relationCount     : number;
  timeClaimCount    : number;
  sourceTimeClaimIds: string[];
  latestUpdatedAt   : string | null;
}

export interface PersonaTimeMatrixDto {
  bookId     : string;
  personas   : PersonaTimeMatrixPersonaDto[];
  timeGroups : PersonaTimeAxisGroupDto[];
  cells      : PersonaTimeMatrixCellDto[];
  generatedAt: string;
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
  runId              : string | null;
  confidence         : number | null;
  supersedesClaimId  : string | null;
  derivedFromClaimId : string | null;
  extra              : Record<string, unknown>;
};

type ClaimDetailRecord = ReviewClaimListItem & {
  claimKind         : ReviewableClaimFamily;
  id                : string;
  runId             : string | null;
  confidence        : number | null;
  supersedesClaimId : string | null;
  derivedFromClaimId: string | null;
} & Record<string, unknown>;

type ConflictStateMap = ReadonlyMap<string, ConflictState>;
type PersonaIdsByCandidateIdMap = ReadonlyMap<string, readonly string[]>;
type TimeLabelByHintIdMap = ReadonlyMap<string, string>;

type AuditStateRecord = Record<string, unknown> | null;

type EvidenceSpanRow = {
  id                 : string;
  chapterId          : string;
  startOffset        : number | null;
  endOffset          : number | null;
  quotedText         : string;
  normalizedText     : string;
  speakerHint        : string | null;
  narrativeRegionType: string | null;
  createdAt          : Date | null;
};

type LlmRawOutputRow = {
  id           : string;
  runId        : string;
  stageRunId   : string | null;
  bookId       : string;
  chapterId    : string | null;
  provider     : string;
  model        : string;
  responseText : string;
  responseJson : unknown;
  parseError   : string | null;
  schemaError  : string | null;
  discardReason: string | null;
  createdAt    : Date | null;
};

type AnalysisStageRunRow = {
  id      : string;
  stageKey: string;
};

type ReviewAuditLogRow = {
  id             : string;
  action         : string;
  actorUserId    : string | null;
  note           : string | null;
  evidenceSpanIds: string[];
  beforeState    : unknown;
  afterState     : unknown;
  createdAt      : Date | null;
};

const RESPONSE_EXCERPT_MAX_LENGTH = 180;

const CLAIM_DIFF_FIELD_KEYS: Record<ReviewableClaimFamily, readonly string[]> = {
  RELATION: [
    "relationTypeKey",
    "relationLabel",
    "direction",
    "effectiveChapterStart",
    "effectiveChapterEnd",
    "sourcePersonaCandidateId",
    "targetPersonaCandidateId",
    "timeHintId",
    "evidenceSpanIds"
  ],
  EVENT: [
    "predicate",
    "objectText",
    "locationText",
    "subjectPersonaCandidateId",
    "objectPersonaCandidateId",
    "timeHintId",
    "eventCategory",
    "evidenceSpanIds"
  ],
  TIME: [
    "rawTimeText",
    "normalizedLabel",
    "timeType",
    "chapterRangeStart",
    "chapterRangeEnd",
    "relativeOrderWeight",
    "evidenceSpanIds"
  ],
  ALIAS: [
    "aliasText",
    "aliasType",
    "personaCandidateId",
    "targetPersonaCandidateId",
    "claimKind",
    "evidenceSpanIds"
  ],
  IDENTITY_RESOLUTION: [
    "personaCandidateId",
    "resolvedPersonaId",
    "resolutionKind",
    "rationale",
    "evidenceSpanIds"
  ],
  CONFLICT_FLAG: [
    "conflictType",
    "severity",
    "summary",
    "relatedClaimIds",
    "evidenceSpanIds"
  ]
};

const CLAIM_DIFF_FIELD_LABELS: Record<string, string> = {
  aliasText                : "别名文本",
  aliasType                : "别名类型",
  chapterRangeEnd          : "章节范围结束",
  chapterRangeStart        : "章节范围开始",
  claimKind                : "别名主张类型",
  conflictType             : "冲突类型",
  direction                : "关系方向",
  effectiveChapterEnd      : "生效章节结束",
  effectiveChapterStart    : "生效章节开始",
  eventCategory            : "事件类别",
  evidenceSpanIds          : "证据跨度",
  locationText             : "地点",
  normalizedLabel          : "标准时间标签",
  objectPersonaCandidateId : "客体候选人物",
  objectText               : "事件对象",
  personaCandidateId       : "人物候选",
  predicate                : "事件谓词",
  rawTimeText              : "原始时间文本",
  relatedClaimIds          : "关联 Claim",
  relationLabel            : "关系显示名称",
  relationTypeKey          : "关系类型 Key",
  resolutionKind           : "归并类型",
  resolvedPersonaId        : "归并人物",
  rationale                : "归并理由",
  severity                 : "冲突级别",
  sourcePersonaCandidateId : "关系源人物候选",
  subjectPersonaCandidateId: "主体候选人物",
  summary                  : "摘要",
  targetPersonaCandidateId : "关系目标人物候选",
  timeHintId               : "时间锚点",
  timeType                 : "时间类型",
  relativeOrderWeight      : "时间排序权重"
};

const REVIEW_TIME_AXIS_TYPE_VALUES = [
  "CHAPTER_ORDER",
  "RELATIVE_PHASE",
  "NAMED_EVENT",
  "HISTORICAL_YEAR",
  "BATTLE_PHASE",
  "UNCERTAIN"
] as const satisfies readonly ReviewTimeAxisType[];

const REVIEW_TIME_AXIS_LABELS: Record<ReviewTimeAxisType, string> = {
  CHAPTER_ORDER  : "章节顺序",
  RELATIVE_PHASE : "相对阶段",
  NAMED_EVENT    : "事件节点",
  HISTORICAL_YEAR: "历史年份",
  BATTLE_PHASE   : "战役阶段",
  UNCERTAIN      : "未定时间"
};

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function toIsoString(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
  }

  return Number.isNaN(value.getTime()) ? null : value.toISOString();
}

function collapseWhitespace(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const collapsed = value.replace(/\s+/g, " ").trim();
  return collapsed.length > 0 ? collapsed : null;
}

function truncateText(value: string | null, maxLength: number): string | null {
  if (value === null) {
    return null;
  }

  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function describeUnknownValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }

  if (typeof value === "symbol") {
    return value.description === undefined ? "Symbol()" : `Symbol(${value.description})`;
  }

  if (typeof value === "function") {
    return "[function]";
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  try {
    return JSON.stringify(value);
  } catch {
    return Object.prototype.toString.call(value);
  }
}

function normalizeDiffComparableValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (Array.isArray(value)) {
    const normalizedItems = value.map((item) => normalizeDiffComparableValue(item));
    normalizedItems.sort();
    return JSON.stringify(normalizedItems);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "object") {
    return describeUnknownValue(value);
  }

  return describeUnknownValue(value);
}

function toDiffDisplayText(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (Array.isArray(value)) {
    const parts = value.map((item) => toDiffDisplayText(item)).filter((item): item is string => item !== null);
    return parts.length > 0 ? parts.join(", ") : null;
  }

  if (typeof value === "string") {
    return value.length > 0 ? value : null;
  }

  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return describeUnknownValue(value);
}

function toAuditStateRecord(value: unknown): AuditStateRecord {
  return isRecord(value) ? value : null;
}

function buildClaimFieldDiffs(
  claimKind: ReviewableClaimFamily,
  beforeState: AuditStateRecord,
  afterState: AuditStateRecord
): ReviewClaimFieldDiffDto[] {
  const fieldKeys = CLAIM_DIFF_FIELD_KEYS[claimKind];

  return fieldKeys.flatMap((fieldKey) => {
    const beforeValue = beforeState?.[fieldKey];
    const afterValue = afterState?.[fieldKey];

    if (normalizeDiffComparableValue(beforeValue) === normalizeDiffComparableValue(afterValue)) {
      return [];
    }

    return [{
      fieldKey,
      fieldLabel: CLAIM_DIFF_FIELD_LABELS[fieldKey] ?? fieldKey,
      beforeText: toDiffDisplayText(beforeValue),
      afterText : toDiffDisplayText(afterValue)
    }];
  });
}

function compareEvidenceSpanRows(left: EvidenceSpanRow, right: EvidenceSpanRow): number {
  const chapterDiff = left.chapterId.localeCompare(right.chapterId);
  if (chapterDiff !== 0) {
    return chapterDiff;
  }

  const leftOffset = left.startOffset ?? Number.MAX_SAFE_INTEGER;
  const rightOffset = right.startOffset ?? Number.MAX_SAFE_INTEGER;
  if (leftOffset !== rightOffset) {
    return leftOffset - rightOffset;
  }

  return left.id.localeCompare(right.id);
}

function compareChapterMatch(
  row: Pick<LlmRawOutputRow, "chapterId">,
  chapterId: string | null
): number {
  if (chapterId === null) {
    return 0;
  }

  return row.chapterId === chapterId ? 0 : 1;
}

function buildAiSummaryLines(claim: ClaimDetailRecord): string[] {
  const relationLabel = typeof claim.relationLabel === "string" && claim.relationLabel.length > 0
    ? claim.relationLabel
    : null;
  const predicate = typeof claim.predicate === "string" && claim.predicate.length > 0
    ? claim.predicate
    : null;
  const objectText = typeof claim.objectText === "string" && claim.objectText.length > 0
    ? claim.objectText
    : null;
  const normalizedLabel = typeof claim.normalizedLabel === "string" && claim.normalizedLabel.length > 0
    ? claim.normalizedLabel
    : null;
  const rawTimeText = typeof claim.rawTimeText === "string" && claim.rawTimeText.length > 0
    ? claim.rawTimeText
    : null;
  const aliasText = typeof claim.aliasText === "string" && claim.aliasText.length > 0
    ? claim.aliasText
    : null;
  const rationale = typeof claim.rationale === "string" && claim.rationale.length > 0
    ? claim.rationale
    : null;
  const summary = typeof claim.summary === "string" && claim.summary.length > 0
    ? claim.summary
    : null;

  switch (claim.claimKind) {
    case "EVENT":
      return [
        ["事件", [predicate, objectText].filter((value): value is string => value !== null).join(" · ") || "未命名事件"],
        claim.timeLabel ? ["时间", claim.timeLabel] : null
      ]
        .filter((line): line is [string, string] => line !== null)
        .map(([label, value]) => `${label}：${value}`);
    case "RELATION":
      return [
        ["关系", relationLabel ?? claim.relationTypeKey ?? "未命名关系"],
        typeof claim.direction === "string" ? ["方向", claim.direction] : null,
        claim.timeLabel ? ["时间", claim.timeLabel] : null
      ]
        .filter((line): line is [string, string] => line !== null)
        .map(([label, value]) => `${label}：${value}`);
    case "TIME":
      return [[normalizedLabel ?? rawTimeText ?? "未命名时间"]].map(([value]) => `时间：${value}`);
    case "ALIAS":
      return [[aliasText ?? "未命名别名"]].map(([value]) => `别名：${value}`);
    case "IDENTITY_RESOLUTION":
      return [
        `归并：${typeof claim.resolutionKind === "string" ? claim.resolutionKind : "未命名归并"}`,
        ...(rationale ? [`理由：${rationale}`] : [])
      ];
    case "CONFLICT_FLAG":
      return [[summary ?? "未命名冲突"]].map(([value]) => `冲突：${value}`);
  }
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
    runId             : row.runId,
    confidence        : row.confidence,
    supersedesClaimId : row.supersedesClaimId,
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

function compareNullableNumberAsc(left: number | null, right: number | null): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left - right;
}

function normalizeReviewTimeAxisType(value: string | null | undefined): ReviewTimeAxisType {
  switch (value) {
    case "CHAPTER_ORDER":
    case "RELATIVE_PHASE":
    case "NAMED_EVENT":
    case "HISTORICAL_YEAR":
    case "BATTLE_PHASE":
    case "UNCERTAIN":
      return value;
    default:
      return "UNCERTAIN";
  }
}

function buildPersonaTimeKey(input: {
  timeType         : ReviewTimeAxisType;
  normalizedLabel  : string;
  timeSortKey      : number | null;
  chapterRangeStart: number | null;
  chapterRangeEnd  : number | null;
}): string {
  return [
    input.timeType,
    encodeURIComponent(input.normalizedLabel),
    input.timeSortKey ?? "null",
    input.chapterRangeStart ?? "null",
    input.chapterRangeEnd ?? "null"
  ].join("::");
}

function addRangeChaptersToSlice(
  accumulator: PersonaTimeSliceAccumulator,
  chapterByNo: ReadonlyMap<number, PersonaChapterMatrixChapterDto>,
  chapterRangeStart: number | null,
  chapterRangeEnd: number | null
) {
  if (chapterRangeStart === null || chapterRangeEnd === null) {
    return;
  }

  const start = Math.min(chapterRangeStart, chapterRangeEnd);
  const end = Math.max(chapterRangeStart, chapterRangeEnd);
  for (let chapterNo = start; chapterNo <= end; chapterNo += 1) {
    const chapter = chapterByNo.get(chapterNo);
    if (chapter) {
      accumulator.linkedChapterIdSet.add(chapter.chapterId);
    }
  }
}

function getOrCreatePersonaTimeSliceAccumulator(
  sliceByKey: Map<string, PersonaTimeSliceAccumulator>,
  chapterByNo: ReadonlyMap<number, PersonaChapterMatrixChapterDto>,
  input: {
    timeType         : ReviewTimeAxisType;
    normalizedLabel  : string;
    timeSortKey      : number | null;
    chapterRangeStart: number | null;
    chapterRangeEnd  : number | null;
  }
): PersonaTimeSliceAccumulator {
  const timeKey = buildPersonaTimeKey(input);
  const existing = sliceByKey.get(timeKey);
  if (existing) {
    return existing;
  }

  const created: PersonaTimeSliceAccumulator = {
    timeKey,
    timeType            : input.timeType,
    normalizedLabel     : input.normalizedLabel,
    rawLabelSet         : new Set<string>(),
    timeSortKey         : input.timeSortKey,
    chapterRangeStart   : input.chapterRangeStart,
    chapterRangeEnd     : input.chapterRangeEnd,
    linkedChapterIdSet  : new Set<string>(),
    sourceTimeClaimIdSet: new Set<string>()
  };
  addRangeChaptersToSlice(
    created,
    chapterByNo,
    input.chapterRangeStart,
    input.chapterRangeEnd
  );
  sliceByKey.set(timeKey, created);
  return created;
}

function comparePersonaTimeSliceDto(
  left: PersonaTimeSliceDto,
  right: PersonaTimeSliceDto
): number {
  const sortKeyDiff = compareNullableNumberAsc(left.timeSortKey, right.timeSortKey);
  if (sortKeyDiff !== 0) return sortKeyDiff;

  const chapterStartDiff = compareNullableNumberAsc(left.chapterRangeStart, right.chapterRangeStart);
  if (chapterStartDiff !== 0) return chapterStartDiff;

  const chapterEndDiff = compareNullableNumberAsc(left.chapterRangeEnd, right.chapterRangeEnd);
  if (chapterEndDiff !== 0) return chapterEndDiff;

  const labelDiff = left.normalizedLabel.localeCompare(right.normalizedLabel);
  if (labelDiff !== 0) return labelDiff;

  return left.timeKey.localeCompare(right.timeKey);
}

function sortPersonaTimePersonas(
  left: PersonaTimeMatrixPersonaDto,
  right: PersonaTimeMatrixPersonaDto
): number {
  const firstTimeDiff = compareNullableNumberAsc(left.firstTimeSortKey, right.firstTimeSortKey);
  if (firstTimeDiff !== 0) return firstTimeDiff;

  const nameDiff = left.displayName.localeCompare(right.displayName);
  if (nameDiff !== 0) return nameDiff;

  return left.personaId.localeCompare(right.personaId);
}

function buildPersonaTimeAxisGroups(
  visibleSlices: readonly PersonaTimeSliceDto[]
): PersonaTimeAxisGroupDto[] {
  const slicesByType = new Map<ReviewTimeAxisType, PersonaTimeSliceDto[]>();
  for (const timeType of REVIEW_TIME_AXIS_TYPE_VALUES) {
    slicesByType.set(timeType, []);
  }

  for (const slice of visibleSlices) {
    const items = slicesByType.get(slice.timeType);
    if (items) {
      items.push(slice);
    }
  }

  let expandedType: ReviewTimeAxisType | null = null;
  for (const timeType of REVIEW_TIME_AXIS_TYPE_VALUES) {
    if ((slicesByType.get(timeType)?.length ?? 0) > 0) {
      expandedType = timeType;
      break;
    }
  }

  return REVIEW_TIME_AXIS_TYPE_VALUES.map((timeType) => ({
    timeType,
    label           : REVIEW_TIME_AXIS_LABELS[timeType],
    defaultCollapsed: expandedType === null ? true : timeType !== expandedType,
    slices          : [...(slicesByType.get(timeType) ?? [])].sort(comparePersonaTimeSliceDto)
  }));
}

function toPersonaTimeSliceDto(
  accumulator: PersonaTimeSliceAccumulator,
  chapterById: ReadonlyMap<string, PersonaChapterMatrixChapterDto>
): PersonaTimeSliceDto {
  return {
    timeKey          : accumulator.timeKey,
    timeType         : accumulator.timeType,
    normalizedLabel  : accumulator.normalizedLabel,
    rawLabels        : [...accumulator.rawLabelSet].sort(),
    timeSortKey      : accumulator.timeSortKey,
    chapterRangeStart: accumulator.chapterRangeStart,
    chapterRangeEnd  : accumulator.chapterRangeEnd,
    linkedChapters   : [...accumulator.linkedChapterIdSet]
      .map((chapterId) => chapterById.get(chapterId))
      .filter((chapter): chapter is PersonaChapterMatrixChapterDto => chapter !== undefined)
      .sort((left, right) => {
        if (left.chapterNo !== right.chapterNo) {
          return left.chapterNo - right.chapterNo;
        }
        return left.chapterId.localeCompare(right.chapterId);
      })
      .map((chapter) => ({
        chapterId: chapter.chapterId,
        chapterNo: chapter.chapterNo,
        label    : chapter.label
      })),
    sourceTimeClaimIds: [...accumulator.sourceTimeClaimIdSet].sort()
  };
}

function resolvePersonaTimeSliceKey(
  row: PersonaTimeFactRow,
  timeClaimById: ReadonlyMap<string, PersonaTimeClaimMetadataRow>
): string {
  const matchingClaims = row.sourceTimeClaimIds
    .map((claimId) => timeClaimById.get(claimId))
    .filter((claim): claim is PersonaTimeClaimMetadataRow => claim !== undefined)
    .sort((left, right) => {
      const weightDiff = compareNullableNumberAsc(left.relativeOrderWeight, right.relativeOrderWeight);
      if (weightDiff !== 0) return weightDiff;

      const chapterStartDiff = compareNullableNumberAsc(left.chapterRangeStart, right.chapterRangeStart);
      if (chapterStartDiff !== 0) return chapterStartDiff;

      const chapterEndDiff = compareNullableNumberAsc(left.chapterRangeEnd, right.chapterRangeEnd);
      if (chapterEndDiff !== 0) return chapterEndDiff;

      const labelDiff = left.normalizedLabel.localeCompare(right.normalizedLabel);
      if (labelDiff !== 0) return labelDiff;

      return left.id.localeCompare(right.id);
    });

  const matchedClaim = matchingClaims[0];
  if (matchedClaim) {
    return buildPersonaTimeKey({
      timeType         : normalizeReviewTimeAxisType(matchedClaim.timeType),
      normalizedLabel  : matchedClaim.normalizedLabel,
      timeSortKey      : matchedClaim.relativeOrderWeight,
      chapterRangeStart: matchedClaim.chapterRangeStart,
      chapterRangeEnd  : matchedClaim.chapterRangeEnd
    });
  }

  return buildPersonaTimeKey({
    timeType         : "UNCERTAIN",
    normalizedLabel  : row.timeLabel,
    timeSortKey      : row.timeSortKey,
    chapterRangeStart: row.chapterRangeStart,
    chapterRangeEnd  : row.chapterRangeEnd
  });
}

function comparePersonaTimeCellDto(
  left: PersonaTimeMatrixCellDto,
  right: PersonaTimeMatrixCellDto,
  personaOrder: ReadonlyMap<string, number>,
  sliceOrder: ReadonlyMap<string, number>
): number {
  const leftPersonaOrder = personaOrder.get(left.personaId) ?? Number.MAX_SAFE_INTEGER;
  const rightPersonaOrder = personaOrder.get(right.personaId) ?? Number.MAX_SAFE_INTEGER;
  if (leftPersonaOrder !== rightPersonaOrder) {
    return leftPersonaOrder - rightPersonaOrder;
  }

  const leftSliceOrder = sliceOrder.get(left.timeKey) ?? Number.MAX_SAFE_INTEGER;
  const rightSliceOrder = sliceOrder.get(right.timeKey) ?? Number.MAX_SAFE_INTEGER;
  if (leftSliceOrder !== rightSliceOrder) {
    return leftSliceOrder - rightSliceOrder;
  }

  return left.timeKey.localeCompare(right.timeKey);
}

function summarizePersonaTimeCells(
  cells: readonly PersonaTimeMatrixCellDto[],
  sliceByKey: ReadonlyMap<string, PersonaTimeSliceDto>
) {
  let firstTimeSortKey: number | null = null;
  let totalEventCount = 0;
  let totalRelationCount = 0;
  const timeClaimIdSet = new Set<string>();

  for (const cell of cells) {
    const maybeSortKey = sliceByKey.get(cell.timeKey)?.timeSortKey ?? null;
    if (
      maybeSortKey !== null &&
      (firstTimeSortKey === null || maybeSortKey < firstTimeSortKey)
    ) {
      firstTimeSortKey = maybeSortKey;
    }
    totalEventCount += cell.eventCount;
    totalRelationCount += cell.relationCount;
    for (const claimId of cell.sourceTimeClaimIds) {
      timeClaimIdSet.add(claimId);
    }
  }

  return {
    firstTimeSortKey,
    totalEventCount,
    totalRelationCount,
    totalTimeClaimCount: timeClaimIdSet.size
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
      confidence               : true,
      reviewState              : true,
      source                   : true,
      runId                    : true,
      supersedesClaimId        : true,
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
    runId             : row.runId,
    confidence        : row.confidence,
    supersedesClaimId : row.supersedesClaimId,
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
      confidence               : row.confidence,
      reviewState              : row.reviewState,
      source                   : row.source,
      runId                    : row.runId,
      supersedesClaimId        : row.supersedesClaimId,
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
      confidence              : true,
      reviewState             : true,
      source                  : true,
      runId                   : true,
      supersedesClaimId       : true,
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
    runId             : row.runId,
    confidence        : row.confidence,
    supersedesClaimId : row.supersedesClaimId,
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
      confidence              : row.confidence,
      reviewState             : row.reviewState,
      source                  : row.source,
      runId                   : row.runId,
      supersedesClaimId       : row.supersedesClaimId,
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
      confidence              : true,
      reviewState             : true,
      source                  : true,
      runId                   : true,
      supersedesClaimId       : true,
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
    runId             : row.runId,
    confidence        : row.confidence,
    supersedesClaimId : row.supersedesClaimId,
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
      confidence              : row.confidence,
      reviewState             : row.reviewState,
      source                  : row.source,
      runId                   : row.runId,
      supersedesClaimId       : row.supersedesClaimId,
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
      confidence         : true,
      reviewState        : true,
      source             : true,
      runId              : true,
      supersedesClaimId  : true,
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
    runId              : row.runId,
    confidence         : row.confidence,
    supersedesClaimId  : row.supersedesClaimId,
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
      confidence         : row.confidence,
      reviewState        : row.reviewState,
      source             : row.source,
      runId              : row.runId,
      supersedesClaimId  : row.supersedesClaimId,
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
      confidence        : true,
      reviewState       : true,
      source            : true,
      runId             : true,
      supersedesClaimId : true,
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
    runId              : row.runId,
    confidence         : row.confidence,
    supersedesClaimId  : row.supersedesClaimId,
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
      confidence        : row.confidence,
      reviewState       : row.reviewState,
      source            : row.source,
      runId             : row.runId,
      supersedesClaimId : row.supersedesClaimId,
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
      runId                     : true,
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
    runId              : row.runId,
    confidence         : null,
    supersedesClaimId  : null,
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
      runId                     : row.runId,
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
    return null;
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

async function loadClaimEvidence(
  prismaClient: typeof prisma,
  bookId: string,
  evidenceSpanIds: readonly string[]
): Promise<ReviewClaimEvidenceSpanDto[]> {
  const uniqueEvidenceSpanIds = toUniqueSortedIds(evidenceSpanIds);
  if (uniqueEvidenceSpanIds.length === 0) {
    return [];
  }

  const rows = await prismaClient.evidenceSpan.findMany({
    where: {
      bookId,
      id: { in: uniqueEvidenceSpanIds }
    },
    orderBy: [{ chapterId: "asc" }, { startOffset: "asc" }, { id: "asc" }]
  }) as EvidenceSpanRow[];

  const chapterLabelById = await loadChapterLabelsById(
    prismaClient,
    bookId,
    rows.map((row) => row.chapterId)
  );

  return [...rows]
    .sort(compareEvidenceSpanRows)
    .map((row) => ({
      id                 : row.id,
      chapterId          : row.chapterId,
      chapterLabel       : chapterLabelById.get(row.chapterId) ?? null,
      startOffset        : row.startOffset,
      endOffset          : row.endOffset,
      quotedText         : row.quotedText,
      normalizedText     : row.normalizedText,
      speakerHint        : row.speakerHint,
      narrativeRegionType: row.narrativeRegionType,
      createdAt          : toIsoString(row.createdAt)
    }));
}

/**
 * detail 面板只允许看到“当前 AI 结论摘要”和“可审查的原始输出摘要”，不能泄露完整 prompt/request payload。
 * 这里按 runId 汇总 raw output，再优先挑选同章节结果，保证面板稳定且可复核。
 */
async function loadRawOutputSummary(
  prismaClient: typeof prisma,
  claim: Pick<ClaimDetailRecord, "bookId" | "chapterId" | "runId">
): Promise<ReviewClaimRawOutputSummaryDto | null> {
  if (claim.runId === null) {
    return null;
  }

  const rawOutputs = await prismaClient.llmRawOutput.findMany({
    where: {
      bookId: claim.bookId,
      runId : claim.runId
    }
  }) as LlmRawOutputRow[];

  if (rawOutputs.length === 0) {
    return null;
  }

  const selected = [...rawOutputs].sort((left, right) => {
    const chapterMatchDiff = compareChapterMatch(left, claim.chapterId) - compareChapterMatch(right, claim.chapterId);
    if (chapterMatchDiff !== 0) {
      return chapterMatchDiff;
    }

    const createdDiff = (right.createdAt?.getTime() ?? 0) - (left.createdAt?.getTime() ?? 0);
    if (createdDiff !== 0) {
      return createdDiff;
    }

    return right.id.localeCompare(left.id);
  })[0];

  if (!selected) {
    return null;
  }

  const stageRunIds = toUniqueSortedIds(selected.stageRunId === null ? [] : [selected.stageRunId]);
  const stageRows = stageRunIds.length === 0
    ? []
    : await prismaClient.analysisStageRun.findMany({
        where: { id: { in: stageRunIds } }
      }) as AnalysisStageRunRow[];
  const stageKeyById = new Map(stageRows.map((row) => [row.id, row.stageKey]));

  return {
    stageKey         : selected.stageRunId ? (stageKeyById.get(selected.stageRunId) ?? null) : null,
    provider         : selected.provider,
    model            : selected.model,
    createdAt        : toIsoString(selected.createdAt),
    responseExcerpt  : truncateText(collapseWhitespace(selected.responseText), RESPONSE_EXCERPT_MAX_LENGTH),
    hasStructuredJson: selected.responseJson !== null && selected.responseJson !== undefined,
    parseError       : selected.parseError,
    schemaError      : selected.schemaError,
    discardReason    : selected.discardReason
  };
}

function buildAuditHistoryItems(
  claimKind: ReviewableClaimFamily,
  auditRows: readonly ReviewAuditLogRow[]
): ReviewClaimAuditHistoryItemDto[] {
  return auditRows.map((row) => {
    const beforeState = toAuditStateRecord(row.beforeState);
    const afterState = toAuditStateRecord(row.afterState);

    return {
      id             : row.id,
      action         : row.action,
      actorUserId    : row.actorUserId,
      note           : row.note,
      evidenceSpanIds: toUniqueSortedIds(row.evidenceSpanIds),
      createdAt      : toIsoString(row.createdAt),
      beforeState,
      afterState,
      fieldDiffs     : buildClaimFieldDiffs(claimKind, beforeState, afterState)
    };
  });
}

async function loadLineageComparisonClaim(
  prismaClient: typeof prisma,
  claim: ClaimRowBase
): Promise<ClaimRowBase | null> {
  const comparisonClaimId = claim.derivedFromClaimId ?? claim.supersedesClaimId;
  if (comparisonClaimId === null) {
    return null;
  }

  return await loadSingleClaim(prismaClient, {
    bookId   : claim.bookId,
    claimKind: claim.claimKind,
    claimId  : comparisonClaimId
  });
}

function buildVersionDiff(
  claim: ClaimRowBase,
  auditHistory: readonly ReviewClaimAuditHistoryItemDto[],
  comparisonClaim: ClaimRowBase | null
): ReviewClaimVersionDiffDto {
  const latestEditAudit = auditHistory.find((item) => item.action === "EDIT" && item.fieldDiffs.length > 0);
  if (latestEditAudit) {
    return {
      versionSource     : "AUDIT_EDIT",
      supersedesClaimId : claim.supersedesClaimId,
      derivedFromClaimId: claim.derivedFromClaimId,
      fieldDiffs        : latestEditAudit.fieldDiffs
    };
  }

  if (comparisonClaim !== null) {
    return {
      versionSource     : "MANUAL_LINEAGE",
      supersedesClaimId : claim.supersedesClaimId,
      derivedFromClaimId: claim.derivedFromClaimId,
      fieldDiffs        : buildClaimFieldDiffs(
        claim.claimKind,
        comparisonClaim.extra,
        claim.extra
      )
    };
  }

  return {
    versionSource     : "NONE",
    supersedesClaimId : claim.supersedesClaimId,
    derivedFromClaimId: claim.derivedFromClaimId,
    fieldDiffs        : []
  };
}

async function buildAiSummary(
  prismaClient: typeof prisma,
  claim: ClaimDetailRecord,
  basisClaim: ClaimDetailRecord | null
): Promise<ReviewClaimAiBasisSummaryDto | null> {
  const aiBasisClaim = basisClaim ?? (claim.source === "AI" ? claim : null);
  if (aiBasisClaim === null) {
    return null;
  }

  return {
    basisClaimId  : aiBasisClaim.id,
    basisClaimKind: aiBasisClaim.claimKind,
    source        : aiBasisClaim.source,
    runId         : aiBasisClaim.runId,
    confidence    : aiBasisClaim.confidence,
    summaryLines  : buildAiSummaryLines(aiBasisClaim),
    rawOutput     : await loadRawOutputSummary(prismaClient, aiBasisClaim)
  };
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

type PersonaTimeFactRow = {
  bookId            : string;
  personaId         : string;
  timeLabel         : string;
  timeSortKey       : number | null;
  chapterRangeStart : number | null;
  chapterRangeEnd   : number | null;
  eventCount        : number;
  relationCount     : number;
  sourceTimeClaimIds: string[];
  updatedAt         : Date | null;
};

type PersonaTimeClaimMetadataRow = {
  id                 : string;
  chapterId          : string;
  rawTimeText        : string;
  timeType           : string;
  normalizedLabel    : string;
  relativeOrderWeight: number | null;
  chapterRangeStart  : number | null;
  chapterRangeEnd    : number | null;
  updatedAt          : Date | null;
};

type PersonaTimeSliceAccumulator = {
  timeKey             : string;
  timeType            : ReviewTimeAxisType;
  normalizedLabel     : string;
  rawLabelSet         : Set<string>;
  timeSortKey         : number | null;
  chapterRangeStart   : number | null;
  chapterRangeEnd     : number | null;
  linkedChapterIdSet  : Set<string>;
  sourceTimeClaimIdSet: Set<string>;
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

  async function getPersonaTimeMatrix(
    input: ReviewPersonaTimeMatrixQueryRequest
  ): Promise<PersonaTimeMatrixDto> {
    const chapters = await loadMatrixChapters(prismaClient, input.bookId);
    const chapterById = new Map(chapters.map((chapter) => [chapter.chapterId, chapter]));
    const chapterByNo = new Map(chapters.map((chapter) => [chapter.chapterNo, chapter]));

    const rows = await prismaClient.personaTimeFact.findMany({
      where: {
        bookId: input.bookId,
        ...(input.personaId ? { personaId: input.personaId } : {})
      },
      orderBy: [
        { timeSortKey: "asc" },
        { chapterRangeStart: "asc" },
        { personaId: "asc" },
        { timeLabel: "asc" }
      ]
    }) as PersonaTimeFactRow[];

    const sourceTimeClaimIds = toUniqueSortedIds(rows.flatMap((row) => row.sourceTimeClaimIds));
    const timeClaimRows = sourceTimeClaimIds.length === 0
      ? []
      : await prismaClient.timeClaim.findMany({
          where: {
            bookId: input.bookId,
            id    : { in: sourceTimeClaimIds }
          },
          orderBy: [
            { relativeOrderWeight: "asc" },
            { chapterRangeStart: "asc" },
            { chapterRangeEnd: "asc" },
            { normalizedLabel: "asc" },
            { id: "asc" }
          ]
        }) as PersonaTimeClaimMetadataRow[];
    const timeClaimById = new Map(timeClaimRows.map((row) => [row.id, row]));

    const sliceByKey = new Map<string, PersonaTimeSliceAccumulator>();
    for (const claim of timeClaimRows) {
      const normalizedLabel = claim.normalizedLabel.trim() || claim.rawTimeText.trim() || "未命名时间";
      const accumulator = getOrCreatePersonaTimeSliceAccumulator(
        sliceByKey,
        chapterByNo,
        {
          timeType         : normalizeReviewTimeAxisType(claim.timeType),
          normalizedLabel,
          timeSortKey      : claim.relativeOrderWeight,
          chapterRangeStart: claim.chapterRangeStart,
          chapterRangeEnd  : claim.chapterRangeEnd
        }
      );

      accumulator.sourceTimeClaimIdSet.add(claim.id);
      accumulator.linkedChapterIdSet.add(claim.chapterId);

      const rawLabel = claim.rawTimeText.trim();
      accumulator.rawLabelSet.add(rawLabel.length > 0 ? rawLabel : normalizedLabel);
    }

    for (const row of rows) {
      const timeKey = resolvePersonaTimeSliceKey(row, timeClaimById);
      const existing = sliceByKey.get(timeKey);
      const accumulator = existing ?? getOrCreatePersonaTimeSliceAccumulator(
        sliceByKey,
        chapterByNo,
        {
          timeType         : "UNCERTAIN",
          normalizedLabel  : row.timeLabel,
          timeSortKey      : row.timeSortKey,
          chapterRangeStart: row.chapterRangeStart,
          chapterRangeEnd  : row.chapterRangeEnd
        }
      );
      if (accumulator.rawLabelSet.size === 0) {
        accumulator.rawLabelSet.add(row.timeLabel);
      }
      for (const claimId of row.sourceTimeClaimIds) {
        accumulator.sourceTimeClaimIdSet.add(claimId);
      }
      addRangeChaptersToSlice(
        accumulator,
        chapterByNo,
        row.chapterRangeStart,
        row.chapterRangeEnd
      );
    }

    const allowedTimeTypes = input.timeTypes && input.timeTypes.length > 0
      ? new Set<ReviewTimeAxisType>(input.timeTypes)
      : null;
    const visibleSlices = Array.from(sliceByKey.values())
      .map((accumulator) => toPersonaTimeSliceDto(accumulator, chapterById))
      .filter((slice) => allowedTimeTypes === null || allowedTimeTypes.has(slice.timeType))
      .sort(comparePersonaTimeSliceDto);
    const visibleSliceByKey = new Map(visibleSlices.map((slice) => [slice.timeKey, slice]));

    const filteredCells = rows
      .map((row) => {
        const timeKey = resolvePersonaTimeSliceKey(row, timeClaimById);
        const slice = visibleSliceByKey.get(timeKey);
        if (!slice) {
          return null;
        }

        return {
          bookId            : row.bookId,
          personaId         : row.personaId,
          timeKey,
          normalizedLabel   : slice.normalizedLabel,
          eventCount        : row.eventCount,
          relationCount     : row.relationCount,
          timeClaimCount    : toUniqueSortedIds(row.sourceTimeClaimIds).length,
          sourceTimeClaimIds: toUniqueSortedIds(row.sourceTimeClaimIds),
          latestUpdatedAt   : toIsoString(row.updatedAt)
        } satisfies PersonaTimeMatrixCellDto;
      })
      .filter((row): row is PersonaTimeMatrixCellDto => row !== null);

    const personaIds = toUniqueSortedIds(filteredCells.map((row) => row.personaId));
    const personaRecordsById = await loadMatrixPersonaRecords(prismaClient, personaIds);
    const candidateHintsByPersonaId = await loadAcceptedCandidateHintsByPersonaId(
      prismaClient,
      input.bookId,
      personaIds
    );

    const personaMap = new Map<string, PersonaTimeMatrixPersonaDto>();
    for (const personaId of personaIds) {
      const personaRecord = personaRecordsById.get(personaId);
      const personaCells = filteredCells.filter((row) => row.personaId === personaId);
      const summary = summarizePersonaTimeCells(personaCells, visibleSliceByKey);
      const candidateHint = candidateHintsByPersonaId.get(personaId);

      personaMap.set(personaId, {
        personaId,
        displayName              : personaRecord?.name ?? personaId,
        aliases                  : [...(personaRecord?.aliases ?? [])],
        primaryPersonaCandidateId: candidateHint?.primaryPersonaCandidateId ?? null,
        personaCandidateIds      : [...(candidateHint?.personaCandidateIds ?? [])],
        firstTimeSortKey         : summary.firstTimeSortKey,
        totalEventCount          : summary.totalEventCount,
        totalRelationCount       : summary.totalRelationCount,
        totalTimeClaimCount      : summary.totalTimeClaimCount
      });
    }

    const sortedPersonas = Array.from(personaMap.values()).sort(sortPersonaTimePersonas);
    const personaOffset = normalizeOffset(input.offsetPersonas);
    const pagedPersonas = typeof input.limitPersonas === "number"
      ? sortedPersonas.slice(personaOffset, personaOffset + normalizeLimit(input.limitPersonas))
      : sortedPersonas.slice(personaOffset);

    const timeGroups = buildPersonaTimeAxisGroups(visibleSlices);
    const orderedSliceKeys = timeGroups.flatMap((group) => group.slices.map((slice) => slice.timeKey));
    const sliceOrder = new Map(orderedSliceKeys.map((timeKey, index) => [timeKey, index]));

    const pagedPersonaIds = new Set(pagedPersonas.map((persona) => persona.personaId));
    const personaOrder = new Map(pagedPersonas.map((persona, index) => [persona.personaId, index]));
    const cells = filteredCells
      .filter((row) => pagedPersonaIds.has(row.personaId))
      .sort((left, right) => comparePersonaTimeCellDto(left, right, personaOrder, sliceOrder));

    return {
      bookId     : input.bookId,
      personas   : pagedPersonas,
      timeGroups,
      cells,
      generatedAt: new Date().toISOString()
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

  async function getClaimDetail(input: GetReviewClaimDetailInput): Promise<ReviewClaimDetailDto | null> {
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

    const evidence = await loadClaimEvidence(prismaClient, input.bookId, claim.evidenceSpanIds);
    const auditRows = await createReviewAuditService(prismaClient).listAuditTrail({
      claimKind: claim.claimKind as ClaimKind,
      claimId  : claim.id
    }) as ReviewAuditLogRow[];
    const auditHistory = buildAuditHistoryItems(claim.claimKind, auditRows);
    const timeLabel = await resolveTimeLabelForClaim(prismaClient, claim);
    const personaIds = resolvePersonaIds(claim.personaCandidateIds, personaIdsByCandidateId);
    const projectionSummary = await loadProjectionSummary(
      prismaClient,
      claim,
      personaIds,
      timeLabel
    );
    const versionDiff = buildVersionDiff(
      claim,
      auditHistory,
      await loadLineageComparisonClaim(prismaClient, claim)
    );

    return {
      claim    : claimDetail,
      evidence,
      basisClaim,
      aiSummary: await buildAiSummary(prismaClient, claimDetail, basisClaim),
      projectionSummary,
      auditHistory,
      versionDiff
    };
  }

  return {
    listClaims,
    getClaimDetail,
    getPersonaChapterMatrix,
    getPersonaTimeMatrix,
    getRelationEditorView
  };
}

export const reviewQueryService = createReviewQueryService();
