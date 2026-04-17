/**
 * 文件定位（Stage 0 · 预处理器对外入口）：
 * - 汇总四区段切分、死亡标记、地点标记、互斥图等规则层模块的对外导出，
 *   供下游（Stage A/B/B.5 等）以单一 barrel 引用。
 * - 纯再导出，不含任何实现逻辑。
 */

export { preprocessChapter } from "@/server/modules/analysis/preprocessor/ChapterPreprocessor";
export {
  DEATH_MARKERS,
  DEATH_MARKER_REGEX,
  DEATH_SUBJECT_WINDOW,
  extractSubjectCandidate,
  scanDeathMarkers
} from "@/server/modules/analysis/preprocessor/deathMarkers";
export {
  LOCATION_PREFIXES,
  LOCATION_SUFFIXES,
  extractLocationMentions
} from "@/server/modules/analysis/preprocessor/locationMarkers";
export type { LocationMention } from "@/server/modules/analysis/preprocessor/locationMarkers";
export {
  MUTUAL_EXCLUSION_PAIRS,
  areMutuallyExclusive
} from "@/server/modules/analysis/preprocessor/locationExclusivityGraph";
export type {
  ChapterPreprocessResult,
  CoverageRatios,
  DeathMarkerHit,
  PreprocessRegion,
  PreprocessorConfidence,
  RegionMapEntry,
  RegionType
} from "@/server/modules/analysis/preprocessor/types";
