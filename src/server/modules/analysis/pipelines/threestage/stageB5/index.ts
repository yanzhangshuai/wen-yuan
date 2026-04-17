/**
 * Stage B.5 时序一致性检查 · 对外 barrel。
 */
export { TemporalConsistencyChecker } from "@/server/modules/analysis/pipelines/threestage/stageB5/TemporalConsistencyChecker";
export type { TemporalB5PrismaClient } from "@/server/modules/analysis/pipelines/threestage/stageB5/TemporalConsistencyChecker";
export type {
  PostDeathMentionEvidence,
  TemporalCheckResult,
  TemporalEvidenceRefs,
  TemporalPersonaReport
} from "@/server/modules/analysis/pipelines/threestage/stageB5/types";
