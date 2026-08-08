/**
 * 登记表派生视图（registry.ts）
 *
 * 功能：从 entities、aliases、mentions、entity_profiles 四表派生身份登记表。
 * 无新表——物化查询，HIGH/MEDIUM/LOW 为运行时派生分类，不落库。
 *
 * 核心原则：
 * - 书级缓存 + identityService 写后失效（不是定时过期）
 * - 名字命中查询（canonical / alias 归一化匹配）供：身份判定原语、
 *   Tier1/Tier2/reconcile、Pass4 自动接受栈
 *
 * 架构依据：docs/architecture/13-agent-architecture-v5.md §2.3 / §6
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";

/**
 * 信任等级（运行时派生，不落库）。
 * - HIGH：CONFIRMED aliases 或 ≥2 证据锚定 mentions，且活跃章区 ≥1，且非 TITLE_ONLY
 * - MEDIUM：有 mentions 或 aliases 但未达 HIGH
 * - LOW：提及 ≤1 或 TITLE_ONLY 无溯源
 */
export type ConfidenceTier = "HIGH" | "MEDIUM" | "LOW";

export interface RegistryEntry {
  entityId              : string;
  canonical             : string;
  type                  : string; // PERSON | LOCATION | ORGANIZATION | CONCEPT
  aliases               : string[];
  confidenceTier        : ConfidenceTier;
  activeChapters        : number[];
  firstAppearanceChapter: number | null;
  nameType              : string; // NAMED | TITLE_ONLY
}

export interface BookRegistry {
  bookId  : string;
  entries : RegistryEntry[];
  loadedAt: Date;
}

/** 书级缓存：bookId → BookRegistry。identityService 写后调用 invalidateRegistryCache 失效。 */
const registryCache = new Map<string, BookRegistry>();

export function invalidateRegistryCache(bookId: string): void {
  registryCache.delete(bookId);
}

export function invalidateAllRegistryCache(): void {
  registryCache.clear();
}

/**
 * 获取书的身份登记表（派生视图）。
 * 查询该书所有有效实体（经 entity_profiles 关联），附 aliases + mentions 派生分类。
 */
export async function getRegistry(bookId: string, txClient?: PrismaClient): Promise<BookRegistry> {
  const cached = registryCache.get(bookId);
  if (cached) return cached;

  const client = txClient ?? prisma;

  const entities = await client.entity.findMany({
    where: {
      profiles : { some: { bookId, deletedAt: null } },
      deletedAt: null
    },
    include: {
      aliasRecords: {
        where : { bookId, deletedAt: null },
        select: { status: true, alias: true }
      },
      mentions: {
        where : { status: { not: "REJECTED" }, deletedAt: null },
        select: { chapter: { select: { no: true } } }
      }
    }
  });

  const entries: RegistryEntry[] = entities.map((entity) => {
    const chapterNos = Array.from(new Set(entity.mentions.map((m) => m.chapter.no))).sort((a, b) => a - b);

    // v6 提取/归并把别名写入书级 alias 表（权威源），entity.aliases 数组可能为空——
    // 登记表的 aliases 取两者并集，保证名称解析（findRegistryEntryByName）完整。
    const aliasSet = new Set<string>(entity.aliases);
    for (const rec of entity.aliasRecords) {
      if (rec.alias) aliasSet.add(rec.alias);
    }
    const aliases = Array.from(aliasSet);

    const aliasStatuses = entity.aliasRecords.map((a) => a.status);
    const hasConfirmed = aliasStatuses.includes("CONFIRMED");
    const mentionCount = entity.mentions.length;
    const aliasCount = entity.aliasRecords.length;

    let confidenceTier: ConfidenceTier;
    if ((hasConfirmed || mentionCount >= 2) && chapterNos.length >= 1 && entity.nameType !== "TITLE_ONLY") {
      confidenceTier = "HIGH";
    } else if (mentionCount > 0 || aliasCount > 0) {
      confidenceTier = "MEDIUM";
    } else {
      confidenceTier = "LOW";
    }

    return {
      entityId              : entity.id,
      canonical             : entity.name,
      type                  : entity.entityType,
      aliases,
      confidenceTier,
      activeChapters        : chapterNos,
      firstAppearanceChapter: chapterNos.length > 0 ? chapterNos[0] : null,
      nameType              : entity.nameType
    };
  });

  entries.sort((a, b) => (a.firstAppearanceChapter ?? 9999) - (b.firstAppearanceChapter ?? 9999));

  const registry: BookRegistry = { bookId, entries, loadedAt: new Date() };
  registryCache.set(bookId, registry);
  return registry;
}

/** 名字归一化：去全角/半角空格、转小写。 */
export function normalizeRegistryName(name: string): string {
  return name.replace(/[\s　]+/g, "").trim().toLowerCase();
}

/** 在登记表中通过名字（canonical 或 alias，归一化后）查找实体。 */
export function findRegistryEntryByName(registry: BookRegistry, name: string): RegistryEntry | null {
  const normalized = normalizeRegistryName(name);
  for (const entry of registry.entries) {
    if (normalizeRegistryName(entry.canonical) === normalized) return entry;
    for (const alias of entry.aliases) {
      if (normalizeRegistryName(alias) === normalized) return entry;
    }
  }
  return null;
}
