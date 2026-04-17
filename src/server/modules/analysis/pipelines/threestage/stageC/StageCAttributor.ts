/**
 * 文件定位（Stage C · 章节事件归属主服务）：
 * - 三阶段架构 Stage C 的主服务类。
 * - 契约源：`docs/superpowers/specs/2026-04-17-character-extraction-accuracy-redesign.md`
 *   §0-FINAL / §0-2（双源死亡章节）/ §0-5（区段硬约束 + REV-1）/ §0-6（四条件过滤）/
 *   §0-14（Stage C → B 反馈通道）。
 *
 * 职责：
 * 1. 扫 `persona_mentions WHERE bookId AND promotedPersonaId IS NOT NULL`，按 chapterId 聚合，
 *    为每章构造 { 章节原文 + 该章节所有晋级 persona + 预处理 regions } 的输入组。
 * 2. 对每个章节调 Prompt C：
 *    - 通过 `resolvePromptTemplate('STAGE_C_ATTRIBUTE_EVENT')` 拼装；
 *    - 通过 `getFewShots(typeCode, 'STAGE_C')` 注入 few-shot；
 *    - 非流式 generateJson，temperature=0。
 * 3. 解析 LLM 返回：`{ records: [{ personaCanonicalName, narrativeLens, narrativeRegionType,
 *    category, rawSpan, actionVerb?, title?, location?, virtualYear?, summary?, confidence? }] }`。
 * 4. 对每条 biography 应用 `enforceBiographyRegionConstraint`（§0-5 + REV-1）。
 * 5. 以 `isEffectiveBiography` 四条件过滤（§0-6）决定 `isEffective` 字段；
 *    **不满足四条件的记录仍落库**，仅不计入 `persona.effectiveBiographyCount`。
 * 6. §0-2 双源死亡：
 *    - Stage 0：从 `chapter_preprocess_results.death_markers` 读；无则回退到 `preprocessChapter()`；
 *    - Stage C：category=DEATH 的 biography；
 *    - 冲突以 Stage 0 为准（正则确定性高）；均未命中不更新。
 * 7. §0-14 反馈：LLM 返回的 personaCanonicalName 在 Stage B 晋级 persona 列表里找不到，
 *    但在同书另一 persona（非本章组）命中 → 写 `merge_suggestions(source='STAGE_C_FEEDBACK',
 *    status='PENDING', evidenceRefs.kind='ENTITY_REVIEW')`；下次 Stage B 消费。
 * 8. 幂等：同 (bookId, chapterId) 重跑先 deleteMany AI-source biography_records 再 createMany。
 *
 * 禁止：
 * - 不运行时回环调 Stage B；
 * - 不改动 `persona_mentions`；
 * - 不直接合并 persona（反馈走队列）。
 */

import type {
  BioCategory,
  BookTypeCode,
  NarrativeLens,
  PrismaClient
} from "@/generated/prisma/client";
import type { AiProviderClient } from "@/server/providers/ai";
import type { PromptMessageInput } from "@/types/pipeline";

import { preprocessChapter } from "@/server/modules/analysis/preprocessor/ChapterPreprocessor";
import type {
  DeathMarkerHit,
  PreprocessRegion,
  RegionType
} from "@/server/modules/analysis/preprocessor/types";
import { resolvePromptTemplate } from "@/server/modules/knowledge";
import { getFewShots } from "@/server/modules/analysis/prompts/resolveBookTypeFewShots";

import {
  enforceBiographyRegionConstraint,
  isEffectiveBiography
} from "@/server/modules/analysis/pipelines/threestage/stageC/enforceBiographyRegionConstraint";
import type {
  DeathChapterUpdate,
  StageCBiography,
  StageCChapterGroup,
  StageCFeedbackAction,
  StageCRawBiography,
  StageCResult
} from "@/server/modules/analysis/pipelines/threestage/stageC/types";

const STAGE_C_SLUG = "STAGE_C_ATTRIBUTE_EVENT";

const VALID_LENSES = new Set<NarrativeLens>([
  "SELF",
  "IMPERSONATING",
  "QUOTED",
  "REPORTED",
  "HISTORICAL"
]);

