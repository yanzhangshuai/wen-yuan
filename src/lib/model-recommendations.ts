import recommendationsRaw from "../../config/model-recommendations.v1.json";
import { BUSINESS_PIPELINE_STAGES, PipelineStage } from "@/types/pipeline";
import { z } from "zod";

const STAGES_FOR_RECOMMENDATION: PipelineStage[] = [
  ...BUSINESS_PIPELINE_STAGES,
  PipelineStage.FALLBACK
];

const RecommendationAliasSchema = z.object({
  label: z.string().trim().min(1)
});

const StageAliasesSchema = z.object({
  [PipelineStage.ROSTER_DISCOVERY]     : z.string().trim().min(1),
  [PipelineStage.CHUNK_EXTRACTION]     : z.string().trim().min(1),
  [PipelineStage.CHAPTER_VALIDATION]   : z.string().trim().min(1),
  [PipelineStage.TITLE_RESOLUTION]     : z.string().trim().min(1),
  [PipelineStage.GRAY_ZONE_ARBITRATION]: z.string().trim().min(1),
  [PipelineStage.BOOK_VALIDATION]      : z.string().trim().min(1),
  [PipelineStage.FALLBACK]             : z.string().trim().min(1)
});

const ModelRecommendationsSchema = z.object({
  version     : z.literal("v1"),
  aliases     : z.record(z.string().trim().min(1), RecommendationAliasSchema),
  stageAliases: StageAliasesSchema
});

type RecommendationAlias = z.infer<typeof RecommendationAliasSchema>;
type ModelRecommendations = z.infer<typeof ModelRecommendationsSchema>;

interface RecommendationModelCandidate {
  aliasKey?: string | null;
}

export interface StageRecommendedModel extends RecommendationAlias {
  alias: string;
}

function createEmptyStageRecommendationMap(): Record<PipelineStage, StageRecommendedModel | null> {
  return {
    [PipelineStage.ROSTER_DISCOVERY]     : null,
    [PipelineStage.CHUNK_EXTRACTION]     : null,
    [PipelineStage.CHAPTER_VALIDATION]   : null,
    [PipelineStage.TITLE_RESOLUTION]     : null,
    [PipelineStage.GRAY_ZONE_ARBITRATION]: null,
    [PipelineStage.BOOK_VALIDATION]      : null,
    [PipelineStage.FALLBACK]             : null
  };
}

function resolveStageRecommendedModels(config: ModelRecommendations): Record<PipelineStage, StageRecommendedModel | null> {
  const mapping = createEmptyStageRecommendationMap();

  for (const stage of STAGES_FOR_RECOMMENDATION) {
    const alias = config.stageAliases[stage];
    const recommended = config.aliases[alias];
    if (!recommended) {
      throw new Error(`[model-recommendations] stage "${stage}" references missing alias "${alias}"`);
    }

    mapping[stage] = { alias, label: recommended.label };
  }

  return mapping;
}

function isSameAlias(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

export function isRecommendedModelMatch(
  recommendation: StageRecommendedModel | null | undefined,
  candidate: RecommendationModelCandidate
): boolean {
  if (!recommendation) {
    return false;
  }

  const candidateAlias = candidate.aliasKey?.trim();
  if (!candidateAlias) {
    return false;
  }

  return isSameAlias(candidateAlias, recommendation.alias);
}

export function pickRecommendedEnabledModel<T extends RecommendationModelCandidate>(
  recommendation: StageRecommendedModel | null | undefined,
  availableModels: T[]
): T | null {
  if (!recommendation) {
    return null;
  }

  return availableModels.find(model => isRecommendedModelMatch(recommendation, model)) ?? null;
}

const parsedRecommendations = ModelRecommendationsSchema.parse(recommendationsRaw);

export const STAGE_RECOMMENDED_MODELS = resolveStageRecommendedModels(parsedRecommendations);
