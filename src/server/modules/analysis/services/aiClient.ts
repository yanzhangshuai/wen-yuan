import type { AiProviderClient } from "@/server/providers/ai";
import { buildChapterAnalysisPrompt, buildRosterDiscoveryPrompt, buildTitleResolutionPrompt, type BuildPromptInput, type RosterDiscoveryInput } from "@/server/modules/analysis/services/prompts";
import { type ChapterAnalysisResponse, type EnhancedChapterRosterEntry, type TitleResolutionEntry, type TitleResolutionInput, parseChapterAnalysisResponse, parseEnhancedChapterRosterResponse, parseTitleResolutionResponse } from "@/types/analysis";

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
 * 输入：AnalyzeChunkInput / RosterDiscoveryInput。
 * 输出：ChapterAnalysisResponse / EnhancedChapterRosterEntry[]。
 * 异常：由具体实现决定。
 * 副作用：由具体实现决定。
 */
export interface AiAnalysisClient {
  analyzeChapterChunk(input: AnalyzeChunkInput): Promise<ChapterAnalysisResponse>;
  /**
   * 功能：Phase 1 人物名册发现——读取完整章节正文，返回本章所有称谓的预解析映射。
   * 输入：RosterDiscoveryInput（完整章节内容 + 已知人物档案）。
   * 输出：ChapterRosterEntry 数组（surfaceForm → entityId/isNew/generic/isTitleOnly）。
   * 异常：AI 调用失败时抛错。
   * 副作用：发起外部 AI 请求。
   */
  discoverChapterRoster(input: RosterDiscoveryInput): Promise<EnhancedChapterRosterEntry[]>;
  /**
   * 功能：Phase 5 称号真名溯源——批量推断 TITLE_ONLY Persona 的历史真名。
   * 输入：TitleResolutionInput（书名 + 称号列表 + 书中摘要）。
   * 输出：TitleResolutionEntry 数组（包含 realName, confidence, historicalNote）。
   * 异常：AI 调用失败时抛错。
   * 副作用：发起外部 AI 请求。
   */
  resolvePersonaTitles(input: TitleResolutionInput): Promise<TitleResolutionEntry[]>;
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
    },

    async discoverChapterRoster(input: RosterDiscoveryInput): Promise<EnhancedChapterRosterEntry[]> {
      const prompt = buildRosterDiscoveryPrompt(input);
      const raw = await providerClient.generateJson(prompt);
      return parseEnhancedChapterRosterResponse(raw);
    },

    async resolvePersonaTitles(input: TitleResolutionInput): Promise<TitleResolutionEntry[]> {
      const prompt = buildTitleResolutionPrompt(input);
      const raw = await providerClient.generateJson(prompt);
      // 构建称号 → personaId 映射，供解析函数还原 ID。
      const personaIdByTitle = new Map(input.entries.map((e) => [e.title, e.personaId]));
      return parseTitleResolutionResponse(raw, personaIdByTitle);
    }
  };
}
