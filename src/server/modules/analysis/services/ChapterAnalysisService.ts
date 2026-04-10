import { BioCategory, ProcessingStatus } from "@/generated/prisma/enums";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { createAiProviderClient } from "@/server/providers/ai";
import { aliasRegistryService, type AliasRegistryService } from "@/server/modules/analysis/services/AliasRegistryService";
import { createChapterAnalysisAiClient, type AiAnalysisClient } from "@/server/modules/analysis/services/aiClient";
import { aiCallExecutor, type AiCallExecutor } from "@/server/modules/analysis/services/AiCallExecutor";
import {
  createModelStrategyResolver,
  type ModelStrategyResolver,
  type ResolvedFallbackModel,
  type ResolvedStageModel
} from "@/server/modules/analysis/services/ModelStrategyResolver";
import { createPersonaResolver, type ResolveResult } from "@/server/modules/analysis/services/PersonaResolver";
import { createMergePersonasService } from "@/server/modules/personas/mergePersonas";
import { buildChapterAnalysisPrompt, buildIndependentExtractionPrompt, buildRosterDiscoveryPrompt, buildTitleArbitrationPrompt, buildTitleResolutionPrompt } from "@/server/modules/analysis/services/prompts";
import {
  type BookLexiconConfig,
  type MentionPersonalizationEvidence,
  buildEffectiveGenericTitles,
  GENERIC_TITLES_PROMPT_LIMIT
} from "@/server/modules/analysis/config/lexicon";
import { ANALYSIS_PIPELINE_CONFIG, DEFAULT_GENRE_PRESET, GENRE_PRESETS } from "@/server/modules/analysis/config/pipeline";
import type {
  AnalysisProfileContext,
  BioCategoryValue,
  ChapterAnalysisResponse,
  ChapterEntityList,
  EnhancedChapterRosterEntry,
  TitleArbitrationInput,
  TitleResolutionInput,
  RegisterAliasInput
} from "@/types/analysis";
import { parseIndependentExtractionResponse } from "@/types/analysis";
import { PipelineStage } from "@/types/pipeline";

/**
 * 文件定位（Next.js 服务端分析核心）：
 * - 本文件是章节解析流水线的主服务，位于 `src/server/modules/analysis/services`。
 * - 它不直接承载路由，而是由 `runAnalysisJob` 在服务端调用，完成“章节 -> 人物/提及/关系/生平”结构化入库。
 *
 * 核心职责：
 * - 组织 Prompt、调用 AI、合并分段结果，并把结果映射成数据库实体；
 * - 与 PersonaResolver / AliasRegistry / ValidationAgent / ModelStrategyResolver 协同，完成识别、纠偏与策略执行；
 * - 提供称号真名溯源、灰区仲裁等后处理能力，降低泛化称谓误识别风险。
 *
 * 运行环境与边界：
 * - 仅在 Node.js 服务端运行（依赖 Prisma 与外部模型调用），不可在客户端执行。
 * - 文件中的阈值、去重键、证据截断等规则是业务规则，改动会影响数据质量与审核成本。
 */
// 同时解析的分段数，避免触发 API 频控，同时控制单章处理时长。
const AI_CONCURRENCY = ANALYSIS_PIPELINE_CONFIG.chunkAiConcurrency;
// relationship evidence 仅保留前 5 条，避免异常长证据链污染最终结构化结果。
const RELATIONSHIP_EVIDENCE_LIMIT = 5;
const GENERIC_IRONY_PATTERNS: readonly RegExp[] = [
  /批判(了|的是)?社会/,
  /揭露(了|的是)?(社会|官场|制度)/,
  /反映(了|的是)?现实/,
  /封建(礼教|社会)/,
  /辛辣?讽刺/,
  /社会(现实)?(黑暗|腐败)/
];

/**
 * 功能：定义章节分析完成后的统计结果结构。
 * 输入：无。
 * 输出：类型约束 ChapterAnalysisResult。
 * 异常：无。
 * 副作用：无。
 */
export interface ChapterAnalysisResult {
  /** 本次完成解析的章节 ID。 */
  chapterId         : string;
  /** 章节被拆分成的 AI 分段数量。 */
  chunkCount        : number;
  /** 被判定为幻觉并过滤的实体数量。 */
  hallucinationCount: number;
  /** 本章实际新增数据计数（写库后统计）。 */
  created: {
    /** 新建 persona 数量。 */
    personas     : number;
    /** 新建 mention 数量。 */
    mentions     : number;
    /** 新建 biography 数量。 */
    biographies  : number;
    /** 新建 relationship 数量。 */
    relationships: number;
  };
  /** 灰区称谓数量（仅启用灰区判定时返回）。 */
  grayZoneCount?: number;
}

export interface GrayZoneMentionRecord {
  /** 灰区称谓原文。 */
  surfaceForm: string;
  /** 灰区判定证据（出现章节数、绑定稳定性、泛化比率等）。 */
  evidence   : MentionPersonalizationEvidence;
}

/**
 * mention 去重键约定：
 * - paraIndex 存在时优先使用 personaName + rawText + paraIndex，避免跨段误去重；
 * - paraIndex 缺失时降级到 personaName + rawText，兼容历史输出。
 * - 该函数只负责“键生成”，不承担标准化写回；这样便于在测试中单独验证去重语义。
 */
function buildMentionDedupKey(mention: ChapterAnalysisResponse["mentions"][number]): string {
  const baseKey = `${mention.personaName}||${mention.rawText}`;
  return typeof mention.paraIndex === "number"
    ? `${baseKey}||${mention.paraIndex}`
    : baseKey;
}

/**
 * 统一合并 Phase 1 人物名册结果：
 * - 优先按 suggestedRealName + aliasType 聚合（对应文档中的 normalizedName + titleType）；
 * - 若缺失 suggestedRealName，则退化到 surfaceForm + aliasType。
 */
export function mergeRosterEntriesForAnalysis(entries: EnhancedChapterRosterEntry[]): EnhancedChapterRosterEntry[] {
  const rosterMap = new Map<string, EnhancedChapterRosterEntry>();

  for (const entry of entries) {
    const surfaceForm = entry.surfaceForm.trim();
    if (!surfaceForm) continue;

    const normalizedName = entry.suggestedRealName?.trim().toLowerCase();
    const typeKey = entry.aliasType ?? "_";
    const dedupBase = normalizedName && normalizedName.length > 0
      ? normalizedName
      : surfaceForm.toLowerCase();
    const dedupKey = `${dedupBase}||${typeKey}`;

    const normalized: EnhancedChapterRosterEntry = {
      ...entry,
      surfaceForm
    };
    const existing = rosterMap.get(dedupKey);
    if (!existing) {
      rosterMap.set(dedupKey, normalized);
      continue;
    }

    // 合并策略：保留“更完整且更可信”的字段，避免后写入的弱信息覆盖强信息。
    rosterMap.set(dedupKey, {
      ...existing,
      ...normalized,
      surfaceForm,
      entityId         : existing.entityId ?? normalized.entityId,
      isNew            : existing.isNew || normalized.isNew,
      generic          : existing.generic && normalized.generic,
      isTitleOnly      : existing.isTitleOnly || normalized.isTitleOnly,
      suggestedRealName: existing.suggestedRealName ?? normalized.suggestedRealName,
      aliasType        : existing.aliasType ?? normalized.aliasType,
      aliasConfidence  : Math.max(existing.aliasConfidence ?? 0, normalized.aliasConfidence ?? 0),
      contextHint      : existing.contextHint ?? normalized.contextHint
    });
  }

  return Array.from(rosterMap.values());
}

