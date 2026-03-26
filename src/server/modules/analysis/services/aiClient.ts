import type { AiProviderClient } from "@/server/providers/ai";
import { buildChapterAnalysisPrompt, type BuildPromptInput } from "@/server/modules/analysis/services/prompts";
import { type ChapterAnalysisResponse, parseChapterAnalysisResponse } from "@/types/analysis";

/**
 * 功能：定义章节分段 AI 分析输入参数。
 * 输入：无。
 * 输出：类型约束 AnalyzeChunkInput。
 * 异常：无。
 * 副作用：无。
 */
export type AnalyzeChunkInput = BuildPromptInput;

/**
 * 功能：定义章节分析场景的 AI 抽象接口。
 * 输入：AnalyzeChunkInput。
 * 输出：ChapterAnalysisResponse。
 * 异常：由具体实现决定。
 * 副作用：由具体实现决定。
 */
export interface AiAnalysisClient {
  analyzeChapterChunk(input: AnalyzeChunkInput): Promise<ChapterAnalysisResponse>;
}

/**
 * 功能：创建章节分析 AI 客户端（Prompt 构建 + 结果解析）。
 * 输入：providerClient - 底层 AI provider（由上层按数据库模型配置注入）。
 * 输出：AiAnalysisClient 实例。
 * 异常：由 provider 调用或 JSON 解析失败触发。
 * 副作用：发起外部 AI 请求（调用时）。
 */
export function createChapterAnalysisAiClient(
  providerClient: AiProviderClient
): AiAnalysisClient {
  return {
    async analyzeChapterChunk(input: AnalyzeChunkInput): Promise<ChapterAnalysisResponse> {
      const prompt = buildChapterAnalysisPrompt(input);
      const raw = await providerClient.generateJson(prompt);
      return parseChapterAnalysisResponse(raw);
    }
  };
}
