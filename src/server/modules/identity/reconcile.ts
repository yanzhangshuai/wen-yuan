/**
 * reconcile：漏网高频补判
 *
 * 触发：DB 扫"提及数 ≥ N 但不在登记表"的表面形式（确定性穷举，漏不了）
 * 判定：原语（同模型二次看）
 * 边界：只补覆盖缺失【补得上】；系统误判（同一偏差二次犯）【补不上】→ 靠跨模型/人审
 *
 * 时序：Pass1 与 Pass3 之间（父任务 C6 强制，本任务实现组件）。
 * 架构依据：docs/architecture/13-agent-architecture-v5.md §2.3
 */
import { prisma } from "@/server/db/prisma";
import type { BookRegistry } from "./registry.ts";
import { findRegistryEntryByName } from "./registry.ts";
import type { MentionWindow } from "./primitive.ts";
import { runPrimitive } from "./primitive.ts";
import type { RegistryWriteEntry } from "./identityService.ts";
import { writeRegistry } from "./identityService.ts";

export interface ReconcileInput {
  bookId: string;
  jobId: string;
  bookSummary: string;
  skills: string[];
  /** 提及数阈值（默认 2）。 */
  minMentions?: number;
}

export interface ReconcileResult {
  scanned: number;
  resolved: number;
  newEntities: number;
  ambiguous: number;
}

/**
 * 扫描"提及数 ≥ N 但不在登记表"的表面形式（按 mentions.rawText 分组计数）。
 * 返回每个漏网表面形式的出现窗口。
 */
async function findMissingSurfaceForms(bookId: string, registry: BookRegistry, minMentions: number): Promise<Map<string, MentionWindow[]>> {
  const missing = new Map<string, MentionWindow[]>();

  // 按 rawText 分组统计 mentions（本书维度）
  const grouped = await prisma.mention.groupBy({
    by: ["rawText"],
    where: { entity: { profiles: { some: { bookId, deletedAt: null } } }, deletedAt: null, status: { not: "REJECTED" } },
    _count: { _all: true },
    _min: { paraIndex: true },
  });

  for (const row of grouped) {
    const surface = row.rawText.trim();
    if (row._count._all < minMentions) continue;
    if (findRegistryEntryByName(registry, surface)) continue; // 已在登记表
    // 取该表面形式的提及窗口（带章节号）
    const mentions = await prisma.mention.findMany({
      where: { rawText: surface, deletedAt: null, status: { not: "REJECTED" } },
      select: { paraIndex: true, chapter: { select: { no: true } }, rawText: true },
    });
    const windows: MentionWindow[] = mentions.map((m) => ({
      chapterNo: m.chapter.no,
      paraIndex: m.paraIndex,
      excerpt: m.rawText,
    }));
    missing.set(surface, windows);
  }

  return missing;
}

/**
 * reconcile 主入口：扫漏网高频表面形式 → 原语补判 → 回写。
 */
export async function runReconcile(input: ReconcileInput, registry: BookRegistry): Promise<ReconcileResult> {
  const minMentions = input.minMentions ?? 2;
  const missing = await findMissingSurfaceForms(input.bookId, registry, minMentions);

  const result: ReconcileResult = { scanned: missing.size, resolved: 0, newEntities: 0, ambiguous: 0 };
  const toCreate: RegistryWriteEntry[] = [];

  for (const [surfaceForm, windows] of missing) {
    const { output } = await runPrimitive({
      surfaceForm,
      windows,
      registry,
      bookSummary: input.bookSummary,
      skills: input.skills,
      jobId: input.jobId,
      bookId: input.bookId,
    });

    if (output.verdict === "new_entity") {
      toCreate.push({
        canonical: surfaceForm,
        aliases: [surfaceForm],
        type: "PERSON",
        nameType: "TITLE_ONLY",
        confidence: 0.5,
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
      bookId: input.bookId,
      source: "reconcile",
      agentRunId: crypto.randomUUID(),
      entries: toCreate,
    });
  }

  return result;
}
