/**
 * AI 阶段调用封装：将 4 个分析阶段的 AI 调用逻辑从 ChapterAnalysisService 工厂中提取。
 * 每个函数接受 stageAiCallExecutor 作为参数，不依赖闭包状态。
 */

import { createAiProviderClient } from "@/server/providers/ai";
import { resolvePromptTemplate } from "@/server/modules/knowledge";
import {
  buildChapterAnalysisRulesText,
  buildIndependentExtractionRulesText,
  buildRosterDiscoveryRulesText,
  type BuildPromptInput,
  type IndependentExtractionInput,
  type RosterDiscoveryInput
} from "@/server/modules/analysis/services/prompts";
import { toGenerateOptions } from "@/server/modules/analysis/services/helpers/chunk-utils";
import type { AiCallExecutor } from "@/server/modules/analysis/services/AiCallExecutor";
import type {
  ChapterAnalysisResponse,
  EnhancedChapterRosterEntry,
  TitleArbitrationInput,
  TitleResolutionInput
} from "@/types/analysis";
import {
  parseChapterAnalysisResponse,
  parseEnhancedChapterRosterResponse,
  parseIndependentExtractionResponse,
  parseTitleArbitrationResponse,
  parseTitleResolutionResponse
} from "@/types/analysis";
import { PipelineStage } from "@/types/pipeline";

// ── ROSTER_DISCOVERY ────────────────────────────────────────────────────

export async function discoverRosterByStage(
  input: {
    chapterId   : string;
    stageContext: { bookId: string; jobId: string };
    rosterInput : RosterDiscoveryInput;
    chunkIndex? : number;
  },
  executor: AiCallExecutor
): Promise<EnhancedChapterRosterEntry[]> {
  const prompt = await resolvePromptTemplate({
    slug        : "ROSTER_DISCOVERY",
    replacements: {
      bookTitle    : input.rosterInput.bookTitle,
      chapterNo    : String(input.rosterInput.chapterNo),
      chapterTitle : input.rosterInput.chapterTitle,
      knownEntities: input.rosterInput.profiles.map((profile, index) => {
        const uniqueAliases = profile.aliases.filter((alias) => alias !== profile.canonicalName);
        const aliasStr = uniqueAliases.length > 0 ? uniqueAliases.join(",") : "无";
        return `[${index + 1}] ${profile.canonicalName}|${aliasStr}`;
      }).join("\n") || "（本书目前尚无已建档人物）",
      rosterRules  : buildRosterDiscoveryRulesText(input.rosterInput),
      content      : input.rosterInput.content,
      genericTitles: input.rosterInput.genericTitlesExample ?? ""
    }
  });
  const result = await executor.execute({
    stage     : PipelineStage.ROSTER_DISCOVERY,
    prompt,
    jobId     : input.stageContext.jobId,
    chapterId : input.chapterId,
    chunkIndex: input.chunkIndex,
    context   : input.stageContext,
    callFn    : async ({ model }) => {
      const providerClient = createAiProviderClient({
        provider : model.provider,
        protocol : model.protocol,
        apiKey   : model.apiKey,
        baseUrl  : model.baseUrl,
        modelName: model.modelName
      });
      const aiResult = await providerClient.generateJson(prompt, toGenerateOptions(model));
      return {
        data : parseEnhancedChapterRosterResponse(aiResult.content),
        usage: aiResult.usage
      };
    }
  });

  return result.data;
}

// ── CHUNK_EXTRACTION ────────────────────────────────────────────────────

export async function analyzeChunkByStage(
  input: {
    chapterId   : string;
    stageContext: { bookId: string; jobId: string };
    chunkInput  : BuildPromptInput;
    chunkIndex  : number;
  },
  executor: AiCallExecutor
): Promise<ChapterAnalysisResponse> {
  const prompt = await resolvePromptTemplate({
    slug        : "CHAPTER_ANALYSIS",
    replacements: {
      bookTitle                 : input.chunkInput.bookTitle,
      chapterNo                 : String(input.chunkInput.chapterNo),
      chapterTitle              : input.chunkInput.chapterTitle,
      content                   : input.chunkInput.content,
      chunkIndex                : String(input.chunkInput.chunkIndex + 1),
      chunkCount                : String(input.chunkInput.chunkCount),
      genericTitles             : input.chunkInput.genericTitlesExample ?? "",
      analysisRules             : buildChapterAnalysisRulesText(input.chunkInput),
      relationshipTypeDictionary: input.chunkInput.relationshipTypeDictionary ?? "",
      knownEntities             : input.chunkInput.profiles.map((profile, index) => {
        const uniqueAliases = profile.aliases.filter((alias) => alias !== profile.canonicalName);
        const aliasStr = uniqueAliases.length > 0 ? uniqueAliases.join(",") : "无";
        return `[${index + 1}] ${profile.canonicalName}|${aliasStr}`;
      }).join("\n") || "（本书目前尚无已建档人物）"
    }
  });
  const result = await executor.execute({
    stage     : PipelineStage.CHUNK_EXTRACTION,
    prompt,
    jobId     : input.stageContext.jobId,
    chapterId : input.chapterId,
    chunkIndex: input.chunkIndex,
    context   : input.stageContext,
    callFn    : async ({ model }) => {
      const providerClient = createAiProviderClient({
        provider : model.provider,
        protocol : model.protocol,
        apiKey   : model.apiKey,
        baseUrl  : model.baseUrl,
        modelName: model.modelName
      });
      const aiResult = await providerClient.generateJson(prompt, toGenerateOptions(model));
      return {
        data : parseChapterAnalysisResponse(aiResult.content),
        usage: aiResult.usage
      };
    }
  });

  return result.data;
}