const VALID_CATEGORIES = new Set<BioCategory>([
  "BIRTH",
  "EXAM",
  "CAREER",
  "TRAVEL",
  "SOCIAL",
  "DEATH",
  "EVENT"
]);

const VALID_REGION_TYPES = new Set<RegionType>([
  "NARRATIVE",
  "POEM",
  "DIALOGUE",
  "COMMENTARY"
]);

/** 需要的 Prisma 最小面，便于测试注入 mock。 */
export type StageCPrismaClient = Pick<
  PrismaClient,
  | "book"
  | "chapter"
  | "persona"
  | "personaMention"
  | "biographyRecord"
  | "mergeSuggestion"
  | "chapterPreprocessResult"
  | "$transaction"
>;

export interface StageCAttributeInput {
  bookId: string;
  /** 关联 Analysis Job（可选，便于按 job 清理）。 */
  jobId?: string;
}

export class StageCAttributionError extends Error {
  readonly rawResponse: string;
  constructor(message: string, rawResponse: string) {
    super(message);
    this.name = "StageCAttributionError";
    this.rawResponse = rawResponse;
  }
}

/** `persona_mentions` 在 Stage C 读时的最小模型。 */
interface StageCMentionRow {
  id               : string;
  chapterId        : string;
  chapterNo        : number;
  surfaceForm      : string;
  aliasTypeHint    : string;
  identityClaim    : string;
  actionVerb       : string | null;
  rawSpan          : string;
  promotedPersonaId: string;
}

/** 章节 chapter 读模型。 */
interface ChapterRow {
  id       : string;
  chapterNo: number;
  content  : string;
}

/** 书中的 persona 读模型（含 aliases + deathChapterNo）。 */
interface PersonaRow {
  id            : string;
  name          : string;
  aliases       : readonly string[];
  deathChapterNo: number | null;
}

/** 解析并校验单条 LLM biography；失败返回 null。 */
function parseRawBiography(raw: unknown): StageCRawBiography | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  const personaCanonicalName =
    typeof obj.personaCanonicalName === "string" ? obj.personaCanonicalName.trim() : "";
  if (personaCanonicalName.length === 0) return null;

  const rawSpan = typeof obj.rawSpan === "string" ? obj.rawSpan : "";
  if (rawSpan.length === 0) return null;

  const lensStr = typeof obj.narrativeLens === "string" ? obj.narrativeLens : "SELF";
  const narrativeLens: NarrativeLens = VALID_LENSES.has(lensStr as NarrativeLens)
    ? (lensStr as NarrativeLens)
    : "SELF";

  const regionTypeStr =
    typeof obj.narrativeRegionType === "string" ? obj.narrativeRegionType : "NARRATIVE";
  const narrativeRegionType: RegionType = VALID_REGION_TYPES.has(regionTypeStr as RegionType)
    ? (regionTypeStr as RegionType)
    : "NARRATIVE";

  const categoryStr = typeof obj.category === "string" ? obj.category : "EVENT";
  const category: BioCategory = VALID_CATEGORIES.has(categoryStr as BioCategory)
    ? (categoryStr as BioCategory)
    : "EVENT";

  const actionVerb =
    typeof obj.actionVerb === "string" && obj.actionVerb.length > 0
      ? obj.actionVerb
      : null;

  const title = typeof obj.title === "string" && obj.title.length > 0 ? obj.title : null;
  const location =
    typeof obj.location === "string" && obj.location.length > 0 ? obj.location : null;
  const virtualYear =
    typeof obj.virtualYear === "string" && obj.virtualYear.length > 0
      ? obj.virtualYear
      : null;
  const summary = typeof obj.summary === "string" ? obj.summary : "";
  const confidenceRaw = typeof obj.confidence === "number" ? obj.confidence : 0.8;
  const confidence = Math.min(1, Math.max(0, confidenceRaw));

  return {
    personaCanonicalName,
    narrativeLens,
    narrativeRegionType,
    category,
    rawSpan,
    actionVerb,
    title,
    location,
    virtualYear,
    summary,
    confidence
  };
}

