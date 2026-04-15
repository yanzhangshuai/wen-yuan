import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { auditLog } from "@/server/modules/knowledge/audit";

/**
 * 知识条目 CRUD + 审核 + 导入导出服务。
 */

interface EntryOverlapMeta {
  overlapEntries: string[];
  overlapTerms  : string[];
}

function normalizeEntryLookupTerm(value: string): string {
  return value.trim().toLowerCase();
}

function buildEntryOverlapMeta(
  entry: { id: string; canonicalName: string; aliases: string[] },
  packEntries: Array<{ id: string; canonicalName: string; aliases: string[] }>
): EntryOverlapMeta {
  const overlapEntries = new Set<string>();
  const overlapTerms = new Set<string>();
  const lookup = new Map<string, Set<string>>();

  for (const packEntry of packEntries) {
    const terms = [packEntry.canonicalName, ...packEntry.aliases];
    for (const term of terms) {
      const normalized = normalizeEntryLookupTerm(term);
      if (!normalized) {
        continue;
      }

      const existing = lookup.get(normalized) ?? new Set<string>();
      existing.add(packEntry.id);
      lookup.set(normalized, existing);
    }
  }

  const terms = [entry.canonicalName, ...entry.aliases];
  for (const term of terms) {
    const normalized = normalizeEntryLookupTerm(term);
    if (!normalized) {
      continue;
    }

    const matchedIds = lookup.get(normalized);
    if (!matchedIds) {
      continue;
    }

    for (const matchedId of matchedIds) {
      if (matchedId === entry.id) {
        continue;
      }

      const matchedEntry = packEntries.find((item) => item.id === matchedId);
      if (!matchedEntry) {
        continue;
      }

      overlapEntries.add(matchedEntry.canonicalName);
      overlapTerms.add(term);
    }
  }

  return {
    overlapEntries: Array.from(overlapEntries),
    overlapTerms  : Array.from(overlapTerms)
  };
}

/** 列出知识包下的条目（支持分页、状态过滤、搜索）。 */
export async function listKnowledgeEntries(params: {
  packId       : string;
  reviewStatus?: string;
  q?           : string;
  page?        : number;
  pageSize?    : number;
}) {
  const where: Prisma.AliasEntryWhereInput = { packId: params.packId };
  if (params.reviewStatus) where.reviewStatus = params.reviewStatus;
  if (params.q) {
    where.OR = [
      { canonicalName: { contains: params.q, mode: "insensitive" } },
      { aliases: { has: params.q } }
    ];
  }

  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 50;

  const [entries, total, packEntries] = await Promise.all([
    prisma.aliasEntry.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      skip   : (page - 1) * pageSize,
      take   : pageSize
    }),
    prisma.aliasEntry.count({ where }),
    prisma.aliasEntry.findMany({
      where: {
        packId      : params.packId,
        reviewStatus: { in: ["PENDING", "VERIFIED"] }
      },
      select: {
        id           : true,
        canonicalName: true,
        aliases      : true
      }
    })
  ]);

  const entriesWithOverlap = entries.map((entry) => ({
    ...entry,
    ...buildEntryOverlapMeta(entry, packEntries)
  }));

  return { entries: entriesWithOverlap, total, page, pageSize };
}

/** 创建单条条目。 */
export async function createKnowledgeEntry(data: {
  packId       : string;
  canonicalName: string;
  aliases      : string[];
  notes?       : string;
  source?      : string;
  reviewStatus?: string;
  confidence?  : number;
}) {
  return prisma.aliasEntry.create({
    data: {
      packId       : data.packId,
      canonicalName: data.canonicalName,
      aliases      : data.aliases,
      notes        : data.notes,
      source       : data.source ?? "MANUAL",
      reviewStatus : data.reviewStatus ?? "PENDING",
      confidence   : data.confidence ?? 1.0
    }
  });
}

/** 更新条目。 */
export async function updateKnowledgeEntry(
  id: string,
  data: {
    canonicalName?: string;
    aliases?      : string[];
    notes?        : string | null;
    confidence?   : number;
  }
) {
  return prisma.aliasEntry.update({
    where: { id },
    data : {
      ...(data.canonicalName !== undefined && { canonicalName: data.canonicalName }),
      ...(data.aliases !== undefined && { aliases: data.aliases }),
      ...(data.notes !== undefined && { notes: data.notes }),
      ...(data.confidence !== undefined && { confidence: data.confidence })
    }
  });
}

