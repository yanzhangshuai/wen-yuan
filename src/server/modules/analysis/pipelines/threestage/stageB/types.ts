/**
 * 文件定位（Stage B · 全书实体仲裁 · 类型契约）：
 * - 契约源：`docs/superpowers/specs/2026-04-17-character-extraction-accuracy-redesign.md`
 *   §0-4（LOW 加严）/ §0-7（CONFIRMED 门槛）/ §0-8（suspectedResolvesTo）/
 *   §0-9（MERGE 充要条件）/ §0-14（B.5 反馈通道）/ §4.2（Prompt B）。
 *
 * 设计约束：纯类型文件，零运行时依赖。
 */

/** 候选组生成来源通道（§0-9 三通道）。 */
export type CandidateGroupChannel =
  | "EXACT_SURFACE"
  | "SUSPECTED_RESOLVES_TO"
  | "ALIAS_ENTRY";

/** Stage B 消费侧对 Persona Mention 的最小读模型（避免 Prisma 类型渗入 resolver 核心）。 */
export interface StageBMentionRow {
  id                 : string;
  chapterNo          : number;
  surfaceForm        : string;
  suspectedResolvesTo: string | null;
  aliasTypeHint      : string;
  identityClaim      : string;
  narrativeRegionType: string;
  actionVerb         : string | null;
  rawSpan            : string;
  confidence         : number;
  promotedPersonaId  : string | null;
}

/** 候选组：聚合后送 LLM 的最小单元。 */
export interface CandidateGroup {
  groupId            : number;
  channels           : Set<CandidateGroupChannel>;
  mentions           : StageBMentionRow[];
  /** 规则预合并是否命中（所有精确同名 + 所有 identityClaim ∈ {SELF}）。 */
  rulePreMergeHit    : boolean;
  /** AliasEntry 是否覆盖组内所有不同 surfaceForm。 */
  aliasEntryHit      : boolean;
  /** 命中的 AliasEntry 规范名（用于合并后 canonicalName）。 */
  aliasEntryCanonical: string | null;
}

/** LLM 对单一候选组的裁决。 */
export interface StageBDecision {
  groupId   : number;
  decision  : "MERGE" | "SPLIT" | "UNSURE";
  confidence: number;
  rationale : string;
}

/** 命中 §0-9 充要条件后真正合并产物。 */
export interface StageBMergeAction {
  groupId         : number;
  canonicalName   : string;
  personaId       : string;
  mergedPersonaIds: string[];
  mentionIds      : string[];
  aliasesAdded    : string[];
  status          : "CONFIRMED" | "CANDIDATE";
  hasLowChapter   : boolean;
}

/** 未达 §0-9 充要条件但 confidence ≥ floor：写入 merge_suggestions 的记录。 */
export interface StageBSuggestionAction {
  groupId        : number;
  reason         : string;
  confidence     : number;
  sourcePersonaId: string;
  targetPersonaId: string;
  evidenceRefs   : Record<string, unknown>;
}

/** B.5 队列消费结果。 */
export interface StageB5ConsumeAction {
  suggestionId  : string;
  originalSource: string;
  originalTarget: string;
  newTargetId   : string | null;
  status        : "PENDING" | "NEEDS_HUMAN_REVIEW";
  reason        : string;
}

export interface StageBResult {
  bookId              : string;
  candidateGroupsTotal: number;
  llmInvocations      : number;
  merges              : StageBMergeAction[];
  suggestions         : StageBSuggestionAction[];
  b5Consumed          : StageB5ConsumeAction[];
  aliasEntryDegraded  : boolean;
}

/** LLM 输出的单组原始条目（宽松解析，容忍额外字段）。 */
export interface RawStageBLlmItem {
  groupId   : number;
  decision  : string;
  confidence: number;
  rationale?: string;
}