/**
 * 分段结果聚合：
 * - mention：按 paraIndex 感知去重，减少跨段误折叠；
 * - relationship：同键关系保留最大权重，并聚合证据；
 * - evidence 聚合后截断到 5 条，防止异常长链污染结果与日志。
 */
export function mergeChunkResultsForAnalysis(results: ChapterAnalysisResponse[]): ChapterAnalysisResponse {
  const mentionMap = new Map<string, ChapterAnalysisResponse["mentions"][number]>();
  const biographyMap = new Map<string, ChapterAnalysisResponse["biographies"][number]>();
  const relationshipMap = new Map<string, ChapterAnalysisResponse["relationships"][number]>();

  for (const result of results) {
    for (const mention of result.mentions) {
      const key = buildMentionDedupKey(mention);
      if (!mentionMap.has(key)) {
        mentionMap.set(key, mention);
      }
    }

    for (const biography of result.biographies) {
      const key = `${biography.personaName}||${biography.event}`;
      if (!biographyMap.has(key)) {
        biographyMap.set(key, biography);
      }
    }

    for (const relationship of result.relationships) {
      const key = `${relationship.sourceName}||${relationship.targetName}||${relationship.type}`;
      const existing = relationshipMap.get(key);
      if (!existing) {
        relationshipMap.set(key, { ...relationship });
        continue;
      }

      // 证据字段可能已经是“；”拼接串，这里按分号拆分去重并限制上限。
      const evidences = new Set<string>();
      for (const evidenceChunk of [existing.evidence, relationship.evidence]) {
        if (!evidenceChunk) {
          continue;
        }
        for (const item of evidenceChunk.split("；")) {
          const trimmed = item.trim();
          if (trimmed) {
            evidences.add(trimmed);
          }
          if (evidences.size >= RELATIONSHIP_EVIDENCE_LIMIT) {
            break;
          }
        }
        if (evidences.size >= RELATIONSHIP_EVIDENCE_LIMIT) {
          break;
        }
      }

      relationshipMap.set(key, {
        ...existing,
        // 权重采用最大值，避免高置信边被后续低置信片段“冲淡”。
        weight     : Math.max(existing.weight ?? 0, relationship.weight ?? 0) || undefined,
        description: existing.description ?? relationship.description,
        evidence   : Array.from(evidences).filter(Boolean).slice(0, RELATIONSHIP_EVIDENCE_LIMIT).join("；") || undefined
      });
    }
  }

  return {
    biographies  : Array.from(biographyMap.values()),
    mentions     : Array.from(mentionMap.values()),
    relationships: Array.from(relationshipMap.values())
  };
}

/**
 * 功能：创建章节分析服务，执行章节分析主流程并写入结构化文学数据。
 * 输入：prismaClient、aiClient（均可注入，便于测试）。
 * 输出：包含 analyzeChapter 方法的服务对象。
 * 异常：章节不存在、AI 调用失败、数据库失败时抛错。
 * 副作用：写入/删除 mentions、biography_records、relationships、personas、profiles。
 */
