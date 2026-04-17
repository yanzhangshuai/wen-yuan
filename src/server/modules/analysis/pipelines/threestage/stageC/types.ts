/**
 * 文件定位（Stage C · 归属层 · 类型契约）：
 * - 三阶段架构 Stage C 的对外类型声明。
 * - 契约源：`docs/superpowers/specs/2026-04-17-character-extraction-accuracy-redesign.md`
 *   §0-FINAL / §0-2（双源死亡）/ §0-5（区段硬约束 + REV-1）/ §0-6（四条件）/ §0-14（反馈通道）。
 *
 * 设计约束：
 * - 纯类型文件，零运行时依赖；不引入 Prisma / AI SDK。
 */

import type { BioCategory, NarrativeLens } from "@/generated/prisma/enums";
import type { RegionType } from "@/server/modules/analysis/preprocessor/types";

/**
 * LLM 原始返回的单条 biography（尚未做区段覆写 / 四条件判定）。
 * - `personaCanonicalName` 必须出现在输入的 resolvedPersonas 列表；否则触发 §0-14 反馈。
 * - `category` 为 BioCategory 7 值之一；未知值降级为 EVENT。
 * - `narrativeLens` 由 LLM 自评，会被 `enforceBiographyRegionConstraint` 规则层校正。
 */
export interface StageCRawBiography {
  personaCanonicalName: string;
  narrativeLens       : NarrativeLens;
  narrativeRegionType : RegionType;
  category            : BioCategory;
  rawSpan             : string;
  actionVerb          : string | null;
  title               : string | null;
  location            : string | null;
  virtualYear         : string | null;
  summary             : string;
  confidence          : number;
}

/**
 * 经 `enforceBiographyRegionConstraint` 校准 + 四条件判定后的 biography。
 * - `personaId` 由 personaCanonicalName 查表解析；解析不到则会被路由到 §0-14 反馈而非此类型。
 * - `regionOverrideApplied` 审计字段；未触发时为 null。
 * - `isEffective` 由 §0-6 四条件判定；仅 true 会计入 `persona.effectiveBiographyCount`。
 */
export interface StageCBiography {
  personaId            : string;
  personaCanonicalName : string;
  chapterId            : string;
  chapterNo            : number;
  narrativeLens        : NarrativeLens;
  narrativeRegionType  : RegionType;
  category             : BioCategory;
  rawSpan              : string;
  actionVerb           : string | null;
  title                : string | null;
  location             : string | null;
  virtualYear          : string | null;
  summary              : string;
  confidence           : number;
  spanStart            : number | null;
  spanEnd              : number | null;
  regionOverrideApplied: string | null;
  isEffective          : boolean;
}

/** 章节聚合的 Stage C 输入组（一个 chapter + 该章所有 CONFIRMED/CANDIDATE persona）。 */
export interface StageCChapterGroup {
  chapterId  : string;
  chapterNo  : number;
  chapterText: string;
  /** 该章节所有已晋级的 persona（Stage B 写 promoted_persona_id 不为 null）。 */
  personas    : ReadonlyArray<{
    personaId    : string;
    canonicalName: string;
    aliases      : readonly string[];
  }>;
}

/** 双源死亡章节更新记录（§0-2）。 */
export interface DeathChapterUpdate {
  personaId       : string;
  personaName     : string;
  chapterNo       : number;
  /** STAGE_0 = 正则命中；STAGE_C = LLM 返回 DEATH biography；BOTH = 两源一致。 */
  source          : "STAGE_0" | "STAGE_C" | "BOTH";
  /** 两源冲突时 Stage 0 的章节号（用于审计）。 */
  stage0ChapterNo?: number;
  stageCChapterNo?: number;
}

/** §0-14 反馈通道：写 merge_suggestions(source=STAGE_C_FEEDBACK)。 */
export interface StageCFeedbackAction {
  suggestionId   : string;
  reason         : string;
  sourcePersonaId: string;
  targetPersonaId: string;
  /** 反馈类型（写入 evidenceRefs.kind 便于审计）。 */
  kind           : "ENTITY_REVIEW" | "ATTRIBUTION_CONFLICT";
}

/** Stage C 运行时结果（便于测试断言与下游消费）。 */
export interface StageCResult {
  bookId              : string;
  chaptersProcessed   : number;
  llmInvocations      : number;
  biographiesCreated  : number;
  effectiveBiographies: number;
  overrideHits        : Record<string, number>;
  deathChapterUpdates : DeathChapterUpdate[];
  feedbackSuggestions : StageCFeedbackAction[];
  biographies         : StageCBiography[];
}
