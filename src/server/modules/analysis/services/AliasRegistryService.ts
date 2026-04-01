import { AliasMappingStatus, type AliasType } from "@/generated/prisma/enums";
import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import type { AliasMappingResult, RegisterAliasInput } from "@/types/analysis";

export const ALIAS_MAPPING_STATUS_VALUES = [
  "PENDING",
  "CONFIRMED",
  "REJECTED"
] as const;

type ReviewAliasMappingRow = {
  id          : string;
  alias       : string;
  resolvedName: string | null;
  personaId   : string | null;
  aliasType   : AliasType;
  confidence  : number;
  evidence    : string | null;
  status      : AliasMappingStatus;
  chapterStart: number | null;
  chapterEnd  : number | null;
};

export interface AliasRegistryService {
  lookupAlias(bookId: string, alias: string, chapterNo: number): Promise<AliasMappingResult | null>;
  registerAlias(input: RegisterAliasInput, tx?: Pick<PrismaClient, "aliasMapping">): Promise<void>;
  loadBookAliasCache(bookId: string): Promise<Map<string, AliasMappingResult[]>>;
  listPendingMappings(bookId: string): Promise<AliasMappingResult[]>;
  listReviewMappings(bookId: string, status?: AliasMappingResult["status"]): Promise<AliasMappingResult[]>;
  updateMappingStatus(mappingId: string, bookId: string, status: AliasMappingResult["status"]): Promise<AliasMappingResult | null>;
}

function normalizeAlias(value: string): string {
  return value.trim();
}

function toAliasType(value: RegisterAliasInput["aliasType"]): AliasType {
  return value as AliasType;
}

function toAliasStatus(value: RegisterAliasInput["status"]): AliasMappingStatus {
  if (value === "CONFIRMED") return AliasMappingStatus.CONFIRMED;
  if (value === "REJECTED") return AliasMappingStatus.REJECTED;
  return AliasMappingStatus.PENDING;
}

function fromAliasType(value: AliasType): AliasMappingResult["aliasType"] {
  return value as AliasMappingResult["aliasType"];
}

function fromAliasStatus(value: AliasMappingStatus): AliasMappingResult["status"] {
  return value as AliasMappingResult["status"];
}

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
  const cacheByBook = new Map<string, Map<string, AliasMappingResult[]>>();

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
   * 功能：从内存缓存中移除指定条目（用于 REJECTED 状态变更时的细粒度缓存失效）。
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

  async function loadBookAliasCache(bookId: string): Promise<Map<string, AliasMappingResult[]>> {
    const rows = await prismaClient.aliasMapping.findMany({
      where: {
        bookId,
        status: AliasMappingStatus.CONFIRMED
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

  async function lookupAlias(bookId: string, alias: string, chapterNo: number): Promise<AliasMappingResult | null> {
    const normalizedAlias = normalizeAlias(alias);
    const cache = cacheByBook.get(bookId) ?? await loadBookAliasCache(bookId);
    const candidates = cache.get(normalizedAlias) ?? [];

    const matched = candidates
      .filter((item) => isScopeMatched(item, chapterNo))
      .sort((a, b) => b.confidence - a.confidence)[0];

    return matched ?? null;
  }

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

    if (saved.status === AliasMappingStatus.CONFIRMED) {
      upsertInMemoryCache(input.bookId, toAliasMappingResult(saved));
    }
  }

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

    if (updated.status === AliasMappingStatus.CONFIRMED) {
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
