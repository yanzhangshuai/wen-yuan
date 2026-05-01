import { ProcessingStatus, RecordSource } from "@/generated/prisma/enums";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { aliasRegistryService, type AliasRegistryService } from "@/server/modules/analysis/services/AliasRegistryService";
import { aiCallExecutor, type AiCallExecutor } from "@/server/modules/analysis/services/AiCallExecutor";
import {
  createModelStrategyResolver,
  type ModelStrategyResolver
} from "@/server/modules/analysis/services/ModelStrategyResolver";
import { createPersonaResolver, type ResolveResult } from "@/server/modules/analysis/services/PersonaResolver";
import { createMergePersonasService } from "@/server/modules/personas/mergePersonas";
import {
  type BookLexiconConfig,
  type MentionPersonalizationEvidence,
  buildEffectiveGenericTitles,
  GENERIC_TITLES_PROMPT_LIMIT
} from "@/server/modules/analysis/config/lexicon";
import { ANALYSIS_PIPELINE_CONFIG } from "@/server/modules/analysis/config/pipeline";
import type { FullRuntimeKnowledge } from "@/server/modules/knowledge/load-book-knowledge";
import {
  formatRelationshipTypeDictionary,
  type RosterDiscoveryInput
} from "@/server/modules/analysis/services/prompts";
import type {
  AnalysisProfileContext,
  ChapterAnalysisResponse,
  ChapterEntityList,
  EnhancedChapterRosterEntry,
  RegisterAliasInput
} from "@/types/analysis";
import {
  AI_CONCURRENCY,
  buildEntityIdMap,
  buildProfileLookupMap,
  collectGenericRatiosFromRoster,
  mergeChunkResultsForAnalysis,
  mergeRosterEntriesForAnalysis,
  normalizeCategory,
  normalizeLookupKey,
  sanitizeIronyNote,
  sanitizeRelationshipField,
  splitContentIntoChunks
} from "@/server/modules/analysis/services/helpers/chunk-utils";
import {
  analyzeChunkByStage,
  arbitrateGrayZoneByStage,
  discoverRosterByStage,
  extractChapterEntitiesByStage,
  resolveTitlesByStage
} from "@/server/modules/analysis/services/stages/stage-calls";

/**
 * 章节解析流水线主服务（编排层）：
 * - 组织各阶段调用（helpers/chunk-utils + stages/stage-calls）；
 * - 管理闭包状态（personaResolver, grayZoneMentionStore）；
 * - 纯工具函数已提取到 helpers/chunk-utils.ts，AI 阶段调用已提取到 stages/stage-calls.ts。
 */

export interface ChapterAnalysisResult {
  chapterId         : string;
  chunkCount        : number;
  hallucinationCount: number;
  created: {
    personas          : number;
    mentions          : number;
    biographies       : number;
    relationships     : number;
    relationshipEvents: number;
  };
  grayZoneCount?: number;
}

export interface GrayZoneMentionRecord {
  surfaceForm: string;
  evidence   : MentionPersonalizationEvidence;
}

// 向后兼容：从 helpers/chunk-utils 重新导出，避免已有消费者修改导入路径。
export { mergeRosterEntriesForAnalysis, mergeChunkResultsForAnalysis } from "@/server/modules/analysis/services/helpers/chunk-utils";

/**
 * 功能：创建章节分析服务，执行章节分析主流程并写入结构化文学数据。
 * 输入：prismaClient、aiClient（均可注入，便于测试）。
 * 输出：包含 analyzeChapter 方法的服务对象。
 * 异常：章节不存在、AI 调用失败、数据库失败时抛错。
 * 副作用：写入/删除 mentions、biography_records、relationships、personas、profiles。
 */
