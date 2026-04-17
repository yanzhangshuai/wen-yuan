/**
 * Stage B 全书实体仲裁 · 对外 barrel。
 */
export { StageBResolver, parseStageBResponse } from "@/server/modules/analysis/pipelines/threestage/stageB/StageBResolver";
export type { StageBPrismaClient, StageBResolveInput } from "@/server/modules/analysis/pipelines/threestage/stageB/StageBResolver";
export type {
  CandidateGroup,
  CandidateGroupChannel,
  RawStageBLlmItem,
  StageB5ConsumeAction,
  StageBDecision,
  StageBMentionRow,
  StageBMergeAction,
  StageBResult,
  StageBSuggestionAction
} from "@/server/modules/analysis/pipelines/threestage/stageB/types";
