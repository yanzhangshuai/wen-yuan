/**
 * 文件定位（Stage A · 区段覆写规则层）：
 * - 契约源：`docs/superpowers/specs/2026-04-17-character-extraction-accuracy-redesign.md`
 *   §0-5（区段硬约束）+ §0-1 REV-1（DIALOGUE 引入句主语例外）。
 * - 输入：LLM 返回的单条 mention + 预处理器 regions + 章节原文。
 * - 输出：校准后的 mention（identityClaim 可能被覆写，spanStart/End 尝试定位）。
 *
 * 规则摘要：
 * 1. POEM 区段：identityClaim → HISTORICAL（覆盖 SELF/IMPERSONATING/REPORTED/UNSURE）。
 *    aliasType 保持原值（允许 NAMED 表示诗中人名引用合法）。
 * 2. COMMENTARY 区段：identityClaim → REPORTED（说书人议论视角）。
 * 3. DIALOGUE 区段：
 *    a. 若 mention 偏移与 region.speakerStart/speakerEnd 重叠（引入句主语）
 *       → REV-1 保留 SELF；若 LLM 原本标 UNSURE/其他，也不做改写。
 *    b. 否则（引号内被提及的第三方或自称）：
 *       - 若 LLM 标 SELF → 强制 QUOTED；
 *       - 若 LLM 已标 QUOTED/REPORTED/HISTORICAL → 保持；
 *       - UNSURE / IMPERSONATING → 强制 QUOTED（保持保守）。
 * 4. NARRATIVE：不做任何覆写（仅回填权威 narrativeRegionType）。
 *
 * 设计决策：
 * - mention 原文偏移通过 `chapterText.indexOf(evidenceRawSpan)` + 内部 `indexOf(surfaceForm)`
 *   两级定位。找不到（rawSpan 被 LLM 改写 / 跨段拼接）时保留 null，回退到 LLM 自评 region。
 * - 覆写审计：返回 `regionOverrideApplied` 字段，命中时填规则名，便于 T16 评测阶段对账。
 */

import type { PreprocessRegion } from "@/server/modules/analysis/preprocessor/types";
import type {
  StageAMention,
  StageARawMention
} from "@/server/modules/analysis/pipelines/threestage/stageA/types";

/** 规则名常量：保持稳定，供审计/测试断言使用。 */
export const REGION_OVERRIDE_RULES = {
  POEM_FORCE_HISTORICAL      : "POEM_FORCE_HISTORICAL",
  COMMENTARY_FORCE_REPORTED  : "COMMENTARY_FORCE_REPORTED",
  DIALOGUE_QUOTED_THIRD_PARTY: "DIALOGUE_QUOTED_THIRD_PARTY",
  DIALOGUE_SELF_PRESERVED    : "DIALOGUE_SELF_PRESERVED"
} as const;

export type RegionOverrideRule =
  (typeof REGION_OVERRIDE_RULES)[keyof typeof REGION_OVERRIDE_RULES];

/**
 * 功能：在章节原文中 best-effort 定位 mention 的字符偏移。
 * 输入：章节原文 + LLM 原始 mention。
 * 输出：`{start, end}`，找不到返回 `{start:null,end:null}`。
 * 异常：无。
 * 副作用：无。
 *
 * 算法：
 * 1. 先用 `indexOf(evidenceRawSpan)` 定位证据段起点。
 * 2. 再在证据段内找 `surfaceForm` 的子偏移；失败则退回证据段起点。
 * 3. 两步都失败时最后尝试直接 `indexOf(surfaceForm)` 作兜底。
 */
export function locateMentionOffset(
  chapterText: string,
  mention    : Pick<StageARawMention, "surfaceForm" | "evidenceRawSpan">
): { start: number | null; end: number | null } {
  const { surfaceForm, evidenceRawSpan } = mention;

  if (surfaceForm.length === 0) return { start: null, end: null };

  // 1) rawSpan → chapter 偏移
  if (evidenceRawSpan.length > 0) {
    const spanIdx = chapterText.indexOf(evidenceRawSpan);
    if (spanIdx >= 0) {
      const surfInSpan = evidenceRawSpan.indexOf(surfaceForm);
      if (surfInSpan >= 0) {
        const start = spanIdx + surfInSpan;
        return { start, end: start + surfaceForm.length };
      }
      // rawSpan 命中但 surfaceForm 不在其中（LLM 写歪）→ 回退到 rawSpan 起点
      return { start: spanIdx, end: spanIdx + surfaceForm.length };
    }
  }

  // 2) 兜底：全文搜 surfaceForm
  const direct = chapterText.indexOf(surfaceForm);
  if (direct >= 0) {
    return { start: direct, end: direct + surfaceForm.length };
  }

  return { start: null, end: null };
}

