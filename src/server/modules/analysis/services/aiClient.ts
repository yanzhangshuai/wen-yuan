import type { AiGenerateOptions, AiProviderClient } from "@/server/providers/ai";
import { buildChapterAnalysisPrompt, buildRosterDiscoveryPrompt, buildTitleArbitrationPrompt, buildTitleResolutionPrompt, type BuildPromptInput, type RosterDiscoveryInput } from "@/server/modules/analysis/services/prompts";
import { type ChapterAnalysisResponse, type EnhancedChapterRosterEntry, type TitleArbitrationEntry, type TitleArbitrationInput, type TitleResolutionEntry, type TitleResolutionInput, parseChapterAnalysisResponse, parseEnhancedChapterRosterResponse, parseTitleArbitrationResponse, parseTitleResolutionResponse } from "@/types/analysis";
import type { AiCallFnResult } from "@/types/pipeline";

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
  analyzeChapterChunk(input: AnalyzeChunkInput, options?: AiGenerateOptions): Promise<ChapterAnalysisResponse>;
  analyzeChapterChunkWithUsage(input: AnalyzeChunkInput, options?: AiGenerateOptions): Promise<AiCallFnResult<ChapterAnalysisResponse>>;
  /**
   * 功能：Phase 1 人物名册发现——读取完整章节正文，返回本章所有称谓的预解析映射。
   * 输入：RosterDiscoveryInput（完整章节内容 + 已知人物档案）。
   * 输出：ChapterRosterEntry 数组（surfaceForm → entityId/isNew/generic/isTitleOnly）。
   * 异常：AI 调用失败时抛错。
   * 副作用：发起外部 AI 请求。
   */
  discoverChapterRoster(input: RosterDiscoveryInput, options?: AiGenerateOptions): Promise<EnhancedChapterRosterEntry[]>;
  discoverChapterRosterWithUsage(input: RosterDiscoveryInput, options?: AiGenerateOptions): Promise<AiCallFnResult<EnhancedChapterRosterEntry[]>>;
  /**
   * 功能：Phase 5 称号真名溯源——批量推断 TITLE_ONLY Persona 的历史真名。
   * 输入：TitleResolutionInput（书名 + 称号列表 + 书中摘要）。
   * 输出：TitleResolutionEntry 数组（包含 realName, confidence, historicalNote）。
   * 异常：AI 调用失败时抛错。
   * 副作用：发起外部 AI 请求。
   */
  resolvePersonaTitles(input: TitleResolutionInput, options?: AiGenerateOptions): Promise<TitleResolutionEntry[]>;
  resolvePersonaTitlesWithUsage(input: TitleResolutionInput, options?: AiGenerateOptions): Promise<AiCallFnResult<TitleResolutionEntry[]>>;
  arbitrateTitlePersonalization?(input: TitleArbitrationInput, options?: AiGenerateOptions): Promise<TitleArbitrationEntry[]>;
  arbitrateTitlePersonalizationWithUsage?(input: TitleArbitrationInput, options?: AiGenerateOptions): Promise<AiCallFnResult<TitleArbitrationEntry[]>>;
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
    async analyzeChapterChunkWithUsage(
      input: AnalyzeChunkInput,
      options?: AiGenerateOptions
    ): Promise<AiCallFnResult<ChapterAnalysisResponse>> {
      const prompt = buildChapterAnalysisPrompt(input);
      const result = await providerClient.generateJson(prompt, options);
      return {
        data : parseChapterAnalysisResponse(result.content),
        usage: result.usage
      };
    },

    async analyzeChapterChunk(input: AnalyzeChunkInput, options?: AiGenerateOptions): Promise<ChapterAnalysisResponse> {
      const result = await this.analyzeChapterChunkWithUsage(input, options);
      return result.data;
    },

    async discoverChapterRosterWithUsage(
      input: RosterDiscoveryInput,
      options?: AiGenerateOptions
    ): Promise<AiCallFnResult<EnhancedChapterRosterEntry[]>> {
      const prompt = buildRosterDiscoveryPrompt(input);
      const result = await providerClient.generateJson(prompt, options);
      return {
        data : parseEnhancedChapterRosterResponse(result.content),
        usage: result.usage
      };
    },

    async discoverChapterRoster(input: RosterDiscoveryInput, options?: AiGenerateOptions): Promise<EnhancedChapterRosterEntry[]> {
      const result = await this.discoverChapterRosterWithUsage(input, options);
      return result.data;
    },

    async resolvePersonaTitlesWithUsage(
      input: TitleResolutionInput,
      options?: AiGenerateOptions
    ): Promise<AiCallFnResult<TitleResolutionEntry[]>> {
      const prompt = buildTitleResolutionPrompt(input);
      const result = await providerClient.generateJson(prompt, options);
      // 构建称号 → personaId 映射，供解析函数还原 ID。
      const personaIdByTitle = new Map(input.entries.map((e) => [e.title, e.personaId]));
      return {
        data : parseTitleResolutionResponse(result.content, personaIdByTitle),
        usage: result.usage
      };
    },

    async resolvePersonaTitles(input: TitleResolutionInput, options?: AiGenerateOptions): Promise<TitleResolutionEntry[]> {
      const result = await this.resolvePersonaTitlesWithUsage(input, options);
      return result.data;
    },

    async arbitrateTitlePersonalizationWithUsage(
      input: TitleArbitrationInput,
      options?: AiGenerateOptions
    ): Promise<AiCallFnResult<TitleArbitrationEntry[]>> {
      const prompt = buildTitleArbitrationPrompt(input);
      const result = await providerClient.generateJson(prompt, options);
      return {
        data : parseTitleArbitrationResponse(result.content),
        usage: result.usage
      };
    },

    async arbitrateTitlePersonalization(input: TitleArbitrationInput, options?: AiGenerateOptions): Promise<TitleArbitrationEntry[]> {
      const result = await this.arbitrateTitlePersonalizationWithUsage?.(input, options);
      return result?.data ?? [];
    }
  };
}
