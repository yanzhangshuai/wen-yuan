import type {
  ProjectionFamily,
  ProjectionRebuildScope
} from "@/server/modules/review/evidence-review/projections/types";
import { PROJECTION_FAMILY_VALUES } from "@/server/modules/review/evidence-review/projections/types";

import type {
  EvidenceReviewRerunChange,
  EvidenceReviewRerunExecutionMode,
  EvidenceReviewRerunStageKey
} from "./types";

const REVIEW_MUTATION_STAGES = ["STAGE_D"] as const satisfies readonly EvidenceReviewRerunStageKey[];
const CHAPTER_TEXT_CHANGE_STAGES = [
  "STAGE_0",
  "STAGE_A",
  "STAGE_A_PLUS",
  "STAGE_B",
  "STAGE_B5",
  "STAGE_C",
  "STAGE_D"
] as const satisfies readonly EvidenceReviewRerunStageKey[];
const KNOWLEDGE_BASE_CHANGE_STAGES = [
  "STAGE_A_PLUS",
  "STAGE_B",
  "STAGE_B5",
  "STAGE_C",
  "STAGE_D"
] as const satisfies readonly EvidenceReviewRerunStageKey[];
const RELATIONSHIP_EDGES = "relationship_edges" satisfies ProjectionFamily;
const ALL_PROJECTION_FAMILIES = [
  ...PROJECTION_FAMILY_VALUES
] satisfies readonly ProjectionFamily[];
const RELATION_NORMALIZATION_PROJECTION_FAMILIES = [
  "persona_chapter_facts",
  "persona_time_facts",
  "relationship_edges"
] as const satisfies readonly ProjectionFamily[];

export interface EvidenceReviewStagePolicy {
  executionMode     : EvidenceReviewRerunExecutionMode;
  expectedStages    : EvidenceReviewRerunStageKey[];
  projectionFamilies: ProjectionFamily[];
}

/**
 * 解析最小安全重跑策略。该函数保持纯计算，避免预览/成本比较阶段误触发旧 retry planner 或数据库访问。
 */
export function getEvidenceReviewStagePolicy(
  change: EvidenceReviewRerunChange
): EvidenceReviewStagePolicy {
  switch (change.changeKind) {
    case "REVIEW_MUTATION":
      return {
        executionMode     : "PROJECTION_ONLY",
        expectedStages    : [...REVIEW_MUTATION_STAGES],
        projectionFamilies: collectReviewMutationProjectionFamilies(change)
      };

    case "CHAPTER_TEXT_CHANGE":
      return {
        executionMode     : "PIPELINE_RERUN",
        expectedStages    : [...CHAPTER_TEXT_CHANGE_STAGES],
        projectionFamilies: [...ALL_PROJECTION_FAMILIES]
      };

    case "KNOWLEDGE_BASE_CHANGE":
      return {
        executionMode     : "PIPELINE_RERUN",
        expectedStages    : [...KNOWLEDGE_BASE_CHANGE_STAGES],
        projectionFamilies: [...ALL_PROJECTION_FAMILIES]
      };

    case "RELATION_CATALOG_CHANGE":
      if (change.impactMode === "DISPLAY_ONLY") {
        return {
          executionMode     : "PROJECTION_ONLY",
          expectedStages    : [...REVIEW_MUTATION_STAGES],
          projectionFamilies: [RELATIONSHIP_EDGES]
        };
      }

      return {
        executionMode     : "PIPELINE_RERUN",
        expectedStages    : [...KNOWLEDGE_BASE_CHANGE_STAGES],
        projectionFamilies: [...RELATION_NORMALIZATION_PROJECTION_FAMILIES]
      };

    default:
      return assertNeverEvidenceReviewChange(change);
  }
}

export const resolveEvidenceReviewStagePolicy = getEvidenceReviewStagePolicy;

function collectReviewMutationProjectionFamilies(
  change: Extract<EvidenceReviewRerunChange, { changeKind: "REVIEW_MUTATION" }>
): ProjectionFamily[] {
  const families: ProjectionFamily[] = [];

  if (change.projectionFamilies) {
    families.push(...change.projectionFamilies);
  }

  for (const scope of change.projectionScopes) {
    families.push(...projectionFamiliesFromScope(scope));
  }

  return dedupeProjectionFamilies(families);
}

function projectionFamiliesFromScope(scope: ProjectionRebuildScope): readonly ProjectionFamily[] {
  return scope.projectionFamilies ?? [];
}

function dedupeProjectionFamilies(families: ProjectionFamily[]): ProjectionFamily[] {
  return Array.from(new Set(families));
}

function assertNeverEvidenceReviewChange(change: never): never {
  throw new Error(`Unsupported evidence-review rerun change: ${JSON.stringify(change)}`);
}
