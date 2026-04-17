/**
 * 文件定位（Stage C · biography 区段硬约束层）：
 * - 契约源：`docs/superpowers/specs/2026-04-17-character-extraction-accuracy-redesign.md`
 *   §0-5（区段硬约束）+ §0-1 REV-1（DIALOGUE 引入句主语例外）。
 * - 在 Stage A `enforceRegionOverride` 之上再应用一次，防止 Prompt C LLM 越权。
 * - 作用于 biography 粒度（rawSpan → region → 强制 narrativeLens）。
 *
 * 规则摘要（与 Stage A 对齐，但输出字段是 NarrativeLens 而非 IdentityClaim）：
 * 1. POEM     : narrativeLens → HISTORICAL（覆盖 SELF/IMPERSONATING/QUOTED/REPORTED）。
 * 2. COMMENTARY: narrativeLens → REPORTED。
 * 3. DIALOGUE  :
 *    a. 若 rawSpan 偏移与 DIALOGUE.speakerStart/End 重叠且 region.speaker
 *       匹配当前 biography 的 personaCanonicalName → REV-1 保留 SELF。
 *    b. 否则（引号内被提及的第三方）：
 *       - 若 LLM 标 SELF → 强制 QUOTED；
 *       - 若 LLM 已标 QUOTED/REPORTED/HISTORICAL → 保持；
 *       - IMPERSONATING → 强制 QUOTED（保守：引号内的冒名叙述改为转述口径）。
 * 4. NARRATIVE : 不改写 narrativeLens（仅回填权威 narrativeRegionType）。
 *
 * 设计决策：
 * - rawSpan 原文定位：先 `chapterText.indexOf(rawSpan)`，失败返回 null（null 则无法判权威区段，
 *   保留 LLM 自评的 narrativeRegionType）。
 * - 覆写审计：`regionOverrideApplied` 命中时填规则名，便于 T16 评测对账。
 */

import type { NarrativeLens } from "@/generated/prisma/enums";
import type {
  PreprocessRegion,
  RegionType
} from "@/server/modules/analysis/preprocessor/types";

/** 规则名常量：保持稳定，供审计/测试断言使用。 */
export const BIOGRAPHY_REGION_OVERRIDE_RULES = {
  POEM_FORCE_HISTORICAL      : "POEM_FORCE_HISTORICAL",
  COMMENTARY_FORCE_REPORTED  : "COMMENTARY_FORCE_REPORTED",
  DIALOGUE_QUOTED_THIRD_PARTY: "DIALOGUE_QUOTED_THIRD_PARTY",
  DIALOGUE_SELF_PRESERVED    : "DIALOGUE_SELF_PRESERVED"
} as const;

export type BiographyRegionOverrideRule =
  (typeof BIOGRAPHY_REGION_OVERRIDE_RULES)[keyof typeof BIOGRAPHY_REGION_OVERRIDE_RULES];

/**
 * 功能：在章节原文中 best-effort 定位 biography.rawSpan 的字符偏移。
 * 输入：章节原文 + rawSpan。
 * 输出：`{start, end}`，找不到返回 `{start:null, end:null}`。
 */
export function locateRawSpanOffset(
  chapterText: string,
  rawSpan    : string
): { start: number | null; end: number | null } {
  if (rawSpan.length === 0) return { start: null, end: null };
  const idx = chapterText.indexOf(rawSpan);
  if (idx < 0) return { start: null, end: null };
  return { start: idx, end: idx + rawSpan.length };
}

/** 判断位置 `pos` 是否落在 `region` 的 [start, end) 内。 */
function positionInRegion(pos: number, region: PreprocessRegion): boolean {
  return pos >= region.start && pos < region.end;
}

/** 在 regions 中查找包含 `pos` 的区段；未命中返回 null。 */
function findRegionAt(
  regions: readonly PreprocessRegion[],
  pos    : number
): PreprocessRegion | null {
  for (const r of regions) {
    if (positionInRegion(pos, r)) return r;
    if (r.start > pos) break;
  }
  return null;
}

/**
 * 功能：判断 biography 的 rawSpan 偏移是否落在 DIALOGUE.speakerStart/End 内，
 * 且 region.speaker === personaCanonicalName（REV-1）。
 */
function biographyIsIntroducingSubject(
  personaCanonicalName: string,
  region              : PreprocessRegion,
  spanStart           : number,
  spanEnd             : number
): boolean {
  if (region.type !== "DIALOGUE") return false;
  if (region.speakerStart === undefined || region.speakerEnd === undefined) return false;
  if (region.speaker !== personaCanonicalName) return false;
  return spanStart < region.speakerEnd && spanEnd > region.speakerStart;
}