export function createChapterAnalysisService(
  prismaClient: PrismaClient = prisma,
  aiClient?: AiAnalysisClient,
  aliasRegistry?: AliasRegistryService,
  stageAiCallExecutor: AiCallExecutor = aiCallExecutor,
  strategyResolver: ModelStrategyResolver = createModelStrategyResolver(prismaClient)
) {
  const personaResolver = createPersonaResolver(prismaClient, aliasRegistry);
  const { mergePersonas } = createMergePersonasService(prismaClient);
  const grayZoneMentionStore = new Map<string, Map<string, MentionPersonalizationEvidence>>();

  function recordGrayZoneMention(
    bookId: string,
    name: string,
    evidence: MentionPersonalizationEvidence
  ): void {
    const bookStore = grayZoneMentionStore.get(bookId) ?? new Map<string, MentionPersonalizationEvidence>();
    const existing = bookStore.get(name);
    if (!existing || evidence.chapterAppearanceCount >= existing.chapterAppearanceCount) {
      bookStore.set(name, evidence);
    }
    grayZoneMentionStore.set(bookId, bookStore);
  }

  const runtimeAiClientCache = new Map<string, AiAnalysisClient>();

  interface AnalysisExecutionContext {
    jobId?             : string;
    /** Pass 2 全局消歧后的映射表（surfaceForm → personaId），提供时跳过 ROSTER_DISCOVERY。 */
    externalPersonaMap?: Map<string, string>;
  }

  function toGenerateOptions(model: ResolvedStageModel | ResolvedFallbackModel) {
    return {
      temperature    : model.params.temperature,
      maxOutputTokens: model.params.maxOutputTokens,
      topP           : model.params.topP,
      ...(typeof model.params.enableThinking === "boolean"
        ? { enableThinking: model.params.enableThinking }
        : {}),
      ...(model.params.reasoningEffort
        ? { reasoningEffort: model.params.reasoningEffort }
        : {})
    };
  }

  function getRuntimeAiClient(model: ResolvedStageModel | ResolvedFallbackModel): AiAnalysisClient {
    if (aiClient) {
      return aiClient;
    }

    const cached = runtimeAiClientCache.get(model.modelId);
    if (cached) {
      return cached;
    }

    const providerClient = createAiProviderClient({
      provider : model.provider,
      apiKey   : model.apiKey,
      baseUrl  : model.baseUrl,
      modelName: model.modelName
    });
    const createdClient = createChapterAnalysisAiClient(providerClient);
    runtimeAiClientCache.set(model.modelId, createdClient);
    return createdClient;
  }

  async function discoverRosterByStage(input: {
    chapterId   : string;
    stageContext: { bookId: string; jobId?: string };
    rosterInput : Parameters<AiAnalysisClient["discoverChapterRoster"]>[0];
    chunkIndex? : number;
  }): Promise<EnhancedChapterRosterEntry[]> {
    if (!input.stageContext.jobId) {
      if (aiClient) {
        if (aiClient.discoverChapterRosterWithUsage) {
          const result = await aiClient.discoverChapterRosterWithUsage(input.rosterInput);
          return result.data;
        }

        return await aiClient.discoverChapterRoster(input.rosterInput);
      }

      const model = await strategyResolver.resolveForStage(PipelineStage.ROSTER_DISCOVERY, {
        bookId: input.stageContext.bookId
      });
      const runtimeClient = getRuntimeAiClient(model);
      const result = runtimeClient.discoverChapterRosterWithUsage
        ? await runtimeClient.discoverChapterRosterWithUsage(input.rosterInput, toGenerateOptions(model))
        : {
          data : await runtimeClient.discoverChapterRoster(input.rosterInput, toGenerateOptions(model)),
          usage: null
        };
      return result.data;
    }

    const prompt = buildRosterDiscoveryPrompt(input.rosterInput);
    const result = await stageAiCallExecutor.execute({
      stage     : PipelineStage.ROSTER_DISCOVERY,
      prompt,
      jobId     : input.stageContext.jobId,
      chapterId : input.chapterId,
      chunkIndex: input.chunkIndex,
      context   : input.stageContext,
      callFn    : async ({ model }) => {
        const runtimeClient = getRuntimeAiClient(model);
        if (runtimeClient.discoverChapterRosterWithUsage) {
          return await runtimeClient.discoverChapterRosterWithUsage(input.rosterInput, toGenerateOptions(model));
        }

        const data = await runtimeClient.discoverChapterRoster(input.rosterInput, toGenerateOptions(model));
        return { data, usage: null };
      }
    });

    return result.data;
  }

  async function analyzeChunkByStage(input: {
    chapterId   : string;
    stageContext: { bookId: string; jobId?: string };
    chunkInput  : Parameters<AiAnalysisClient["analyzeChapterChunk"]>[0];
    chunkIndex  : number;
  }): Promise<ChapterAnalysisResponse> {
    if (!input.stageContext.jobId) {
      if (aiClient) {
        if (aiClient.analyzeChapterChunkWithUsage) {
          const result = await aiClient.analyzeChapterChunkWithUsage(input.chunkInput);
          return result.data;
        }

        return await aiClient.analyzeChapterChunk(input.chunkInput);
      }

      const model = await strategyResolver.resolveForStage(PipelineStage.CHUNK_EXTRACTION, {
        bookId: input.stageContext.bookId
      });
      const runtimeClient = getRuntimeAiClient(model);
      const result = runtimeClient.analyzeChapterChunkWithUsage
        ? await runtimeClient.analyzeChapterChunkWithUsage(input.chunkInput, toGenerateOptions(model))
        : {
          data : await runtimeClient.analyzeChapterChunk(input.chunkInput, toGenerateOptions(model)),
          usage: null
        };
      return result.data;
    }

    const prompt = buildChapterAnalysisPrompt(input.chunkInput);
    const result = await stageAiCallExecutor.execute({
      stage     : PipelineStage.CHUNK_EXTRACTION,
      prompt,
      jobId     : input.stageContext.jobId,
      chapterId : input.chapterId,
      chunkIndex: input.chunkIndex,
      context   : input.stageContext,
      callFn    : async ({ model }) => {
        const runtimeClient = getRuntimeAiClient(model);
        if (runtimeClient.analyzeChapterChunkWithUsage) {
          return await runtimeClient.analyzeChapterChunkWithUsage(input.chunkInput, toGenerateOptions(model));
        }

        const data = await runtimeClient.analyzeChapterChunk(input.chunkInput, toGenerateOptions(model));
        return { data, usage: null };
      }
    });

    return result.data;
  }

  async function resolveTitlesByStage(input: {
    stageContext: { bookId: string; jobId?: string };
    titleInput  : TitleResolutionInput;
  }) {
    if (!input.stageContext.jobId) {
      if (aiClient) {
        if (aiClient.resolvePersonaTitlesWithUsage) {
          const result = await aiClient.resolvePersonaTitlesWithUsage(input.titleInput);
          return result.data;
        }

        return await aiClient.resolvePersonaTitles(input.titleInput);
      }

      const model = await strategyResolver.resolveForStage(PipelineStage.TITLE_RESOLUTION, {
        bookId: input.stageContext.bookId
      });
      const runtimeClient = getRuntimeAiClient(model);
      const result = runtimeClient.resolvePersonaTitlesWithUsage
        ? await runtimeClient.resolvePersonaTitlesWithUsage(input.titleInput, toGenerateOptions(model))
        : {
          data : await runtimeClient.resolvePersonaTitles(input.titleInput, toGenerateOptions(model)),
          usage: null
        };
      return result.data;
    }

    const prompt = buildTitleResolutionPrompt(input.titleInput);
    const result = await stageAiCallExecutor.execute({
      stage  : PipelineStage.TITLE_RESOLUTION,
      prompt,
      jobId  : input.stageContext.jobId,
      context: input.stageContext,
      callFn : async ({ model }) => {
        const runtimeClient = getRuntimeAiClient(model);
        if (runtimeClient.resolvePersonaTitlesWithUsage) {
          return await runtimeClient.resolvePersonaTitlesWithUsage(input.titleInput, toGenerateOptions(model));
        }

        const data = await runtimeClient.resolvePersonaTitles(input.titleInput, toGenerateOptions(model));
        return { data, usage: null };
      }
    });

    return result.data;
  }

  async function arbitrateGrayZoneByStage(input: {
    stageContext    : { bookId: string; jobId?: string };
    arbitrationInput: TitleArbitrationInput;
  }) {
    if (!input.stageContext.jobId) {
      if (aiClient) {
        if (aiClient.arbitrateTitlePersonalizationWithUsage) {
          const result = await aiClient.arbitrateTitlePersonalizationWithUsage(input.arbitrationInput);
          return result.data;
        }
        return aiClient.arbitrateTitlePersonalization
          ? await aiClient.arbitrateTitlePersonalization(input.arbitrationInput)
          : [];
      }

      const model = await strategyResolver.resolveForStage(PipelineStage.GRAY_ZONE_ARBITRATION, {
        bookId: input.stageContext.bookId
      });
      const runtimeClient = getRuntimeAiClient(model);
      if (runtimeClient.arbitrateTitlePersonalizationWithUsage) {
        const result = await runtimeClient.arbitrateTitlePersonalizationWithUsage(
          input.arbitrationInput,
          toGenerateOptions(model)
        );
        return result.data;
      }
      return runtimeClient.arbitrateTitlePersonalization
        ? await runtimeClient.arbitrateTitlePersonalization(input.arbitrationInput, toGenerateOptions(model))
        : [];
    }

    const prompt = buildTitleArbitrationPrompt(input.arbitrationInput);
    const result = await stageAiCallExecutor.execute({
      stage  : PipelineStage.GRAY_ZONE_ARBITRATION,
      prompt,
      jobId  : input.stageContext.jobId,
      context: input.stageContext,
      callFn : async ({ model }) => {
        const runtimeClient = getRuntimeAiClient(model);
        if (runtimeClient.arbitrateTitlePersonalizationWithUsage) {
          return await runtimeClient.arbitrateTitlePersonalizationWithUsage(
            input.arbitrationInput,
            toGenerateOptions(model)
          );
        }

        const data = runtimeClient.arbitrateTitlePersonalization
          ? await runtimeClient.arbitrateTitlePersonalization(input.arbitrationInput, toGenerateOptions(model))
          : [];
        return { data, usage: null };
      }
    });

    return result.data;
  }

  /**
   * Phase 1 长章节保护：超过阈值时按更大的切片执行名册发现，再按称谓去重合并。
   */
  async function discoverRosterWithProtection(input: {
    chapterId     : string;
    chapterContent: string;
    stageContext  : { bookId: string; jobId?: string };
    rosterInput   : Omit<Parameters<AiAnalysisClient["discoverChapterRoster"]>[0], "content">;
  }): Promise<EnhancedChapterRosterEntry[]> {
    if (input.chapterContent.length <= ANALYSIS_PIPELINE_CONFIG.rosterMaxInputLength) {
      return await discoverRosterByStage({
        chapterId   : input.chapterId,
        stageContext: input.stageContext,
        rosterInput : {
          ...input.rosterInput,
          content: input.chapterContent
        }
      });
    }

    const rosterChunks = splitContentIntoChunks(
      input.chapterContent,
      ANALYSIS_PIPELINE_CONFIG.rosterChunkSize,
      ANALYSIS_PIPELINE_CONFIG.rosterChunkOverlap
    );
    const allEntries: EnhancedChapterRosterEntry[] = [];
    for (let index = 0; index < rosterChunks.length; index += 1) {
      const chunkRoster = await discoverRosterByStage({
        chapterId   : input.chapterId,
        stageContext: input.stageContext,
        chunkIndex  : index,
        rosterInput : {
          ...input.rosterInput,
          content: rosterChunks[index] ?? ""
        }
      });
      allEntries.push(...chunkRoster);
    }

    return mergeRosterEntries(allEntries);
  }

  /**
   * 功能：执行单章节分析主流程（读取、分段、AI 解析、事务落库）。
   * 输入：chapterId - 章节主键 UUID。
   * 输出：ChapterAnalysisResult 统计结果。
   * 异常：章节不存在、AI 调用失败、数据库失败时抛错。
   * 副作用：更新该章节的 mentions / biography_records / relationships 等数据。
   */
  async function analyzeChapter(chapterId: string, executionContext: AnalysisExecutionContext = {}): Promise<ChapterAnalysisResult> {
    log("analysis.start", { chapterId });

    const chapter = await prismaClient.chapter.findUnique({
      where  : { id: chapterId },
      include: {
        book: {
          include: {
            profiles: { include: { persona: true } }
          }
        }
      }
    });

    if (!chapter) throw new Error(`Chapter [${chapterId}] 不存在`);

    const profiles: AnalysisProfileContext[] = chapter.book.profiles.map(p => ({
      personaId    : p.personaId,
      canonicalName: p.persona.name,
      aliases      : Array.from(new Set([p.persona.name, p.localName, ...p.persona.aliases]))
        .filter((alias): alias is string => Boolean(alias)
      ),
      localSummary: p.localSummary
    }));
    const bookLexiconConfig = resolveBookLexiconConfig(chapter.book.genre);
    const effectiveGenericTitles = buildEffectiveGenericTitles(bookLexiconConfig);
    const genericTitlesExample = Array.from(effectiveGenericTitles).slice(0, GENERIC_TITLES_PROMPT_LIMIT).join("、") + "等";

    const stageContext = {
      bookId: chapter.bookId,
      jobId : executionContext.jobId
    };

    // Pass 3 模式：externalPersonaMap 由全局消歧阶段提供，跳过 ROSTER_DISCOVERY。
    const useExternalMap = executionContext.externalPersonaMap && executionContext.externalPersonaMap.size > 0;

    let rosterMap: Map<string, string>;
    let titleOnlyNames: Set<string>;
    let pendingRosterAliasMappings: RegisterAliasInput[];
    let resolvedGenericRatios: Map<string, { generic: number; nonGeneric: number }>;
    let chapterProfiles: AnalysisProfileContext[];

    if (useExternalMap) {
      // Pass 3: 使用全局消歧后的映射，无需 roster discovery
      rosterMap = executionContext.externalPersonaMap!;
      titleOnlyNames = new Set<string>();
      pendingRosterAliasMappings = [];
      resolvedGenericRatios = new Map();

      // 根据外部映射过滤 profiles 注入范围
      const referencedPersonaIds = new Set<string>();
      for (const [, value] of rosterMap) {
        if (value !== "GENERIC") referencedPersonaIds.add(value);
      }
      const floorSize = ANALYSIS_PIPELINE_CONFIG.chunkProfileFloor;
      const floorPersonaIds = new Set(profiles.slice(0, floorSize).map(p => p.personaId));
      chapterProfiles = referencedPersonaIds.size > 0
        ? profiles.filter(p => referencedPersonaIds.has(p.personaId) || floorPersonaIds.has(p.personaId))
        : profiles;

      log("analysis.pass3_external_map", { chapterId, mapSize: rosterMap.size, profileCount: chapterProfiles.length });
    } else {
      // 原始模式：Phase 1 全章人物名册发现
      const roster = await discoverRosterWithProtection({
        chapterId     : chapter.id,
        chapterContent: chapter.content,
        stageContext,
        rosterInput   : {
          bookTitle   : chapter.book.title,
          chapterNo   : chapter.no,
          chapterTitle: chapter.title,
          profiles,
          genericTitlesExample
        }
      });
      resolvedGenericRatios = collectGenericRatiosFromRoster(roster);

      log("analysis.roster_discovered", { chapterId, rosterSize: roster.length });

      // 将名册结果转换为 rosterMap（surfaceForm → personaId | "GENERIC"）。
      const entityIdMap = buildEntityIdMap(profiles);
      const profileLookup = buildProfileLookupMap(profiles);
      rosterMap = new Map<string, string>();
      titleOnlyNames = new Set<string>();
      pendingRosterAliasMappings = [];
      for (const entry of roster) {
        if (entry.generic) {
          rosterMap.set(entry.surfaceForm, "GENERIC");
        } else if (entry.entityId !== undefined) {
          const personaId = entityIdMap.get(entry.entityId);
          if (personaId) {
            rosterMap.set(entry.surfaceForm, personaId);
          }
        } else if (entry.isNew && entry.isTitleOnly) {
          titleOnlyNames.add(entry.surfaceForm);
        }

        if (
          aliasRegistry &&
          entry.aliasType &&
          typeof entry.aliasConfidence === "number" &&
          entry.aliasConfidence >= ANALYSIS_PIPELINE_CONFIG.aliasRegistryMinConfidence &&
          entry.suggestedRealName
        ) {
          const suggestedKey = normalizeLookupKey(entry.suggestedRealName);
          const matchedProfile = profileLookup.get(suggestedKey);
          const confidence = entry.aliasConfidence;

          pendingRosterAliasMappings.push({
            bookId      : chapter.bookId,
            personaId   : matchedProfile?.personaId,
            alias       : entry.surfaceForm,
            resolvedName: matchedProfile?.canonicalName ?? entry.suggestedRealName.trim(),
            aliasType   : entry.aliasType,
            confidence,
            evidence    : entry.contextHint?.contextClue ?? "Phase1 名册别名线索",
            chapterStart: chapter.no,
            status      : confidence >= 0.9 ? "CONFIRMED" : "PENDING"
          });

          if (matchedProfile?.personaId && confidence >= 0.85) {
            rosterMap.set(entry.surfaceForm, matchedProfile.personaId);
          }
        }
      }

      // [Cost opt C] 按 Roster 结果收缩 profiles 注入范围
      const rosterReferencedPersonaIds = new Set<string>();
      for (const [, value] of rosterMap) {
        if (value !== "GENERIC") {
          rosterReferencedPersonaIds.add(value);
        }
      }
      const floorSize = ANALYSIS_PIPELINE_CONFIG.chunkProfileFloor;
      const floorPersonaIds = new Set(profiles.slice(0, floorSize).map(p => p.personaId));
      chapterProfiles = rosterReferencedPersonaIds.size > 0
        ? profiles.filter(p => rosterReferencedPersonaIds.has(p.personaId) || floorPersonaIds.has(p.personaId))
        : profiles;
    }

    const chunks = splitContentIntoChunks(
      chapter.content,
      ANALYSIS_PIPELINE_CONFIG.maxChunkLength,
      ANALYSIS_PIPELINE_CONFIG.chunkOverlap
    );

    const aiResults: ChapterAnalysisResponse[] = [];
    for (let i = 0; i < chunks.length; i += AI_CONCURRENCY) {
      const batch = chunks.slice(i, i + AI_CONCURRENCY);
      const batchPromises = batch.map((chunk, idx) => analyzeChunkByStage({
        chapterId : chapter.id,
        stageContext,
        chunkIndex: i + idx,
        chunkInput: {
          bookTitle   : chapter.book.title,
          chapterNo   : chapter.no,
          chapterTitle: chapter.title,
          content     : chunk,
          profiles    : chapterProfiles,
          chunkIndex  : i + idx,
          chunkCount  : chunks.length,
          genericTitlesExample
        }
      }));
      const results = await Promise.all(batchPromises);
      aiResults.push(...results);
    }

    const merged = mergeChunkResults(aiResults);

    const stats = await prismaClient.$transaction(async (tx) => {
      return await persistResult(tx, {
        chapterId     : chapter.id,
        chapterNo     : chapter.no,
        bookId        : chapter.bookId,
        chapterContent: chapter.content,
        merged,
        rosterMap,
        titleOnlyNames,
        pendingRosterAliasMappings,
        lexiconConfig : bookLexiconConfig,
        genericRatios : resolvedGenericRatios
      });
    }, {
      timeout: 30000
    });

    log("analysis.completed", { chapterId, ...stats });

    return {
      chapterId,
      chunkCount: chunks.length,
      ...stats
    };
  }

  /**
   * 功能：在事务内持久化 AI 分析结果并执行实体对齐。
   * 输入：tx - Prisma 事务客户端；input - 合并后的章节分析数据与上下文。
   * 输出：不含 chapterId/chunkCount 的统计结果。
   * 异常：数据库写入失败时抛错（由事务统一回滚）。
   * 副作用：删除旧草稿并写入新 mentions / biography_records / relationships。
   */
  async function persistResult(
    tx: Prisma.TransactionClient,
    input: {
      chapterId                 : string;
      chapterNo                 : number;
      bookId                    : string;
      chapterContent            : string;
      merged                    : ChapterAnalysisResponse;
      rosterMap                 : Map<string, string>;
      titleOnlyNames            : Set<string>;
      pendingRosterAliasMappings: RegisterAliasInput[];
      lexiconConfig?            : BookLexiconConfig;
      genericRatios             : Map<string, { generic: number; nonGeneric: number }>;
    }
  ): Promise<Omit<ChapterAnalysisResult, "chapterId" | "chunkCount">> {
    await tx.mention.deleteMany({ where: { chapterId: input.chapterId } });
    await tx.biographyRecord.deleteMany({
      where: { chapterId: input.chapterId, status: ProcessingStatus.DRAFT }
    });
    await tx.relationship.deleteMany({
      where: { chapterId: input.chapterId, status: ProcessingStatus.DRAFT }
    });

    if (aliasRegistry) {
      for (const aliasMapping of input.pendingRosterAliasMappings) {
        await aliasRegistry.registerAlias(aliasMapping, tx);
      }
    }

    const cache = new Map<string, ResolveResult>();
    let personaCreated = 0;
    let hallucinationCount = 0;
    let grayZoneCount = 0;
    const hallucinatedNamesLogged = new Set<string>();

    const resolve = async (name: string) => {
      if (!cache.has(name)) {
        const res = await personaResolver.resolve({
          bookId        : input.bookId,
          extractedName : name,
          chapterContent: input.chapterContent,
          chapterNo     : input.chapterNo,
          rosterMap     : input.rosterMap,
          titleOnlyNames: input.titleOnlyNames,
          lexiconConfig : input.lexiconConfig,
          genericRatios : input.genericRatios
        }, tx);
        cache.set(name, res);
        if (res.status === "created") personaCreated++;
        if (res.personalizationTier === "gray_zone" && res.grayZoneEvidence && ANALYSIS_PIPELINE_CONFIG.recordGrayZoneMentions) {
          grayZoneCount += 1;
          recordGrayZoneMention(input.bookId, name, res.grayZoneEvidence);
        }
        if (res.status === "hallucinated" && !hallucinatedNamesLogged.has(name)) {
          hallucinatedNamesLogged.add(name);
          log("analysis.hallucination", {
            chapterId  : input.chapterId,
            name,
            confidence : res.confidence,
            reason     : res.reason ?? "unknown",
            matchedName: res.matchedName ?? null
          });
        }
      }
      const cached = cache.get(name);
      if (!cached) {
        throw new Error(`resolve cache missing for persona: ${name}`);
      }

      return cached;
    };

    const mentionData: Prisma.MentionCreateManyInput[] = [];
    const mentionKeys = new Set<string>();
    for (const m of input.merged.mentions) {
      const res = await resolve(m.personaName);
      if (res.status === "hallucinated") {
        hallucinationCount += 1;
        continue;
      }
      if (res.personaId) {
        const key = [
          input.chapterId,
          res.personaId,
          m.rawText,
          m.paraIndex ?? "null",
          m.summary ?? ""
        ].join("|");
        if (mentionKeys.has(key)) continue;
        mentionKeys.add(key);

        mentionData.push({
          chapterId: input.chapterId,
          personaId: res.personaId,
          rawText  : m.rawText,
          summary  : m.summary,
          paraIndex: m.paraIndex
        });
      }
    }

    const bioData: Prisma.BiographyRecordCreateManyInput[] = [];
    const bioKeys = new Set<string>();
    for (const b of input.merged.biographies) {
      const res = await resolve(b.personaName);
      if (res.status === "hallucinated") {
        hallucinationCount += 1;
        continue;
      }
      if (res.personaId) {
        const normalizedCategory = normalizeCategory(b.category);
        const sanitizedIrony = sanitizeIronyNote(b.ironyNote);
        const key = [
          input.chapterId,
          res.personaId,
          normalizedCategory,
          b.event,
          b.title ?? "",
          b.location ?? "",
          b.virtualYear ?? ""
        ].join("|");
        if (bioKeys.has(key)) continue;
        bioKeys.add(key);

        bioData.push({
          chapterId  : input.chapterId,
          chapterNo  : input.chapterNo,
          personaId  : res.personaId,
          category   : normalizedCategory,
          event      : b.event,
          title      : b.title,
          location   : b.location,
          virtualYear: b.virtualYear,
          ironyNote  : sanitizedIrony,
          status     : ProcessingStatus.DRAFT
        });
      }
    }

    const relationData: Prisma.RelationshipCreateManyInput[] = [];
    const relationKeys = new Set<string>();
    for (const r of input.merged.relationships) {
      const s = await resolve(r.sourceName);
      const t = await resolve(r.targetName);
      if (s.status === "hallucinated") {
        hallucinationCount += 1;
      }
      if (t.status === "hallucinated") {
        hallucinationCount += 1;
      }
      if (s.personaId && t.personaId && s.personaId !== t.personaId) {
        const normalizedDescription = sanitizeRelationshipField(r.description);
        const normalizedEvidence = sanitizeRelationshipField(r.evidence);
        // 去重 key 与 DB 唯一约束保持一致：(chapterId, sourceId, targetId, type)
        // recordSource 固定为 AI，不纳入 key；description/evidence 不在 DB 唯一索引中，不作去重依据
        const key = [
          input.chapterId,
          s.personaId,
          t.personaId,
          r.type
        ].join("|");
        if (relationKeys.has(key)) continue;
        relationKeys.add(key);

        relationData.push({
          chapterId  : input.chapterId,
          sourceId   : s.personaId,
          targetId   : t.personaId,
          type       : r.type,
          weight     : r.weight ?? 1,
          description: normalizedDescription,
          evidence   : normalizedEvidence,
          status     : ProcessingStatus.DRAFT
        });
      }
    }

    if (mentionData.length > 0) {
      await tx.mention.createMany({ data: mentionData });
    }
    if (bioData.length > 0) {
      await tx.biographyRecord.createMany({ data: bioData });
    }
    if (relationData.length > 0) {
      await tx.relationship.createMany({ data: relationData });
    }

    return {
      hallucinationCount,
      grayZoneCount,
      created: {
        personas     : personaCreated,
        mentions     : mentionData.length,
        biographies  : bioData.length,
        relationships: relationData.length
      }
    };
  }

  /**
   * 功能：按段落边界切分章节内容，控制单次模型输入长度，支持相邻分片重叠以缓解边界断裂。
   * 输入：content - 章节原文；size - 单块最大长度；overlap - 相邻块重叠字符数（默认配置值）。
   * 输出：分段文本数组。
   * 异常：无。
   * 副作用：无。
   */
  function splitContentIntoChunks(
    text: string,
    size: number,
    overlap: number = ANALYSIS_PIPELINE_CONFIG.chunkOverlap
  ): string[] {
    const paras = text.split(/\n+/).filter(p => p.trim());
    const rawChunks: string[] = [];
    let current = "";
    for (const p of paras) {
      if (p.length > size) {
        if (current) {
          rawChunks.push(current);
          current = "";
        }
        for (let start = 0; start < p.length; start += size) {
          rawChunks.push(p.slice(start, start + size));
        }
        continue;
      }

      if ((current + p).length > size && current) {
        rawChunks.push(current);
        current = p;
      } else {
        current += (current ? "\n\n" : "") + p;
      }
    }
    if (current) rawChunks.push(current);

    // 只有一个 chunk 时无需重叠
    if (rawChunks.length <= 1 || overlap <= 0) {
      return rawChunks;
    }

    // 为第 2 个及以后的 chunk 添加前一个 chunk 尾部的 overlap 上下文
    const chunks: string[] = [rawChunks[0]];
    for (let i = 1; i < rawChunks.length; i++) {
      const prev = rawChunks[i - 1];
      const overlapText = prev.slice(-overlap);
      chunks.push(overlapText + rawChunks[i]);
    }
    return chunks;
  }

  /**
   * 统一合并 Phase 1 人物名册结果：
   * - 使用外部纯函数，便于直接单元测试；
   * - 真实去重键规则见 mergeRosterEntriesForAnalysis（normalizedName + aliasType 优先）。
   */
  function mergeRosterEntries(entries: EnhancedChapterRosterEntry[]): EnhancedChapterRosterEntry[] {
    return mergeRosterEntriesForAnalysis(entries);
  }

  /**
   * 功能：合并多个分段分析结果。
   * 输入：results - 各分段的 ChapterAnalysisResponse。
   * 输出：单一 ChapterAnalysisResponse。
   * 异常：无。
   * 副作用：无。
   */
  function mergeChunkResults(results: ChapterAnalysisResponse[]): ChapterAnalysisResponse {
    return mergeChunkResultsForAnalysis(results);
  }

  function normalizeCategory(val: BioCategoryValue): BioCategory {
    const map: Record<string, BioCategory> = {
      BIRTH : BioCategory.BIRTH,
      EXAM  : BioCategory.EXAM,
      CAREER: BioCategory.CAREER,
      TRAVEL: BioCategory.TRAVEL,
      SOCIAL: BioCategory.SOCIAL,
      DEATH : BioCategory.DEATH
    };
    return map[val] ?? BioCategory.EVENT;
  }

  /**
   * ironyNote 常出现"泛化标签"与"剧情猜测"，这里做保守抽取：
   * 1) 限制长度，避免把整段解释写入数据库；
   * 2) 只保留当前章节可证据化的讽刺描述；
   * 3) 若内容过于空泛（如"很讽刺""批判社会"）则置空，避免污染 biography_records。
   */
  function sanitizeIronyNote(note?: string): string | undefined {
    if (!note) return undefined;
    const clean = note.replace(/\s+/g, " ").trim();
    if (clean.length < 5) return undefined;

    // 过滤过于空泛的“宏大叙事式”评语，减少噪声进入结构化数据。
    if (GENERIC_IRONY_PATTERNS.some((pattern) => pattern.test(clean)) && clean.length <= 28) {
      return undefined;
    }

    return clean.slice(0, 300);
  }

  /**
   * 统一清洗关系字段（description/evidence）：
   * - 去除多余空白；
   * - 过滤过短噪声；
   * - 限制长度避免把整段原文写入关系字段。
   */
  function sanitizeRelationshipField(value?: string): string | undefined {
    if (!value) return undefined;
    const clean = value.replace(/\s+/g, " ").trim();
    return clean.length < 2 ? undefined : clean.slice(0, 400);
  }

  function log(event: string, data: Record<string, unknown>) {
    console.info(`[ChapterAnalysisService] ${event}:`, JSON.stringify(data));
  }

  /**
   * 功能：Phase 5 称号真名溯源——查询本书所有 TITLE_ONLY Persona，批量 AI 推断历史真名并回写。
   * 输入：bookId - 书籍主键。
   * 输出：实际更新的 Persona 数量。
   * 异常：数据库或 AI 调用失败时抛错。
   * 副作用：更新 personas.name / aliases / nameType / confidence。
   */
  async function resolvePersonaTitles(bookId: string, executionContext: AnalysisExecutionContext = {}): Promise<number> {
    // 1. 加载书籍信息以及所有 TITLE_ONLY Persona。
    const book = await prismaClient.book.findUnique({
      where : { id: bookId },
      select: { title: true }
    });
    if (!book) return 0;

    const titleOnlyProfiles = await prismaClient.profile.findMany({
      where: {
        bookId,
        deletedAt: null,
        persona  : { nameType: "TITLE_ONLY", deletedAt: null }
      },
      select: {
        localSummary: true,
        persona     : { select: { id: true, name: true } }
      }
    });

    if (titleOnlyProfiles.length === 0) return 0;

    const entries = titleOnlyProfiles.map((p) => ({
      personaId   : p.persona.id,
      title       : p.persona.name,
      localSummary: p.localSummary
    }));

    // 2. 调用 AI 批量溯源真名。
    const resolutions = await resolveTitlesByStage({
      stageContext: {
        bookId,
        jobId: executionContext.jobId
      },
      titleInput: {
        bookTitle: book.title,
        entries
      }
    });

    // 3. 按置信度分流处理。
    //    mergePersonas 内部自带 $transaction，单条 update + registerAlias 用独立事务保护一致性。
    let updatedCount = 0;
    for (const r of resolutions) {
      if (r.confidence >= ANALYSIS_PIPELINE_CONFIG.aliasRegistryMinConfidence && r.realName) {
        const existingPersona = await prismaClient.persona.findFirst({
          where: {
            id       : { not: r.personaId },
            deletedAt: null,
            profiles : { some: { bookId, deletedAt: null } },
            OR       : [
              { name: r.realName },
              { aliases: { has: r.realName } }
            ]
          },
          select: { id: true }
        });

        if (existingPersona) {
          // mergePersonas 内部自带 $transaction，无需外层包裹
          await mergePersonas({
            targetId: existingPersona.id,
            sourceId: r.personaId
          });

          if (aliasRegistry) {
            await aliasRegistry.registerAlias({
              bookId,
              personaId   : existingPersona.id,
              alias       : r.title,
              resolvedName: r.realName,
              aliasType   : "TITLE",
              confidence  : r.confidence,
              evidence    : r.historicalNote ?? "Phase 5 称号真名溯源",
              status      : "CONFIRMED"
            });
          }
          updatedCount++;
          continue;
        }

        // 高置信：确认真名，内嵌为常规 NAMED Persona。
        // persona update + alias 注册用事务保证一致性。
        await prismaClient.$transaction(async (tx) => {
          await tx.persona.update({
            where: { id: r.personaId },
            data : {
              name      : r.realName!,
              nameType  : "NAMED",
              confidence: r.confidence,
              aliases   : { push: r.title }
            }
          });

          if (aliasRegistry) {
            await aliasRegistry.registerAlias({
              bookId,
              personaId   : r.personaId,
              alias       : r.title,
              resolvedName: r.realName!,
              aliasType   : "TITLE",
              confidence  : r.confidence,
              evidence    : r.historicalNote ?? "Phase 5 称号真名溯源",
              status      : r.confidence >= 0.9 ? "CONFIRMED" : "PENDING"
            }, tx);
          }
        });
        updatedCount++;
      } else {
        // 低置信：只更新 confidence，称号保留 TITLE_ONLY 供审核者手动确认。
        await prismaClient.persona.update({
          where: { id: r.personaId },
          data : { confidence: r.confidence }
        });
      }
    }

    return updatedCount;
  }

  /**
   * 查询当前书籍仍处于 TITLE_ONLY 的人物数量，用于条件触发称号溯源。
   */
  async function getTitleOnlyPersonaCount(bookId: string): Promise<number> {
    return await prismaClient.profile.count({
      where: {
        bookId,
        deletedAt: null,
        persona  : { nameType: "TITLE_ONLY", deletedAt: null }
      }
    });
  }

  function collectGrayZoneMentions(bookId: string): GrayZoneMentionRecord[] {
    const bucket = grayZoneMentionStore.get(bookId);
    if (!bucket) return [];
    return Array.from(bucket.entries()).map(([surfaceForm, evidence]) => ({ surfaceForm, evidence }));
  }

  function clearGrayZoneMentions(bookId: string): void {
    grayZoneMentionStore.delete(bookId);
  }

  async function runGrayZoneArbitration(bookId: string, executionContext: AnalysisExecutionContext = {}): Promise<number> {
    if (!ANALYSIS_PIPELINE_CONFIG.llmTitleArbitrationEnabled) return 0;
    const grayZones = collectGrayZoneMentions(bookId);
    if (grayZones.length === 0) return 0;

    const book = await prismaClient.book.findUnique({
      where : { id: bookId },
      select: { title: true }
    });
    if (!book) return 0;

    const terms = grayZones
      .slice(0, ANALYSIS_PIPELINE_CONFIG.llmArbitrationMaxTerms)
      .map((item) => ({
        surfaceForm             : item.surfaceForm,
        chapterAppearanceCount  : item.evidence.chapterAppearanceCount,
        hasStableAliasBinding   : item.evidence.hasStableAliasBinding,
        singlePersonaConsistency: item.evidence.singlePersonaConsistency,
        genericRatio            : item.evidence.genericRatio
      }));

    if (terms.length === 0) return 0;
    const results = await arbitrateGrayZoneByStage({
      stageContext: {
        bookId,
        jobId: executionContext.jobId
      },
      arbitrationInput: {
        bookTitle: book.title,
        terms
      }
    });
    let written = 0;
    for (const row of results) {
      const evidence = grayZones.find((item) => item.surfaceForm === row.surfaceForm)?.evidence;
      if (!evidence || !row.isPersonalized || !aliasRegistry || row.confidence <= 0) {
        continue;
      }

      await aliasRegistry.registerAlias({
        bookId,
        alias       : row.surfaceForm,
        aliasType   : "NICKNAME",
        confidence  : row.confidence,
        evidence    : row.reason ?? "Phase 3 gray-zone arbitration",
        status      : row.confidence >= ANALYSIS_PIPELINE_CONFIG.llmArbitrationMinConfidence ? "LLM_INFERRED" : "PENDING",
        resolvedName: undefined
      });
      written += 1;
    }
    console.info("[ChapterAnalysisService] arbitration.completed:", JSON.stringify({ bookId, total: results.length, written }));
    clearGrayZoneMentions(bookId);
    return written;
  }

  /**
   * Pass 1 独立章节实体提取：不注入任何已有 profiles，LLM 纯粹从原文提取人物。
   * 输入：chapterId - 章节主键。
   * 输出：ChapterEntityList（本章人物列表）。
   * 异常：章节不存在、AI 调用失败时抛错。
   * 副作用：无（不写库）。
   */
  async function extractChapterEntities(
    chapterId: string,
    executionContext: AnalysisExecutionContext = {}
  ): Promise<ChapterEntityList> {
    const chapter = await prismaClient.chapter.findUnique({
      where  : { id: chapterId },
      include: { book: { select: { title: true } } }
    });
    if (!chapter) throw new Error(`Chapter [${chapterId}] 不存在`);

    const prompt = buildIndependentExtractionPrompt({
      bookTitle   : chapter.book.title,
      chapterNo   : chapter.no,
      chapterTitle: chapter.title,
      content     : chapter.content
    });

    const stageContext = { bookId: chapter.bookId, jobId: executionContext.jobId };

    if (!stageContext.jobId) {
      const model = await strategyResolver.resolveForStage(PipelineStage.INDEPENDENT_EXTRACTION, {
        bookId: chapter.bookId
      });
      const providerClient = createAiProviderClient({
        provider : model.provider,
        apiKey   : model.apiKey,
        baseUrl  : model.baseUrl,
        modelName: model.modelName
      });
      const aiResult = await providerClient.generateJson(prompt, toGenerateOptions(model));
      const entities = parseIndependentExtractionResponse(aiResult.content);
      return { chapterId, chapterNo: chapter.no, entities };
    }

    const result = await stageAiCallExecutor.execute({
      stage  : PipelineStage.INDEPENDENT_EXTRACTION,
      prompt,
      jobId  : stageContext.jobId,
      chapterId,
      context: stageContext,
      callFn : async ({ model }) => {
        const providerClient = createAiProviderClient({
          provider : model.provider,
          apiKey   : model.apiKey,
          baseUrl  : model.baseUrl,
          modelName: model.modelName
        });
        const aiResult = await providerClient.generateJson(prompt, toGenerateOptions(model));
        const entities = parseIndependentExtractionResponse(aiResult.content);
        return { data: entities, usage: aiResult.usage };
      }
    });

    log("analysis.independent_extraction", {
      chapterId,
      entityCount: result.data.length
    });

    return { chapterId, chapterNo: chapter.no, entities: result.data };
  }

  return { analyzeChapter, extractChapterEntities, resolvePersonaTitles, getTitleOnlyPersonaCount, collectGrayZoneMentions, clearGrayZoneMentions, runGrayZoneArbitration };
}

