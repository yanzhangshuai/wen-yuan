/**
 * 章节分析纯工具函数集合。
 * 所有函数均无副作用、不依赖闭包状态，可直接单元测试。
 */

import { BioCategory } from "@/generated/prisma/enums";
import { ANALYSIS_PIPELINE_CONFIG } from "@/server/modules/analysis/config/pipeline";
import type {
  AnalysisProfileContext,
  BioCategoryValue,
  ChapterAnalysisResponse,
  EnhancedChapterRosterEntry
} from "@/types/analysis";
import type { ResolvedFallbackModel, ResolvedStageModel } from "@/server/modules/analysis/services/ModelStrategyResolver";

// ── 常量 ────────────────────────────────────────────────────────────────

/** 同时解析的分段数，避免触发 API 频控，同时控制单章处理时长。 */
export const AI_CONCURRENCY = ANALYSIS_PIPELINE_CONFIG.chunkAiConcurrency;

/** relationship evidence 仅保留前 5 条，避免异常长证据链污染最终结构化结果。 */
export const RELATIONSHIP_EVIDENCE_LIMIT = 5;

export const GENERIC_IRONY_PATTERNS: readonly RegExp[] = [
  /批判(了|的是)?社会/,
  /揭露(了|的是)?(社会|官场|制度)/,
  /反映(了|的是)?现实/,
  /封建(礼教|社会)/,
  /辛辣?讽刺/,
  /社会(现实)?(黑暗|腐败)/
];

// ── 模型参数 ─────────────────────────────────────────────────────────────

export function toGenerateOptions(model: ResolvedStageModel | ResolvedFallbackModel) {
  return {
    temperature    : model.params.temperature,
    maxOutputTokens: model.params.maxOutputTokens,
    topP           : model.params.topP,
    ...(typeof model.params.enableThinking === "boolean"
      ? { enableThinking: model.params.enableThinking }
      : {}),
    ...(model.params.reasoningEffort
      ? { reasoningEffort: model.params.reasoningEffort }
      : {})
  };
}

// ── mention 去重 ─────────────────────────────────────────────────────────

/**
 * mention 去重键约定：
 * - paraIndex 存在时优先使用 personaName + rawText + paraIndex，避免跨段误去重；
 * - paraIndex 缺失时降级到 personaName + rawText，兼容历史输出。
 */
export function buildMentionDedupKey(mention: ChapterAnalysisResponse["mentions"][number]): string {
  const baseKey = `${mention.personaName}||${mention.rawText}`;
  return typeof mention.paraIndex === "number"
    ? `${baseKey}||${mention.paraIndex}`
    : baseKey;
}

// ── 名册合并 ─────────────────────────────────────────────────────────────

/**
 * 统一合并 Phase 1 人物名册结果：
 * - 优先按 suggestedRealName + aliasType 聚合（对应文档中的 normalizedName + titleType）；
 * - 若缺失 suggestedRealName，则退化到 surfaceForm + aliasType。
 */
export function mergeRosterEntriesForAnalysis(entries: EnhancedChapterRosterEntry[]): EnhancedChapterRosterEntry[] {
  const rosterMap = new Map<string, EnhancedChapterRosterEntry>();

  for (const entry of entries) {
    const surfaceForm = entry.surfaceForm.trim();
    if (!surfaceForm) continue;

    const normalizedName = entry.suggestedRealName?.trim().toLowerCase();
    const typeKey = entry.aliasType ?? "_";
    const dedupBase = normalizedName && normalizedName.length > 0
      ? normalizedName
      : surfaceForm.toLowerCase();
    const dedupKey = `${dedupBase}||${typeKey}`;

    const normalized: EnhancedChapterRosterEntry = {
      ...entry,
      surfaceForm
    };
    const existing = rosterMap.get(dedupKey);
    if (!existing) {
      rosterMap.set(dedupKey, normalized);
      continue;
    }

    // 合并策略：保留"更完整且更可信"的字段，避免后写入的弱信息覆盖强信息。
    rosterMap.set(dedupKey, {
      ...existing,
      ...normalized,
      surfaceForm,
      entityId         : existing.entityId ?? normalized.entityId,
      isNew            : existing.isNew || normalized.isNew,
      generic          : existing.generic && normalized.generic,
      isTitleOnly      : existing.isTitleOnly || normalized.isTitleOnly,
      suggestedRealName: existing.suggestedRealName ?? normalized.suggestedRealName,
      aliasType        : existing.aliasType ?? normalized.aliasType,
      aliasConfidence  : Math.max(existing.aliasConfidence ?? 0, normalized.aliasConfidence ?? 0),
      contextHint      : existing.contextHint ?? normalized.contextHint
    });
  }

  return Array.from(rosterMap.values());
}

