/**
 * 文件定位（Stage A · 章节硬提取服务）：
 * - 三阶段架构 Stage A 的主服务类。
 * - 契约源：`docs/superpowers/specs/2026-04-17-character-extraction-accuracy-redesign.md`
 *   §0-FINAL / §0-5 / §0-8 / §0-1 REV-1。
 *
 * 职责：
 * 1. 调用 Stage 0 `preprocessChapter` 获取 regions / confidence / deathMarkers。
 * 2. 拼接 regionMap 字符串注入 Prompt；调用 `resolvePromptTemplate('STAGE_A_EXTRACT_MENTIONS')`。
 * 3. 通过 `getFewShots(bookTypeCode, 'STAGE_A')` 注入 few-shot 示例。
 * 4. 调用注入的 `AiProviderClient.generateJson` 获得模型输出。
 * 5. 解析 JSON、逐条过 `enforceRegionOverride` 规则层。
 * 6. 在事务内：先删旧 (bookId, chapterId) mentions，再 createMany 写入。
 * 7. 返回 `StageAResult`：mentionCount / regionBreakdown / confidence / overrideHits。
 *
 * 设计约束：
 * - **禁止**任何跨 mention 合并、跨章聚合、跨称呼推断（Stage B/C 职责）。
 * - **禁止**直接写 `personas` / `mentions` / `biography_records`（严格隔离）。
 * - AI Provider 由构造器注入（便于测试 mock）；真实调用方参考现有 AiCallExecutor。
 * - Prisma 客户端由构造器注入，内部仅使用 `personaMention.deleteMany / createMany` +
 *   `$transaction`，保持最小面积。
 */

import type { AliasType, BookTypeCode, IdentityClaim, PrismaClient } from "@/generated/prisma/client";
import type { PromptMessageInput } from "@/types/pipeline";
import type { AiProviderClient } from "@/server/providers/ai";
import { preprocessChapter } from "@/server/modules/analysis/preprocessor/ChapterPreprocessor";
import type {
  PreprocessRegion,
  RegionMapEntry,
  RegionType
} from "@/server/modules/analysis/preprocessor/types";
import { resolvePromptTemplate } from "@/server/modules/knowledge";
import { getFewShots } from "@/server/modules/analysis/prompts/resolveBookTypeFewShots";
import { enforceRegionOverride } from "@/server/modules/analysis/pipelines/threestage/stageA/enforceRegionOverride";
import { filterGenericMentions } from "@/server/modules/analysis/pipelines/threestage/stageA/genericTermFilter";
import { parseLlmJsonSafely } from "@/server/modules/analysis/pipelines/threestage/shared/parseLlmJson";
import type {
  RegionBreakdown,
  StageAMention,
  StageARawMention,
  StageAResult
} from "@/server/modules/analysis/pipelines/threestage/stageA/types";

const STAGE_A_SLUG = "STAGE_A_EXTRACT_MENTIONS";

const VALID_ALIAS_TYPES = new Set<AliasType>([
  "TITLE",
  "POSITION",
  "KINSHIP",
  "NICKNAME",
  "COURTESY_NAME",
  "NAMED",
  "IMPERSONATED_IDENTITY",
  "MISIDENTIFIED_AS",
  "UNSURE"
]);

const VALID_IDENTITY_CLAIMS = new Set<IdentityClaim>([
  "SELF",
  "IMPERSONATING",
  "QUOTED",
  "REPORTED",
  "HISTORICAL",
  "UNSURE"
]);

const VALID_REGION_TYPES = new Set<RegionType>([
  "NARRATIVE",
  "POEM",
  "DIALOGUE",
  "COMMENTARY"
]);

/** Stage A 运行时入参。 */
export interface StageAExtractInput {
  bookId      : string;
  chapterId   : string;
  chapterNo   : number;
  chapterText : string;
  bookTypeCode: BookTypeCode;
  /** 归属 Analysis Job（可选，便于按 job 清理 / 追溯）。 */
  jobId?      : string;
}

/** Extractor 依赖的 Prisma 子集（便于测试时用最小 mock 替代）。 */
export type StageAPrismaClient = Pick<PrismaClient, "personaMention" | "$transaction">;

/**
 * LLM 返回必须顶层为 `{ mentions: [...] }`，本错误用于解析失败路径。
 */
export class StageAExtractionError extends Error {
  readonly rawResponse: string;
  constructor(message: string, rawResponse: string) {
    super(message);
    this.name = "StageAExtractionError";
    this.rawResponse = rawResponse;
  }
}

