/**
 * 文件定位（Stage 0 · 章节预处理器主入口）：
 * - 分析管线 Stage 0 的纯规则层实现：四区段切分 + 覆盖率自白 + 死亡标记候选。
 * - 契约源：
 *   `docs/superpowers/specs/2026-04-17-character-extraction-accuracy-redesign.md`
 *   §0-2 / §0-4 / §0-5。
 *
 * 设计摘要：
 * 1. 先全文扫描 POEM 区段，再在非 POEM 段上扫描 DIALOGUE 区段（优先级 POEM > DIALOGUE）。
 * 2. 按行（保留换行符）分段；逐行判定 NARRATIVE / COMMENTARY / 不分类。
 *    每行减去 POEM / DIALOGUE 已占区间，剩余子段按行类别归档。
 * 3. 未被任一区段覆盖的字符 → unclassified；占比 > 0.10 → `confidence = "LOW"`。
 * 4. 同步运行死亡标记扫描（`scanDeathMarkers`），结果并入最终产物。
 *
 * 使用方：T03 (pipeline 集成) / T04 (持久化) 消费 `preprocessChapter` 返回值，
 * 本模块自身不落库、不依赖 Prisma，保持纯函数以便高覆盖率单测。
 */

import { scanDeathMarkers } from "@/server/modules/analysis/preprocessor/deathMarkers";
import type {
  ChapterPreprocessResult,
  CoverageRatios,
  PreprocessRegion,
  PreprocessorConfidence,
  RegionMapEntry,
  RegionType
} from "@/server/modules/analysis/preprocessor/types";

// ── 规则常量 ─────────────────────────────────────────────────────────────

/** unclassified 占比阈值：> 10% 即 LOW（§0-4）。 */
const UNCLASSIFIED_LOW_THRESHOLD = 0.10;

/**
 * POEM 触发词（§0-FINAL §0-4）。保持与 PRD Requirements 表完全一致。
 * 全局匹配，调用方不复用正则对象（每次 `matchAll` 独立迭代）。
 */
const POEM_TRIGGER_REGEX = /有诗为证|有词为证|诗曰|词曰/g;

/** POEM 结尾关键字：出现即终止区段。 */
const POEM_CLOSER_REGEX = /此诗|此词/;

/** POEM 结尾兜底：500 字上限（避免正则失败时吞全文）。 */
const POEM_MAX_LENGTH = 500;

/** 空行（POEM 结尾兜底之一）。 */
const BLANK_LINE_REGEX = /\n\s*\n/;

/**
 * DIALOGUE 匹配：中文全角引号（""）、单角引号（「」）、双角引号（『』）。
 * 非贪婪地吞内容直到下一配对的闭合引号；不处理跨引号嵌套（古典文本罕见）。
 */
const QUOTE_PATTERN_REGEX = /[\u201c\u300c\u300e][^\u201d\u300d\u300f]*[\u201d\u300d\u300f]/g;

/**
 * DIALOGUE 引入句回扫正则：形如 `王冕笑道：` / `王冕答道：` / `王冕说:` 等。
 * - 必须贴着开引号（匹配在回扫窗口的 `$` 处）。
 * - 捕获组 1 = 说话人 token（2~4 字中文）。
 * - 允许说话人后跟 0~3 个描写前缀字（笑/怒/答/问/叹/喝/唤/吩/咐/回/又/便/忙/复/大）再到收束动词。
 */
const INTRODUCER_REGEX = /([\u4e00-\u9fff]{2,4}?)(?:笑|怒|答|问|叹|喝|唤|吩|咐|回|又|便|忙|复|大){0,3}(?:道|说|言|曰)[：:]?\s*$/;

/** DIALOGUE 引入句最大回扫字数，避免把远端叙事吞进 DIALOGUE 区段。 */
const INTRODUCER_LOOKBACK = 20;

/** COMMENTARY 起首触发词（§0-FINAL §0-4）。 */
const COMMENTARY_TRIGGERS = ["却说", "话说", "看官听说", "且说", "按", "诸君试看", "原来"] as const;

