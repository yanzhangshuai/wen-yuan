import { BioCategory, ProcessingStatus } from "@/generated/prisma/enums";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { GeminiClient } from "@/server/modules/analysis/ai/geminiClient";
import { DeepSeekClient } from "@/server/modules/analysis/ai/deepseekClient";
import type { AiAnalysisClient } from "@/server/modules/analysis/ai/types";
import { PersonaResolver, type ResolveResult } from "@/server/modules/analysis/services/PersonaResolver";
import type { 
  AnalysisProfileContext, 
  BioCategoryValue, 
  ChapterAnalysisResponse 
} from "@/types/analysis";

// 配置常量
const MAX_CHUNK_LENGTH = 3500; // 适配 Gemini/DeepSeek 的最佳 Context Window
const AI_CONCURRENCY = 3;      // 同时解析的分段数，避免触发 API 频控
const AI_MAX_RETRIES = 2;
const AI_RETRY_BASE_MS = 600;
/**
 * 功能：定义章节分析完成后的统计结果结构。
 * 输入：无。
 * 输出：类型约束 ChapterAnalysisResult。
 * 异常：无。
 * 副作用：无。
 */

export interface ChapterAnalysisResult {
  chapterId: string;
  chunkCount: number;
  hallucinationCount: number;
  created: {
    personas: number;
    mentions: number;
    biographies: number;
    relationships: number;
  };
}

/**
 * 功能：执行章节分析主流程并写入结构化文学数据。
 * 输入：构造参数（prismaClient、aiClient）及 analyzeChapter 入参。
 * 输出：ChapterAnalysisResult。
 * 异常：章节不存在、AI 调用失败、数据库失败时抛错。
 * 副作用：写入/删除 mentions、biography_records、relationships、personas、profiles。
 */
export class ChapterAnalysisService {
  private readonly aiClient: AiAnalysisClient;
  private readonly personaResolver: PersonaResolver;

  constructor(
    private readonly prismaClient: PrismaClient = prisma, 
    aiClient?: AiAnalysisClient
  ) {
    this.aiClient = aiClient ?? this.createAiClient();
    this.personaResolver = new PersonaResolver(prismaClient);
  }

  /**
   * 功能：执行单章节分析主流程（读取、分段、AI 解析、事务落库）。
   * 输入：chapterId - 章节主键 UUID。
   * 输出：ChapterAnalysisResult 统计结果。
   * 异常：章节不存在、AI 调用失败、数据库失败时抛错。
   * 副作用：更新该章节的 mentions / biography_records / relationships 等数据。
   */
  async analyzeChapter(chapterId: string): Promise<ChapterAnalysisResult> {
    this.log("analysis.start", { chapterId });

    // 拉取章节与当前书人物档案（用于 Prompt 实体上下文）。
    const chapter = await this.prismaClient.chapter.findUnique({
      where: { id: chapterId },
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
      personaId: p.personaId,
      canonicalName: p.persona.name,
      aliases: Array.from(new Set([p.localName, ...p.persona.globalTags])).filter(Boolean) as string[],
      localSummary: p.localSummary
    }));

    // 2. 文本切分
    const chunks = this.splitContentIntoChunks(chapter.content, MAX_CHUNK_LENGTH);
    
    // 3. 并发 AI 解析 (分批处理，防止 API 崩盘)
    const aiResults: ChapterAnalysisResponse[] = [];
    for (let i = 0; i < chunks.length; i += AI_CONCURRENCY) {
      const batch = chunks.slice(i, i + AI_CONCURRENCY);
      const batchPromises = batch.map((chunk, idx) => 
        this.analyzeChunkWithRetry({
          bookTitle: chapter.book.title,
          chapterNo: chapter.no,
          chapterTitle: chapter.title,
          content: chunk,
          profiles,
          chunkIndex: i + idx,
          chunkCount: chunks.length
        })
      );
      const results = await Promise.all(batchPromises);
      aiResults.push(...results);
    }

    const merged = this.mergeChunkResults(aiResults);

    // 4. 事务持久化 (Prisma 7 批量写入优化)
    const stats = await this.prismaClient.$transaction(async (tx) => {
      return await this.persistResult(tx, {
        chapterId: chapter.id,
        chapterNo: chapter.no,
        bookId: chapter.bookId,
        chapterContent: chapter.content,
        merged
      });
    }, {
      timeout: 30000 // 调高事务超时，防止长章节写入失败
    });

