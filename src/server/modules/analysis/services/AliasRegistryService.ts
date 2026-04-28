import { AliasMappingStatus, type AliasType } from "@/generated/prisma/enums";
import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import type { AliasMappingResult, RegisterAliasInput } from "@/types/analysis";

/**
 * 文件定位（Next.js 服务端逻辑层）：
 * - 本文件位于 `src/server/modules/analysis/services`，属于“章节解析流水线”的服务层组件。
 * - 它不是 route handler/page，而是被服务端模块（如 ChapterAnalysisService、PersonaResolver、后台审核接口）调用的领域服务。
 *
 * 核心职责：
 * - 维护“称谓/别名 -> 人物”的映射（alias mapping）读写能力。
 * - 提供按书籍维度的内存缓存，降低章节解析过程中的重复数据库查询。
 * - 提供审核后台所需的待审列表、按状态筛选、状态更新等能力。
 *
 * 上下游关系：
 * - 上游输入：章节解析自动注册（RegisterAliasInput）、后台审核动作（mappingId + status）、书籍/章节上下文。
 * - 下游输出：PersonaResolver 的别名命中结果、审核页展示 DTO、数据库 `alias_mapping` 持久化记录。
 *
 * 运行时与约束：
 * - 仅在 Node.js 服务端运行；缓存是“进程内缓存”，不是跨实例共享缓存。
 * - 缓存命中只用于性能优化，最终真实状态仍以数据库为准。
 * - 这里的状态与置信度规则属于业务规则，不是技术限制，修改会直接影响实体解析准确率与审核工作量。
 */
export const ALIAS_MAPPING_STATUS_VALUES = [
  "PENDING",
  "CONFIRMED",
  "REJECTED",
  "LLM_INFERRED"
] as const;

/**
 * 数据库审查记录的最小读取形态。
 * 这里显式列出字段，是为了把 DB schema 与对外 DTO（AliasMappingResult）之间做一层防腐映射，避免调用方依赖 Prisma 原始结构。
 */
type ReviewAliasMappingRow = {
  /** 映射记录主键。 */
  id          : string;
  /** 原文中出现的称谓/别名。 */
  alias       : string;
  /** 该称谓被解析出的标准人名（可能为空，表示仅挂 personaId 或待定）。 */
  resolvedName: string | null;
  /** 对应 persona 主键；待审或拒绝状态可为空。 */
  personaId   : string | null;
  /** 别名类型（称号/官职/昵称等）。 */
  aliasType   : AliasType;
  /** 当前映射置信度，供匹配排序与审核优先级使用。 */
  confidence  : number;
  /** 证据文本（模型推理依据或人工备注）。 */
  evidence    : string | null;
  /** 当前审核状态（PENDING/CONFIRMED/REJECTED/LLM_INFERRED）。 */
  status      : AliasMappingStatus;
  /** 生效章节起点，null 表示全书生效。 */
  chapterStart: number | null;
  /** 生效章节终点，null 表示“从起点到书末”或全书。 */
  chapterEnd  : number | null;
};

/**
 * 别名注册表对外服务契约。
 * 该接口是解析管线与审核接口之间的稳定边界，便于后续替换缓存策略或存储实现而不影响调用方。
 */
export interface AliasRegistryService {
  /** 按“书籍 + 称谓 + 章节号”查询最优映射，用于章节解析时的人物消歧。 */
  lookupAlias(bookId: string, alias: string, chapterNo: number): Promise<AliasMappingResult | null>;
  /** 注册/更新一个别名映射（支持事务上下文），用于 AI 自动登记或人工修正回写。 */
  registerAlias(input: RegisterAliasInput, tx?: Pick<PrismaClient, "aliasMapping">): Promise<void>;
  /** 预热某本书的别名缓存，减少后续逐章解析时的重复查询成本。 */
  loadBookAliasCache(bookId: string): Promise<Map<string, AliasMappingResult[]>>;
  /** 读取该书待审映射，供审核工作台展示。 */
  listPendingMappings(bookId: string): Promise<AliasMappingResult[]>;
  /** 读取该书审核映射，可按状态筛选。 */
  listReviewMappings(bookId: string, status?: AliasMappingResult["status"]): Promise<AliasMappingResult[]>;
  /** 更新单条映射状态，并同步维护内存缓存的一致性。 */
  updateMappingStatus(mappingId: string, bookId: string, status: AliasMappingResult["status"]): Promise<AliasMappingResult | null>;
}