// ── 分段结果合并 ─────────────────────────────────────────────────────────

/**
 * 分段结果聚合：
 * - mention：按 paraIndex 感知去重，减少跨段误折叠；
 * - relationship：按结构三元组去重，并聚合证据；
 * - relationshipEvent：按精确事件语义去重，保留同 Pair 同章节的多事件；
 * - evidence 聚合后截断到 5 条，防止异常长链污染结果与日志。
 */
export function mergeChunkResultsForAnalysis(results: ChapterAnalysisResponse[]): ChapterAnalysisResponse {
  const mentionMap = new Map<string, ChapterAnalysisResponse["mentions"][number]>();
  const biographyMap = new Map<string, ChapterAnalysisResponse["biographies"][number]>();
  const relationshipMap = new Map<string, ChapterAnalysisResponse["relationships"][number]>();
  const relationshipEventMap = new Map<string, ChapterAnalysisResponse["relationshipEvents"][number]>();

  for (const result of results) {
    for (const mention of result.mentions) {
      const key = buildMentionDedupKey(mention);
      if (!mentionMap.has(key)) {
        mentionMap.set(key, mention);
      }
    }

    for (const biography of result.biographies) {
      const key = `${biography.personaName}||${biography.event}`;
      if (!biographyMap.has(key)) {
        biographyMap.set(key, biography);
      }
    }

    for (const relationship of result.relationships) {
      const key = `${relationship.sourceName}||${relationship.targetName}||${relationship.relationshipTypeCode}`;
      const existing = relationshipMap.get(key);
      if (!existing) {
        relationshipMap.set(key, { ...relationship });
        continue;
      }

      // 证据字段可能已经是"；"拼接串，这里按分号拆分去重并限制上限。
      const evidences = new Set<string>();
      for (const evidenceChunk of [existing.evidence, relationship.evidence]) {
        if (!evidenceChunk) {
          continue;
        }
        for (const item of evidenceChunk.split("；")) {
          const trimmed = item.trim();
          if (trimmed) {
            evidences.add(trimmed);
          }
          if (evidences.size >= RELATIONSHIP_EVIDENCE_LIMIT) {
            break;
          }
        }
        if (evidences.size >= RELATIONSHIP_EVIDENCE_LIMIT) {
          break;
        }
      }

      relationshipMap.set(key, {
        ...existing,
        evidence: Array.from(evidences).filter(Boolean).slice(0, RELATIONSHIP_EVIDENCE_LIMIT).join("；") || undefined
      });
    }

    for (const event of result.relationshipEvents ?? []) {
      const key = [
        event.sourceName,
        event.targetName,
        event.relationshipTypeCode,
        event.summary,
        event.evidence ?? "",
        event.paraIndex ?? "null"
      ].join("||");
      if (!relationshipEventMap.has(key)) {
        relationshipEventMap.set(key, event);
      }
    }
  }

  return {
    biographies       : Array.from(biographyMap.values()),
    mentions          : Array.from(mentionMap.values()),
    relationships     : Array.from(relationshipMap.values()),
    relationshipEvents: Array.from(relationshipEventMap.values())
  };
}

// ── 文本分片 ─────────────────────────────────────────────────────────────

/**
 * 按段落边界切分章节内容，控制单次模型输入长度，支持相邻分片重叠以缓解边界断裂。
 */
