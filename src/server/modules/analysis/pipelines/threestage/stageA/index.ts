/**
 * Stage A 硬提取服务 · 对外 barrel。
 */
export { StageAExtractor, StageAExtractionError, parseStageAResponse, formatRegionAnnotations } from "@/server/modules/analysis/pipelines/threestage/stageA/StageAExtractor";
export type { StageAExtractInput, StageAPrismaClient } from "@/server/modules/analysis/pipelines/threestage/stageA/StageAExtractor";
export { enforceRegionOverride, locateMentionOffset, REGION_OVERRIDE_RULES } from "@/server/modules/analysis/pipelines/threestage/stageA/enforceRegionOverride";
export type { RegionOverrideRule } from "@/server/modules/analysis/pipelines/threestage/stageA/enforceRegionOverride";
export type {
  StageAMention,
  StageARawMention,
  StageAResult,
  RegionBreakdown
} from "@/server/modules/analysis/pipelines/threestage/stageA/types";
