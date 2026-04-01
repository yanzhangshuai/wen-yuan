import { BioCategory, ProcessingStatus } from "@/generated/prisma/enums";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { createAiProviderClient, type AiProviderName } from "@/server/providers/ai";
import { decryptValue } from "@/server/security/encryption";
import { aliasRegistryService, type AliasRegistryService } from "@/server/modules/analysis/services/AliasRegistryService";
import { createChapterAnalysisAiClient, type AiAnalysisClient } from "@/server/modules/analysis/services/aiClient";
import { createPersonaResolver, type ResolveResult } from "@/server/modules/analysis/services/PersonaResolver";
import { createMergePersonasService } from "@/server/modules/personas/mergePersonas";
import { validationAgentService as defaultValidationAgent, type ValidationAgentService } from "@/server/modules/analysis/services/ValidationAgentService";
import type {
  AnalysisProfileContext,
  BioCategoryValue,
  ChapterAnalysisResponse,
  RegisterAliasInput
} from "@/types/analysis";

// 配置常量
const MAX_CHUNK_LENGTH = 2000; // 每片输入字符数：缩小分片减少每次输出量，防止 AI token 上限截断
const AI_CONCURRENCY = 3;      // 同时解析的分段数，避免触发 API 频控
const AI_MAX_RETRIES = 2;
const AI_RETRY_BASE_MS = 600;
const SUPPORTED_AI_PROVIDERS: readonly AiProviderName[] = ["gemini", "deepseek", "qwen", "doubao"];
const GENERIC_IRONY_PATTERNS: readonly RegExp[] = [
  /批判(了|的是)?社会/,
  /揭露(了|的是)?(社会|官场|制度)/,
  /反映(了|的是)?现实/,
  /封建(礼教|社会)/,
  /辛辣?讽刺/,
  /社会(现实)?(黑暗|腐败)/
];

interface AnalysisAiModelConfig {
  id       : string;
  provider : string;
  name     : string;
  modelId  : string;
  baseUrl  : string;
  apiKey   : string | null;
  isEnabled: boolean;
}

function normalizeProvider(provider: string): AiProviderName {
  const normalizedProvider = provider.trim().toLowerCase();
  if ((SUPPORTED_AI_PROVIDERS as readonly string[]).includes(normalizedProvider)) {
    return normalizedProvider as AiProviderName;
  }

  throw new Error(`不支持的模型 provider: ${provider}`);
}

function readEncryptedApiKey(apiKey: string | null, modelName: string): string {
  if (!apiKey) {
    throw new Error(`模型「${modelName}」未配置 API Key`);
  }

  if (!apiKey.startsWith("enc:v1:")) {
    throw new Error(`模型「${modelName}」API Key 存储格式非法，请在模型设置页重新保存`);
  }

  return decryptValue(apiKey);
}

/**
 * 功能：定义章节分析完成后的统计结果结构。
 * 输入：无。
 * 输出：类型约束 ChapterAnalysisResult。
 * 异常：无。
 * 副作用：无。
 */
