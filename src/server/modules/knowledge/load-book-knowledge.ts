import type { PrismaClient } from "@/generated/prisma/client";
import type { BookLexiconConfig } from "@/server/modules/analysis/config/lexicon";

/**
 * 解析流水线集成：从数据库加载书籍知识配置。
 * 替代硬编码的 GENRE_PRESETS + GENRE_CLASSICAL_NAMES。
 */

/**
 * 加载书籍类型的 NER 调谐配置（替代 GENRE_PRESETS）。
 * 任务启动时调用一次，缓存到内存。
 */
export async function loadBookTypeConfig(
  bookTypeKey: string,
  prisma: PrismaClient
): Promise<BookLexiconConfig> {
  const bookType = await prisma.bookType.findUnique({
    where: { key: bookTypeKey, isActive: true }
  });
  if (!bookType?.presetConfig) return {};
  return bookType.presetConfig as BookLexiconConfig;
}

/**
 * 为分析任务一次性预加载运行时词典配置，避免章节处理中重复查询数据库。
 */
export async function loadAnalysisRuntimeConfig(
  bookTypeKey: string | null | undefined,
  prisma: PrismaClient
): Promise<BookLexiconConfig> {
  const baseConfig = bookTypeKey ? await loadBookTypeConfig(bookTypeKey, prisma) : {};

  const [genericTitles, surnames, extractionRules] = await Promise.all([
    prisma.genericTitleEntry.findMany({
      where  : { isActive: true },
      orderBy: [{ tier: "asc" }, { title: "asc" }],
      select : { title: true, tier: true }
    }),
    prisma.surnameEntry.findMany({
      where: {
        isActive: true,
        OR      : [
          { bookTypeId: null },
          ...(bookTypeKey ? [{ bookType: { key: bookTypeKey } }] : [])
        ]
      },
      orderBy: [{ isCompound: "desc" }, { priority: "desc" }, { surname: "asc" }],
      select : { surname: true, isCompound: true }
    }),
    prisma.extractionRule.findMany({
      where: {
        isActive: true,
        OR      : [
          { genreKey: null },
          ...(bookTypeKey ? [{ genreKey: bookTypeKey }] : [])
        ]
      },
      orderBy: [{ ruleType: "asc" }, { sortOrder: "asc" }],
      select : { ruleType: true, content: true }
    })
  ]);

  return {
    ...baseConfig,
    safetyGenericTitles        : genericTitles.filter((item) => item.tier === "SAFETY").map((item) => item.title),
    defaultGenericTitles       : genericTitles.filter((item) => item.tier === "DEFAULT").map((item) => item.title),
    surnameCompounds           : surnames.filter((item) => item.isCompound).map((item) => item.surname),
    surnameSingles             : surnames.filter((item) => !item.isCompound).map((item) => item.surname),
    entityExtractionRules      : extractionRules.filter((item) => item.ruleType === "ENTITY").map((item) => item.content),
    relationshipExtractionRules: extractionRules.filter((item) => item.ruleType === "RELATIONSHIP").map((item) => item.content)
  };
}

/**
 * 从数据库构建别名查找表（替代 buildAliasLookup 中的硬编码数据）。
 * 运行时会合并“手动挂载包 + 自动继承书籍类型包”，并保证手动挂载优先级更高。
 * 仅加载 reviewStatus=VERIFIED 的条目。
 */
export async function buildAliasLookupFromDb(
  bookId: string,
  bookTypeKey: string | null | undefined,
  prisma: PrismaClient
): Promise<Map<string, string>> {
  // Step 1: 查找手动挂载且仍处于启用态的知识包
  const bookPacks = await prisma.bookKnowledgePack.findMany({
    where  : { bookId, pack: { isActive: true } },
    orderBy: { priority: "desc" },
    select : { packId: true, priority: true }
  });

  // Step 2: 自动继承启用中的书籍类型知识包；与手动挂载包合并去重
  const typePacks = bookTypeKey
    ? await prisma.knowledgePack.findMany({
      where : { bookType: { key: bookTypeKey }, isActive: true, scope: "GENRE" },
      select: { id: true }
    })
    : [];

  const mountedPackIds = bookPacks.map((item) => item.packId);
  const inheritedPackIds = typePacks
    .map((item) => item.id)
    .filter((packId) => !mountedPackIds.includes(packId));
  const packIds = [...mountedPackIds, ...inheritedPackIds];

  // Step 3: 无知识包 → 返回空 Map
  if (packIds.length === 0) return new Map();

  const packPriorityMeta = new Map(
    bookPacks.map((item) => [item.packId, { isMounted: true, priority: item.priority }])
  );
  for (const packId of inheritedPackIds) {
    packPriorityMeta.set(packId, { isMounted: false, priority: 0 });
  }

  // Step 4: 加载所有已验证条目
  const entries = await prisma.knowledgeEntry.findMany({
    where : { packId: { in: packIds }, reviewStatus: "VERIFIED" },
    select: { packId: true, canonicalName: true, aliases: true, confidence: true }
  });

  // Step 5: 展平为 alias → canonicalName 映射（手动挂载优先，其次 priority，再次 confidence）
  const lookup = new Map<string, string>();
  const sortedEntries = entries.sort((left, right) => {
    const leftMeta = packPriorityMeta.get(left.packId) ?? { isMounted: false, priority: 0 };
    const rightMeta = packPriorityMeta.get(right.packId) ?? { isMounted: false, priority: 0 };

    if (leftMeta.isMounted !== rightMeta.isMounted) {
      return leftMeta.isMounted ? -1 : 1;
    }

    if (leftMeta.priority !== rightMeta.priority) {
      return rightMeta.priority - leftMeta.priority;
    }

    if (left.confidence !== right.confidence) {
      return right.confidence - left.confidence;
    }

    return left.canonicalName.localeCompare(right.canonicalName, "zh-CN");
  });
  for (const entry of sortedEntries) {
    const canonicalKey = entry.canonicalName.trim().toLowerCase();
    if (canonicalKey && !lookup.has(canonicalKey)) {
      lookup.set(canonicalKey, entry.canonicalName);
    }

    for (const alias of entry.aliases) {
      const normalizedAlias = alias.trim().toLowerCase();
      if (normalizedAlias && !lookup.has(normalizedAlias)) {
        lookup.set(normalizedAlias, entry.canonicalName);
      }
    }
  }
  return lookup;
}