export const chapterAnalysisService = createChapterAnalysisService(prisma, undefined, aliasRegistryService);

/**
 * 功能：将人物档案列表转为短整型 ID 映射（shortId → personaId UUID）。
 * 生成的 shortId 与 buildEntityContextLines 中的 [N] 序号完全对应（1-indexed）。
 * 输入：profiles - 按稳定顺序传入的人物档案列表。
 * 输出：Map<shortId, personaId>，用于将 Phase 1 AI 输出的 entityId 翻译回 UUID。
 * 异常：无。
 * 副作用：无。
 */
function buildEntityIdMap(profiles: AnalysisProfileContext[]): Map<number, string> {
  const map = new Map<number, string>();
  profiles.forEach((p, idx) => {
    map.set(idx + 1, p.personaId);
  });
  return map;
}

function normalizeLookupKey(value: string): string {
  return value.trim().toLowerCase();
}

function buildProfileLookupMap(
  profiles: AnalysisProfileContext[]
): Map<string, { personaId: string; canonicalName: string }> {
  const lookup = new Map<string, { personaId: string; canonicalName: string }>();
  for (const profile of profiles) {
    const names = [profile.canonicalName, ...profile.aliases];
    for (const name of names) {
      const key = normalizeLookupKey(name);
      if (!key || lookup.has(key)) {
        continue;
      }

      lookup.set(key, {
        personaId    : profile.personaId,
        canonicalName: profile.canonicalName
      });
    }
  }

  return lookup;
}

function resolveBookLexiconConfig(genre: string | null | undefined): BookLexiconConfig {
  if (!ANALYSIS_PIPELINE_CONFIG.enableGenrePresetOverride) {
    return GENRE_PRESETS[DEFAULT_GENRE_PRESET] ?? {};
  }

  // 优先使用书籍显式指定的体裁；未指定时回退默认预设
  const key = genre && genre in GENRE_PRESETS ? genre : DEFAULT_GENRE_PRESET;
  return GENRE_PRESETS[key] ?? {};
}

function collectGenericRatiosFromRoster(
  roster: Array<{ surfaceForm: string; generic?: boolean }>
): Map<string, { generic: number; nonGeneric: number }> {
  const map = new Map<string, { generic: number; nonGeneric: number }>();
  for (const item of roster) {
    const key = item.surfaceForm.trim();
    if (!key) continue;
    const current = map.get(key) ?? { generic: 0, nonGeneric: 0 };
    if (item.generic) current.generic += 1;
    else current.nonGeneric += 1;
    map.set(key, current);
  }
  return map;
}