/** 判断位置 `pos` 是否落在 `region` 的 [start, end) 内。 */
function positionInRegion(pos: number, region: PreprocessRegion): boolean {
  return pos >= region.start && pos < region.end;
}

/**
 * 功能：在 regions 中查找包含 `pos` 的区段；未命中返回 null。
 * 输入：已排序不重叠的 regions；目标字符位置。
 * 输出：命中区段或 null。
 */
function findRegionAt(
  regions: readonly PreprocessRegion[],
  pos    : number
): PreprocessRegion | null {
  for (const r of regions) {
    if (positionInRegion(pos, r)) return r;
    if (r.start > pos) break; // 已按 start 升序，越过即可停
  }
  return null;
}

/**
 * 功能：判断 mention 偏移是否落在 DIALOGUE 区段的「引入句主语」span 内。
 * 输入：mention 偏移区间；DIALOGUE 区段（需带 speakerStart/End）。
 * 输出：true 表示应保留 SELF（REV-1）。
 *
 * 约束：
 * - 两区间需存在正重叠（`mStart < sEnd && mEnd > sStart`）。
 * - region.speaker 必须等于 mention.surfaceForm（防止两个不同真名碰巧落进同一 span）。
 */
function mentionIsIntroducingSubject(
  mention: StageARawMention,
  region : PreprocessRegion,
  mStart : number,
  mEnd   : number
): boolean {
  if (region.type !== "DIALOGUE") return false;
  if (region.speakerStart === undefined || region.speakerEnd === undefined) return false;
  if (region.speaker !== mention.surfaceForm) return false;
  return mStart < region.speakerEnd && mEnd > region.speakerStart;
}

/**
 * 功能：对单条 LLM mention 做区段覆写与 spanStart/End 定位。
 * 输入：原始 mention + 章节原文 + 预处理器 regions。
 * 输出：校准后的 `StageAMention`（可能改写 identityClaim、narrativeRegionType、追加审计字段）。
 * 异常：无。
 * 副作用：无（纯函数）。
 *
 * 规则优先级：POEM > COMMENTARY > DIALOGUE > NARRATIVE。
 */
export function enforceRegionOverride(
  mention    : StageARawMention,
  chapterText: string,
  regions    : readonly PreprocessRegion[]
): StageAMention {
  const { start, end } = locateMentionOffset(chapterText, mention);

  // 权威区段：若能定位原文偏移，以 regionMap 为准；否则回退到 LLM 自评。
  const authoritativeRegion =
    start !== null ? findRegionAt(regions, start) : null;
  const effectiveType = authoritativeRegion?.type ?? mention.narrativeRegionType;

  // 基线：保持原值，spanStart/End 回填（可能为 null）
  let identityClaim = mention.identityClaim;
  let regionOverrideApplied: string | null = null;

  switch (effectiveType) {
    case "POEM": {
      if (identityClaim !== "HISTORICAL") {
        identityClaim = "HISTORICAL";
        regionOverrideApplied = REGION_OVERRIDE_RULES.POEM_FORCE_HISTORICAL;
      }
      break;
    }
    case "COMMENTARY": {
      if (identityClaim !== "REPORTED") {
        identityClaim = "REPORTED";
        regionOverrideApplied = REGION_OVERRIDE_RULES.COMMENTARY_FORCE_REPORTED;
      }
      break;
    }
    case "DIALOGUE": {
      // DIALOGUE 细分：需要拿权威 region（必须含 speakerStart/End）
      const dialogueRegion = authoritativeRegion?.type === "DIALOGUE"
        ? authoritativeRegion
        : null;
      const isIntroSubject =
        dialogueRegion !== null
        && start !== null
        && end !== null
        && mentionIsIntroducingSubject(mention, dialogueRegion, start, end);

      if (isIntroSubject) {
        // REV-1：保留 SELF；若 LLM 给的是其他值（UNSURE/REPORTED/...）也不改写，
        // 但记录审计字段以便下游知道此 mention 已经被规则层“豁免”。
        regionOverrideApplied = REGION_OVERRIDE_RULES.DIALOGUE_SELF_PRESERVED;
      } else if (identityClaim === "SELF") {
        // 引号内第三方 / 非权威 DIALOGUE → 强制 QUOTED
        identityClaim = "QUOTED";
        regionOverrideApplied = REGION_OVERRIDE_RULES.DIALOGUE_QUOTED_THIRD_PARTY;
      }
      // 其他取值保持不变（QUOTED / REPORTED / HISTORICAL / UNSURE / IMPERSONATING）
      break;
    }
    case "NARRATIVE":
    default: {
      // NARRATIVE 不做任何 identityClaim 覆写
      break;
    }
  }

  return {
    ...mention,
    // 回填权威 region 类型（若能定位），否则维持 LLM 自评
    narrativeRegionType: effectiveType,
    identityClaim,
    spanStart          : start,
    spanEnd            : end,
    regionOverrideApplied
  };
}
