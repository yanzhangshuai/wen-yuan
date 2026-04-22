import { clientFetch } from "@/lib/client-api";
import type {
  ClaimReviewState,
  ClaimSource,
  ConflictState,
  RelationDirection,
  RelationTypeSource
} from "@/lib/services/review-matrix";

export {
  createManualReviewClaim,
  fetchReviewClaimDetail,
  submitReviewClaimAction
} from "@/lib/services/review-matrix";

export type {
  ClaimReviewState,
  ClaimSource,
  ConflictState,
  CreateManualReviewClaimInput,
  CreateManualReviewClaimResult,
  FetchReviewClaimDetailInput,
  RelationDirection,
  RelationTypeSource,
  ReviewClaimActionType,
  ReviewClaimDetailRecord,
  ReviewClaimDetailResponse,
  SubmitReviewClaimActionInput
} from "@/lib/services/review-matrix";

export interface ReviewRelationTypeOptionDto {
  relationTypeKey   : string;
  label             : string;
  direction         : RelationDirection;
  relationTypeSource: RelationTypeSource;
  aliasLabels       : string[];
  systemPreset      : boolean;
}

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
  generatedAt?       : string;
}

export interface FetchRelationEditorViewInput {
  bookId           : string;
  personaId?       : string;
  pairPersonaId?   : string;
  relationTypeKeys?: string[];
  reviewStates?    : ClaimReviewState[];
  conflictState?   : ConflictState;
  limitPairs?      : number;
  offsetPairs?     : number;
}

function appendRepeatedParams(
  searchParams: URLSearchParams,
  key: string,
  values?: readonly string[]
): void {
  if (!values || values.length === 0) {
    return;
  }

  for (const value of values) {
    searchParams.append(key, value);
  }
}

function appendOptionalParam(
  searchParams: URLSearchParams,
  key: string,
  value: string | number | null | undefined
): void {
  if (value === null || value === undefined || value === "") {
    return;
  }

  searchParams.set(key, String(value));
}

function buildQueryPath(pathname: string, searchParams: URLSearchParams): string {
  const query = searchParams.toString();
  return query.length > 0 ? `${pathname}?${query}` : pathname;
}

export async function fetchRelationEditorView(
  input: FetchRelationEditorViewInput
): Promise<ReviewRelationEditorDto> {
  const searchParams = new URLSearchParams({ bookId: input.bookId });
  appendOptionalParam(searchParams, "personaId", input.personaId);
  appendOptionalParam(searchParams, "pairPersonaId", input.pairPersonaId);
  appendRepeatedParams(searchParams, "relationTypeKeys", input.relationTypeKeys);
  appendRepeatedParams(searchParams, "reviewStates", input.reviewStates);
  appendOptionalParam(searchParams, "conflictState", input.conflictState);
  appendOptionalParam(searchParams, "limitPairs", input.limitPairs);
  appendOptionalParam(searchParams, "offsetPairs", input.offsetPairs);

  return clientFetch<ReviewRelationEditorDto>(
    buildQueryPath("/api/admin/review/relations", searchParams)
  );
}