export interface ChapterAnalysisResult {
  chapterId         : string;
  chunkCount        : number;
  hallucinationCount: number;
  created: {
    personas     : number;
    mentions     : number;
    biographies  : number;
    relationships: number;
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
  validationAgent?: Pick<ValidationAgentService, "validateChapterResult"> | null
) {
  const personaResolver = createPersonaResolver(prismaClient, aliasRegistry);
  const { mergePersonas } = createMergePersonasService(prismaClient);

  /**
   * 功能：为章节分析解析“实际生效模型”。
   * 输入：bookAiModelId - 书籍绑定模型 ID，可为空。
   * 输出：可直接用于构造 provider 的模型配置（已校验启用状态）。
   * 异常：模型不存在、未启用或未配置 Key 时抛错。
   * 副作用：读取数据库 `ai_models` 表。
   */
  async function resolveAnalysisModelConfig(bookAiModelId: string | null): Promise<AnalysisAiModelConfig> {
    if (bookAiModelId) {
      const assignedModel = await prismaClient.aiModel.findUnique({
        where : { id: bookAiModelId },
        select: {
          id       : true,
          provider : true,
          name     : true,
          modelId  : true,
          baseUrl  : true,
          apiKey   : true,
          isEnabled: true
        }
      });

      if (!assignedModel) {
        throw new Error(`书籍绑定模型不存在: ${bookAiModelId}`);
      }

      if (!assignedModel.isEnabled) {
        throw new Error(`书籍绑定模型未启用: ${assignedModel.name}`);
      }

      return assignedModel;
    }

    const defaultModel = await prismaClient.aiModel.findFirst({
      where  : { isDefault: true, isEnabled: true },
      orderBy: { updatedAt: "desc" },
      select : {
        id       : true,
        provider : true,
        name     : true,
        modelId  : true,
        baseUrl  : true,
        apiKey   : true,
        isEnabled: true
      }
    });

    if (!defaultModel) {
      throw new Error("未找到可用默认模型，请在 /admin/model 配置并启用至少一个模型");
    }

    return defaultModel;
  }

  /**
   * 功能：根据书籍绑定模型动态创建章节分析 AI 客户端。
   * 输入：bookAiModelId - 书籍模型 ID（可为空）。
   * 输出：AiAnalysisClient。
   * 异常：模型配置不合法或 Key 解密失败时抛错。
   * 副作用：读取数据库模型配置。
   */
  async function createRuntimeAiClient(bookAiModelId: string | null): Promise<AiAnalysisClient> {
    const modelConfig = await resolveAnalysisModelConfig(bookAiModelId);
    const provider = normalizeProvider(modelConfig.provider);
    const apiKey = readEncryptedApiKey(modelConfig.apiKey, modelConfig.name);

    const providerClient = createAiProviderClient({
      provider,
      apiKey,
      baseUrl  : modelConfig.baseUrl,
      modelName: modelConfig.modelId
    });

    return createChapterAnalysisAiClient(providerClient);
  }

  /**
   * 功能：执行单章节分析主流程（读取、分段、AI 解析、事务落库）。
   * 输入：chapterId - 章节主键 UUID。
   * 输出：ChapterAnalysisResult 统计结果。
   * 异常：章节不存在、AI 调用失败、数据库失败时抛错。
   * 副作用：更新该章节的 mentions / biography_records / relationships 等数据。
   */
  async function analyzeChapter(chapterId: string): Promise<ChapterAnalysisResult> {
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

    const runtimeAiClient = aiClient ?? await createRuntimeAiClient(chapter.book.aiModelId);

    // Phase 1: 全章人物名册发现——AI 读完整章节，输出本章所有称谓的预解析映射。
    // 此调用比 chunk 分析便宜（只识别称谓名单，不提取事件/关系），但能解决跨段指代歧义。
    const roster = await runtimeAiClient.discoverChapterRoster({
      bookTitle   : chapter.book.title,
      chapterNo   : chapter.no,
      chapterTitle: chapter.title,
      content     : chapter.content,
      profiles
    });

    log("analysis.roster_discovered", { chapterId, rosterSize: roster.length });

    // 将名册结果转换为 rosterMap（surfaceForm → personaId | "GENERIC"）。
    const entityIdMap = buildEntityIdMap(profiles);
    const profileLookup = buildProfileLookupMap(profiles);
    const rosterMap = new Map<string, string>();
    const titleOnlyNames = new Set<string>();
    const pendingRosterAliasMappings: RegisterAliasInput[] = [];
    for (const entry of roster) {
      if (entry.generic) {
        rosterMap.set(entry.surfaceForm, "GENERIC");
      } else if (entry.entityId !== undefined) {
        const personaId = entityIdMap.get(entry.entityId);
        if (personaId) {
          rosterMap.set(entry.surfaceForm, personaId);
        }
      } else if (entry.isNew && entry.isTitleOnly) {
        // isTitleOnly: true 且为新建实体 → 记录到集合供 PersonaResolver 写入 nameType = TITLE_ONLY
        titleOnlyNames.add(entry.surfaceForm);
      }

      if (
        aliasRegistry &&
        entry.aliasType &&
        typeof entry.aliasConfidence === "number" &&
        entry.aliasConfidence >= 0.7 &&
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
      // isNew: true 且非 TITLE_ONLY → 不加入 rosterMap，走正常 resolver 创建新 persona 流程
    }

    const chunks = splitContentIntoChunks(chapter.content, MAX_CHUNK_LENGTH);

    const aiResults: ChapterAnalysisResponse[] = [];
    for (let i = 0; i < chunks.length; i += AI_CONCURRENCY) {
      const batch = chunks.slice(i, i + AI_CONCURRENCY);
      const batchPromises = batch.map((chunk, idx) =>
        analyzeChunkWithRetry(runtimeAiClient, {
          bookTitle   : chapter.book.title,
          chapterNo   : chapter.no,
          chapterTitle: chapter.title,
          content     : chunk,
          profiles,
          chunkIndex  : i + idx,
          chunkCount  : chunks.length
        })
      );
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
        pendingRosterAliasMappings
      });
    }, {
      timeout: 30000
    });

