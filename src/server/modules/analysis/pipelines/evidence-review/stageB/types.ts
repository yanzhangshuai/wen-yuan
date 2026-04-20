import type { ClaimReviewState, ClaimSource } from "@/server/modules/analysis/claims/base-types";
import type { ClaimDraftByFamily } from "@/server/modules/analysis/claims/claim-schemas";
import type {
  AliasClaimKind,
  AliasType,
  IdentityClaim,
  IdentityResolutionKind,
  MentionKind,
  PersonaCandidateStatus
} from "@/generated/prisma/enums";

export const STAGE_B_STAGE_KEY = "stage_b_identity_resolution";
export const STAGE_B_RULE_VERSION = "2026-04-20-stage-b-v1";
export const STAGE_B_RULE_PROVIDER = "rule-engine";
export const STAGE_B_RULE_MODEL = "stage-b-identity-resolution-v1";

export type StageBSupportReason =
  | "SUSPECTED_RESOLVES_TO"
  | "KB_ALIAS_EQUIVALENCE"
  | "KB_ALIAS_PENDING_HINT"
  | "EXACT_NAMED_SURFACE";

export type StageBBlockReason =
  | "NEGATIVE_ALIAS_RULE"
  | "CONFLICTING_CANONICAL_HINTS"
  | "SUSPECTED_RESOLVES_TO_CONFLICT"
  | "TITLE_ONLY_AMBIGUITY"
  | "IMPERSONATION"
  | "MISIDENTIFICATION";

export interface StageBMentionRow {
  id                 : string;
  bookId             : string;
  chapterId          : string;
  chapterNo          : number;
  runId              : string;
  surfaceText        : string;
  mentionKind        : MentionKind;
  identityClaim      : IdentityClaim | null;
  aliasTypeHint      : AliasType | null;
  suspectedResolvesTo: string | null;
  evidenceSpanId     : string;
  confidence         : number;
  source             : ClaimSource;
}

export interface StageBAliasClaimRow {
  id             : string;
  bookId         : string;
  chapterId      : string | null;
  runId          : string;
  aliasText      : string;
  aliasType      : AliasType;
  claimKind      : AliasClaimKind;
  evidenceSpanIds: string[];
  confidence     : number;
  reviewState    : ClaimReviewState;
  source         : ClaimSource;
  reviewNote     : string | null;
}

export interface StageBAliasPositiveSignal {
  aliasText      : string;
  canonicalName  : string;
  knowledgeId    : string | null;
  reviewStrength : "VERIFIED" | "PENDING";
  confidence     : number;
  evidenceSpanIds: string[];
}

export interface StageBAliasNegativeSignal {
  aliasText            : string;
  blockedCanonicalNames: string[];
  knowledgeId          : string | null;
  confidence           : number;
  evidenceSpanIds      : string[];
}

export interface StageBAliasSignalBundle {
  positiveSignals        : StageBAliasPositiveSignal[];
  negativeSignals        : StageBAliasNegativeSignal[];
  impersonationAliasTexts: Set<string>;
  misidentifiedAliasTexts: Set<string>;
}

export interface StageBCandidateCluster {
  candidateRef          : string;
  mentions              : StageBMentionRow[];
  canonicalHints        : string[];
  supportReasons        : StageBSupportReason[];
  blockReasons          : StageBBlockReason[];
  supportEvidenceSpanIds: string[];
  mergeConfidence       : number;
}

export interface StageBPersonaCandidateSeed {
  candidateRef      : string;
  canonicalLabel    : string;
  candidateStatus   : PersonaCandidateStatus;
  firstSeenChapterNo: number | null;
  lastSeenChapterNo : number | null;
  mentionCount      : number;
  evidenceScore     : number;
}

export interface StageBPendingIdentityResolutionDraft {
  candidateRef: string;
  draft       : ClaimDraftByFamily["IDENTITY_RESOLUTION"];
}

export interface StageBResolutionDraftBundle {
  personaCandidates       : StageBPersonaCandidateSeed[];
  identityResolutionDrafts: StageBPendingIdentityResolutionDraft[];
}

export interface StageBPersistedCounts {
  personaCandidates       : number;
  identityResolutionClaims: number;
}

export interface StageBRunInput {
  bookId  : string;
  runId   : string | null;
  attempt?: number;
}

export interface StageBRunResult {
  bookId         : string;
  runId          : string | null;
  stageRunId     : string | null;
  rawOutputId    : string | null;
  inputCount     : number;
  outputCount    : number;
  skippedCount   : number;
  persistedCounts: StageBPersistedCounts;
  candidateCount : number;
  decisionSummary: string;
}

export function summarizeStageBDecisionCounts(
  rows: Array<{ resolutionKind: IdentityResolutionKind; reviewState: ClaimReviewState }>
): string {
  const kindCounts = new Map<IdentityResolutionKind, number>();
  const stateCounts = new Map<ClaimReviewState, number>();

  for (const row of rows) {
    kindCounts.set(row.resolutionKind, (kindCounts.get(row.resolutionKind) ?? 0) + 1);
    stateCounts.set(row.reviewState, (stateCounts.get(row.reviewState) ?? 0) + 1);
  }

  const kindSummary = Array.from(kindCounts.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([kind, count]) => `${kind}:${count}`)
    .join(",");

  const stateSummary = Array.from(stateCounts.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([state, count]) => `${state}:${count}`)
    .join(",");

  return `${kindSummary} | ${stateSummary}`;
}