export function createChapterAnalysisService(
  prismaClient: PrismaClient = prisma,
  aliasRegistry?: AliasRegistryService,
  stageAiCallExecutor: AiCallExecutor = aiCallExecutor,
  _strategyResolver: ModelStrategyResolver = createModelStrategyResolver(prismaClient)
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

  interface AnalysisExecutionContext {
    jobId                  : string;
    /** Pass 2 全局消歧后的映射表（surfaceForm → personaId），提供时跳过 ROSTER_DISCOVERY。 */
    externalPersonaMap?    : Map<string, string>;
    /** 从数据库预加载的词典配置；未提供时回退为空配置。 */
    preloadedLexiconConfig?: BookLexiconConfig;
    /** 运行时知识（含历史人物、关系词、名字规则等 DB 驱动的完整过滤配置）。 */
    runtimeKnowledge?      : FullRuntimeKnowledge;
  }

  /**
   * Phase 1 长章节保护：超过阈值时按更大的切片执行名册发现，再按称谓去重合并。
   */
  async function discoverRosterWithProtection(input: {
    chapterId     : string;
    chapterContent: string;
    stageContext  : { bookId: string; jobId: string };
    rosterInput   : Omit<RosterDiscoveryInput, "content">;
  }): Promise<EnhancedChapterRosterEntry[]> {
    if (input.chapterContent.length <= ANALYSIS_PIPELINE_CONFIG.rosterMaxInputLength) {
      return await discoverRosterByStage({
        chapterId   : input.chapterId,
        stageContext: input.stageContext,
        rosterInput : {
          ...input.rosterInput,
          content: input.chapterContent
        }
      }, stageAiCallExecutor);
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
      }, stageAiCallExecutor);
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
  async function analyzeChapter(chapterId: string, executionContext: AnalysisExecutionContext): Promise<ChapterAnalysisResult> {
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
    const bookLexiconConfig = executionContext.preloadedLexiconConfig ?? {};
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
          bookTitle            : chapter.book.title,
          chapterNo            : chapter.no,
          chapterTitle         : chapter.title,
          profiles,
          genericTitlesExample,
          entityExtractionRules: bookLexiconConfig.entityExtractionRules
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
    const relationshipTypeDictionary = formatRelationshipTypeDictionary(await prismaClient.relationshipTypeDefinition.findMany({
      where  : { status: "ACTIVE" },
      orderBy: [
        { group: "asc" },
        { sortOrder: "asc" },
        { code: "asc" }
      ],
      select: {
        code         : true,
        name         : true,
        group        : true,
        directionMode: true
      }
    }));

    const aiResults: ChapterAnalysisResponse[] = [];
    for (let i = 0; i < chunks.length; i += AI_CONCURRENCY) {
      const batch = chunks.slice(i, i + AI_CONCURRENCY);
      const batchPromises = batch.map((chunk, idx) => analyzeChunkByStage({
        chapterId : chapter.id,
        stageContext,
        chunkIndex: i + idx,
        chunkInput: {
          bookTitle                  : chapter.book.title,
          chapterNo                  : chapter.no,
          chapterTitle               : chapter.title,
          content                    : chunk,
          profiles                   : chapterProfiles,
          chunkIndex                 : i + idx,
          chunkCount                 : chunks.length,
          genericTitlesExample,
          entityExtractionRules      : bookLexiconConfig.entityExtractionRules,
          relationshipExtractionRules: bookLexiconConfig.relationshipExtractionRules,
          relationshipTypeDictionary
        }
      }, stageAiCallExecutor));
      const results = await Promise.all(batchPromises);
      aiResults.push(...results);
    }

    const merged = mergeChunkResults(aiResults);

    const stats = await prismaClient.$transaction(async (tx) => {
      return await persistResult(tx, {
        chapterId       : chapter.id,
        chapterNo       : chapter.no,
        bookId          : chapter.bookId,
        chapterContent  : chapter.content,
        merged,
        rosterMap,
        titleOnlyNames,
        pendingRosterAliasMappings,
        lexiconConfig   : bookLexiconConfig,
        genericRatios   : resolvedGenericRatios,
        runtimeKnowledge: executionContext.runtimeKnowledge
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
      runtimeKnowledge?         : FullRuntimeKnowledge;
    }
  ): Promise<Omit<ChapterAnalysisResult, "chapterId" | "chunkCount">> {
    await tx.mention.deleteMany({ where: { chapterId: input.chapterId } });
    await tx.biographyRecord.deleteMany({
      where: { chapterId: input.chapterId, status: ProcessingStatus.DRAFT }
    });
    await tx.relationshipEvent.deleteMany({
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
          bookId          : input.bookId,
          extractedName   : name,
          chapterContent  : input.chapterContent,
          chapterNo       : input.chapterNo,
          rosterMap       : input.rosterMap,
          titleOnlyNames  : input.titleOnlyNames,
          lexiconConfig   : input.lexiconConfig,
          genericRatios   : input.genericRatios,
          runtimeKnowledge: input.runtimeKnowledge
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

    const activeRelationshipTypes = await tx.relationshipTypeDefinition.findMany({
      where : { status: "ACTIVE" },
      select: {
        code         : true,
        directionMode: true
      }
    });
    const relationshipTypeByCode = new Map(activeRelationshipTypes.map((type) => [type.code, type]));

    const normalizeRelationshipTypeCode = (code: string) => code.trim();
    const buildRelationshipKey = (sourceId: string, targetId: string, typeCode: string) => [
      sourceId,
      targetId,
      typeCode
    ].join("|");
    const normalizeAttitudeTags = (tags: readonly string[]) => {
      const seen = new Set<string>();
      const normalized: string[] = [];
      for (const tag of tags) {
        const trimmed = tag.trim();
        if (!trimmed || seen.has(trimmed)) continue;
        seen.add(trimmed);
        normalized.push(trimmed);
        if (normalized.length >= 3) break;
      }
      return normalized;
    };
    const resolveRelationshipPair = async (relationship: {
      sourceName          : string;
      targetName          : string;
      relationshipTypeCode: string;
    }): Promise<{
      sourceId: string;
      targetId: string;
      typeCode: string;
    } | null> => {
      const source = await resolve(relationship.sourceName);
      const target = await resolve(relationship.targetName);
      if (source.status === "hallucinated") {
        hallucinationCount += 1;
      }
      if (target.status === "hallucinated") {
        hallucinationCount += 1;
      }
      if (!source.personaId || !target.personaId || source.personaId === target.personaId) {
        return null;
      }

      const typeCode = normalizeRelationshipTypeCode(relationship.relationshipTypeCode);
      const relationshipType = relationshipTypeByCode.get(typeCode);
      if (!relationshipType) {
        return null;
      }

      if (relationshipType.directionMode === "SYMMETRIC" && source.personaId > target.personaId) {
        return {
          sourceId: target.personaId,
          targetId: source.personaId,
          typeCode
        };
      }

      return {
        sourceId: source.personaId,
        targetId: target.personaId,
        typeCode
      };
    };

    const relationshipIdByKey = new Map<string, string>();
    for (const relationship of input.merged.relationships) {
      const canonicalPair = await resolveRelationshipPair(relationship);
      if (!canonicalPair) {
        continue;
      }

      const key = buildRelationshipKey(canonicalPair.sourceId, canonicalPair.targetId, canonicalPair.typeCode);
      if (relationshipIdByKey.has(key)) {
        continue;
      }

      const existingRelationship = await tx.relationship.findFirst({
        where: {
          bookId              : input.bookId,
          sourceId            : canonicalPair.sourceId,
          targetId            : canonicalPair.targetId,
          relationshipTypeCode: canonicalPair.typeCode,
          deletedAt           : null
        },
        select: {
          id: true
        }
      });

      const persistedRelationship = existingRelationship
        ? existingRelationship
        : await tx.relationship.create({
          data: {
            bookId              : input.bookId,
            sourceId            : canonicalPair.sourceId,
            targetId            : canonicalPair.targetId,
            relationshipTypeCode: canonicalPair.typeCode,
            recordSource        : RecordSource.DRAFT_AI,
            status              : ProcessingStatus.DRAFT
          },
          select: {
            id: true
          }
        });

      relationshipIdByKey.set(key, persistedRelationship.id);
    }

    const relationshipEventData: Prisma.RelationshipEventCreateManyInput[] = [];
    const relationshipEventKeys = new Set<string>();
    for (const event of input.merged.relationshipEvents) {
      const canonicalPair = await resolveRelationshipPair(event);
      if (!canonicalPair) {
        continue;
      }

      const relationshipKey = buildRelationshipKey(canonicalPair.sourceId, canonicalPair.targetId, canonicalPair.typeCode);
      const relationshipId = relationshipIdByKey.get(relationshipKey);
      if (!relationshipId) {
        continue;
      }

      const summary = sanitizeRelationshipField(event.summary);
      if (!summary) {
        continue;
      }
      const evidence = sanitizeRelationshipField(event.evidence);
      const eventKey = [
        relationshipId,
        summary,
        evidence ?? "",
        event.paraIndex ?? "null"
      ].join("|");
      if (relationshipEventKeys.has(eventKey)) {
        continue;
      }
      relationshipEventKeys.add(eventKey);

      relationshipEventData.push({
        relationshipId,
        bookId      : input.bookId,
        chapterId   : input.chapterId,
        chapterNo   : input.chapterNo,
        sourceId    : canonicalPair.sourceId,
        targetId    : canonicalPair.targetId,
        summary,
        evidence,
        attitudeTags: normalizeAttitudeTags(event.attitudeTags),
        paraIndex   : event.paraIndex,
        confidence  : event.confidence,
        recordSource: RecordSource.DRAFT_AI,
        status      : ProcessingStatus.DRAFT
      });
    }

    if (mentionData.length > 0) {
      await tx.mention.createMany({ data: mentionData });
    }
    if (bioData.length > 0) {
      await tx.biographyRecord.createMany({ data: bioData });
    }
    if (relationshipEventData.length > 0) {
      await tx.relationshipEvent.createMany({ data: relationshipEventData });
    }
    return {
      hallucinationCount,
      grayZoneCount,
      created: {
        personas          : personaCreated,
        mentions          : mentionData.length,
        biographies       : bioData.length,
        relationships     : relationshipIdByKey.size,
        relationshipEvents: relationshipEventData.length
      }
    };
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
  async function resolvePersonaTitles(bookId: string, executionContext: AnalysisExecutionContext): Promise<number> {
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
    }, stageAiCallExecutor);

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

  async function runGrayZoneArbitration(bookId: string, executionContext: AnalysisExecutionContext): Promise<number> {
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
    }, stageAiCallExecutor);
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
   */
  async function extractChapterEntities(
    chapterId: string,
    executionContext: AnalysisExecutionContext
  ): Promise<ChapterEntityList> {
    const chapter = await prismaClient.chapter.findUnique({
      where  : { id: chapterId },
      include: { book: { select: { title: true } } }
    });
    if (!chapter) throw new Error(`Chapter [${chapterId}] 不存在`);

    const extractionInput = {
      bookTitle            : chapter.book.title,
      chapterNo            : chapter.no,
      chapterTitle         : chapter.title,
      content              : chapter.content,
      entityExtractionRules: executionContext.preloadedLexiconConfig?.entityExtractionRules,
      genericTitlesExample : executionContext.runtimeKnowledge
        ? Array.from(buildEffectiveGenericTitles(executionContext.preloadedLexiconConfig)).slice(0, GENERIC_TITLES_PROMPT_LIMIT).join("、") + "等"
        : undefined
    };

    const stageContext = { bookId: chapter.bookId, jobId: executionContext.jobId };

    const result = await extractChapterEntitiesByStage({
      chapterId,
      stageContext,
      extractionInput
    }, stageAiCallExecutor);

    log("analysis.independent_extraction", {
      chapterId,
      entityCount: result.data.length
    });

    return { chapterId, chapterNo: chapter.no, entities: result.data };
  }

  return { analyzeChapter, extractChapterEntities, resolvePersonaTitles, getTitleOnlyPersonaCount, collectGrayZoneMentions, clearGrayZoneMentions, runGrayZoneArbitration };
}

export const chapterAnalysisService = createChapterAnalysisService(prisma, aliasRegistryService);

/**
 * 仅供单元测试使用：暴露纯帮助函数，便于覆盖边界分支。
 * 业务代码禁止依赖该对象。
 */
export const chapterAnalysisTesting = {
  splitContentIntoChunks,
  normalizeCategory,
  sanitizeIronyNote,
  sanitizeRelationshipField,
  buildEntityIdMap,
  normalizeLookupKey,
  buildProfileLookupMap,
  collectGenericRatiosFromRoster
};