/**
 * 解析 LLM 返回字符串为 `StageCRawBiography[]`。
 * 支持顶层形态：`{records: [...]}` 或 `[...]`（兜底）。
 */
export function parseStageCResponse(content: string): StageCRawBiography[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new StageCAttributionError("Stage C JSON 解析失败", content);
  }

  let rawArray: unknown[];
  if (Array.isArray(parsed)) {
    rawArray = parsed;
  } else if (
    parsed
    && typeof parsed === "object"
    && Array.isArray((parsed as { records?: unknown[] }).records)
  ) {
    rawArray = (parsed as { records: unknown[] }).records;
  } else {
    throw new StageCAttributionError("Stage C 返回缺少 records 数组", content);
  }

  const out: StageCRawBiography[] = [];
  for (const raw of rawArray) {
    const parsedBio = parseRawBiography(raw);
    if (parsedBio) out.push(parsedBio);
  }
  return out;
}

/** 将 regions 列表序列化为 Prompt C 输入的 regionMap 字符串。 */
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

/** 将该章节已晋级 persona 列表序列化为 Prompt C 输入。 */
function formatResolvedPersonas(
  personas: StageCChapterGroup["personas"]
): string {
  if (personas.length === 0) return "（本章尚无晋级 persona）";
  return personas
    .map(
      (p) =>
        `- ${p.canonicalName}${
          p.aliases.length > 0 ? `（别名：${p.aliases.join("、")}）` : ""
        }`
    )
    .join("\n");
}

/** 将该章节的 mention 列表序列化为 Prompt C 输入。 */
function formatMentions(mentions: readonly StageCMentionRow[]): string {
  if (mentions.length === 0) return "（无 mention）";
  return mentions
    .map(
      (m) =>
        `- ${m.surfaceForm}｜aliasTypeHint=${m.aliasTypeHint}｜identityClaim=${m.identityClaim}｜rawSpan="${m.rawSpan}"`
    )
    .join("\n");
}

/**
 * Stage C 章节事件归属主服务。
 *
 * 使用：
 * ```ts
 * const attributor = new StageCAttributor(aiClient, prisma);
 * const result = await attributor.attribute({ bookId });
 * ```
 */
export class StageCAttributor {
  constructor(
    private readonly aiClient: AiProviderClient,
    private readonly prisma  : StageCPrismaClient
  ) {}

