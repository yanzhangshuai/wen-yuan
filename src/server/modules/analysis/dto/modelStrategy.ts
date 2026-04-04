import { z } from "zod";

import { PipelineStage } from "@/types/pipeline";

export const stageModelConfigSchema = z.object({
  modelId        : z.string().uuid(),
  temperature    : z.number().min(0).max(2).optional(),
  maxOutputTokens: z.number().int().min(256).max(65536).optional(),
  topP           : z.number().min(0).max(1).optional(),
  enableThinking : z.boolean().optional(),
  reasoningEffort: z.enum(["low", "medium", "high"]).optional(),
  maxRetries     : z.number().int().min(0).max(5).optional(),
  retryBaseMs    : z.number().int().min(100).max(10000).optional()
});

export const strategyStagesSchema = z.object({
  [PipelineStage.ROSTER_DISCOVERY]     : stageModelConfigSchema.optional(),
  [PipelineStage.CHUNK_EXTRACTION]     : stageModelConfigSchema.optional(),
  [PipelineStage.CHAPTER_VALIDATION]   : stageModelConfigSchema.optional(),
  [PipelineStage.TITLE_RESOLUTION]     : stageModelConfigSchema.optional(),
  [PipelineStage.GRAY_ZONE_ARBITRATION]: stageModelConfigSchema.optional(),
  [PipelineStage.BOOK_VALIDATION]      : stageModelConfigSchema.optional(),
  [PipelineStage.FALLBACK]             : stageModelConfigSchema.optional()
});

export const modelStrategyScopeSchema = z.enum(["GLOBAL", "BOOK", "JOB"]);

export type ModelStrategyScope = z.infer<typeof modelStrategyScopeSchema>;
export type StageModelConfigDto = z.infer<typeof stageModelConfigSchema>;
export type StrategyStagesDto = z.infer<typeof strategyStagesSchema>;

export interface ModelStrategyDto {
  id       : string;
  scope    : ModelStrategyScope;
  bookId   : string | null;
  jobId    : string | null;
  stages   : StrategyStagesDto;
  createdAt: string;
  updatedAt: string;
}