/** 统一别名标准化：当前仅做 trim，避免“看起来相同但前后空白不同”的重复键。 */
function normalizeAlias(value: string): string {
  return value.trim();
}

/** 应用层别名类型 -> Prisma 枚举类型（保持边界清晰，避免业务层直接耦合 DB 枚举实现细节）。 */
function toAliasType(value: RegisterAliasInput["aliasType"]): AliasType {
  return value;
}

/** 应用层状态 -> Prisma 枚举状态；未知值保守回落为 PENDING，避免误写入非法状态。 */
function toAliasStatus(value: RegisterAliasInput["status"]): AliasMappingStatus {
  if (value === "CONFIRMED") return AliasMappingStatus.CONFIRMED;
  if (value === "REJECTED") return AliasMappingStatus.REJECTED;
  if (value === "LLM_INFERRED") return AliasMappingStatus.LLM_INFERRED;
  return AliasMappingStatus.PENDING;
}

/** Prisma 枚举 -> 应用层状态（对外返回统一 AliasMappingResult 语义）。 */
function fromAliasType(value: AliasType): AliasMappingResult["aliasType"] {
  return value;
}

/** Prisma 枚举 -> 应用层状态。 */
function fromAliasStatus(value: AliasMappingStatus): AliasMappingResult["status"] {
  return value;
}

/**
 * 数据库行转业务 DTO。
 * 重点：chapterStart/chapterEnd 会被折叠为 `chapterScope`，确保前端和调用方只面对一个统一结构。
 */
function toAliasMappingResult(row: ReviewAliasMappingRow): AliasMappingResult {
  return {
    id          : row.id,
    alias       : row.alias,
    resolvedName: row.resolvedName,
    personaId   : row.personaId,
    aliasType   : fromAliasType(row.aliasType),
    confidence  : row.confidence,
    evidence    : row.evidence ?? "",
    status      : fromAliasStatus(row.status),
    chapterScope: row.chapterStart == null
      ? undefined
      : {
        start: row.chapterStart,
        ...(row.chapterEnd == null ? {} : { end: row.chapterEnd })
      }
  };
}

/**
 * 判断映射作用域是否覆盖当前章节号。
 * 这是解析时别名命中正确性的关键步骤：同一称谓在不同章节可能指向不同人物。
 */
function isScopeMatched(mapping: AliasMappingResult, chapterNo: number): boolean {
  const start = mapping.chapterScope?.start;
  const end = mapping.chapterScope?.end;

  if (typeof start === "number" && start > chapterNo) {
    return false;
  }

  if (typeof end === "number" && end < chapterNo) {
    return false;
  }

  return true;
}