    log("analysis.completed", { chapterId, ...stats });

    // 章节级自检（非阻塞）：成功解析后触发 AI 二次验证，失败仅记日志不影响主流程。
    if (validationAgent) {
      fireChapterValidation(
        validationAgent, prismaClient, chapter, stats
      ).catch((err) =>
        console.warn("[ChapterAnalysisService] chapter.validation.failed",
          JSON.stringify({ chapterId, error: String(err).slice(0, 300) }))
      );
    }

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
    const hallucinatedNamesLogged = new Set<string>();

    const resolve = async (name: string) => {
      if (!cache.has(name)) {
        const res = await personaResolver.resolve({
          bookId        : input.bookId,
          extractedName : name,
          chapterContent: input.chapterContent,
          chapterNo     : input.chapterNo,
          rosterMap     : input.rosterMap,
          titleOnlyNames: input.titleOnlyNames
        }, tx);
        cache.set(name, res);
        if (res.status === "created") personaCreated++;
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
      created: {
        personas     : personaCreated,
        mentions     : mentionData.length,
        biographies  : bioData.length,
        relationships: relationData.length
      }
    };
  }

  /**
   * 功能：按段落边界切分章节内容，控制单次模型输入长度。
   * 输入：content - 章节原文；maxLength - 单块最大长度。
   * 输出：分段文本数组。
   * 异常：无。
   * 副作用：无。
   */
  function splitContentIntoChunks(text: string, size: number): string[] {
    const paras = text.split(/\n+/).filter(p => p.trim());
    const chunks: string[] = [];
    let current = "";
    for (const p of paras) {
      if (p.length > size) {
        if (current) {
          chunks.push(current);
          current = "";
        }
        for (let start = 0; start < p.length; start += size) {
          chunks.push(p.slice(start, start + size));
        }
        continue;
      }

      if ((current + p).length > size && current) {
        chunks.push(current);
        current = p;
      } else {
        current += (current ? "\n\n" : "") + p;
      }
    }
    if (current) chunks.push(current);
    return chunks;
  }