/** NARRATIVE/COMMENTARY 成段的最小 CJK 字数阈值（用于剔除噪声拼接）。 */
const PARAGRAPH_MIN_CJK = 5;

/** NARRATIVE/COMMENTARY 成段的 CJK 字符最低密度（过滤混乱拼接）。 */
const PARAGRAPH_MIN_CJK_DENSITY = 0.4;

/** CJK 基本汉字判定正则。 */
const CJK_CHAR_REGEX = /[\u4e00-\u9fff]/g;

// ── 内部结构 ─────────────────────────────────────────────────────────────

interface Range {
  start: number;
  end  : number;
}

interface LineSlice {
  start: number;
  end  : number;
  text : string;
}

// ── POEM / DIALOGUE 扫描 ────────────────────────────────────────────────

/**
 * 功能：全文扫描 POEM 区段。
 * 输入：章节原文。
 * 输出：按 `start` 升序的 POEM 区段列表（不重叠）。
 * 异常：无。
 * 副作用：无。
 */
function findPoemRegions(chapterText: string): PreprocessRegion[] {
  const regions: PreprocessRegion[] = [];
  let lastEnd = -1;

  for (const match of chapterText.matchAll(POEM_TRIGGER_REGEX)) {
    // matchAll 返回的匹配对象必定带有 `index`（TS 类型过宽，这里以 number 明示契约）
    const start = match.index;
    // 若当前触发词落在前一个 POEM 区段内（同时命中多个触发词），跳过避免重叠
    if (start < lastEnd) continue;

    const triggerEnd = start + match[0].length;
    const tail = chapterText.slice(triggerEnd);

    const closerMatch = tail.match(POEM_CLOSER_REGEX);
    const blankIdx = tail.search(BLANK_LINE_REGEX);

    // 候选结束位置（相对 tail）
    const candidates: number[] = [];
    if (closerMatch && closerMatch.index !== undefined) {
      // 收束词 + 后续一个句号/换行（若有），避免把半句话切开
      const afterCloser = closerMatch.index + closerMatch[0].length;
      const tailAfter = tail.slice(afterCloser);
      const sentenceEnd = tailAfter.search(/[\n。]/);
      candidates.push(sentenceEnd >= 0 ? afterCloser + sentenceEnd + 1 : afterCloser);
    }
    if (blankIdx >= 0) {
      candidates.push(blankIdx);
    }
    candidates.push(POEM_MAX_LENGTH);

    const relEnd = Math.min(...candidates, tail.length);
    const end = triggerEnd + relEnd;
    regions.push({
      type: "POEM",
      start,
      end,
      text: chapterText.slice(start, end)
    });
    lastEnd = end;
  }

  return regions;
}

/**
 * 功能：在非 POEM 区间内扫描 DIALOGUE 区段，并回扫引入句抽取说话人。
 * 输入：章节原文、已命中的 POEM 区段（用于过滤）。
 * 输出：按 `start` 升序的 DIALOGUE 区段列表。
 * 异常：无。
 * 副作用：无。
 */
function findDialogueRegions(
  chapterText : string,
  poemRegions : PreprocessRegion[]
): PreprocessRegion[] {
  const regions: PreprocessRegion[] = [];

  for (const match of chapterText.matchAll(QUOTE_PATTERN_REGEX)) {
    const quoteStart = match.index;
    const quoteEnd = quoteStart + match[0].length;

    // POEM 优先：落入 POEM 内的引号（古诗里偶见引号）直接放弃
    if (rangeOverlaps(quoteStart, quoteEnd, poemRegions)) continue;

    // 回扫引入句（最多 INTRODUCER_LOOKBACK 字）
    const lookbackFrom = Math.max(0, quoteStart - INTRODUCER_LOOKBACK);
    const lookback = chapterText.slice(lookbackFrom, quoteStart);
    const introMatch = lookback.match(INTRODUCER_REGEX);

    let regionStart = quoteStart;
    let speaker: string | undefined;
    if (introMatch && introMatch.index !== undefined) {
      const introAbsStart = lookbackFrom + introMatch.index;
      // 防御性：若引入句起点落在 POEM 区段内，则放弃引入句（保留 speaker 以记录）
      if (!isInsidePoem(introAbsStart, poemRegions)) {
        regionStart = introAbsStart;
      }
      speaker = introMatch[1];
    }

    regions.push({
      type : "DIALOGUE",
      start: regionStart,
      end  : quoteEnd,
      text : chapterText.slice(regionStart, quoteEnd),
      speaker
    });
  }

  return regions;
}

