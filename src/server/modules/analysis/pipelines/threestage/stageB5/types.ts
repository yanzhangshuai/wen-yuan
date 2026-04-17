/**
 * 文件定位（Stage B.5 · 时序一致性检查 · 类型契约）：
 * - 契约源：`docs/superpowers/specs/2026-04-17-character-extraction-accuracy-redesign.md`
 *   §0-3（双检）/ §0-14（反馈通道 · 不回环）/ REV-2。
 * - MVP 仅实现 §0-3(a) “死后行动”检查；§0-3(b) 跨地点并发由 T17 完成后补齐。
 *
 * 设计约束：
 * - 纯类型文件，零运行时依赖。
 * - `IMPERSONATION_CANDIDATE` 经 `evidenceRefs.kind` 字段携带（MergeSuggestion 表未设 `kind` 列）。
 */

/**
 * 命中 Stage B.5 的 post-death mention 证据项。
 * 只保留仲裁/审阅时必须的字段，避免把全量 persona_mentions 行塞进 JSON。
 */
export interface PostDeathMentionEvidence {
  mentionId          : string;
  chapterNo          : number;
  surfaceForm        : string;
  rawSpan            : string;
  identityClaim      : string;
  narrativeRegionType: string;
}

/**
 * 写入 `merge_suggestions.evidenceRefs` 的载荷结构。
 * 固定 `kind='IMPERSONATION_CANDIDATE'` + `subKind='POST_DEATH_ACTION'`，
 * Stage B 消费时依据 kind 分派处理器。
 */
export interface TemporalEvidenceRefs {
  kind             : "IMPERSONATION_CANDIDATE";
  subKind          : "POST_DEATH_ACTION";
  deathChapterNo   : number;
  postDeathMentions: PostDeathMentionEvidence[];
}

/**
 * 单个 persona 的检查结果，便于日志与测试断言。
 */
export interface TemporalPersonaReport {
  personaId        : string;
  deathChapterNo   : number;
  postDeathMentions: number;
  /** 写入 merge_suggestions 的行动：created = 新增 / skipped_existing = 已有 PENDING 跳过 / none = 未命中。*/
  action           : "created" | "skipped_existing" | "none";
  suggestionId     : string | null;
}

/**
 * `TemporalConsistencyChecker.check(bookId)` 的返回值。
 */
export interface TemporalCheckResult {
  bookId            : string;
  personasScanned   : number;
  suggestionsCreated: number;
  suggestionsSkipped: number;
  reports           : TemporalPersonaReport[];
}
