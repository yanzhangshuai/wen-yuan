/**
 * =============================================================================
 * 文件定位（人物 x 章节审核矩阵客户端服务层）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/lib/services/review-matrix.ts`
 *
 * 该文件属于前端数据访问层，负责把矩阵页的筛选、钻取与审核动作转换为 T12/T13
 * review API 请求。这里必须保持 browser-safe，不能依赖 `src/server/**`。
 * =============================================================================
 */
import { clientFetch, clientMutate } from "@/lib/client-api";

export type ClaimReviewState =
  | "PENDING"
  | "ACCEPTED"
  | "REJECTED"
  | "EDITED"
  | "DEFERRED"
  | "CONFLICTED";

export type ClaimSource = "AI" | "RULE" | "MANUAL" | "IMPORTED";
export type ConflictState = "ACTIVE" | "NONE";
export type RelationDirection = "FORWARD" | "REVERSE" | "BIDIRECTIONAL" | "UNDIRECTED";
export type RelationTypeSource = "PRESET" | "CUSTOM" | "NORMALIZED_FROM_CUSTOM";
export type ReviewableClaimKind =
  | "ALIAS"
  | "EVENT"
  | "RELATION"
  | "TIME"
  | "IDENTITY_RESOLUTION"
  | "CONFLICT_FLAG";
export type ReviewManualClaimKind =
  | "ALIAS"
  | "EVENT"
  | "RELATION"
  | "TIME"
  | "IDENTITY_RESOLUTION";
export type ReviewClaimActionType = "ACCEPT" | "REJECT" | "DEFER" | "EDIT" | "RELINK_EVIDENCE";

const CELL_REVIEWABLE_CLAIM_KINDS = ["EVENT", "RELATION", "CONFLICT_FLAG"] as const;

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
  bookId              : string;
  personas            : PersonaChapterMatrixPersonaDto[];
  chapters            : PersonaChapterMatrixChapterDto[];
  cells               : PersonaChapterMatrixCellDto[];
  relationTypeOptions?: PersonaChapterRelationTypeOptionDto[];
  generatedAt?        : string;
}

export interface FetchPersonaChapterMatrixInput {
  bookId         : string;
  personaId?     : string;
  chapterId?     : string;
  reviewStates?  : ClaimReviewState[];
  conflictState? : ConflictState;
  limitPersonas? : number;
  offsetPersonas?: number;
}

export interface ReviewClaimListItem {
  claimKind          : ReviewableClaimKind;
  claimId            : string;
  bookId             : string;
  chapterId          : string | null;
  reviewState        : ClaimReviewState;
  source             : ClaimSource;
  conflictState      : ConflictState;
  createdAt          : string;
  updatedAt          : string;
  personaCandidateIds: string[];
  personaIds         : string[];
  timeLabel          : string | null;
  relationTypeKey    : string | null;
  evidenceSpanIds    : string[];
}

export interface ReviewClaimListResponse {
  items: ReviewClaimListItem[];
  total: number;
}

export interface FetchCellClaimsInput {
  bookId        : string;
  personaId     : string;
  chapterId     : string;
  reviewStates? : ClaimReviewState[];
  conflictState?: ConflictState;
  limit?        : number;
  offset?       : number;
}

export interface ReviewClaimDetailRecord extends ReviewClaimListItem {
  id                : string;
  derivedFromClaimId: string | null;
  [key: string]     : unknown;
}

export interface ReviewClaimDetailProjectionSummary {
  personaChapterFacts: unknown[];
  personaTimeFacts   : unknown[];
  relationshipEdges  : unknown[];
  timelineEvents     : unknown[];
}

export interface ReviewClaimDetailResponse {
  claim            : ReviewClaimDetailRecord;
  evidence         : unknown[];
  basisClaim       : ReviewClaimDetailRecord | null;
  projectionSummary: ReviewClaimDetailProjectionSummary;
  auditHistory     : unknown[];
}

export interface FetchReviewClaimDetailInput {
  bookId   : string;
  claimKind: ReviewableClaimKind;
  claimId  : string;
}

interface ReviewClaimActionBase {
  bookId   : string;
  claimKind: ReviewableClaimKind;
  claimId  : string;
  note     : string | null;
}

