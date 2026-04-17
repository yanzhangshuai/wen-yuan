/**
 * 文件定位（Stage 0 · 地点标记词抽取）：
 * - 提供章节原文中"移动/居住"类地点提及的确定性识别。
 * - 契约源：§0-3(b) REV-2 跨地点并发冲突检测；Stage B.5（T13）消费本模块输出。
 *
 * 设计要点：
 * - 纯规则层，无 LLM、无 DB 依赖；便于高覆盖率单测。
 * - 仅扫描 NARRATIVE 区段；POEM / DIALOGUE / COMMENTARY 全部忽略
 *   （避免"桃花源""蓬莱仙境"等意象词、对白中他人提及等噪声）。
 * - 命中模式 = 前缀标记词（到/往/住在/…）+ 1~6 字 CJK 地名 token（最后一字为后缀词）。
 *   · 前缀兜底保证不会把纯地名 token（"庙前""市中"）误抽。
 *   · 末字必须落在后缀词白名单（城/村/…/宅）避免把普通动宾短语抽成地点。
 *   · 地名 token 内部不得再出现任何单字前缀词，防止 `...来又往苏州城` 把 "来"
 *     当前缀、把后续 "又往苏州" 一并吞为地名的越界匹配。
 * - 采用"正则定位前缀 + 手工扫描地名"的二段实现，避免引入 `v` flag 字符类减法。
 * - 单次抽取返回地点字面 + regionType（当前恒为 NARRATIVE）+ 全文字符偏移，
 *   下游（Stage B.5）据此做"同章节互斥地点"判定。
 */

import type {
  PreprocessRegion,
  RegionType
} from "@/server/modules/analysis/preprocessor/types";

// ── 规则常量 ─────────────────────────────────────────────────────────────

/**
 * 前缀标记词（按"更长更具体优先"排序，避免 `在` 遮蔽 `住在`）。
 * 含义粗分：
 * - 移动：到 / 往 / 至 / 过 / 来 / 出 / 入 / 自 / 从
 * - 居留：住在 / 在
 */
export const LOCATION_PREFIXES = [
  "住在", "到", "往", "至", "过", "来", "出", "入", "在", "自", "从"
] as const;

/**
 * 单字前缀集合：用于排除地名 token 内部再出现前缀字（见文件注释）。
 * 注意：`住在` 是 2 字前缀，其首字 `住` 未列入单字前缀集合，
 * 因此不会被当成"内部前缀"污染；`住` 允许出现在地名 token 内部。
 */
const SINGLE_CHAR_PREFIX_SET = new Set<string>([
  "到", "往", "至", "过", "来", "出", "入", "在", "自", "从"
]);

/**
 * 后缀词白名单：地名最后一字必须落在此集合。
 * 覆盖常见古典小说地名末字（行政/聚落/建筑/自然地物）。
 */
export const LOCATION_SUFFIXES = [
  "城", "村", "镇", "县", "府", "州",
  "家", "店", "庙", "寺", "馆", "楼",
  "山", "河", "园", "宅"
] as const;

const LOCATION_SUFFIX_SET = new Set<string>(LOCATION_SUFFIXES);

/**
 * 地名 token 长度上限：PRD 约定 2~6 字；允许 1 字当且仅当前缀存在时
 * （例：`在庙` → "庙"）。上限 6 字兼顾"云梦泽""乌衣巷"等多字地名。
 */
const LOCATION_TOKEN_MAX_LEN = 6;

/**
 * 前缀定位正则：只负责找到前缀词的起止位置，不负责抓地名。
 * 捕获组 1 = 前缀字面。使用 `matchAll` 迭代，天然无 lastIndex 副作用。
 */
const PREFIX_LOCATOR_REGEX = /(住在|到|往|至|过|来|出|入|在|自|从)/g;

/** 判定一个字符是否为 CJK 统一汉字（\u4e00-\u9fff）。 */
function isCJK(ch: string): boolean {
  if (!ch) return false;
  const code = ch.charCodeAt(0);
  return code >= 0x4e00 && code <= 0x9fff;
}

// ── 对外类型 ─────────────────────────────────────────────────────────────