  /**
   * 功能：合并多个分段分析结果。
   * 输入：results - 各分段的 ChapterAnalysisResponse。
   * 输出：单一 ChapterAnalysisResponse。
   * 异常：无。
   * 副作用：无。
   */
  function mergeChunkResults(results: ChapterAnalysisResponse[]): ChapterAnalysisResponse {
    return {
      biographies  : results.flatMap(r => r.biographies),
      mentions     : results.flatMap(r => r.mentions),
      relationships: results.flatMap(r => r.relationships)
    };
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

  async function analyzeChunkWithRetry(
    activeAiClient: AiAnalysisClient,
    input: Parameters<AiAnalysisClient["analyzeChapterChunk"]>[0]
  ): Promise<ChapterAnalysisResponse> {
    let attempt = 0;
    let lastError: unknown;

    while (attempt <= AI_MAX_RETRIES) {
      try {
        return await activeAiClient.analyzeChapterChunk(input);
      } catch (error) {
        lastError = error;
        if (!isRetryableAiError(error) || attempt === AI_MAX_RETRIES) {
          throw error;
        }
        const waitMs = AI_RETRY_BASE_MS * (attempt + 1);
        log("analysis.ai_retry", {
          chunkIndex: input.chunkIndex,
          attempt   : attempt + 1,
          waitMs,
          reason    : error instanceof Error ? error.message : String(error)
        });
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        attempt += 1;
      }
    }

    throw lastError instanceof Error ? lastError : new Error("AI chunk analysis failed");
  }

  function isRetryableAiError(error: unknown): boolean {
    const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
    return (
      message.includes("429") ||
      message.includes("rate limit") ||
      message.includes("timeout") ||
      message.includes("temporarily unavailable") ||
      message.includes("econnreset") ||
      message.includes("network") ||
      message.includes("terminated") ||
      message.includes("aborted") ||
      message.includes("fetch failed") ||
      message.includes("socket") ||
      message.includes("connection reset")
    );
  }

  /**
   * 功能：异步触发章节级自检（非阻塞），从 DB 加载刚持久化的分析结果后调用 validationAgent。
   * 输入：validationAgent、prismaClient、chapter 基础信息、分析统计结果。
   * 输出：无（结果写入 validation_reports 表）。
   * 异常：调用方应 catch 并记录日志；不应影响主流程。
   */
  async function fireChapterValidation(
    agent: Pick<ValidationAgentService, "validateChapterResult">,
    pc: PrismaClient,
    chapter: { id: string; no: number; bookId: string; content: string },
    _stats: Omit<ChapterAnalysisResult, "chapterId" | "chunkCount">
  ): Promise<void> {
    const [newPersonas, newMentions, newRelationships, existingProfiles] = await Promise.all([
      pc.persona.findMany({
        where  : { profiles: { some: { bookId: chapter.bookId, deletedAt: null } }, deletedAt: null },
        select : { id: true, name: true, confidence: true, nameType: true },
        orderBy: { createdAt: "desc" },
        take   : 50
      }),
      pc.mention.findMany({
        where : { chapterId: chapter.id, deletedAt: null },
        select: { personaId: true, rawText: true },
        take  : 200
      }),
      pc.relationship.findMany({
        where : { chapterId: chapter.id, deletedAt: null },
        select: { sourceId: true, targetId: true, type: true },
        take  : 100
      }),
      pc.profile.findMany({
        where  : { bookId: chapter.bookId, deletedAt: null },
        include: { persona: { select: { name: true, aliases: true } } }
      })
    ]);

    await agent.validateChapterResult({
      bookId        : chapter.bookId,
      chapterId     : chapter.id,
      chapterNo     : chapter.no,
      chapterContent: chapter.content.slice(0, 3000),
      newPersonas   : newPersonas.map((p) => ({
        id: p.id, name: p.name, confidence: p.confidence ?? 0.5, nameType: p.nameType ?? "NAMED"
      })),
      newMentions     : newMentions.map((m) => ({ personaId: m.personaId, rawText: m.rawText })),
      newRelationships: newRelationships.map((r) => ({
        sourceId: r.sourceId, targetId: r.targetId, type: r.type
      })),
      existingProfiles: existingProfiles.map((p) => ({
        personaId    : p.personaId,
        canonicalName: p.persona?.name ?? p.localName,
        aliases      : (Array.isArray(p.persona?.aliases) ? p.persona.aliases : []),
        localSummary : p.localSummary
      }))
    });
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
  async function resolvePersonaTitles(bookId: string): Promise<number> {
    // 1. 加载书籍信息以及所有 TITLE_ONLY Persona。
    const book = await prismaClient.book.findUnique({
      where : { id: bookId },
      select: { title: true, aiModelId: true }
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
    const runtimeAiClient = await createRuntimeAiClient(book.aiModelId);
    const resolutions = await runtimeAiClient.resolvePersonaTitles({
      bookTitle: book.title,
      entries
    });

    // 3. 按置信度分流处理。
    //    mergePersonas 内部自带 $transaction，单条 update + registerAlias 用独立事务保护一致性。
    let updatedCount = 0;
    for (const r of resolutions) {
      if (r.confidence >= 0.7 && r.realName) {
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

  return { analyzeChapter, resolvePersonaTitles };
}

export const chapterAnalysisService = createChapterAnalysisService(prisma, undefined, aliasRegistryService, defaultValidationAgent);

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