/**
 * 功能：对单条 biography 做区段覆写与 spanStart/End 定位。
 * 输入：biography 原始字段（narrativeLens + narrativeRegionType + rawSpan） +
 *       章节原文 + 预处理 regions + biography 所属的 personaCanonicalName。
 * 输出：覆写后的 {narrativeLens, narrativeRegionType, spanStart, spanEnd, regionOverrideApplied}。
 * 异常：无。
 * 副作用：无（纯函数）。
 *
 * 规则优先级：POEM > COMMENTARY > DIALOGUE > NARRATIVE。
 */
export function enforceBiographyRegionConstraint(params: {
  personaCanonicalName: string;
  narrativeLens       : NarrativeLens;
  narrativeRegionType : RegionType;
  rawSpan             : string;
  chapterText         : string;
  regions             : readonly PreprocessRegion[];
}): {
  narrativeLens        : NarrativeLens;
  narrativeRegionType  : RegionType;
  spanStart            : number | null;
  spanEnd              : number | null;
  regionOverrideApplied: string | null;
} {
  const { personaCanonicalName, narrativeLens, narrativeRegionType, rawSpan, chapterText, regions } = params;

  const { start, end } = locateRawSpanOffset(chapterText, rawSpan);

  const authoritativeRegion =
    start !== null ? findRegionAt(regions, start) : null;
  const effectiveType: RegionType = authoritativeRegion?.type ?? narrativeRegionType;

  let nextLens: NarrativeLens = narrativeLens;
  let regionOverrideApplied: string | null = null;

  switch (effectiveType) {
    case "POEM": {
      if (nextLens !== "HISTORICAL") {
        nextLens = "HISTORICAL";
        regionOverrideApplied = BIOGRAPHY_REGION_OVERRIDE_RULES.POEM_FORCE_HISTORICAL;
      }
      break;
    }
    case "COMMENTARY": {
      if (nextLens !== "REPORTED") {
        nextLens = "REPORTED";
        regionOverrideApplied = BIOGRAPHY_REGION_OVERRIDE_RULES.COMMENTARY_FORCE_REPORTED;
      }
      break;
    }
    case "DIALOGUE": {
      const dialogueRegion =
        authoritativeRegion?.type === "DIALOGUE" ? authoritativeRegion : null;
      const isIntroSubject =
        dialogueRegion !== null
        && start !== null
        && end !== null
        && biographyIsIntroducingSubject(personaCanonicalName, dialogueRegion, start, end);

      if (isIntroSubject) {
        // REV-1：保留 SELF。若 LLM 已经不是 SELF 也不做改写，仅打审计。
        regionOverrideApplied = BIOGRAPHY_REGION_OVERRIDE_RULES.DIALOGUE_SELF_PRESERVED;
      } else if (nextLens === "SELF" || nextLens === "IMPERSONATING") {
        nextLens = "QUOTED";
        regionOverrideApplied = BIOGRAPHY_REGION_OVERRIDE_RULES.DIALOGUE_QUOTED_THIRD_PARTY;
      }
      // 其他取值（QUOTED/REPORTED/HISTORICAL）保持
      break;
    }
    case "NARRATIVE":
    default:
      break;
  }

  return {
    narrativeLens      : nextLens,
    narrativeRegionType: effectiveType,
    spanStart          : start,
    spanEnd            : end,
    regionOverrideApplied
  };
}

/**
 * 功能：§0-6 四条件判定 —— 是否可计入 `persona.effectiveBiographyCount`。
 * 条件：narrativeLens ∈ {SELF, IMPERSONATING} AND narrativeRegionType=NARRATIVE
 *       AND rawSpan.length ≥ 15 AND actionVerb 非空。
 */
export function isEffectiveBiography(params: {
  narrativeLens      : NarrativeLens;
  narrativeRegionType: RegionType;
  rawSpan            : string;
  actionVerb         : string | null;
}): boolean {
  const { narrativeLens, narrativeRegionType, rawSpan, actionVerb } = params;
  if (narrativeLens !== "SELF" && narrativeLens !== "IMPERSONATING") return false;
  if (narrativeRegionType !== "NARRATIVE") return false;
  if (rawSpan.length < 15) return false;
  if (actionVerb === null || actionVerb.trim().length === 0) return false;
  return true;
}