  async attribute(input: StageCAttributeInput): Promise<StageCResult> {
    const { bookId, jobId } = input;

    // 1. 加载书籍（含 typeCode）
    const book = await this.prisma.book.findUnique({
      where : { id: bookId },
      select: { id: true, title: true, typeCode: true }
    });
    if (book === null) {
      throw new Error(`StageCAttributor: book not found: ${bookId}`);
    }

    // 2. 加载全书已晋级 mentions（promotedPersonaId 非空）+ 相关 persona 表
    const mentions = await this.loadPromotedMentions(bookId);
    if (mentions.length === 0) {
      return this.emptyResult(bookId);
    }

    const allPersonas = await this.loadPersonas(bookId);
    const personaById = new Map(allPersonas.map((p) => [p.id, p]));
    // canonical name & alias → personaId（用于 §0-14 反馈查找）
    const nameToPersonaId = this.buildNameIndex(allPersonas);

    // 3. 按 chapterId 聚合
    const chapterGroups = await this.groupByChapter(mentions, personaById);

    // 4. 逐章跑 LLM + 覆写 + 落库
    const allBiographies: StageCBiography[] = [];
    const overrideHits: Record<string, number> = {};
    const feedbackSuggestions: StageCFeedbackAction[] = [];
    let llmInvocations = 0;

    const deathStage0ByPersona = new Map<string, number>(); // personaId → earliest chapterNo
    const deathStageCByPersona = new Map<string, number>();

    for (const group of chapterGroups) {
      // Stage 0 death marker 收集
      const { regions, deathMarkerHits } = await this.loadPreprocess(
        group.chapterId,
        group.chapterNo,
        group.chapterText
      );
      for (const hit of deathMarkerHits) {
        if (hit.subjectCandidate === null) continue;
        const pid = nameToPersonaId.get(hit.subjectCandidate);
        if (pid === undefined) continue;
        const prev = deathStage0ByPersona.get(pid);
        if (prev === undefined || hit.chapterNo < prev) {
          deathStage0ByPersona.set(pid, hit.chapterNo);
        }
      }

      // Prompt C 调用
      const chapterMentions = mentions.filter((m) => m.chapterId === group.chapterId);
      const prompt = await this.buildPrompt({
        bookId,
        chapterNo   : group.chapterNo,
        chapterText : group.chapterText,
        regions,
        personas    : group.personas,
        mentions    : chapterMentions,
        bookTypeCode: book.typeCode
      });

      const aiResult = await this.aiClient.generateJson(prompt, { temperature: 0 });
      llmInvocations += 1;
      const rawBiographies = parseStageCResponse(aiResult.content);

      for (const raw of rawBiographies) {
        // 解析 personaCanonicalName → personaId
        const inGroup = group.personas.find((p) => p.canonicalName === raw.personaCanonicalName);
        let personaId: string | null = null;
        if (inGroup) {
          personaId = inGroup.personaId;
        } else {
          // §0-14 反馈：LLM 给出的 personaCanonicalName 在本章组找不到，但在同书存在
          const externalPid = nameToPersonaId.get(raw.personaCanonicalName);
          if (externalPid !== undefined && group.personas.length > 0) {
            const feedback = await this.persistFeedbackSuggestion({
              bookId,
              sourcePersonaId: group.personas[0].personaId,
              targetPersonaId: externalPid,
              reason         : `Stage C 归属指向本章未晋级的 persona "${raw.personaCanonicalName}"；Stage B 下次消费复核`,
              rawSpan        : raw.rawSpan,
              chapterNo      : group.chapterNo
            });
            feedbackSuggestions.push(feedback);
            // 反馈完成后仍然尝试把 biography 归给外部 persona（保留数据）
            personaId = externalPid;
          } else {
            // 完全找不到 → 跳过
            continue;
          }
        }

        // 区段覆写
        const override = enforceBiographyRegionConstraint({
          personaCanonicalName: raw.personaCanonicalName,
          narrativeLens       : raw.narrativeLens,
          narrativeRegionType : raw.narrativeRegionType,
          rawSpan             : raw.rawSpan,
          chapterText         : group.chapterText,
          regions
        });

        if (override.regionOverrideApplied !== null) {
          overrideHits[override.regionOverrideApplied] =
            (overrideHits[override.regionOverrideApplied] ?? 0) + 1;
        }

        // §0-6 四条件判定
        const isEffective = isEffectiveBiography({
          narrativeLens      : override.narrativeLens,
          narrativeRegionType: override.narrativeRegionType,
          rawSpan            : raw.rawSpan,
          actionVerb         : raw.actionVerb
        });

        const biography: StageCBiography = {
          personaId,
          personaCanonicalName : raw.personaCanonicalName,
          chapterId            : group.chapterId,
          chapterNo            : group.chapterNo,
          narrativeLens        : override.narrativeLens,
          narrativeRegionType  : override.narrativeRegionType,
          category             : raw.category,
          rawSpan              : raw.rawSpan,
          actionVerb           : raw.actionVerb,
          title                : raw.title,
          location             : raw.location,
          virtualYear          : raw.virtualYear,
          summary              : raw.summary,
          confidence           : raw.confidence,
          spanStart            : override.spanStart,
          spanEnd              : override.spanEnd,
          regionOverrideApplied: override.regionOverrideApplied,
          isEffective
        };
        allBiographies.push(biography);

        // 收集 Stage C 死亡候选
        if (raw.category === "DEATH") {
          const prev = deathStageCByPersona.get(personaId);
          if (prev === undefined || group.chapterNo < prev) {
            deathStageCByPersona.set(personaId, group.chapterNo);
          }
        }
      }
    }

    // 5. 落库 biography_records（按 chapterId 幂等）
    const chapterIds = chapterGroups.map((g) => g.chapterId);
    await this.persistBiographies(bookId, chapterIds, allBiographies);

    // 6. §0-2 双源死亡合并（Stage 0 为准）
    const deathUpdates = this.computeDeathUpdates({
      stage0: deathStage0ByPersona,
      stageC: deathStageCByPersona,
      personaById
    });
    await this.applyDeathUpdates(deathUpdates);

    // 7. 更新 effectiveBiographyCount（全量重算 per-persona）
    await this.recomputeEffectiveCounts(
      new Set(allBiographies.map((b) => b.personaId))
    );

    const effectiveBiographies = allBiographies.filter((b) => b.isEffective).length;

    // jobId 只用于标记日志（未来扩展审计）；此处暂不写额外表
    void jobId;

    return {
      bookId,
      chaptersProcessed  : chapterGroups.length,
      llmInvocations,
      biographiesCreated : allBiographies.length,
      effectiveBiographies,
      overrideHits,
      deathChapterUpdates: deathUpdates,
      feedbackSuggestions,
      biographies        : allBiographies
    };
  }