/**
 * 将 regionMap 精简列表序列化为人类可读字符串，供 Prompt 注入。
 *
 * 格式示例：`POEM: 第12-45字; DIALOGUE: 第60-120字（说话人=王冕）`
 */
function formatRegionAnnotations(regions: readonly PreprocessRegion[]): string {
  if (regions.length === 0) return "（全文未识别出特殊区段）";
  return regions
    .map((r) => {
      const base = `${r.type}: 第${r.start}-${r.end}字`;
      if (r.type === "DIALOGUE" && r.speaker) {
        return `${base}（说话人=${r.speaker}）`;
      }
      return base;
    })
    .join("; ");
}

/** 解析并校验单条 LLM mention；失败项返回 null 由上层过滤。 */
function parseRawMention(raw: unknown): StageARawMention | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  const surfaceForm = typeof obj.surfaceForm === "string" ? obj.surfaceForm.trim() : "";
  if (surfaceForm.length === 0 || surfaceForm.length > 20) return null;

  const aliasTypeStr = typeof obj.aliasType === "string" ? obj.aliasType : "";
  const aliasType = VALID_ALIAS_TYPES.has(aliasTypeStr as AliasType)
    ? (aliasTypeStr as AliasType)
    : "UNSURE";

  const identityClaimStr = typeof obj.identityClaim === "string" ? obj.identityClaim : "UNSURE";
  const identityClaim = VALID_IDENTITY_CLAIMS.has(identityClaimStr as IdentityClaim)
    ? (identityClaimStr as IdentityClaim)
    : "UNSURE";

  const regionTypeStr = typeof obj.narrativeRegionType === "string" ? obj.narrativeRegionType : "NARRATIVE";
  const narrativeRegionType = VALID_REGION_TYPES.has(regionTypeStr as RegionType)
    ? (regionTypeStr as RegionType)
    : "NARRATIVE";

  const suspectedResolvesTo =
    typeof obj.suspectedResolvesTo === "string" && obj.suspectedResolvesTo.length > 0
      ? obj.suspectedResolvesTo
      : null;

  const evidenceRawSpan =
    typeof obj.evidenceRawSpan === "string" ? obj.evidenceRawSpan : "";

  const actionVerb =
    typeof obj.actionVerb === "string" && obj.actionVerb.length > 0
      ? obj.actionVerb
      : null;

  const confidenceRaw = typeof obj.confidence === "number" ? obj.confidence : 0;
  const confidence = Math.min(1, Math.max(0, confidenceRaw));

  return {
    surfaceForm,
    aliasType,
    identityClaim,
    narrativeRegionType,
    suspectedResolvesTo,
    evidenceRawSpan,
    actionVerb,
    confidence
  };
}

/**
 * 解析 LLM 输出字符串为 `StageARawMention[]`。
 * 支持两种顶层形态：`{mentions: [...]}` 或 `[...]`（后者是兜底）。
 * 解析失败直接抛 `StageAExtractionError`。
 */
export function parseStageAResponse(content: string): StageARawMention[] {
  const parsed = parseLlmJsonSafely(content);
  if (parsed === null) {
    throw new StageAExtractionError("Stage A JSON 解析失败", content);
  }

  let rawArray: unknown[];
  if (Array.isArray(parsed)) {
    rawArray = parsed;
  } else if (parsed && typeof parsed === "object" && Array.isArray((parsed as { mentions?: unknown[] }).mentions)) {
    rawArray = (parsed as { mentions: unknown[] }).mentions;
  } else {
    throw new StageAExtractionError("Stage A 返回缺少 mentions 数组", content);
  }

  const mentions: StageARawMention[] = [];
  for (const raw of rawArray) {
    const parsedMention = parseRawMention(raw);
    if (parsedMention) mentions.push(parsedMention);
  }
  return mentions;
}

/** 按 RegionType 聚合区段命中计数。 */
function buildRegionBreakdown(mentions: readonly StageAMention[]): RegionBreakdown {
  const breakdown: RegionBreakdown = {
    NARRATIVE : 0,
    POEM      : 0,
    DIALOGUE  : 0,
    COMMENTARY: 0
  };
  for (const m of mentions) breakdown[m.narrativeRegionType] += 1;
  return breakdown;
}

/**
 * Stage A 硬提取服务。
 *
 * 使用：
 * ```ts
 * const extractor = new StageAExtractor(aiClient, prisma);
 * const result = await extractor.extract({ bookId, chapterId, chapterNo, chapterText, bookTypeCode });
 * ```
 */
export class StageAExtractor {
  constructor(
    private readonly aiClient: AiProviderClient,
    private readonly prisma  : StageAPrismaClient
  ) {}

