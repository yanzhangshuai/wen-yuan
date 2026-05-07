import type { PrismaClient } from "@/generated/prisma/client";
import type { BookLexiconConfig } from "@/server/modules/analysis/config/lexicon";
import {
  formatRelationshipTypeDictionary,
  type RelationshipTypeDictionaryPromptEntry
} from "@/server/modules/analysis/services/prompts";
import { getStaticSurnames } from "./data/surnames";
import { STATIC_NAME_PATTERNS } from "./data/name-patterns";

/**
 * 解析流水线集成：从数据库加载书籍知识配置。
 * 替代硬编码词表，统一由数据库驱动。
 */

const NAME_PATTERN_MAX_LENGTH = 200;
const NAME_PATTERN_COMPILE_TIMEOUT_MS = 100;
const NESTED_QUANTIFIER_PATTERN = /(\([^)]*[+*][^)]*\))[+*{]/;

interface RuntimeLexiconPayload {
  genericTitles  : Array<{ title: string; tier: string }>;
  nerLexiconRules: Array<{ ruleType: string; content: string }>;
  promptRules    : Array<{ ruleType: string; content: string }>;
}

interface RuntimeLexiconBuildResult {
  lexiconConfig       : BookLexiconConfig;
  safetyGenericTitles : string[];
  defaultGenericTitles: string[];
  relationalTermTitles: string[];
  hardBlockSuffixes   : string[];
  softBlockSuffixes   : string[];
  titleStems          : string[];
  positionStems       : string[];
}

export interface CompiledNamePatternRule {
  id         : string;
  ruleType   : string;
  action     : string;
  pattern    : string;
  description: string | null;
  compiled   : RegExp;
}

export interface FullRuntimeKnowledge {
  bookId                        : string;
  bookTypeId                    : string | null;
  bookTypeKey                   : string | null;
  lexiconConfig                 : BookLexiconConfig;
  relationshipTypes             : RelationshipTypeDictionaryPromptEntry[];
  relationshipTypeByCode        : Map<string, RelationshipTypeDictionaryPromptEntry>;
  relationshipTypeDictionaryText: string;
  aliasLookup                   : Map<string, string>;
  relationalTerms               : Set<string>;
  namePatternRules              : CompiledNamePatternRule[];
  hardBlockSuffixes             : Set<string>;
  softBlockSuffixes             : Set<string>;
  safetyGenericTitles           : Set<string>;
  defaultGenericTitles          : Set<string>;
  titlePatterns                 : RegExp[];
  positionPatterns              : RegExp[];
  loadedAt                      : Date;
}

const runtimeKnowledgeCache = new Map<string, FullRuntimeKnowledge>();

interface LoadFullRuntimeKnowledgeParams {
  bookId       : string;
  prisma       : PrismaClient;
  forceRefresh?: boolean;
}

function normalizeLookupValue(value: string): string {
  return value.trim().toLowerCase();
}

function toUniqueList(values: Iterable<string>): string[] {
  return Array.from(new Set(
    Array.from(values)
      .map((value) => value.trim())
      .filter(Boolean)
  ));
}

function escapeRegexLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compileStemPatterns(stems: Iterable<string>): RegExp[] {
  return toUniqueList(stems).map((stem) => new RegExp(`${escapeRegexLiteral(stem)}$`, "u"));
}

export function compileNamePatternRule(input: {
  id         : string;
  ruleType   : string;
  action     : string;
  pattern    : string;
  description: string | null;
}): CompiledNamePatternRule | null {
  const pattern = input.pattern.trim();
  if (!pattern) return null;

  if (pattern.length > NAME_PATTERN_MAX_LENGTH) {
    console.warn(
      "[knowledge.loader] name_pattern.skipped.length_exceeded",
      JSON.stringify({ id: input.id, length: pattern.length, maxLength: NAME_PATTERN_MAX_LENGTH })
    );
    return null;
  }

  if (NESTED_QUANTIFIER_PATTERN.test(pattern)) {
    console.warn(
      "[knowledge.loader] name_pattern.skipped.nested_quantifier",
      JSON.stringify({ id: input.id, pattern })
    );
    return null;
  }

  const compileStartedAt = Date.now();
  try {
    const compiled = new RegExp(pattern, "u");
    const compileDurationMs = Date.now() - compileStartedAt;
    if (compileDurationMs > NAME_PATTERN_COMPILE_TIMEOUT_MS) {
      console.warn(
        "[knowledge.loader] name_pattern.skipped.compile_timeout",
        JSON.stringify({ id: input.id, compileDurationMs, maxDurationMs: NAME_PATTERN_COMPILE_TIMEOUT_MS })
      );
      return null;
    }

    return {
      id         : input.id,
      ruleType   : input.ruleType,
      action     : input.action,
      pattern,
      description: input.description,
      compiled
    };
  } catch (error) {
    console.warn(
      "[knowledge.loader] name_pattern.skipped.syntax_error",
      JSON.stringify({ id: input.id, error: String(error).slice(0, 500) })
    );
    return null;
  }
}

async function loadRuntimeLexiconPayload(
  bookTypeKey: string | null,
  prisma: PrismaClient
): Promise<RuntimeLexiconPayload> {
  const [genericTitles, allExtractionRules] = await Promise.all([
    prisma.genericTitleRule.findMany({
      where  : { isActive: true },
      orderBy: [{ tier: "asc" }, { title: "asc" }],
      select : { title: true, tier: true }
    }),
    prisma.extractionRule.findMany({
      where: {
        isActive: true,
        OR      : [
          { bookTypeId: null },
          ...(bookTypeKey ? [{ bookType: { key: bookTypeKey } }] : [])
        ]
      },
      orderBy: [{ ruleType: "asc" }, { sortOrder: "asc" }],
      select : { ruleType: true, content: true }
    })
  ]);

  // 从统一 extraction_rules 表按 ruleType 拆分
  const nerLexiconRules = allExtractionRules.filter((r) =>
    ["HARD_BLOCK_SUFFIX", "SOFT_BLOCK_SUFFIX", "TITLE_STEM", "POSITION_STEM"].includes(r.ruleType)
  );
  const promptRules = allExtractionRules.filter((r) =>
    ["ENTITY", "RELATIONSHIP"].includes(r.ruleType)
  );

  return {
    genericTitles,
    nerLexiconRules,
    promptRules
  };
}

function buildRuntimeLexiconConfig(payload: RuntimeLexiconPayload): RuntimeLexiconBuildResult {
  const safetyGenericTitles = toUniqueList(payload.genericTitles
    .filter((item) => item.tier === "SAFETY")
    .map((item) => item.title));

  const defaultGenericTitles = toUniqueList(payload.genericTitles
    .filter((item) => item.tier === "DEFAULT")
    .map((item) => item.title));

  // NEW: relational terms now come from genericTitles with tier=RELATIONAL
  const relationalTermTitles = toUniqueList(payload.genericTitles
    .filter((item) => item.tier === "RELATIONAL")
    .map((item) => item.title));

  // 姓氏完全使用静态文件，不再查询 DB
  const staticSurnames = getStaticSurnames();
  const surnameCompounds = toUniqueList(staticSurnames.compounds);
  const surnameSingles = toUniqueList(staticSurnames.singles.filter((s) => !staticSurnames.compounds.includes(s)));

  const entityExtractionRules = toUniqueList(payload.promptRules
    .filter((item) => item.ruleType === "ENTITY")
    .map((item) => item.content));

  const relationshipExtractionRules = toUniqueList(payload.promptRules
    .filter((item) => item.ruleType === "RELATIONSHIP")
    .map((item) => item.content));

  const hardBlockSuffixes = toUniqueList(payload.nerLexiconRules
    .filter((item) => item.ruleType === "HARD_BLOCK_SUFFIX")
    .map((item) => item.content));

  const softBlockSuffixes = toUniqueList(payload.nerLexiconRules
    .filter((item) => item.ruleType === "SOFT_BLOCK_SUFFIX")
    .map((item) => item.content));

  const titleStems = toUniqueList(payload.nerLexiconRules
    .filter((item) => item.ruleType === "TITLE_STEM")
    .map((item) => item.content));

  const positionStems = toUniqueList(payload.nerLexiconRules
    .filter((item) => item.ruleType === "POSITION_STEM")
    .map((item) => item.content));

  const lexiconConfig: BookLexiconConfig = {
    safetyGenericTitles,
    defaultGenericTitles,
    surnameCompounds,
    surnameSingles,
    entityExtractionRules       : toUniqueList(entityExtractionRules),
    relationshipExtractionRules : toUniqueList(relationshipExtractionRules),
    additionalRelationalSuffixes: toUniqueList(hardBlockSuffixes),
    softRelationalSuffixes      : toUniqueList(softBlockSuffixes),
    additionalTitlePatterns     : toUniqueList(titleStems),
    additionalPositionPatterns  : toUniqueList(positionStems)
  };

  return {
    lexiconConfig,
    safetyGenericTitles,
    defaultGenericTitles,
    relationalTermTitles,
    hardBlockSuffixes,
    softBlockSuffixes,
    titleStems,
    positionStems
  };
}

/**
 * 为分析任务一次性预加载运行时词典配置，避免章节处理中重复查询数据库。
 */
export async function loadAnalysisRuntimeConfig(
  bookTypeKey: string | null | undefined,
  prisma: PrismaClient
): Promise<BookLexiconConfig> {
  const payload = await loadRuntimeLexiconPayload(bookTypeKey ?? null, prisma);
  return buildRuntimeLexiconConfig(payload).lexiconConfig;
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
  const bookPacks = await prisma.bookAliasPack.findMany({
    where  : { bookId, pack: { isActive: true } },
    orderBy: { priority: "desc" },
    select : { packId: true, priority: true }
  });

  // Step 2: 自动继承启用中的书籍类型知识包；与手动挂载包合并去重
  const typePacks = bookTypeKey
    ? await prisma.aliasPack.findMany({
      where : { bookType: { key: bookTypeKey }, isActive: true, scope: "BOOK_TYPE" },
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
  const entries = await prisma.aliasEntry.findMany({
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
    const canonicalKey = normalizeLookupValue(entry.canonicalName);
    if (canonicalKey && !lookup.has(canonicalKey)) {
      lookup.set(canonicalKey, entry.canonicalName);
    }

    for (const alias of entry.aliases) {
      const normalizedAlias = normalizeLookupValue(alias);
      if (normalizedAlias && !lookup.has(normalizedAlias)) {
        lookup.set(normalizedAlias, entry.canonicalName);
      }
    }
  }
  return lookup;
}

export function clearKnowledgeCache(bookId?: string): void {
  if (bookId) {
    runtimeKnowledgeCache.delete(bookId);
    return;
  }

  runtimeKnowledgeCache.clear();
}

export async function loadFullRuntimeKnowledge({
  bookId,
  prisma,
  forceRefresh = false
}: LoadFullRuntimeKnowledgeParams): Promise<FullRuntimeKnowledge> {
  const cached = runtimeKnowledgeCache.get(bookId);
  if (cached && !forceRefresh) {
    return cached;
  }

  const book = await prisma.book.findUnique({
    where : { id: bookId },
    select: {
      id        : true,
      bookTypeId: true,
      bookType  : { select: { key: true } }
    }
  });

  if (!book) {
    throw new Error(`书籍不存在: ${bookId}`);
  }

  const normalizedBookTypeId = book.bookTypeId ?? null;
  const normalizedBookTypeKey = book.bookType?.key ?? null;
  const relationshipTypeWhere = normalizedBookTypeId
    ? {
      status: "ACTIVE",
      OR    : [
        { bookTypeId: normalizedBookTypeId },
        { bookTypeId: null }
      ]
    }
    : {
      status    : "ACTIVE",
      bookTypeId: null
    };

  const [
    runtimeLexiconPayload,
    aliasLookup,
    relationshipTypeEntries
  ] = await Promise.all([
    loadRuntimeLexiconPayload(normalizedBookTypeKey, prisma),
    buildAliasLookupFromDb(bookId, normalizedBookTypeKey, prisma),
    prisma.relationshipTypeDefinition.findMany({
      where  : relationshipTypeWhere,
      orderBy: [
        { group: "asc" },
        { sortOrder: "asc" },
        { code: "asc" }
      ],
      select: {
        code           : true,
        name           : true,
        group          : true,
        directionMode  : true,
        sourceRoleLabel: true,
        targetRoleLabel: true,
        aliases        : true,
        examples       : true
      }
    })
  ]);

  // 名字模式规则：从静态常量加载，不再查询 DB
  const namePatternRuleEntries = STATIC_NAME_PATTERNS.map((p, i) => ({
    id         : `np-static-${i}`,
    ruleType   : p.ruleType,
    action     : p.action,
    pattern    : p.pattern,
    description: p.description
  }));

  const runtimeLexicon = buildRuntimeLexiconConfig(runtimeLexiconPayload);

  const relationalTerms = new Set(toUniqueList(
    runtimeLexicon.relationalTermTitles.map(normalizeLookupValue)
  ));

  const namePatternRules = namePatternRuleEntries
    .map((rule) => compileNamePatternRule(rule))
    .filter((rule): rule is CompiledNamePatternRule => Boolean(rule));
  const relationshipTypes = relationshipTypeEntries.map((entry) => ({
    code           : entry.code,
    name           : entry.name,
    group          : entry.group,
    directionMode  : entry.directionMode,
    sourceRoleLabel: entry.sourceRoleLabel,
    targetRoleLabel: entry.targetRoleLabel,
    aliases        : toUniqueList(entry.aliases),
    examples       : toUniqueList(entry.examples)
  }));
  const relationshipTypeByCode = new Map(relationshipTypes.map((item) => [item.code, item]));

  const loadedKnowledge: FullRuntimeKnowledge = {
    bookId,
    bookTypeId                    : normalizedBookTypeId,
    bookTypeKey                   : normalizedBookTypeKey,
    lexiconConfig                 : runtimeLexicon.lexiconConfig,
    relationshipTypes,
    relationshipTypeByCode,
    relationshipTypeDictionaryText: formatRelationshipTypeDictionary(relationshipTypes),
    aliasLookup,
    relationalTerms,
    namePatternRules,
    hardBlockSuffixes             : new Set(runtimeLexicon.hardBlockSuffixes),
    softBlockSuffixes             : new Set(runtimeLexicon.softBlockSuffixes),
    safetyGenericTitles           : new Set(runtimeLexicon.safetyGenericTitles),
    defaultGenericTitles          : new Set(runtimeLexicon.defaultGenericTitles),
    titlePatterns                 : compileStemPatterns(runtimeLexicon.titleStems),
    positionPatterns              : compileStemPatterns(runtimeLexicon.positionStems),
    loadedAt                      : new Date()
  };

  runtimeKnowledgeCache.set(bookId, loadedKnowledge);
  return loadedKnowledge;
}
