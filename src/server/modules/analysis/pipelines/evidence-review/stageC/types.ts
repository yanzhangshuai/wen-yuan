import type {
  BioCategory,
  ClaimKind,
  ConflictSeverity,
  ConflictType,
  NarrativeLens,
  TimeType
} from "@/generated/prisma/enums";
import type {
  ClaimReviewState,
  ClaimSource,
  RelationDirection,
  RelationTypeSource
} from "@/server/modules/analysis/claims/base-types";
import type { ClaimDraftByFamily } from "@/server/modules/analysis/claims/claim-schemas";

export const STAGE_C_STAGE_KEY = "stage_c_fact_attribution";
export const STAGE_C_RULE_VERSION = "2026-04-20-stage-c-v1";
export const STAGE_C_RULE_PROVIDER = "rule-engine";
export const STAGE_C_RULE_MODEL = "stage-c-fact-attribution-v1";

export interface StageCPersonaCandidateRow {
  id                : string;
  bookId            : string;
  runId             : string;
  canonicalLabel    : string;
  firstSeenChapterNo: number | null;
  lastSeenChapterNo : number | null;
  mentionCount      : number;
  evidenceScore     : number;
}

export interface StageCEventClaimRow {
  id                       : string;
  bookId                   : string;
  chapterId                : string;
  chapterNo                : number;
  runId                    : string;
  subjectMentionId         : string | null;
  subjectPersonaCandidateId: string | null;
  predicate                : string;
  objectText               : string | null;
  objectPersonaCandidateId : string | null;
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

export interface StageCRelationClaimRow {
  id                      : string;
  bookId                  : string;
  chapterId               : string;
  chapterNo               : number;
  runId                   : string;
  sourceMentionId         : string | null;
  targetMentionId         : string | null;
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

export interface StageCTimeClaimRow {
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

export interface StageCConflictFlagRow {
  id                        : string;
  bookId                    : string;
  chapterId                 : string | null;
  runId                     : string;
  conflictType              : ConflictType;
  severity                  : ConflictSeverity;
  relatedClaimKind          : ClaimKind | null;
  relatedClaimIds           : string[];
  relatedPersonaCandidateIds: string[];
  relatedChapterIds         : string[];
  evidenceSpanIds           : string[];
  reviewState               : ClaimReviewState;
  source                    : ClaimSource;
}

export interface StageCRepositoryPayload {
  personaCandidates: StageCPersonaCandidateRow[];
  eventClaims      : StageCEventClaimRow[];
  relationClaims   : StageCRelationClaimRow[];
  timeClaims       : StageCTimeClaimRow[];
  conflictFlags    : StageCConflictFlagRow[];
}

export interface StageCAttributionRankingInput {
  directPersonaCandidateId: string | null;
  evidenceSpanIds         : string[];
  personaCandidates       : StageCPersonaCandidateRow[];
  conflictFlags           : StageCConflictFlagRow[];
}

export interface StageCAttributionDecision {
  personaCandidateId: string | null;
  rank              : number;
  score             : number;
  confidence        : number;
  reviewState       : ClaimReviewState;
  reason            : string;
  reasons           : string[];
  conflictFlagIds   : string[];
}

export interface StageCDecisionRow {
  rootClaimId       : string;
  claimFamily       : "EVENT" | "RELATION";
  endpoint          : "SUBJECT" | "OBJECT" | "SOURCE" | "TARGET";
  personaCandidateId: string | null;
  rank              : number;
  score             : number;
  reviewState       : ClaimReviewState;
  reason            : string;
  conflictFlagIds   : string[];
}

export interface StageCBuildDraftsInput {
  bookId : string;
  runId  : string;
  payload: StageCRepositoryPayload;
}

export interface StageCDraftBundle {
  eventDrafts     : ClaimDraftByFamily["EVENT"][];
  relationDrafts  : ClaimDraftByFamily["RELATION"][];
  scopedChapterIds: string[];
  decisionRows    : StageCDecisionRow[];
}

export interface StageCPersistedCounts {
  deletedCount: number;
  createdCount: number;
}

export interface StageCRunInput {
  bookId  : string;
  runId   : string | null;
  attempt?: number;
}

export interface StageCRunResult {
  bookId         : string;
  runId          : string | null;
  stageRunId     : string | null;
  rawOutputId    : string | null;
  inputCount     : number;
  outputCount    : number;
  skippedCount   : number;
  persistedCounts: StageCPersistedCounts;
  decisionSummary: string;
}

export function summarizeStageCDecisionCounts(
  rows: Array<{ claimFamily: "EVENT" | "RELATION"; reviewState: ClaimReviewState }>
): string {
  const familyCounts = new Map<string, number>();
  const stateCounts = new Map<string, number>();

  for (const row of rows) {
    familyCounts.set(row.claimFamily, (familyCounts.get(row.claimFamily) ?? 0) + 1);
    stateCounts.set(row.reviewState, (stateCounts.get(row.reviewState) ?? 0) + 1);
  }

  const familySummary = Array.from(familyCounts.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([family, count]) => `${family}:${count}`)
    .join(",");
  const stateSummary = Array.from(stateCounts.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([state, count]) => `${state}:${count}`)
    .join(",");

  return `${familySummary} | ${stateSummary}`;
}
