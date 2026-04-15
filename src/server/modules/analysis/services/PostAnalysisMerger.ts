import type { PrismaClient } from "@/generated/prisma/client";
import type { FullRuntimeKnowledge } from "@/server/modules/knowledge/load-book-knowledge";

/**
 * 全书分析完成后的人物合并建议生成器。
 * 依据名字精确匹配、知识库别名、别名交叉等信号，
 * 生成待人工确认的合并建议队列（MergeSuggestion）。
 *
 * D3 硬性约束：仅 confidence=1.0 的精确名称匹配可自动合并（AUTO_MERGED），
 * 其余一律写入 PENDING 状态等待人工确认。
 */

interface MergeCandidate {
  sourceId  : string;
  targetId  : string;
  confidence: number;
  reason    : string;
  tier      : number;
}

/**
 * 功能：归一化人物名称，用于精确匹配和别名交叉比对。
 * 输入：原始名称字符串。
 * 输出：去除首尾空白和内部空格后的归一化字符串。
 * 异常：无。
 * 副作用：无。
 */
function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, "");
}

export interface PostAnalysisMergerOptions {
  bookId           : string;
  runtimeKnowledge?: FullRuntimeKnowledge;
}

/**
 * 功能：扫描指定 book 下所有 persona，按多层匹配策略生成合并建议。
 * 输入：prisma 客户端、bookId 及可选的运行时知识库。
 * 输出：{ created: 已创建建议数, autoMerged: 自动合并数 }。
 * 异常：Prisma 查询失败时抛出底层数据库错误。
 * 副作用：写入 merge_suggestions 表；console.info 输出结构化日志。
 */
export async function runPostAnalysisMerger(
  prisma : PrismaClient,
  options: PostAnalysisMergerOptions
): Promise<{ created: number; autoMerged: number }> {
  const { bookId, runtimeKnowledge } = options;

  // 加载本书所有 persona（通过 profile 关联）
  const profiles = await prisma.profile.findMany({
    where : { bookId },
    select: {
      personaId: true,
      localName: true,
      persona  : {
        select: {
          id        : true,
          name      : true,
          aliases   : true,
          confidence: true,
        },
      },
    },
  });

  // 去重：同一 persona 可能有多个 profile
  const personaMap = new Map<
    string,
    {
      id        : string;
      name      : string;
      aliases   : string[];
      confidence: number | null;
    }
  >();
  for (const p of profiles) {
    if (!personaMap.has(p.personaId)) {
      personaMap.set(p.personaId, p.persona);
    }
  }

  const personas = Array.from(personaMap.values());
  if (personas.length < 2) {
    return { created: 0, autoMerged: 0 };
  }

  // 已存在的合并建议对（避免重复建议）
  const existingSuggestions = await prisma.mergeSuggestion.findMany({
    where : { bookId },
    select: { sourcePersonaId: true, targetPersonaId: true },
  });
  const existingPairs = new Set(
    existingSuggestions.map(
      (s) => `${s.sourcePersonaId}:${s.targetPersonaId}`
    )
  );
  function isPairExists(sourceId: string, targetId: string): boolean {
    return (
      existingPairs.has(`${sourceId}:${targetId}`) ||
      existingPairs.has(`${targetId}:${sourceId}`)
    );
  }

  const candidates: MergeCandidate[] = [];

  // 名称索引：归一化名 → personaId（Tier 2/3 共用）
  const nameIndex = new Map<string, string>();
  for (const p of personas) {
    nameIndex.set(normalizeName(p.name), p.id);
  }

  // ── Tier 1: 精确名称匹配 ──
  // 按归一化名字分组，同组内两两生成合并候选
  const nameGroups = new Map<string, typeof personas>();
  for (const p of personas) {
    const key = normalizeName(p.name);
    const group = nameGroups.get(key) ?? [];
    group.push(p);
    nameGroups.set(key, group);
  }
  for (const [, group] of nameGroups) {
    if (group.length < 2) continue;
    // 选置信度最高的作为 target
    const sorted = [...group].sort(
      (a, b) => (b.confidence ?? 0) - (a.confidence ?? 0)
    );
    const target = sorted[0];
    for (let i = 1; i < sorted.length; i++) {
      const source = sorted[i];
      if (!isPairExists(source.id, target.id)) {
        candidates.push({
          sourceId  : source.id,
          targetId  : target.id,
          confidence: 1.0,
          reason    : `精确名称匹配: "${source.name}" = "${target.name}"`,
          tier      : 1,
        });
      }
    }
  }

  // ── Tier 2: KB alias 驱动 ──
  // aliasLookup 返回 canonicalName（非 personaId），需要经 nameIndex 二次查找
  if (runtimeKnowledge?.aliasLookup) {
    for (const p of personas) {
      const allNames = [p.name, ...p.aliases];
      for (const alias of allNames) {
        const canonicalName = runtimeKnowledge.aliasLookup.get(alias);
        if (!canonicalName) continue;

        const targetId = nameIndex.get(normalizeName(canonicalName));
        if (targetId && targetId !== p.id && !isPairExists(p.id, targetId)) {
          const targetPersona = personaMap.get(targetId);
          candidates.push({
            sourceId  : p.id,
            targetId,
            confidence: 0.90,
            reason    : `知识库别名映射: "${alias}" → "${targetPersona?.name ?? targetId}"`,
            tier      : 2,
          });
        }
      }
    }
  }

  // ── Tier 3: Alias 交叉匹配 ──
  // persona A 的 alias 等于 persona B 的 name（或反之）
  for (const p of personas) {
    for (const alias of p.aliases) {
      const normalizedAlias = normalizeName(alias);
      const matchedId = nameIndex.get(normalizedAlias);
      if (matchedId && matchedId !== p.id && !isPairExists(p.id, matchedId)) {
        const matchedPersona = personaMap.get(matchedId);
        candidates.push({
          sourceId  : p.id,
          targetId  : matchedId,
          confidence: 0.85,
          reason    : `别名交叉: "${p.name}" 的别名 "${alias}" 匹配 "${matchedPersona?.name ?? matchedId}"`,
          tier      : 3,
        });
      }
    }
  }

  // 去重：同一对只保留最高 tier（tier 数字越小优先级越高）的候选
  const uniqueCandidates = new Map<string, MergeCandidate>();
  for (const c of candidates) {
    const key = [c.sourceId, c.targetId].sort().join(":");
    const existing = uniqueCandidates.get(key);
    if (!existing || c.tier < existing.tier) {
      uniqueCandidates.set(key, c);
    }
  }

  // 写入 MergeSuggestion
  let created    = 0;
  let autoMerged = 0;

  for (const candidate of uniqueCandidates.values()) {
    // D3: 仅 confidence=1.0 可自动合并
    const status = candidate.confidence >= 1.0 ? "AUTO_MERGED" : "PENDING";

    await prisma.mergeSuggestion.create({
      data: {
        bookId,
        sourcePersonaId: candidate.sourceId,
        targetPersonaId: candidate.targetId,
        reason         : candidate.reason,
        confidence     : candidate.confidence,
        status,
        evidenceRefs   : { tier: candidate.tier },
      },
    });

    created++;
    if (status === "AUTO_MERGED") {
      autoMerged++;
    }
  }

  if (created > 0) {
    console.info(
      "[PostAnalysisMerger] merge.suggestions.created",
      JSON.stringify({
        bookId,
        total  : created,
        autoMerged,
        pending: created - autoMerged,
      })
    );
  }

  return { created, autoMerged };
}
