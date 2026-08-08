/**
 * Tier2：残余候选兜底（局部窗口 + 全局登记表）
 *
 * 跑：冲突标记 / 低置信 / 漏网高频 / 风险集中类
 * 每候选：分层采样窗口（≤15）→ 原语 → 回写
 *
 * 边界：原语是局部组件，替代不了 Tier1 全局整合；只做安全网。
 * 架构依据：docs/architecture/13-agent-architecture-v5.md §2.3
 */
import type { BookRegistry, RegistryEntry } from "./registry.ts";
import { findRegistryEntryByName } from "./registry.ts";
import type { MentionWindow } from "./primitive.ts";
import { runPrimitive } from "./primitive.ts";
import type { RegistryWriteEntry } from "./identityService.ts";
import { writeRegistry } from "./identityService.ts";

export interface Tier2Candidate {
  surfaceForm: string;
  windows    : MentionWindow[];
}

export interface Tier2Input {
  bookId     : string;
  jobId      : string;
  /** Pass0 的 agent_run id（审计外键必须真实存在）。 */
  agentRunId : string;
  bookSummary: string;
  skills     : string[];
  candidates : Tier2Candidate[];
}

export interface Tier2Result {
  resolved   : number;
  newEntities: number;
  ambiguous  : number;
}

/**
 * Tier2 主入口：对残余候选逐个跑原语，回写登记表。
 * - resolved → 原语给出 resolvedEntityId（已存在实体，通常无需写）
 * - new_entity → 写新实体
 * - ambiguous → 标记（返回计数，由 caller 决定进人审/跨模型）
 */
export async function runTier2(input: Tier2Input, registry: BookRegistry): Promise<Tier2Result> {
  const result: Tier2Result = { resolved: 0, newEntities: 0, ambiguous: 0 };
  const toCreate: RegistryWriteEntry[] = [];

  for (const candidate of input.candidates) {
    const existing = findRegistryEntryByName(registry, candidate.surfaceForm);
    if (existing && existing.confidenceTier === "HIGH") {
      // 已是 HIGH，无需处理
      continue;
    }

    const { output } = await runPrimitive({
      surfaceForm: candidate.surfaceForm,
      windows    : candidate.windows,
      registry,
      bookSummary: input.bookSummary,
      skills     : input.skills,
      jobId      : input.jobId
    });

    if (output.verdict === "new_entity") {
      toCreate.push({
        canonical : candidate.surfaceForm,
        aliases   : [candidate.surfaceForm],
        type      : "PERSON",
        nameType  : "TITLE_ONLY",
        confidence: 0.5
      });
      result.newEntities++;
    } else if (output.verdict === "ambiguous") {
      result.ambiguous++;
    } else {
      result.resolved++;
    }
  }

  if (toCreate.length > 0) {
    await writeRegistry({
      bookId    : input.bookId,
      source    : "tier2",
      agentRunId: input.agentRunId,
      entries   : toCreate
    });
  }

  return result;
}

/** 从登记表中收集低置信/无溯源候选（供 Tier2 处理）。 */
export function collectResidualCandidates(registry: BookRegistry): Tier2Candidate[] {
  return registry.entries
    .filter((e) => e.confidenceTier === "LOW" || (e.confidenceTier === "MEDIUM" && e.nameType === "TITLE_ONLY"))
    .map((e: RegistryEntry) => ({
      surfaceForm: e.canonical,
      windows    : []
    }));
}