/** 判断 `[s,e)` 是否与任意已知区段有重叠。 */
function rangeOverlaps(s: number, e: number, regions: PreprocessRegion[]): boolean {
  for (const r of regions) {
    if (s < r.end && e > r.start) return true;
  }
  return false;
}

/**
 * 功能：检测位置 `pos` 是否落在任意 POEM 区段内部（含左闭右开）。
 * 输出：`true` 表示应放弃该位置；`false` 表示安全。
 */
function isInsidePoem(pos: number, poemRegions: PreprocessRegion[]): boolean {
  for (const p of poemRegions) {
    if (pos >= p.start && pos < p.end) return true;
  }
  return false;
}

// ── 段落（行）分类 ───────────────────────────────────────────────────────

/**
 * 功能：按 `\n` 切分行，同时保留每行末尾的换行符到当前行范围，
 *       使所有字符都被行范围覆盖，便于覆盖率账本闭合。
 * 输入：章节原文。
 * 输出：`LineSlice[]`（可能含空行）。
 */
function splitLines(chapterText: string): LineSlice[] {
  const lines: LineSlice[] = [];
  let cursor = 0;
  while (cursor < chapterText.length) {
    const nlIdx = chapterText.indexOf("\n", cursor);
    const end = nlIdx < 0 ? chapterText.length : nlIdx + 1;
    lines.push({
      start: cursor,
      end,
      text : chapterText.slice(cursor, end)
    });
    cursor = end;
  }
  return lines;
}

/** 段落类别决策：返回 `null` 表示段落内容不可靠（归入 unclassified）。 */
function classifyParagraph(lineText: string): Exclude<RegionType, "POEM" | "DIALOGUE"> | null {
  const trimmed = lineText.trim();
  if (trimmed.length === 0) return null;

  const cjk = (trimmed.match(CJK_CHAR_REGEX) ?? []).length;
  if (cjk < PARAGRAPH_MIN_CJK) return null;
  if (cjk / trimmed.length < PARAGRAPH_MIN_CJK_DENSITY) return null;

  for (const trigger of COMMENTARY_TRIGGERS) {
    if (trimmed.startsWith(trigger)) return "COMMENTARY";
  }
  return "NARRATIVE";
}

/**
 * 功能：在单行范围内减去已占区间（POEM/DIALOGUE），返回剩余未占子段列表。
 * 输入：行起止、排序后的已占区间列表。
 * 输出：剩余子段 `Range[]`（可能为空）。
 */
function subtractClaimed(line: LineSlice, claimed: Range[]): Range[] {
  const result: Range[] = [];
  let cursor = line.start;
  // 仅关心与本行相交的 claimed；claimed 已按 start 排序
  for (const c of claimed) {
    if (c.end <= cursor) continue;
    if (c.start >= line.end) break;
    if (c.start > cursor) {
      result.push({ start: cursor, end: Math.min(c.start, line.end) });
    }
    cursor = Math.max(cursor, c.end);
    if (cursor >= line.end) break;
  }
  if (cursor < line.end) {
    result.push({ start: cursor, end: line.end });
  }
  return result;
}

// ── 主入口 ──────────────────────────────────────────────────────────────

/**
 * 功能：对单章原文做 Stage 0 预处理，输出四区段 + 覆盖率自白 + 死亡标记候选。
 * 输入：
 *   - `chapterText`：章节原文（UTF-16 字符串，偏移按 JS 字符数计算）。
 *   - `chapterNo`：章节号（仅用于死亡标记回填，不参与切分逻辑）。
 * 输出：`ChapterPreprocessResult`。
 * 异常：无。空串返回默认 HIGH（coverage 五段全 0）。
 * 副作用：无（纯函数）。
 */