  // ────────────────────────────── 数据加载 ──────────────────────────────

  private async loadPromotedMentions(bookId: string): Promise<StageCMentionRow[]> {
    const rows = await this.prisma.personaMention.findMany({
      where: {
        bookId,
        promotedPersonaId: { not: null }
      },
      select: {
        id               : true,
        chapterId        : true,
        chapterNo        : true,
        surfaceForm      : true,
        aliasTypeHint    : true,
        identityClaim    : true,
        actionVerb       : true,
        rawSpan          : true,
        promotedPersonaId: true
      },
      orderBy: [{ chapterNo: "asc" }]
    });
    const out: StageCMentionRow[] = [];
    for (const r of rows) {
      if (r.promotedPersonaId === null) continue; // narrowing
      out.push({
        id               : r.id,
        chapterId        : r.chapterId,
        chapterNo        : r.chapterNo,
        surfaceForm      : r.surfaceForm,
        aliasTypeHint    : String(r.aliasTypeHint),
        identityClaim    : String(r.identityClaim),
        actionVerb       : r.actionVerb,
        rawSpan          : r.rawSpan,
        promotedPersonaId: r.promotedPersonaId
      });
    }
    return out;
  }

  private async loadPersonas(bookId: string): Promise<PersonaRow[]> {
    // personas 没有直接的 bookId 关联；通过 personaMention.bookId 过滤参与过的 personaId 集合
    const ids = await this.prisma.personaMention.findMany({
      where   : { bookId, promotedPersonaId: { not: null } },
      select  : { promotedPersonaId: true },
      distinct: ["promotedPersonaId"]
    });
    const personaIds = Array.from(
      new Set(ids.map((r) => r.promotedPersonaId).filter((v): v is string => v !== null))
    );
    if (personaIds.length === 0) return [];

    const rows = await this.prisma.persona.findMany({
      where : { id: { in: personaIds } },
      select: {
        id            : true,
        name          : true,
        aliases       : true,
        deathChapterNo: true
      }
    });
    return rows.map((r) => ({
      id            : r.id,
      name          : r.name,
      aliases       : r.aliases,
      deathChapterNo: r.deathChapterNo
    }));
  }

  private buildNameIndex(personas: readonly PersonaRow[]): Map<string, string> {
    const index = new Map<string, string>();
    for (const p of personas) {
      if (!index.has(p.name)) index.set(p.name, p.id);
      for (const alias of p.aliases) {
        if (!index.has(alias)) index.set(alias, p.id);
      }
    }
    return index;
  }

