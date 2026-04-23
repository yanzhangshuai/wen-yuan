import { clientFetch } from "@/lib/client-api";
import type {
  ClaimReviewState,
  ConflictState,
  ReviewClaimListResponse
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
  ReviewClaimActionType,
  ReviewClaimAiBasisSummaryDto,
  ReviewClaimAuditHistoryItemDto,
  ReviewClaimDetailRecord,
  ReviewClaimDetailResponse,
  ReviewClaimEvidenceSpanDto,
  ReviewClaimFieldDiffDto,
  ReviewClaimListItem,
  ReviewClaimListResponse,
  ReviewClaimRawOutputSummaryDto,
  ReviewClaimVersionDiffDto,
  SubmitReviewClaimActionInput
} from "@/lib/services/review-matrix";

const TIME_CELL_REVIEWABLE_CLAIM_KINDS = ["TIME", "EVENT", "RELATION", "CONFLICT_FLAG"] as const;

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

export interface FetchPersonaTimeMatrixInput {
  bookId         : string;
  personaId?     : string;
  timeTypes?     : ReviewTimeAxisType[];
  limitPersonas? : number;
  offsetPersonas?: number;
}

export interface FetchTimeCellClaimsInput {
  bookId        : string;
  personaId     : string;
  timeLabel     : string;
  reviewStates? : ClaimReviewState[];
  conflictState?: ConflictState;
  limit?        : number;
  offset?       : number;
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

export async function fetchPersonaTimeMatrix(
  input: FetchPersonaTimeMatrixInput
): Promise<PersonaTimeMatrixDto> {
  const searchParams = new URLSearchParams({ bookId: input.bookId });
  appendOptionalParam(searchParams, "personaId", input.personaId);
  appendRepeatedParams(searchParams, "timeTypes", input.timeTypes);
  appendOptionalParam(searchParams, "limitPersonas", input.limitPersonas);
  appendOptionalParam(searchParams, "offsetPersonas", input.offsetPersonas);

  return clientFetch<PersonaTimeMatrixDto>(
    buildQueryPath("/api/admin/review/persona-time-matrix", searchParams)
  );
}

export async function fetchTimeCellClaims(
  input: FetchTimeCellClaimsInput
): Promise<ReviewClaimListResponse> {
  const searchParams = new URLSearchParams({
    bookId   : input.bookId,
    personaId: input.personaId,
    timeLabel: input.timeLabel
  });
  appendRepeatedParams(searchParams, "claimKinds", TIME_CELL_REVIEWABLE_CLAIM_KINDS);
  appendRepeatedParams(searchParams, "reviewStates", input.reviewStates);
  appendOptionalParam(searchParams, "conflictState", input.conflictState);
  appendOptionalParam(searchParams, "limit", input.limit);
  appendOptionalParam(searchParams, "offset", input.offset);

  return clientFetch<ReviewClaimListResponse>(
    buildQueryPath("/api/admin/review/claims", searchParams)
  );
}