export type SubmitReviewClaimActionInput =
  | (ReviewClaimActionBase & {
    action: "ACCEPT" | "REJECT" | "DEFER";
  })
  | (ReviewClaimActionBase & {
    action: "EDIT";
    draft : Record<string, unknown>;
  })
  | (ReviewClaimActionBase & {
    action         : "RELINK_EVIDENCE";
    evidenceSpanIds: string[];
  });

export interface CreateManualReviewClaimInput {
  claimKind: ReviewManualClaimKind;
  note     : string | null;
  draft    : Record<string, unknown>;
}

export interface CreateManualReviewClaimResult {
  id           : string;
  [key: string]: unknown;
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

function buildJsonPostOptions(body: Record<string, unknown>): RequestInit {
  return {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(body)
  };
}

export async function fetchPersonaChapterMatrix(
  input: FetchPersonaChapterMatrixInput
): Promise<PersonaChapterMatrixDto> {
  const searchParams = new URLSearchParams({ bookId: input.bookId });
  appendOptionalParam(searchParams, "personaId", input.personaId);
  appendOptionalParam(searchParams, "chapterId", input.chapterId);
  appendRepeatedParams(searchParams, "reviewStates", input.reviewStates);
  appendOptionalParam(searchParams, "conflictState", input.conflictState);
  appendOptionalParam(searchParams, "limitPersonas", input.limitPersonas);
  appendOptionalParam(searchParams, "offsetPersonas", input.offsetPersonas);

  return clientFetch<PersonaChapterMatrixDto>(
    buildQueryPath("/api/admin/review/persona-chapter-matrix", searchParams)
  );
}

export async function fetchCellClaims(input: FetchCellClaimsInput): Promise<ReviewClaimListResponse> {
  const searchParams = new URLSearchParams({
    bookId   : input.bookId,
    personaId: input.personaId,
    chapterId: input.chapterId
  });
  appendRepeatedParams(searchParams, "claimKinds", CELL_REVIEWABLE_CLAIM_KINDS);
  appendRepeatedParams(searchParams, "reviewStates", input.reviewStates);
  appendOptionalParam(searchParams, "conflictState", input.conflictState);
  appendOptionalParam(searchParams, "limit", input.limit);
  appendOptionalParam(searchParams, "offset", input.offset);

  return clientFetch<ReviewClaimListResponse>(
    buildQueryPath("/api/admin/review/claims", searchParams)
  );
}

export async function fetchReviewClaimDetail(
  input: FetchReviewClaimDetailInput
): Promise<ReviewClaimDetailResponse> {
  const searchParams = new URLSearchParams({ bookId: input.bookId });
  const claimKind = encodeURIComponent(input.claimKind);
  const claimId = encodeURIComponent(input.claimId);

  return clientFetch<ReviewClaimDetailResponse>(
    buildQueryPath(`/api/admin/review/claims/${claimKind}/${claimId}`, searchParams)
  );
}

export async function submitReviewClaimAction(
  input: SubmitReviewClaimActionInput
): Promise<void> {
  const claimKind = encodeURIComponent(input.claimKind);
  const claimId = encodeURIComponent(input.claimId);
  const path = `/api/admin/review/claims/${claimKind}/${claimId}/actions`;

  if (input.action === "EDIT") {
    await clientMutate(path, buildJsonPostOptions({
      bookId: input.bookId,
      action: input.action,
      note  : input.note,
      draft : input.draft
    }));
    return;
  }

  if (input.action === "RELINK_EVIDENCE") {
    await clientMutate(path, buildJsonPostOptions({
      bookId         : input.bookId,
      action         : input.action,
      note           : input.note,
      evidenceSpanIds: input.evidenceSpanIds
    }));
    return;
  }

  await clientMutate(path, buildJsonPostOptions({
    bookId: input.bookId,
    action: input.action,
    note  : input.note
  }));
}

export async function createManualReviewClaim(
  input: CreateManualReviewClaimInput
): Promise<CreateManualReviewClaimResult> {
  return clientFetch<CreateManualReviewClaimResult>(
    "/api/admin/review/claims",
    buildJsonPostOptions({
      claimKind: input.claimKind,
      note     : input.note,
      draft    : input.draft
    })
  );
}
