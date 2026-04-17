/**
 * 文件定位（Stage 0 章节预处理器 · 类型契约）：
 * - 位于分析管线 Stage 0（LLM 介入之前的纯规则层）。
 * - 定义四区段切分、覆盖率自白、死亡标记候选的对外数据结构。
 *
 * 设计约束：
 * - 契约源：`docs/superpowers/specs/2026-04-17-character-extraction-accuracy-redesign.md`
 *   §0-2（死亡标记）/ §0-4（覆盖率自白）/ §0-5（regionMap 回填 Stage A）。
 * - 本模块产出的结构将被 T03/T04 消费并按 T01 schema 落入 `chapter_preprocess_results`。
 * - 纯类型文件，零运行时依赖；禁止在此引入 Prisma / Next.js / AI SDK。
 */

/**
 * 区段类别：四区段切分 + unclassified 兜底。
 * - NARRATIVE：正叙段落（默认兜底类别）。
 * - POEM：诗词嵌入段，由 `有诗为证|有词为证|诗曰|词曰` 触发。
 * - DIALOGUE：直接引语，形如 `王冕道："..."`。
 * - COMMENTARY：说书人议论段，由 `却说|话说|看官听说|且说|按|诸君试看|原来` 起首。
 * - unclassified 不以 Region 形式暴露，仅参与覆盖率自白。
 */
export type RegionType = "NARRATIVE" | "POEM" | "DIALOGUE" | "COMMENTARY";

/**
 * 覆盖率自白信心：§0-4。
 * - HIGH：unclassified 占比 ≤ 10%，Stage A 可直接信任 regionMap。
 * - LOW：unclassified 占比 > 10%，Stage A 需回落到全文扫描并在日志里留痕。
 */
export type PreprocessorConfidence = "HIGH" | "LOW";

/**
 * 四区段切分出的一个具体区间（按字符偏移）。
 * - `start` 闭区间、`end` 开区间，与 `String.prototype.slice` 约定一致。
 * - `speaker` 仅 DIALOGUE 类型可能存在：从引入句中抽取的说话人 token（best-effort）。
 */
export interface PreprocessRegion {
  type    : RegionType;
  start   : number;
  end     : number;
  text    : string;
  speaker?: string;
}

/**
 * 覆盖率占比（0~1 浮点，五段相加 ≈ 1，允许浮点误差 ≤ 1e-6）。
 */
export interface CoverageRatios {
  narrative   : number;
  poem        : number;
  dialogue    : number;
  commentary  : number;
  unclassified: number;
}

/**
 * 死亡标记命中项（§0-2）。
 * - `marker`：命中的标记词字面（例如 "病逝"）。
 * - `subjectCandidate`：向前 30 字窗口中提取的最近中文人名 token（2~4 字），为空表示未抽到。
 * - `spanStart` / `spanEnd`：标记词在章节原文中的字符偏移，配对 `String.slice` 约定。
 * - `rawSpan`：含窗口上下文的原文片段，落库后供人工审阅。
 */
export interface DeathMarkerHit {
  chapterNo       : number;
  marker          : string;
  subjectCandidate: string | null;
  spanStart       : number;
  spanEnd         : number;
  rawSpan         : string;
}

/**
 * regionMap 元素：Stage A `enforceRegionOverride` 所需的最小区间信息（§0-5）。
 */
export interface RegionMapEntry {
  start: number;
  end  : number;
  type : RegionType;
}

/**
 * Stage 0 预处理器最终产物。
 *
 * 输出字段：
 * - `regions`：带文本与说话人的详细区段列表（供调试 / 审阅）。
 * - `regionMap`：精简后的区间映射（供 Stage A `enforceRegionOverride` 消费）。
 * - `coverage`：五段覆盖率自白；`unclassified > 0.10` → `confidence = "LOW"`。
 * - `deathMarkerHits`：死亡标记词命中列表，可能为空数组。
 */
export interface ChapterPreprocessResult {
  chapterNo      : number;
  regions        : PreprocessRegion[];
  regionMap      : RegionMapEntry[];
  coverage       : CoverageRatios;
  confidence     : PreprocessorConfidence;
  deathMarkerHits: DeathMarkerHit[];
}