  private async groupByChapter(
    mentions: readonly StageCMentionRow[],
    personaById: ReadonlyMap<string, PersonaRow>
  ): Promise<StageCChapterGroup[]> {
    const chapterIds = Array.from(new Set(mentions.map((m) => m.chapterId)));
    const chapters = await this.prisma.chapter.findMany({
      where : { id: { in: chapterIds } },
      select: { id: true, no: true, content: true }
    });
    const chapterById = new Map<string, ChapterRow>(
      chapters.map((c) => [c.id, { id: c.id, chapterNo: c.no, content: c.content }])
    );

    const groups: StageCChapterGroup[] = [];
    for (const cid of chapterIds) {
      const ch = chapterById.get(cid);
      if (ch === undefined) continue;
      const personaIds = Array.from(
        new Set(mentions.filter((m) => m.chapterId === cid).map((m) => m.promotedPersonaId))
      );
      const personas = personaIds
        .map((pid) => personaById.get(pid))
        .filter((p): p is PersonaRow => p !== undefined)
        .map((p) => ({
          personaId    : p.id,
          canonicalName: p.name,
          aliases      : p.aliases
        }));
      groups.push({
        chapterId  : ch.id,
        chapterNo  : ch.chapterNo,
        chapterText: ch.content,
        personas
      });
    }
    groups.sort((a, b) => a.chapterNo - b.chapterNo);
    return groups;
  }

  private async loadPreprocess(
    chapterId  : string,
    chapterNo  : number,
    chapterText: string
  ): Promise<{ regions: PreprocessRegion[]; deathMarkerHits: DeathMarkerHit[] }> {
    const row = await this.prisma.chapterPreprocessResult.findUnique({
      where : { chapterId },
      select: { regions: true, deathMarkers: true }
    });

    if (row !== null) {
      const regions = Array.isArray(row.regions)
        ? (row.regions as unknown as PreprocessRegion[])
        : [];
      const deathHits = Array.isArray(row.deathMarkers)
        ? (row.deathMarkers as unknown as DeathMarkerHit[])
        : [];
      if (regions.length > 0 || deathHits.length > 0) {
        return { regions, deathMarkerHits: deathHits };
      }
    }

    // 回退：重新跑 preprocessor
    const pre = preprocessChapter(chapterText, chapterNo);
    return { regions: pre.regions, deathMarkerHits: pre.deathMarkerHits };
  }

  // ────────────────────────────── Prompt ──────────────────────────────

  private async buildPrompt(params: {
    bookId      : string;
    chapterNo   : number;
    chapterText : string;
    regions     : readonly PreprocessRegion[];
    personas    : StageCChapterGroup["personas"];
    mentions    : readonly StageCMentionRow[];
    bookTypeCode: BookTypeCode;
  }): Promise<PromptMessageInput> {
    const fewShots = await getFewShots(params.bookTypeCode, "STAGE_C");
    const regionMap = formatRegionAnnotations(params.regions);
    const resolvedPersonas = formatResolvedPersonas(params.personas);
    const mentions = formatMentions(params.mentions);

    const resolved = await resolvePromptTemplate({
      slug        : STAGE_C_SLUG,
      bookTypeId  : null,
      replacements: {
        bookId              : params.bookId,
        chapterNo           : String(params.chapterNo),
        chapterText         : params.chapterText,
        regionMap,
        regionAnnotations   : regionMap,
        resolvedPersonas,
        mentions,
        bookTypeFewShots    : fewShots,
        bookTypeSpecialRules: ""
      }
    });
    return { system: resolved.system, user: resolved.user };
  }

  // ────────────────────────────── 落库 ──────────────────────────────

  private async persistBiographies(
    bookId     : string,
    chapterIds : readonly string[],
    biographies: readonly StageCBiography[]
  ): Promise<void> {
    if (chapterIds.length === 0) return;

    const data = biographies.map((b) => ({
      personaId            : b.personaId,
      chapterId            : b.chapterId,
      chapterNo            : b.chapterNo,
      category             : b.category,
      title                : b.title,
      location             : b.location,
      event                : b.summary.length > 0 ? b.summary : b.rawSpan,
      virtualYear          : b.virtualYear,
      narrativeLens        : b.narrativeLens,
      narrativeRegionType  : b.narrativeRegionType,
      rawSpan              : b.rawSpan,
      actionVerb           : b.actionVerb,
      isEffective          : b.isEffective,
      regionOverrideApplied: b.regionOverrideApplied,
      attributionConfidence: b.confidence,
      recordSource         : "AI" as const
    }));

    void bookId; // 当前签名保留 bookId 便于后续扩展（按书清理）
    await this.prisma.$transaction(async (tx) => {
      await tx.biographyRecord.deleteMany({
        where: {
          chapterId   : { in: [...chapterIds] },
          recordSource: "AI"
        }
      });
      if (data.length > 0) {
        await tx.biographyRecord.createMany({ data });
      }
    });
  }

