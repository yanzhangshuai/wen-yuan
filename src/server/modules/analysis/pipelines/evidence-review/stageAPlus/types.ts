import type { ClaimReviewState, RelationDirection, RelationTypeSource } from "@/server/modules/analysis/claims/base-types";
import type { ClaimDraftByFamily } from "@/server/modules/analysis/claims/claim-schemas";
import type { RuntimeKnowledgeItem } from "@/server/modules/knowledge-v2/runtime-loader";

export const STAGE_A_PLUS_STAGE_KEY = "stage_a_plus_knowledge_recall";
export const STAGE_A_PLUS_RULE_VERSION = "2026-04-19-stage-a-plus-v1";
export const STAGE_A_PLUS_RULE_PROVIDER = "rule-engine";
export const STAGE_A_PLUS_RULE_MODEL = "stage-a-plus-knowledge-recall-v1";

export const STAGE_A_PLUS_CONFIDENCE = Object.freeze({
  VERIFIED_KB   : 0.9,
  PENDING_KB    : 0.55,
  LOCAL_RULE    : 0.68,
  NEGATIVE_KB   : 0.92,
  RELATION_BOOST: 0.12
} as const);

export type StageAPlusKnowledgeReviewState = "VERIFIED" | "PENDING";
export type StageAPlusRecallKind = "MENTION" | "ALIAS" | "RELATION";
export type StageAPlusDiscardCode =
  | "SCHEMA_VALIDATION"
  | "SEGMENT_INDEX_OUT_OF_RANGE"
  | "QUOTE_NOT_FOUND"
  | "QUOTE_NOT_UNIQUE"
  | "EVIDENCE_VALIDATION_FAILED";

export interface StageAPlusDiscardRecord {
  kind   : StageAPlusRecallKind;
  ref    : string;
  code   : StageAPlusDiscardCode;
  message: string;
}

export interface StageAPlusCompiledKnowledgeBase {
  id         : string;
  reviewState: StageAPlusKnowledgeReviewState;
  confidence : number;
  item       : RuntimeKnowledgeItem;
}

export interface StageAPlusCompiledAliasEquivalenceRule extends StageAPlusCompiledKnowledgeBase {
  canonicalName : string;
  aliasTexts    : string[];
  aliasTypeHints: string[];
  note          : string | null;
}

export interface StageAPlusCompiledAliasNegativeRule extends StageAPlusCompiledKnowledgeBase {
  aliasText            : string;
  blockedCanonicalNames: string[];
  reason               : string;
}

export interface StageAPlusCompiledTermRule extends StageAPlusCompiledKnowledgeBase {
  term           : string;
  normalizedLabel: string | null;
  aliasTypeHint  : "TITLE" | "POSITION" | "KINSHIP" | "NAMED" | "UNSURE";
  mentionKind    : "TITLE_ONLY" | "KINSHIP" | "NAMED" | "UNKNOWN";
}

export interface StageAPlusCompiledRelationMappingRule extends StageAPlusCompiledKnowledgeBase {
  relationTypeKey   : string;
  observedLabel     : string;
  normalizedLabel   : string;
  relationTypeSource: RelationTypeSource;
}

export interface StageAPlusCompiledRelationTaxonomyRule extends StageAPlusCompiledKnowledgeBase {
  relationTypeKey   : string;
  displayLabel      : string;
  direction         : RelationDirection;
  relationTypeSource: RelationTypeSource;
  aliasLabels       : string[];
}

export interface StageAPlusCompiledRelationNegativeRule extends StageAPlusCompiledKnowledgeBase {
  relationTypeKey: string | null;
  blockedLabels  : string[];
  denyDirection  : RelationDirection | null;
  reason         : string;
}

export interface StageAPlusCompiledKnowledge {
  aliasEquivalenceRules: StageAPlusCompiledAliasEquivalenceRule[];
  aliasNegativeRules   : StageAPlusCompiledAliasNegativeRule[];
  termRules            : StageAPlusCompiledTermRule[];
  surnameRules         : StageAPlusCompiledTermRule[];
  relationMappings     : StageAPlusCompiledRelationMappingRule[];
  relationTaxonomyRules: StageAPlusCompiledRelationTaxonomyRule[];
  relationNegativeRules: StageAPlusCompiledRelationNegativeRule[];
}

export interface StageAPlusRelationClaimRow {
  id                      : string;
  bookId                  : string;
  chapterId               : string;
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
}

export interface StageAPlusRecallOutput {
  mentionDrafts   : Array<ClaimDraftByFamily["ENTITY_MENTION"]>;
  aliasDrafts     : Array<ClaimDraftByFamily["ALIAS"]>;
  relationDrafts  : Array<ClaimDraftByFamily["RELATION"]>;
  discardRecords  : StageAPlusDiscardRecord[];
  knowledgeItemIds: string[];
}

export interface StageAPlusPersistedCounts {
  mentions : number;
  aliases  : number;
  relations: number;
}

export interface StageAPlusRunInput {
  bookId     : string;
  bookTypeKey: string | null;
  runId      : string | null;
  attempt?   : number;
  chapter    : {
    id     : string;
    no     : number;
    title  : string;
    content: string;
  };
}

export interface StageAPlusRunResult {
  bookId          : string;
  chapterId       : string;
  runId           : string | null;
  stageRunId      : string | null;
  rawOutputId     : string | null;
  inputCount      : number;
  outputCount     : number;
  skippedCount    : number;
  persistedCounts : StageAPlusPersistedCounts;
  knowledgeItemIds: string[];
  discardRecords  : StageAPlusDiscardRecord[];
}

export function reviewNoteForKnowledge(
  prefix: "KB_VERIFIED" | "KB_PENDING_HINT" | "KB_ALIAS_NEGATIVE" | "KB_RELATION_NEGATIVE",
  knowledgeId: string,
  detail: string
): string {
  return `${prefix}: knowledgeId=${knowledgeId}; ${detail}`;
}

export function reviewStateForKnowledge(
  reviewState: StageAPlusKnowledgeReviewState
): ClaimReviewState {
  return reviewState === "VERIFIED" ? "PENDING" : "PENDING";
}

export function summarizeStageAPlusDiscards(
  discards: StageAPlusDiscardRecord[]
): string | null {
  if (discards.length === 0) {
    return null;
  }

  const counts = new Map<StageAPlusDiscardCode, number>();
  for (const discard of discards) {
    counts.set(discard.code, (counts.get(discard.code) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([code, count]) => `${code}:${count}`)
    .join(", ");
}
