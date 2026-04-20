import type {
  ClaimReviewState,
  ClaimSource,
  RelationDirection,
  RelationTypeSource
} from "@/server/modules/analysis/claims/base-types";
import type { ClaimDraftByFamily } from "@/server/modules/analysis/claims/claim-schemas";
import type {
  AliasClaimKind,
  BioCategory,
  ClaimKind,
  ConflictSeverity,
  ConflictType,
  IdentityResolutionKind,
  NarrativeLens,
  TimeType
} from "@/generated/prisma/enums";

export const STAGE_B5_STAGE_KEY = "stage_b5_conflict_detection";
export const STAGE_B5_RULE_VERSION = "2026-04-20-stage-b5-v1";
export const STAGE_B5_RULE_PROVIDER = "rule-engine";
export const STAGE_B5_RULE_MODEL = "stage-b5-conflict-detection-v1";
export const STAGE_B5_LOW_EVIDENCE_THRESHOLD = 0.55;

export const CONFLICT_RECOMMENDED_ACTION_KEYS = [
  "REQUEST_MORE_EVIDENCE",
  "VERIFY_IDENTITY_SPLIT",
  "VERIFY_LOCATION_ATTRIBUTION",
  "VERIFY_RELATION_DIRECTION",
  "VERIFY_TIME_ALIGNMENT"
] as const;

export type ConflictRecommendedActionKey = (typeof CONFLICT_RECOMMENDED_ACTION_KEYS)[number];

export interface StageB5PersonaCandidateRow {
  id                : string;
  bookId            : string;
  runId             : string;
  canonicalLabel    : string;
  firstSeenChapterNo: number | null;
  lastSeenChapterNo : number | null;
  mentionCount      : number;
  evidenceScore     : number;
}

export interface StageB5AliasClaimRow {
  id             : string;
  bookId         : string;
  chapterId      : string | null;
  chapterNo      : number | null;
  runId          : string;
  aliasText      : string;
  claimKind      : AliasClaimKind;
  evidenceSpanIds: string[];
  confidence     : number;
  reviewState    : ClaimReviewState;
  source         : ClaimSource;
  reviewNote     : string | null;
}

export interface StageB5EventClaimRow {
  id                       : string;
  bookId                   : string;
  chapterId                : string;
  chapterNo                : number;
  runId                    : string;
  subjectPersonaCandidateId: string | null;
  objectPersonaCandidateId : string | null;
  predicate                : string;
  objectText               : string | null;
  locationText             : string | null;
  timeHintId               : string | null;
  eventCategory            : BioCategory;
  narrativeLens            : NarrativeLens;
  evidenceSpanIds          : string[];
  confidence               : number;
  reviewState              : ClaimReviewState;
  source                   : ClaimSource;
  derivedFromClaimId       : string | null;
  reviewNote               : string | null;
}

export interface StageB5RelationClaimRow {
  id                      : string;
  bookId                  : string;
  chapterId               : string;
  chapterNo               : number;
  runId                   : string;
  sourcePersonaCandidateId: string | null;
  targetPersonaCandidateId: string | null;
  relationTypeKey         : string;
  relationLabel           : string;
  relationTypeSource      : RelationTypeSource;
  direction               : RelationDirection;
  effectiveChapterStart   : number | null;
  effectiveChapterEnd     : number | null;
  timeHintId              : string | null;
  evidenceSpanIds         : string[];
  confidence              : number;
  reviewState             : ClaimReviewState;
  source                  : ClaimSource;
  derivedFromClaimId      : string | null;
  reviewNote              : string | null;
}

export interface StageB5TimeClaimRow {
  id                 : string;
  bookId             : string;
  chapterId          : string;
  chapterNo          : number;
  runId              : string;
  rawTimeText        : string;
  timeType           : TimeType;
  normalizedLabel    : string;
  relativeOrderWeight: number | null;
  chapterRangeStart  : number | null;
  chapterRangeEnd    : number | null;
  evidenceSpanIds    : string[];
  confidence         : number;
  reviewState        : ClaimReviewState;
  source             : ClaimSource;
  derivedFromClaimId : string | null;
  reviewNote         : string | null;
}

export interface StageB5IdentityResolutionClaimRow {
  id                : string;
  bookId            : string;
  chapterId         : string | null;
  chapterNo         : number | null;
  runId             : string;
  mentionId         : string;
  personaCandidateId: string | null;
  resolutionKind    : IdentityResolutionKind;
  rationale         : string | null;
  evidenceSpanIds   : string[];
  confidence        : number;
  reviewState       : ClaimReviewState;
  source            : ClaimSource;
  reviewNote        : string | null;
}

export interface StageB5RepositoryPayload {
  personaCandidates       : StageB5PersonaCandidateRow[];
  aliasClaims             : StageB5AliasClaimRow[];
  eventClaims             : StageB5EventClaimRow[];
  relationClaims          : StageB5RelationClaimRow[];
  timeClaims              : StageB5TimeClaimRow[];
  identityResolutionClaims: StageB5IdentityResolutionClaimRow[];
}

export interface StageB5ConflictFinding {
  conflictType              : ConflictType;
  severity                  : ConflictSeverity;
  reason                    : string;
  summary                   : string;
  recommendedActionKey      : ConflictRecommendedActionKey;
  sourceStageKey            : string;
  relatedClaimKind          : ClaimKind | null;
  relatedClaimIds           : string[];
  relatedPersonaCandidateIds: string[];
  relatedChapterIds         : string[];
  evidenceSpanIds           : string[];
  tags                      : string[];
}

export interface StageB5ConflictDraftBundle {
  drafts: ClaimDraftByFamily["CONFLICT_FLAG"][];
}

export interface StageB5RunInput {
  bookId  : string;
  runId   : string | null;
  attempt?: number;
}

export interface StageB5RunResult {
  bookId         : string;
  runId          : string | null;
  stageRunId     : string | null;
  rawOutputId    : string | null;
  inputCount     : number;
  outputCount    : number;
  skippedCount   : number;
  decisionSummary: string;
}

export function summarizeStageB5ConflictCounts(
  rows: Array<{ conflictType: ConflictType; severity: ConflictSeverity }>
): string {
  const typeCounts = new Map<ConflictType, number>();
  const severityCounts = new Map<ConflictSeverity, number>();

  for (const row of rows) {
    typeCounts.set(row.conflictType, (typeCounts.get(row.conflictType) ?? 0) + 1);
    severityCounts.set(row.severity, (severityCounts.get(row.severity) ?? 0) + 1);
  }

  const typeSummary = Array.from(typeCounts.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([type, count]) => `${type}:${count}`)
    .join(",");

  const severitySummary = Array.from(severityCounts.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([severity, count]) => `${severity}:${count}`)
    .join(",");

  return `${typeSummary} | ${severitySummary}`;
}