  async extract(input: StageAExtractInput): Promise<StageAResult> {
    const { bookId, chapterId, chapterNo, chapterText, bookTypeCode, jobId } = input;

    // 1. Stage 0 预处理
    const pre = preprocessChapter(chapterText, chapterNo);

    // 2. 拼接 Prompt 替换参数
    const regionAnnotations = formatRegionAnnotations(pre.regions);
    const fewShots = await getFewShots(bookTypeCode, "STAGE_A");

    const prompt: PromptMessageInput = await this.buildPrompt({
      bookId,
      chapterNo,
      chapterText,
      regionMap: regionAnnotations,
      fewShots
    });

    // 3. 调 AI（非流式）
    const aiResult = await this.aiClient.generateJson(prompt, {
      temperature: 0
    });

    // 4. 解析 + 覆写
    const rawMentions = parseStageAResponse(aiResult.content);
    const overridden: StageAMention[] = rawMentions.map((m) =>
      enforceRegionOverride(m, chapterText, pre.regions)
    );
    // 4.1 过滤纯泛称 / 代词指代（"母亲、儿、娘、道士、虔婆、他母亲、令叔祖" 等）
    const { kept: mentions, dropped: genericDropped } = filterGenericMentions(overridden);
    if (genericDropped.length > 0) {
      console.info(
        "[StageAExtractor] generic.filter",
        JSON.stringify({
          chapterId,
          chapterNo,
          dropped: genericDropped.map((m) => m.surfaceForm).slice(0, 20),
          count  : genericDropped.length
        })
      );
    }

    // 5. 持久化（幂等：同 (bookId, chapterId) 重跑先删旧）
    await this.persist({ bookId, chapterId, chapterNo, jobId, mentions });

    // 6. 审计统计
    const overrideHits: Record<string, number> = {};
    for (const m of mentions) {
      if (m.regionOverrideApplied) {
        overrideHits[m.regionOverrideApplied] =
          (overrideHits[m.regionOverrideApplied] ?? 0) + 1;
      }
    }

    return {
      mentionCount          : mentions.length,
      regionBreakdown       : buildRegionBreakdown(mentions),
      preprocessorConfidence: pre.confidence,
      overrideHits,
      mentions
    };
  }

  /**
   * 组装 Stage A Prompt：
   * - `{chapterNo}` / `{chapterText}` / `{regionMap}` / `{bookTypeFewShots}` /
   *   `{bookTypeSpecialRules}` 占位符按契约注入。
   * - `{bookTypeSpecialRules}` 由后续任务扩展，当前填空串。
   */
  private async buildPrompt(params: {
    bookId     : string;
    chapterNo  : number;
    chapterText: string;
    regionMap  : string;
    fewShots   : string;
  }): Promise<PromptMessageInput> {
    const resolved = await resolvePromptTemplate({
      slug        : STAGE_A_SLUG,
      bookTypeId  : null,
      replacements: {
        bookId              : params.bookId,
        chapterNo           : String(params.chapterNo),
        chapterText         : params.chapterText,
        regionMap           : params.regionMap,
        // 别名兼容：部分早期契约文档写作 regionAnnotations
        regionAnnotations   : params.regionMap,
        bookTypeFewShots    : params.fewShots,
        bookTypeSpecialRules: ""
      }
    });

    return { system: resolved.system, user: resolved.user };
  }

  /**
   * 幂等落库：同 (bookId, chapterId) 先 delete 再 createMany；整个过程在事务内完成。
   */
  private async persist(params: {
    bookId   : string;
    chapterId: string;
    chapterNo: number;
    jobId?   : string;
    mentions : readonly StageAMention[];
  }): Promise<void> {
    const { bookId, chapterId, chapterNo, jobId, mentions } = params;

    const data = mentions.map((m) => ({
      bookId,
      chapterId,
      chapterNo,
      jobId              : jobId ?? null,
      surfaceForm        : m.surfaceForm,
      aliasTypeHint      : m.aliasType,
      identityClaim      : m.identityClaim,
      suspectedResolvesTo: m.suspectedResolvesTo,
      narrativeRegionType: m.narrativeRegionType,
      actionVerb         : m.actionVerb,
      rawSpan            : m.evidenceRawSpan,
      spanStart          : m.spanStart,
      spanEnd            : m.spanEnd,
      sceneContextHint   : null,
      confidence         : m.confidence
    }));

    await this.prisma.$transaction(async (tx) => {
      await tx.personaMention.deleteMany({
        where: { bookId, chapterId }
      });
      if (data.length > 0) {
        await tx.personaMention.createMany({ data });
      }
    });
  }
}

// 便于测试直接引用
export { formatRegionAnnotations };
export type { RegionMapEntry };
