/**
 * 分布式冲突扫描（conflictScan.ts）
 *
 * 功能：按章分布判读别名误归属，而非邻近窗口重叠（防误报工厂）。
 * 同场共现（范老爷/范进同章）是常态，不触发标记。
 *
 * 两条调用路径（同一代码）：
 * - Tier2 候选级：只扫当前残余候选
 * - Pass3 全量终扫：捕跨候选交互
 *
 * 架构依据：docs/architecture/13-agent-architecture-v5.md §2.3 / D11
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import type { RegistryEntry } from "./registry.ts";

export interface MisattributionFlag {
  alias: string;
  currentEntityId: string;
  targetEntityId: string | null;
  aliasActiveChapters: number[];
  currentEntityChapters: number[];
  targetEntityChapters: number[] | null;
  confidence: number;
}

/**
 * 分布式冲突扫描：按章分布判读别名误归属。
 *
 * 语义（D11）：
 * - 别名活跃章区只与实体 Y 重合、从不与当前实体 X 重合 → 重归属 Y
 * - 与 X、Y 均重合 → 正常同场共现，不标记
 *
 * @param aliasesMap  { 别名 -> 当前绑定实体 ID }
 * @param entities    登记表实体（含活跃章区）
 */
export async function scanMisattribution(
  bookId: string,
  aliasesMap: Map<string, string>,
  entities: RegistryEntry[],
  txClient?: PrismaClient,
): Promise<MisattributionFlag[]> {
  const flags: MisattributionFlag[] = [];
  const client = txClient ?? prisma;

  // 实体 ID → 活跃章区
  const chapterMap = new Map<string, Set<number>>();
  for (const e of entities) {
    chapterMap.set(e.entityId, new Set(e.activeChapters));
  }

  for (const [alias, currentEntityId] of aliasesMap) {
    const currentChapters = chapterMap.get(currentEntityId);
    if (!currentChapters) continue;

    // 查该别名在本书的实际活跃章区（mentions.rawText 命中）
    const mentionRows = await client.mention.findMany({
      where: { rawText: { contains: alias } },
      select: { chapter: { select: { no: true } } },
    });
    const aliasChapters = Array.from(new Set(mentionRows.map((r) => r.chapter.no))).sort((a, b) => a - b);
    if (aliasChapters.length === 0) continue;

    for (const other of entities) {
      if (other.entityId === currentEntityId) continue;
      const otherChapters = chapterMap.get(other.entityId);
      if (!otherChapters || otherChapters.size === 0) continue;

      const inCurrent = aliasChapters.some((c) => currentChapters.has(c));
      const inOther = aliasChapters.some((c) => otherChapters.has(c));

      // 只与 other 重合、从不与 current 重合 → 误归属
      if (!inCurrent && inOther) {
        flags.push({
          alias,
          currentEntityId,
          targetEntityId: other.entityId,
          aliasActiveChapters: aliasChapters,
          currentEntityChapters: Array.from(currentChapters).sort(),
          targetEntityChapters: Array.from(otherChapters).sort(),
          confidence: 0.7 + Math.min(aliasChapters.length / 5, 0.2),
        });
      }
    }
  }

  return flags;
}

/** 单候选扫描（Tier2 用）：只扫残余候选的别名集。 */
export async function scanCandidateMisattribution(
  bookId: string,
  candidateEntityId: string,
  candidateAliases: string[],
  entities: RegistryEntry[],
  txClient?: PrismaClient,
): Promise<MisattributionFlag[]> {
  const aliasMap = new Map(candidateAliases.map((a) => [a, candidateEntityId]));
  return scanMisattribution(bookId, aliasMap, entities, txClient);
}
