import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";

/**
 * 泛化称谓库 CRUD 服务。
 */

export async function listGenericTitles(params?: { tier?: string; q?: string; active?: boolean }) {
  const where: Prisma.GenericTitleEntryWhereInput = {};
  if (params?.tier) where.tier = params.tier;
  if (params?.active !== undefined) where.isActive = params.active;
  if (params?.q) where.title = { contains: params.q };

  return prisma.genericTitleEntry.findMany({
    where,
    orderBy: [{ tier: "asc" }, { title: "asc" }]
  });
}

export async function createGenericTitle(data: {
  title          : string;
  tier?          : string;
  exemptInGenres?: string[];
  description?   : string;
  source?        : string;
}) {
  return prisma.genericTitleEntry.create({
    data: {
      title         : data.title,
      tier          : data.tier ?? "DEFAULT",
      exemptInGenres: data.exemptInGenres ?? undefined,
      description   : data.description,
      source        : data.source ?? "MANUAL"
    }
  });
}

export async function updateGenericTitle(
  id: string,
  data: {
    tier?          : string;
    exemptInGenres?: string[] | null;
    description?   : string;
    isActive?      : boolean;
  }
) {
  return prisma.genericTitleEntry.update({
    where: { id },
    data : {
      ...(data.tier !== undefined && { tier: data.tier }),
      ...(data.exemptInGenres !== undefined && {
        exemptInGenres: data.exemptInGenres === null ? Prisma.JsonNull : data.exemptInGenres
      }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.isActive !== undefined && { isActive: data.isActive })
    }
  });
}

export async function deleteGenericTitle(id: string) {
  const entry = await prisma.genericTitleEntry.findUnique({ where: { id } });
  if (entry?.tier === "SAFETY") {
    throw new Error("SAFETY 级别称谓不可删除，仅可停用");
  }
  return prisma.genericTitleEntry.delete({ where: { id } });
}

export async function testGenericTitle(title: string, genreKey?: string) {
  const entry = await prisma.genericTitleEntry.findUnique({ where: { title } });
  if (!entry || !entry.isActive) {
    return { title, genre: genreKey ?? null, result: "not_found" as const, reason: "未在词库中找到该称谓", tier: null };
  }

  if (entry.tier === "SAFETY") {
    return { title, genre: genreKey ?? null, result: "generic" as const, reason: "该称谓为安全泛称，任何情况下不个体化", tier: entry.tier };
  }

  // 检查书籍类型豁免
  if (genreKey && entry.exemptInGenres) {
    const exempt = entry.exemptInGenres as string[];
    if (exempt.includes(genreKey)) {
      return { title, genre: genreKey, result: "exempt" as const, reason: `该称谓在${genreKey}书籍类型下已豁免（exemptInGenres）`, tier: entry.tier };
    }
  }

  return { title, genre: genreKey ?? null, result: "generic" as const, reason: "该称谓为默认泛称", tier: entry.tier };
}
