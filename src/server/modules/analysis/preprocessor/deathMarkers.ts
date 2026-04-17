/**
 * 文件定位（Stage 0 · 死亡标记抽主语）：
 * - 提供死亡标记词列表、组合正则与主语候选抽取函数。
 * - 契约源：§0-2（死亡标记词驱动 `persona.deathChapterNo` 候选）。
 *
 * 设计要点：
 * - 正则按"长 token 优先"排序，避免 `殒` 吞掉 `殒命`、`死于` 吞掉 `死在` 等字首碰撞。
 * - 主语抽取：在标记词起始位置向前扫描 `DEATH_SUBJECT_WINDOW`(30) 字，
 *   取窗口内最后一个 2~4 字中文 token 作为候选；未命中返回 `null`。
 * - 纯函数，无副作用；下游（T03/T04）负责与 LLM 结论做双源确认。
 */

import type { DeathMarkerHit } from "@/server/modules/analysis/preprocessor/types";

/** §0-2 正文列出的完整死亡标记词集合，保持与 PRD DoD 同序列出。 */
export const DEATH_MARKERS = [
  "病逝", "病故", "故去", "故了", "归天", "一命呜呼", "无常", "云亡",
  "殒", "殒命", "殁", "卒", "薨", "死于", "死在", "圆寂", "羽化", "殉",
  "毙", "夭亡"
] as const;

/** 主语候选扫描窗口：标记词起始前 30 字。 */
export const DEATH_SUBJECT_WINDOW = 30;

/**
 * 组合后的死亡标记正则。
 * - 按"更长更具体优先"排序，避免 `殒` / `死于` 遮蔽 `殒命` / `死在`。
 * - 使用全局捕获；调用前需确保 `lastIndex = 0`（本模块每次都用 `matchAll` 新迭代，天然安全）。
 */
export const DEATH_MARKER_REGEX = /一命呜呼|病逝|病故|故去|故了|归天|无常|云亡|殒命|圆寂|羽化|夭亡|死于|死在|殒|殁|卒|薨|殉|毙/g;

/** 匹配 2~4 连续 CJK 统一汉字的中文 token（扫窗口内人名候选时用）。 */
const CHINESE_NAME_TOKEN_REGEX = /[\u4e00-\u9fff]{2,4}/g;

/**
 * 功能：从标记词起始位置向前扫描 `window` 字，抽取最近的中文人名候选。
 * 输入：章节原文、标记词起始偏移（`String.slice` 约定）、窗口大小（默认 30）。
 * 输出：2~4 字中文 token；窗口内无命中时返回 `null`。
 * 异常：无（纯函数，输入不合法时返回 `null`）。
 * 副作用：无。
 */
export function extractSubjectCandidate(
  chapterText: string,
  markerStart: number,
  windowSize : number = DEATH_SUBJECT_WINDOW
): string | null {
  if (markerStart <= 0) return null;
  const from = Math.max(0, markerStart - windowSize);
  const window = chapterText.slice(from, markerStart);
  // 窗口内所有 2~4 字中文 token；取"最靠近标记词"者（即最后一个）
  const tokens = [...window.matchAll(CHINESE_NAME_TOKEN_REGEX)];
  if (tokens.length === 0) return null;
  return tokens[tokens.length - 1][0];
}

/**
 * 功能：对整章原文扫描死亡标记，产出候选命中列表。
 * 输入：整章原文、章节号、可选扫描窗口大小。
 * 输出：`DeathMarkerHit[]`，按 `spanStart` 升序；原文无命中返回空数组。
 * 异常：无。
 * 副作用：无。
 *
 * 注意事项：
 * - `rawSpan` 约定回包含 `windowSize` 字窗口 + 标记词 + 后 10 字，供人工审阅。
 * - `卒` / `殒` / `毙` 等常见单字在泛化文本里可能误命中；本阶段只做"候选"，
 *   最终是否落入 `persona.deathChapterNo` 由 T03/T04 与 LLM 结论做双源确认。
 */
export function scanDeathMarkers(
  chapterText: string,
  chapterNo  : number,
  windowSize : number = DEATH_SUBJECT_WINDOW
): DeathMarkerHit[] {
  const hits: DeathMarkerHit[] = [];
  // matchAll 每次创建新的迭代器，正则 lastIndex 状态隔离，无需手动重置
  for (const match of chapterText.matchAll(DEATH_MARKER_REGEX)) {
    const marker = match[0];
    const spanStart = match.index ?? 0;
    const spanEnd = spanStart + marker.length;
    const rawSpanFrom = Math.max(0, spanStart - windowSize);
    const rawSpanTo = Math.min(chapterText.length, spanEnd + 10);
    hits.push({
      chapterNo,
      marker,
      subjectCandidate: extractSubjectCandidate(chapterText, spanStart, windowSize),
      spanStart,
      spanEnd,
      rawSpan         : chapterText.slice(rawSpanFrom, rawSpanTo)
    });
  }
  return hits;
}