  private async persistFeedbackSuggestion(params: {
    bookId         : string;
    sourcePersonaId: string;
    targetPersonaId: string;
    reason         : string;
    rawSpan        : string;
    chapterNo      : number;
  }): Promise<StageCFeedbackAction> {
    const { bookId, sourcePersonaId, targetPersonaId, reason, rawSpan, chapterNo } = params;
    const evidenceRefs: Record<string, unknown> = {
      kind : "ENTITY_REVIEW",
      stage: "STAGE_C_FEEDBACK",
      chapterNo,
      rawSpan
    };
    const row = await this.prisma.mergeSuggestion.create({
      data: {
        bookId,
        sourcePersonaId,
        targetPersonaId,
        reason,
        confidence  : 0,
        status      : "PENDING",
        source      : "STAGE_C_FEEDBACK",
        evidenceRefs: evidenceRefs as unknown as Parameters<
          StageCPrismaClient["mergeSuggestion"]["create"]
        >[0]["data"]["evidenceRefs"]
      },
      select: { id: true }
    });
    return {
      suggestionId: row.id,
      reason,
      sourcePersonaId,
      targetPersonaId,
      kind        : "ENTITY_REVIEW"
    };
  }

  // ────────────────────────────── §0-2 双源死亡 ──────────────────────────────

  private computeDeathUpdates(params: {
    stage0     : ReadonlyMap<string, number>;
    stageC     : ReadonlyMap<string, number>;
    personaById: ReadonlyMap<string, PersonaRow>;
  }): DeathChapterUpdate[] {
    const { stage0, stageC, personaById } = params;
    const all = new Set<string>([...stage0.keys(), ...stageC.keys()]);
    const out: DeathChapterUpdate[] = [];
    for (const pid of all) {
      const s0 = stage0.get(pid);
      const sc = stageC.get(pid);
      const persona = personaById.get(pid);
      if (persona === undefined) continue;

      let source: DeathChapterUpdate["source"];
      let chapterNo: number;
      if (s0 !== undefined && sc !== undefined) {
        source = s0 === sc ? "BOTH" : "STAGE_0";
        chapterNo = s0; // 冲突以 Stage 0 为准（正则确定性高）
      } else if (s0 !== undefined) {
        source = "STAGE_0";
        chapterNo = s0;
      } else if (sc !== undefined) {
        source = "STAGE_C";
        chapterNo = sc;
      } else {
        continue;
      }

      // 不回退已有更早的值
      if (persona.deathChapterNo !== null && persona.deathChapterNo <= chapterNo) {
        continue;
      }

      out.push({
        personaId      : pid,
        personaName    : persona.name,
        chapterNo,
        source,
        stage0ChapterNo: s0,
        stageCChapterNo: sc
      });
    }
    return out;
  }

  private async applyDeathUpdates(updates: readonly DeathChapterUpdate[]): Promise<void> {
    if (updates.length === 0) return;
    for (const u of updates) {
      await this.prisma.persona.update({
        where: { id: u.personaId },
        data : { deathChapterNo: u.chapterNo }
      });
    }
  }

  // ────────────────────────────── effectiveBiographyCount ──────────────────────────────

  private async recomputeEffectiveCounts(personaIds: ReadonlySet<string>): Promise<void> {
    for (const pid of personaIds) {
      const count = await this.prisma.biographyRecord.count({
        where: { personaId: pid, isEffective: true }
      });
      await this.prisma.persona.update({
        where: { id: pid },
        data : { effectiveBiographyCount: count }
      });
    }
  }

  // ────────────────────────────── 空结果 ──────────────────────────────

  private emptyResult(bookId: string): StageCResult {
    return {
      bookId,
      chaptersProcessed   : 0,
      llmInvocations      : 0,
      biographiesCreated  : 0,
      effectiveBiographies: 0,
      overrideHits        : {},
      deathChapterUpdates : [],
      feedbackSuggestions : [],
      biographies         : []
    };
  }
}