export function createAliasRegistryService(prismaClient: PrismaClient = prisma): AliasRegistryService {
  /**
   * 进程内缓存结构：
   * - 第一层 key: bookId（不同书籍别名空间隔离）
   * - 第二层 key: normalizedAlias（同一本书下的称谓）
   * - value: 候选映射数组（按 confidence 降序）
   */
  const cacheByBook = new Map<string, Map<string, AliasMappingResult[]>>();

  /**
   * 将单条映射写入内存缓存（存在则更新，不存在则追加）。
   * 设计目的：审核动作后无需整本书清缓存，降低缓存重建成本。
   */
  function upsertInMemoryCache(bookId: string, mapping: AliasMappingResult): void {
    const existingBookCache = cacheByBook.get(bookId);
    if (!existingBookCache) {
      return;
    }

    const normalizedAlias = normalizeAlias(mapping.alias);
    const entries = existingBookCache.get(normalizedAlias) ?? [];
    const scopeStart = mapping.chapterScope?.start;
    const scopeEnd = mapping.chapterScope?.end;

    const matchedIndex = entries.findIndex((item) =>
      item.personaId === mapping.personaId &&
      item.chapterScope?.start === scopeStart &&
      item.chapterScope?.end === scopeEnd
    );

    if (matchedIndex >= 0) {
      entries[matchedIndex] = mapping;
    } else {
      entries.push(mapping);
    }

    entries.sort((a, b) => b.confidence - a.confidence);
    existingBookCache.set(normalizedAlias, entries);
  }

  /**
   * 从内存缓存中移除指定条目（用于 REJECTED 状态变更时的细粒度缓存失效）。
   * 业务原因：被拒绝映射不能继续参与后续解析命中，否则会把人工纠错再次污染到结果。
   */
  function removeFromInMemoryCache(bookId: string, mapping: AliasMappingResult): void {
    const existingBookCache = cacheByBook.get(bookId);
    if (!existingBookCache) {
      return;
    }

    const normalizedAlias = normalizeAlias(mapping.alias);
    const entries = existingBookCache.get(normalizedAlias);
    if (!entries) return;

    const filtered = entries.filter((item) => item.id !== mapping.id);
    if (filtered.length === 0) {
      existingBookCache.delete(normalizedAlias);
    } else {
      existingBookCache.set(normalizedAlias, filtered);
    }
  }

  /**
   * 从数据库加载该书“可参与解析命中”的映射，并构建内存索引。
   * 注意只加载 CONFIRMED / LLM_INFERRED，排除 PENDING/REJECTED：
   * - PENDING 尚未确认，不应影响线上实体归并；
   * - REJECTED 已被人工否定，必须从命中集合剔除。
   */
  async function loadBookAliasCache(bookId: string): Promise<Map<string, AliasMappingResult[]>> {
    const rows = await prismaClient.aliasMapping.findMany({
      where: {
        bookId,
        status: { in: [AliasMappingStatus.CONFIRMED, AliasMappingStatus.LLM_INFERRED] }
      },
      orderBy: [
        { alias: "asc" },
        { confidence: "desc" }
      ]
    });

    const cache = new Map<string, AliasMappingResult[]>();
    for (const row of rows) {
      const result = toAliasMappingResult(row);
      const key = normalizeAlias(result.alias);
      const current = cache.get(key) ?? [];
      current.push(result);
      cache.set(key, current);
    }

    for (const values of cache.values()) {
      values.sort((a, b) => b.confidence - a.confidence);
    }

    cacheByBook.set(bookId, cache);
    return cache;
  }

  /**
   * 别名查询主入口：
   * - 先读缓存（没有则懒加载）；
   * - 再按章节作用域过滤；
   * - 最后按置信度取第一名。
   */
  async function lookupAlias(bookId: string, alias: string, chapterNo: number): Promise<AliasMappingResult | null> {
    const normalizedAlias = normalizeAlias(alias);
    const cache = cacheByBook.get(bookId) ?? await loadBookAliasCache(bookId);
    const candidates = cache.get(normalizedAlias) ?? [];

    const matched = candidates
      .filter((item) => isScopeMatched(item, chapterNo))
      .sort((a, b) => b.confidence - a.confidence)[0];

    return matched ?? null;
  }

  /**
   * 注册或更新别名映射。
   * 关键规则：
   * - 空别名直接丢弃（防御脏输入）；
   * - 同范围已有更高置信度记录时，不被低置信度覆盖（这是业务规则，不是技术限制）；
   * - 仅“可生效状态”会写入缓存。
   */
  async function registerAlias(input: RegisterAliasInput, tx?: Pick<PrismaClient, "aliasMapping">): Promise<void> {
    const client = tx ?? prismaClient;
    const alias = normalizeAlias(input.alias);
    if (!alias) {
      return;
    }

    const existing = await client.aliasMapping.findFirst({
      where: {
        bookId      : input.bookId,
        alias,
        chapterStart: input.chapterStart ?? null,
        chapterEnd  : input.chapterEnd ?? null
      },
      orderBy: { confidence: "desc" }
    });

    if (existing && existing.confidence >= input.confidence) {
      return;
    }

    const data = {
      bookId      : input.bookId,
      personaId   : input.personaId ?? null,
      alias,
      resolvedName: input.resolvedName ?? null,
      aliasType   : toAliasType(input.aliasType),
      confidence  : input.confidence,
      evidence    : input.evidence ?? null,
      status      : toAliasStatus(input.status),
      chapterStart: input.chapterStart ?? null,
      chapterEnd  : input.chapterEnd ?? null,
      contextHash : input.contextHash ?? null
    };

    const saved = existing
      ? await client.aliasMapping.update({
        where: { id: existing.id },
        data
      })
      : await client.aliasMapping.create({ data });

    if (saved.status === AliasMappingStatus.CONFIRMED || saved.status === AliasMappingStatus.LLM_INFERRED) {
      upsertInMemoryCache(input.bookId, toAliasMappingResult(saved));
    }
  }

  /** 待审列表是审核台高频入口，这里复用 `listReviewMappings` 避免重复查询逻辑。 */
  async function listPendingMappings(bookId: string): Promise<AliasMappingResult[]> {
    return await listReviewMappings(bookId, "PENDING");
  }

  async function listReviewMappings(
    bookId: string,
    status?: AliasMappingResult["status"]
  ): Promise<AliasMappingResult[]> {
    const rows = await prismaClient.aliasMapping.findMany({
      where: {
        bookId,
        ...(status ? { status: toAliasStatus(status) } : {})
      },
      orderBy: { confidence: "desc" }
    });

    return rows.map(toAliasMappingResult);
  }

  /**
   * 审核状态更新：
   * - 先校验记录是否属于当前书籍，防止跨书误改；
   * - 更新后做缓存同步（确认/推断入缓存，拒绝移除）。
   */
  async function updateMappingStatus(
    mappingId: string,
    bookId: string,
    status: AliasMappingResult["status"]
  ): Promise<AliasMappingResult | null> {
    const saved = await prismaClient.aliasMapping.findFirst({
      where : { id: mappingId, bookId },
      select: {
        id          : true,
        alias       : true,
        resolvedName: true,
        personaId   : true,
        aliasType   : true,
        confidence  : true,
        evidence    : true,
        status      : true,
        chapterStart: true,
        chapterEnd  : true
      }
    });

    if (!saved) {
      return null;
    }

    const updated = await prismaClient.aliasMapping.update({
      where : { id: mappingId },
      data  : { status: toAliasStatus(status) },
      select: {
        id          : true,
        alias       : true,
        resolvedName: true,
        personaId   : true,
        aliasType   : true,
        confidence  : true,
        evidence    : true,
        status      : true,
        chapterStart: true,
        chapterEnd  : true
      }
    });

    if (updated.status === AliasMappingStatus.CONFIRMED || updated.status === AliasMappingStatus.LLM_INFERRED) {
      upsertInMemoryCache(bookId, toAliasMappingResult(updated));
    } else {
      // 细粒度失效：仅移除被 REJECTED 的条目，保留其余缓存
      removeFromInMemoryCache(bookId, toAliasMappingResult(updated));
    }

    return toAliasMappingResult(updated);
  }

  return {
    lookupAlias,
    registerAlias,
    loadBookAliasCache,
    listPendingMappings,
    listReviewMappings,
    updateMappingStatus
  };
}

export const aliasRegistryService = createAliasRegistryService();