/** 删除条目。 */
export async function deleteKnowledgeEntry(id: string) {
  return prisma.aliasEntry.delete({ where: { id } });
}

/** 审核通过。 */
export async function verifyEntry(id: string) {
  return prisma.aliasEntry.update({
    where: { id },
    data : {
      reviewStatus: "VERIFIED",
      reviewedAt  : new Date()
    }
  });
}

/** 审核拒绝。 */
export async function rejectEntry(id: string, note?: string) {
  return prisma.aliasEntry.update({
    where: { id },
    data : {
      reviewStatus: "REJECTED",
      reviewNote  : note,
      reviewedAt  : new Date()
    }
  });
}

/** 批量审核通过。 */
export async function batchVerifyEntries(ids: string[]) {
  return prisma.aliasEntry.updateMany({
    where: { id: { in: ids } },
    data : {
      reviewStatus: "VERIFIED",
      reviewedAt  : new Date()
    }
  });
}

/** 批量审核拒绝。 */
export async function batchRejectEntries(ids: string[], note?: string) {
  return prisma.aliasEntry.updateMany({
    where: { id: { in: ids } },
    data : {
      reviewStatus: "REJECTED",
      reviewNote  : note,
      reviewedAt  : new Date()
    }
  });
}

/** 导入条目（JSON 格式）。 */
export async function importEntries(
  packId: string,
  entries: Array<{
    canonicalName: string;
    aliases      : string[];
    notes?       : string;
    confidence?  : number;
  }>,
  options?: {
    reviewStatus?: string;
    source?      : string;
    operatorId?  : string;
    auditAction? : string;
  }
) {
  const reviewStatus = options?.reviewStatus ?? "PENDING";
  const source = options?.source ?? "IMPORTED";

  const result = await prisma.$transaction(async (tx) => {
    const result = await tx.aliasEntry.createMany({
      data: entries.map((e) => ({
        packId,
        canonicalName: e.canonicalName,
        aliases      : e.aliases,
        notes        : e.notes,
        source,
        reviewStatus,
        confidence   : e.confidence ?? (source === "LLM_GENERATED" ? 0.8 : 1.0)
      }))
    });

    await tx.aliasPack.update({
      where: { id: packId },
      data : { version: { increment: 1 } }
    });

    return { count: result.count };
  });

  if (result.count > 0) {
    const pack = await prisma.aliasPack.findUnique({
      where : { id: packId },
      select: { name: true }
    });

    if (pack) {
      await auditLog({
        objectType: "KNOWLEDGE_PACK",
        objectId  : packId,
        objectName: pack.name,
        action    : options?.auditAction ?? "IMPORT",
        after     : {
          count: result.count,
          reviewStatus,
          source
        },
        operatorId: options?.operatorId
      });
    }
  }

  return result;
}

/** 导出知识包条目。 */
export async function exportEntries(
  packId: string,
  format: "json" | "csv" = "json",
  reviewScope: "VERIFIED" | "ALL" = "VERIFIED"
) {
  const entryWhere = reviewScope === "ALL"
    ? { reviewStatus: { not: "REJECTED" as const } }
    : { reviewStatus: "VERIFIED" as const };

  const pack = await prisma.aliasPack.findUnique({
    where  : { id: packId },
    include: {
      bookType: { select: { key: true } },
      entries : {
        where  : entryWhere,
        orderBy: { canonicalName: "asc" },
        select : {
          canonicalName: true,
          aliases      : true,
          notes        : true
        }
      }
    }
  });

  if (!pack) throw new Error("知识包不存在");

  if (format === "csv") {
    const header = "canonicalName,aliases,notes";
    const rows = pack.entries.map((e) => {
      const aliasStr = e.aliases.join("|");
      const notesStr = (e.notes ?? "").replace(/"/g, '""');
      return `${e.canonicalName},"${aliasStr}","${notesStr}"`;
    });
    return { content: [header, ...rows].join("\n"), contentType: "text/csv" };
  }

  const jsonData = {
    meta: {
      packName    : pack.name,
      genre       : pack.bookType?.key ?? null,
      version     : pack.version,
      reviewScope,
      exportedAt  : new Date().toISOString(),
      totalEntries: pack.entries.length
    },
    entries: pack.entries
  };
  return { content: JSON.stringify(jsonData, null, 2), contentType: "application/json" };
}