    this.log("analysis.completed", { chapterId, ...stats });

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
  private async persistResult(
    tx: Prisma.TransactionClient,
    input: {
      chapterId: string;
      chapterNo: number;
      bookId: string;
      chapterContent: string;
      merged: ChapterAnalysisResponse;
    }
  ): Promise<Omit<ChapterAnalysisResult, "chapterId" | "chunkCount">> {
    // 幂等重跑策略：先清空本章草稿数据，再写入新结果。
    await tx.mention.deleteMany({ where: { chapterId: input.chapterId } });
    await tx.biographyRecord.deleteMany({ 
      where: { chapterId: input.chapterId, status: ProcessingStatus.DRAFT } 
    });
    await tx.relationship.deleteMany({ 
      where: { chapterId: input.chapterId, status: ProcessingStatus.DRAFT } 
    });

    const cache = new Map<string, ResolveResult>();
    let personaCreated = 0;
    let hallucinationCount = 0;
    const hallucinatedNamesLogged = new Set<string>();

    // 统一实体对齐方法
    const resolve = async (name: string) => {
      if (!cache.has(name)) {
        const res = await this.personaResolver.resolve({
          bookId: input.bookId,
          extractedName: name,
          chapterContent: input.chapterContent
        }, tx);
        cache.set(name, res);
        if (res.status === "created") personaCreated++;
        if (res.status === "hallucinated" && !hallucinatedNamesLogged.has(name)) {
          hallucinatedNamesLogged.add(name);
          this.log("analysis.hallucination", {
            chapterId: input.chapterId,
            name,
            confidence: res.confidence,
            reason: res.reason ?? "unknown",
            matchedName: res.matchedName ?? null
          });
        }
      }
      return cache.get(name)!;
    };

    // --- 准备批量数据 ---
    
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
          rawText: m.rawText,
          summary: m.summary,
          paraIndex: m.paraIndex
        });
      }
    }

    const bioData: Prisma.BiographyRecordCreateManyInput[] = [];
    const bioKeys = new Set<string>();
    // 写入 biography_records（生平轨迹）
    
    for (const b of input.merged.biographies) {
      const res = await resolve(b.personaName);
      if (res.status === "hallucinated") {
        hallucinationCount += 1;
        continue;
      }
      if (res.personaId) {
        const normalizedCategory = this.normalizeCategory(b.category);
        const sanitizedIrony = this.sanitizeIronyNote(b.ironyNote);
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
          chapterId: input.chapterId,
          chapterNo: input.chapterNo,
          personaId: res.personaId,
          category: normalizedCategory,
          event: b.event,
          title: b.title,
          location: b.location,
          virtualYear: b.virtualYear,
          ironyNote: sanitizedIrony,
          status: ProcessingStatus.DRAFT
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
        const key = [
          input.chapterId,
          s.personaId,
          t.personaId,
          r.type,
          r.description ?? ""
        ].join("|");
        if (relationKeys.has(key)) continue;
        relationKeys.add(key);

        relationData.push({
          chapterId: input.chapterId,
          sourceId: s.personaId,
          targetId: t.personaId,
          type: r.type,
          weight: r.weight ?? 1,
          description: r.description,
          status: ProcessingStatus.DRAFT
        });
      }
    }

    // --- 执行 Prisma 7 批量写入 ---
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
        personas: personaCreated,
        mentions: mentionData.length,
        biographies: bioData.length,
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

  private splitContentIntoChunks(text: string, size: number): string[] {
    const paras = text.split(/\n+/).filter(p => p.trim());
    const chunks: string[] = [];
    let current = "";
    for (const p of paras) {
      // 当单段本身超长时，按固定窗口硬切，避免超出模型输入上限。
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
  private mergeChunkResults(results: ChapterAnalysisResponse[]): ChapterAnalysisResponse {
    return {
      biographies: results.flatMap(r => r.biographies),
      mentions: results.flatMap(r => r.mentions),
      relationships: results.flatMap(r => r.relationships)
    };
  }

  private normalizeCategory(val: BioCategoryValue): BioCategory {
    const map: Record<string, BioCategory> = {
      BIRTH: BioCategory.BIRTH,
      EXAM: BioCategory.EXAM,
      CAREER: BioCategory.CAREER,
      TRAVEL: BioCategory.TRAVEL,
      SOCIAL: BioCategory.SOCIAL,
      DEATH: BioCategory.DEATH
    };
    return map[val] ?? BioCategory.EVENT;
  }

/**
 * ironyNote 常出现“泛化标签”与“剧情猜测”，这里做保守抽取：
 * 1) 限制长度，避免把整段解释写入数据库；
 * 2) 只保留当前章节可证据化的讽刺描述；
 * 3) 若内容过于空泛（如“很讽刺”“批判社会”）则置空，避免污染 biography_records。
 */
  private sanitizeIronyNote(note?: string): string | undefined {
    if (!note) return undefined;
    const clean = note.replace(/\s+/g, " ").trim();
    return clean.length < 5 ? undefined : clean.slice(0, 300);
  }

  private createAiClient(): AiAnalysisClient {
    const p = (process.env.AI_PROVIDER || "gemini").toLowerCase();
    if (p === "gemini") return new GeminiClient();
    if (p === "deepseek") return new DeepSeekClient();
    throw new Error(`Unsupported AI_PROVIDER: ${p}`);
  }

  private async analyzeChunkWithRetry(input: Parameters<AiAnalysisClient["analyzeChapterChunk"]>[0]): Promise<ChapterAnalysisResponse> {
    let attempt = 0;
    let lastError: unknown;

    while (attempt <= AI_MAX_RETRIES) {
      try {
        return await this.aiClient.analyzeChapterChunk(input);
      } catch (error) {
        lastError = error;
        if (!this.isRetryableAiError(error) || attempt === AI_MAX_RETRIES) {
          throw error;
        }
        const waitMs = AI_RETRY_BASE_MS * (attempt + 1);
        this.log("analysis.ai_retry", {
          chunkIndex: input.chunkIndex,
          attempt: attempt + 1,
          waitMs,
          reason: error instanceof Error ? error.message : String(error)
        });
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        attempt += 1;
      }
    }

    throw lastError instanceof Error ? lastError : new Error("AI chunk analysis failed");
  }

  private isRetryableAiError(error: unknown): boolean {
    const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
    return (
      message.includes("429") ||
      message.includes("rate limit") ||
      message.includes("timeout") ||
      message.includes("temporarily unavailable") ||
      message.includes("econnreset") ||
      message.includes("network")
    );
  }

  private log(event: string, data: Record<string, unknown>) {
    console.info(`[ChapterAnalysisService] ${event}:`, JSON.stringify(data));
  }
}

export const chapterAnalysisService = new ChapterAnalysisService();
