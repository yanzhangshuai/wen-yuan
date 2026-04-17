export {
  StageCAttributor,
  StageCAttributionError,
  parseStageCResponse
} from "@/server/modules/analysis/pipelines/threestage/stageC/StageCAttributor";
export type { StageCPrismaClient, StageCAttributeInput } from "@/server/modules/analysis/pipelines/threestage/stageC/StageCAttributor";
export {
  enforceBiographyRegionConstraint,
  isEffectiveBiography,
  locateRawSpanOffset,
  BIOGRAPHY_REGION_OVERRIDE_RULES
} from "@/server/modules/analysis/pipelines/threestage/stageC/enforceBiographyRegionConstraint";
export type { BiographyRegionOverrideRule } from "@/server/modules/analysis/pipelines/threestage/stageC/enforceBiographyRegionConstraint";
export type * from "@/server/modules/analysis/pipelines/threestage/stageC/types";