export function preprocessChapter(
  chapterText: string,
  chapterNo  : number
): ChapterPreprocessResult {
  const totalLen = chapterText.length;

  if (totalLen === 0) {
    return {
      chapterNo,
      regions        : [],
      regionMap      : [],
      coverage       : { narrative: 0, poem: 0, dialogue: 0, commentary: 0, unclassified: 0 },
      confidence     : "HIGH",
      deathMarkerHits: []
    };
  }

  // 1. POEM 先行，DIALOGUE 其次；两者联合构成"已占区间"基底
  const poemRegions = findPoemRegions(chapterText);
  const dialogueRegions = findDialogueRegions(chapterText, poemRegions);
  const claimedRanges: Range[] = [...poemRegions, ...dialogueRegions]
    .map(r => ({ start: r.start, end: r.end }))
    .sort((a, b) => a.start - b.start);

  // 2. 按行扫描 NARRATIVE / COMMENTARY，减去已占区间
  const narrativeOrCommentary: PreprocessRegion[] = [];
  for (const line of splitLines(chapterText)) {
    const paragraphType = classifyParagraph(line.text);
    if (paragraphType === null) continue;
    for (const sub of subtractClaimed(line, claimedRanges)) {
      if (sub.end <= sub.start) continue;
      narrativeOrCommentary.push({
        type : paragraphType,
        start: sub.start,
        end  : sub.end,
        text : chapterText.slice(sub.start, sub.end)
      });
    }
  }

  // 3. 合并全部区段、按起点排序、相邻同类型合并，形成最终 regions
  const regions = mergeAdjacentSameType(
    [...poemRegions, ...dialogueRegions, ...narrativeOrCommentary]
      .sort((a, b) => a.start - b.start)
  );

  // 4. 覆盖率自白
  const coverage = computeCoverage(regions, totalLen);
  const confidence: PreprocessorConfidence =
    coverage.unclassified > UNCLASSIFIED_LOW_THRESHOLD ? "LOW" : "HIGH";

  // 5. 死亡标记候选
  const deathMarkerHits = scanDeathMarkers(chapterText, chapterNo);

  const regionMap: RegionMapEntry[] = regions.map(r => ({
    start: r.start,
    end  : r.end,
    type : r.type
  }));

  return {
    chapterNo,
    regions,
    regionMap,
    coverage,
    confidence,
    deathMarkerHits
  };
}

/** 相邻同类型区段合并（保留 DIALOGUE speaker 需保守：不同 speaker 不合并）。 */
function mergeAdjacentSameType(regions: PreprocessRegion[]): PreprocessRegion[] {
  const out: PreprocessRegion[] = [];
  for (const cur of regions) {
    const prev = out[out.length - 1];
    if (
      prev
      && prev.type === cur.type
      && prev.end === cur.start
      && prev.speaker === cur.speaker
    ) {
      prev.end = cur.end;
      prev.text = prev.text + cur.text;
    } else {
      out.push({ ...cur });
    }
  }
  return out;
}

/**
 * 功能：按区段统计覆盖率；unclassified = 1 - 四段之和。
 * 输入：已排序不重叠的最终 regions、原文长度。
 * 输出：`CoverageRatios`。
 */
function computeCoverage(regions: PreprocessRegion[], totalLen: number): CoverageRatios {
  const counts: Record<RegionType, number> = {
    NARRATIVE : 0,
    POEM      : 0,
    DIALOGUE  : 0,
    COMMENTARY: 0
  };
  for (const r of regions) counts[r.type] += r.end - r.start;

  const narrative = counts.NARRATIVE / totalLen;
  const poem = counts.POEM / totalLen;
  const dialogue = counts.DIALOGUE / totalLen;
  const commentary = counts.COMMENTARY / totalLen;
  const classifiedSum = narrative + poem + dialogue + commentary;
  // 避免浮点误差导致 unclassified = -ε
  const unclassified = Math.max(0, 1 - classifiedSum);
  return { narrative, poem, dialogue, commentary, unclassified };
}
