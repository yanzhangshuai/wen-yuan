import type {
  ProjectionFamily,
  ProjectionRebuildScope
} from "@/server/modules/review/evidence-review/projections/types";

export const EVIDENCE_REVIEW_RERUN_CHANGE_KIND_VALUES = Object.freeze([
  "REVIEW_MUTATION",
  "CHAPTER_TEXT_CHANGE",
  "KNOWLEDGE_BASE_CHANGE",
  "RELATION_CATALOG_CHANGE"
] as const);

export type EvidenceReviewRerunChangeKind =
  (typeof EVIDENCE_REVIEW_RERUN_CHANGE_KIND_VALUES)[number];

export const EVIDENCE_REVIEW_RERUN_STAGE_KEY_VALUES = Object.freeze([
  "STAGE_0",
  "STAGE_A",
  "STAGE_A_PLUS",
  "STAGE_B",
  "STAGE_B5",
  "STAGE_C",
  "STAGE_D"
] as const);

export type EvidenceReviewRerunStageKey =
  (typeof EVIDENCE_REVIEW_RERUN_STAGE_KEY_VALUES)[number];

export const EVIDENCE_REVIEW_KB_CHANGE_KIND_VALUES = Object.freeze([
  "ALIAS_RULE",
  "PERSONA_HINT",
  "RELATION_NORMALIZATION",
  "BAN_MERGE_HINT"
] as const);

export type EvidenceReviewKnowledgeBaseChangeKind =
  (typeof EVIDENCE_REVIEW_KB_CHANGE_KIND_VALUES)[number];

export const EVIDENCE_REVIEW_RELATION_CATALOG_IMPACT_MODE_VALUES = Object.freeze([
  "DISPLAY_ONLY",
  "NORMALIZATION_RULE"
] as const);

export type EvidenceReviewRelationCatalogImpactMode =
  (typeof EVIDENCE_REVIEW_RELATION_CATALOG_IMPACT_MODE_VALUES)[number];

export const EVIDENCE_REVIEW_RERUN_EXECUTION_MODE_VALUES = Object.freeze([
  "PROJECTION_ONLY",
  "PIPELINE_RERUN"
] as const);

export type EvidenceReviewRerunExecutionMode =
  (typeof EVIDENCE_REVIEW_RERUN_EXECUTION_MODE_VALUES)[number];

export const EVIDENCE_REVIEW_RERUN_STAGE_PLAN_SCOPE_KIND_VALUES = Object.freeze([
  "LOCAL_CHAPTER",
  "FULL_BOOK",
  "PROJECTION_REBUILD"
] as const);

export type EvidenceReviewRerunScopeKind =
  (typeof EVIDENCE_REVIEW_RERUN_STAGE_PLAN_SCOPE_KIND_VALUES)[number];

// Rerun planning uses an evidence-review-specific input union rather than overloading the legacy retry planner.
export type EvidenceReviewRerunChange =
  | {
      changeKind         : "REVIEW_MUTATION";
      bookId             : string;
      reason             : string;
      runId?             : string | null;
      claimFamilies?     : string[];
      projectionScopes   : ProjectionRebuildScope[];
      projectionFamilies?: ProjectionFamily[];
    }
  | {
      changeKind    : "CHAPTER_TEXT_CHANGE";
      bookId        : string;
      reason        : string;
      previousRunId?: string | null;
      chapterIds    : string[];
      segmentIds?   : string[];
    }
  | {
      changeKind      : "KNOWLEDGE_BASE_CHANGE";
      bookId          : string;
      reason          : string;
      previousRunId?  : string | null;
      kbChangeKinds   : EvidenceReviewKnowledgeBaseChangeKind[];
      affectedEntryIds: string[];
    }
  | {
      changeKind      : "RELATION_CATALOG_CHANGE";
      bookId          : string;
      reason          : string;
      previousRunId?  : string | null;
      relationTypeKeys: string[];
      impactMode      : EvidenceReviewRelationCatalogImpactMode;
    };

// Dirty-set dimensions stay first-class so later planner steps can explain what is invalidated and what is preserved.
export interface EvidenceReviewDirtySet {
  bookId             : string;
  runIds             : string[];
  chapterIds         : string[];
  segmentIds         : string[];
  claimFamilies      : string[];
  personaCandidateIds: string[];
  projectionSlices   : ProjectionRebuildScope[];
  projectionFamilies : ProjectionFamily[];
}

export interface EvidenceReviewAffectedRange {
  runIds             : string[];
  chapterIds         : string[];
  chapterNos         : number[];
  segmentIds         : string[];
  claimFamilies      : string[];
  personaCandidateIds: string[];
  projectionScopes   : ProjectionRebuildScope[];
  projectionFamilies : ProjectionFamily[];
}

export interface EvidenceReviewStagePlan {
  stageKey               : EvidenceReviewRerunStageKey;
  scopeKind              : EvidenceReviewRerunScopeKind;
  chapterIds             : string[];
  preservePreviousOutputs: boolean;
}

export interface EvidenceReviewRerunCachePlan {
  invalidateStageKeys          : EvidenceReviewRerunStageKey[];
  preserveStageKeys            : EvidenceReviewRerunStageKey[];
  invalidatedProjectionFamilies: ProjectionFamily[];
  comparableBaselineRunId      : string | null;
}

export interface EvidenceReviewRerunExplanation {
  summary: string;
  lines  : string[];
}

// The plan DTO keeps execution mode separate from projection scope kind to avoid treating local rebuilds as LLM reruns.
export interface EvidenceReviewRerunPlan {
  bookId        : string;
  changeKind    : EvidenceReviewRerunChangeKind;
  executionMode : EvidenceReviewRerunExecutionMode;
  reason        : string;
  expectedStages: EvidenceReviewRerunStageKey[];
  affectedRange : EvidenceReviewAffectedRange;
  stagePlans    : EvidenceReviewStagePlan[];
  cache         : EvidenceReviewRerunCachePlan;
  explanation   : EvidenceReviewRerunExplanation;
}