// ── TITLE_RESOLUTION ────────────────────────────────────────────────────

export async function resolveTitlesByStage(
  input: {
    stageContext: { bookId: string; jobId: string };
    titleInput  : TitleResolutionInput;
  },
  executor: AiCallExecutor
) {
  const prompt = await resolvePromptTemplate({
    slug        : "TITLE_RESOLUTION",
    replacements: {
      bookTitle   : input.titleInput.bookTitle,
      titleEntries: input.titleInput.entries.map((entry) => `| ${entry.title} | ${entry.localSummary ?? ""} |`).join("\n")
    }
  });
  const result = await executor.execute({
    stage  : PipelineStage.TITLE_RESOLUTION,
    prompt,
    jobId  : input.stageContext.jobId,
    context: input.stageContext,
    callFn : async ({ model }) => {
      const providerClient = createAiProviderClient({
        provider : model.provider,
        protocol : model.protocol,
        apiKey   : model.apiKey,
        baseUrl  : model.baseUrl,
        modelName: model.modelName
      });
      const aiResult = await providerClient.generateJson(prompt, toGenerateOptions(model));
      const personaIdByTitle = new Map(input.titleInput.entries.map((e) => [e.title, e.personaId]));
      return {
        data : parseTitleResolutionResponse(aiResult.content, personaIdByTitle),
        usage: aiResult.usage
      };
    }
  });

  return result.data;
}

// ── GRAY_ZONE_ARBITRATION ───────────────────────────────────────────────

export async function arbitrateGrayZoneByStage(
  input: {
    stageContext    : { bookId: string; jobId: string };
    arbitrationInput: TitleArbitrationInput;
  },
  executor: AiCallExecutor
) {
  const prompt = await resolvePromptTemplate({
    slug        : "TITLE_ARBITRATION",
    replacements: {
      bookTitle: input.arbitrationInput.bookTitle,
      terms    : input.arbitrationInput.terms.map((item) =>
        `- "${item.surfaceForm}" (chapterAppearanceCount=${item.chapterAppearanceCount}, hasStableAliasBinding=${item.hasStableAliasBinding}, singlePersonaConsistency=${item.singlePersonaConsistency}, genericRatio=${item.genericRatio.toFixed(2)})`
      ).join("\n")
    }
  });
  const result = await executor.execute({
    stage  : PipelineStage.GRAY_ZONE_ARBITRATION,
    prompt,
    jobId  : input.stageContext.jobId,
    context: input.stageContext,
    callFn : async ({ model }) => {
      const providerClient = createAiProviderClient({
        provider : model.provider,
        protocol : model.protocol,
        apiKey   : model.apiKey,
        baseUrl  : model.baseUrl,
        modelName: model.modelName
      });
      const aiResult = await providerClient.generateJson(prompt, toGenerateOptions(model));
      return {
        data : parseTitleArbitrationResponse(aiResult.content),
        usage: aiResult.usage
      };
    }
  });

  return result.data;
}

// ── INDEPENDENT_EXTRACTION ──────────────────────────────────────────────

export async function extractChapterEntitiesByStage(
  input: {
    chapterId      : string;
    stageContext   : { bookId: string; jobId: string };
    extractionInput: IndependentExtractionInput;
  },
  executor: AiCallExecutor
) {
  const prompt = await resolvePromptTemplate({
    slug        : "INDEPENDENT_EXTRACTION",
    replacements: {
      bookTitle       : input.extractionInput.bookTitle,
      chapterNo       : String(input.extractionInput.chapterNo),
      chapterTitle    : input.extractionInput.chapterTitle,
      independentRules: buildIndependentExtractionRulesText(input.extractionInput),
      content         : input.extractionInput.content
    }
  });

  const result = await executor.execute({
    stage    : PipelineStage.INDEPENDENT_EXTRACTION,
    prompt,
    jobId    : input.stageContext.jobId,
    chapterId: input.chapterId,
    context  : input.stageContext,
    callFn   : async ({ model }) => {
      const providerClient = createAiProviderClient({
        provider : model.provider,
        protocol : model.protocol,
        apiKey   : model.apiKey,
        baseUrl  : model.baseUrl,
        modelName: model.modelName
      });
      const aiResult = await providerClient.generateJson(prompt, toGenerateOptions(model));
      const entities = parseIndependentExtractionResponse(aiResult.content);
      return { data: entities, usage: aiResult.usage };
    }
  });

  return result;
}