/**
 * 单条地点提及命中。
 * - `location`：地名字面（不含前缀词）。
 * - `regionType`：命中所在区段类别（当前恒为 `"NARRATIVE"`，预留扩展）。
 * - `charOffset`：地名 token 在整章原文中的起始字符偏移（`String.slice` 约定）。
 * - `prefix`：命中时贴在 token 前的前缀标记词字面，便于下游审阅。
 */
export interface LocationMention {
  location  : string;
  regionType: RegionType;
  charOffset: number;
  prefix    : string;
}

// ── 实现 ────────────────────────────────────────────────────────────────

/**
 * 功能：从 `startIndex` 起扫描最短合法地名 token。
 * 规则：
 *   - 从 `startIndex` 起，字符必须是 CJK；
 *   - token 长度 1~`LOCATION_TOKEN_MAX_LEN` 字；
 *   - token 内部（含末字）不得出现单字前缀词；
 *   - 最后一字必须落在 `LOCATION_SUFFIX_SET`；
 *   - 优先返回最短合法 token（避免吞并过多后续文本）。
 * 输入：区段文本与起始下标。
 * 输出：匹配的地名字面；无则 `null`。
 * 异常：无。
 * 副作用：无。
 */
function scanLocationToken(regionText: string, startIndex: number): string | null {
  const maxLen = Math.min(LOCATION_TOKEN_MAX_LEN, regionText.length - startIndex);
  // 预扫：累积连续 CJK 且不含内部单字前缀字的 run 长度
  let runLen = 0;
  for (let k = 0; k < maxLen; k += 1) {
    const ch = regionText[startIndex + k];
    if (!isCJK(ch)) break;
    if (k > 0 && SINGLE_CHAR_PREFIX_SET.has(ch)) break; // 内部前缀字立即截断
    runLen = k + 1;
  }
  // 从长到短找"末字为后缀"的最大 token（贪婪）：
  // - "杭州城" 优先于 "杭州"（州 / 城 都是后缀，偏好更具体的 3 字）；
  // - "苏州城住下" 取到 "苏州城"（越过 `住/下` 非后缀后回溯）。
  for (let len = runLen; len >= 1; len -= 1) {
    const last = regionText[startIndex + len - 1];
    if (LOCATION_SUFFIX_SET.has(last)) {
      return regionText.slice(startIndex, startIndex + len);
    }
  }
  return null;
}

/**
 * 功能：从整章原文中抽取"移动/居住"类地点提及，仅在 NARRATIVE 区段生效。
 * 输入：
 *   - `chapterText`：章节原文（未切分）。
 *   - `regions`：Stage 0 四区段切分输出的 `PreprocessRegion[]`；
 *     本函数只消费其中 `type === "NARRATIVE"` 的区段。
 * 输出：按 `charOffset` 升序的 `LocationMention[]`；无命中返回空数组。
 * 异常：无。对越界/不合法 region 静默跳过（防御式实现）。
 * 副作用：无（纯函数）。
 *
 * 注意事项：
 * - 仅作"候选命中"，不做同名地点归一（由 Stage B.5 配合
 *   `locationExclusivityGraph` 做互斥判定）。
 * - 单字地名 token 必须带前缀才会命中（由 `scanLocationToken` 保证）。
 */
export function extractLocationMentions(
  chapterText: string,
  regions    : PreprocessRegion[]
): LocationMention[] {
  const out: LocationMention[] = [];
  for (const region of regions) {
    if (region.type !== "NARRATIVE") continue;
    if (region.start < 0 || region.end > chapterText.length) continue;
    if (region.end <= region.start) continue;

    const regionText = chapterText.slice(region.start, region.end);
    for (const match of regionText.matchAll(PREFIX_LOCATOR_REGEX)) {
      const prefix = match[1];
      if (!prefix) continue;
      const prefixStart = match.index ?? 0;
      const tokenStart = prefixStart + prefix.length;
      const location = scanLocationToken(regionText, tokenStart);
      if (!location) continue;
      out.push({
        location,
        regionType: "NARRATIVE",
        charOffset: region.start + tokenStart,
        prefix
      });
    }
  }
  out.sort((a, b) => a.charOffset - b.charOffset);
  return out;
}