export function splitContentIntoChunks(
  text: string,
  size: number,
  overlap: number = ANALYSIS_PIPELINE_CONFIG.chunkOverlap
): string[] {
  const paras = text.split(/\n+/).filter(p => p.trim());
  const rawChunks: string[] = [];
  let current = "";
  for (const p of paras) {
    if (p.length > size) {
      if (current) {
        rawChunks.push(current);
        current = "";
      }
      for (let start = 0; start < p.length; start += size) {
        rawChunks.push(p.slice(start, start + size));
      }
      continue;
    }

    if ((current + p).length > size && current) {
      rawChunks.push(current);
      current = p;
    } else {
      current += (current ? "\n\n" : "") + p;
    }
  }
  if (current) rawChunks.push(current);

  // 只有一个 chunk 时无需重叠
  if (rawChunks.length <= 1 || overlap <= 0) {
    return rawChunks;
  }

  // 为第 2 个及以后的 chunk 添加前一个 chunk 尾部的 overlap 上下文
  const chunks: string[] = [rawChunks[0]];
  for (let i = 1; i < rawChunks.length; i++) {
    const prev = rawChunks[i - 1];
    const overlapText = prev.slice(-overlap);
    chunks.push(overlapText + rawChunks[i]);
  }
  return chunks;
}

// ── 数据清洗 ─────────────────────────────────────────────────────────────

export function normalizeCategory(val: BioCategoryValue): BioCategory {
  const map: Record<string, BioCategory> = {
    BIRTH : BioCategory.BIRTH,
    EXAM  : BioCategory.EXAM,
    CAREER: BioCategory.CAREER,
    TRAVEL: BioCategory.TRAVEL,
    SOCIAL: BioCategory.SOCIAL,
    DEATH : BioCategory.DEATH
  };
  return map[val] ?? BioCategory.EVENT;
}

/**
 * ironyNote 常出现"泛化标签"与"剧情猜测"，这里做保守抽取：
 * 1) 限制长度，避免把整段解释写入数据库；
 * 2) 只保留当前章节可证据化的讽刺描述；
 * 3) 若内容过于空泛（如"很讽刺""批判社会"）则置空，避免污染 biography_records。
 */
export function sanitizeIronyNote(note?: string): string | undefined {
  if (!note) return undefined;
  const clean = note.replace(/\s+/g, " ").trim();
  if (clean.length < 5) return undefined;

  // 过滤过于空泛的"宏大叙事式"评语，减少噪声进入结构化数据。
  if (GENERIC_IRONY_PATTERNS.some((pattern) => pattern.test(clean)) && clean.length <= 28) {
    return undefined;
  }

  return clean.slice(0, 300);
}

/**
 * 统一清洗关系字段（description/evidence）：
 * - 去除多余空白；
 * - 过滤过短噪声；
 * - 限制长度避免把整段原文写入关系字段。
 */
export function sanitizeRelationshipField(value?: string): string | undefined {
  if (!value) return undefined;
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length < 2 ? undefined : clean.slice(0, 400);
}

// ── Profile 工具 ────────────────────────────────────────────────────────

/**
 * 将人物档案列表转为短整型 ID 映射（shortId → personaId UUID）。
 * 生成的 shortId 与 buildEntityContextLines 中的 [N] 序号完全对应（1-indexed）。
 */
export function buildEntityIdMap(profiles: AnalysisProfileContext[]): Map<number, string> {
  const map = new Map<number, string>();
  profiles.forEach((p, idx) => {
    map.set(idx + 1, p.personaId);
  });
  return map;
}

export function normalizeLookupKey(value: string): string {
  return value.trim().toLowerCase();
}

export function buildProfileLookupMap(
  profiles: AnalysisProfileContext[]
): Map<string, { personaId: string; canonicalName: string }> {
  const lookup = new Map<string, { personaId: string; canonicalName: string }>();
  for (const profile of profiles) {
    const names = [profile.canonicalName, ...profile.aliases];
    for (const name of names) {
      const key = normalizeLookupKey(name);
      if (!key || lookup.has(key)) {
        continue;
      }

      lookup.set(key, {
        personaId    : profile.personaId,
        canonicalName: profile.canonicalName
      });
    }
  }

  return lookup;
}

export function collectGenericRatiosFromRoster(
  roster: Array<{ surfaceForm: string; generic?: boolean }>
): Map<string, { generic: number; nonGeneric: number }> {
  const map = new Map<string, { generic: number; nonGeneric: number }>();
  for (const item of roster) {
    const key = item.surfaceForm.trim();
    if (!key) continue;
    const current = map.get(key) ?? { generic: 0, nonGeneric: 0 };
    if (item.generic) current.generic += 1;
    else current.nonGeneric += 1;
    map.set(key, current);
  }
  return map;
}
