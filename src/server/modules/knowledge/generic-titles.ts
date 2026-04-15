import { type Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";

/**
 * 泛化称谓库 CRUD 服务。
 */

export async function listGenericTitles(params?: { tier?: string; q?: string; active?: boolean }) {
  const where: Prisma.GenericTitleRuleWhereInput = {};
  if (params?.tier) where.tier = params.tier;
  if (params?.active !== undefined) where.isActive = params.active;
  if (params?.q) where.title = { contains: params.q };

  return prisma.genericTitleRule.findMany({
    where,
    orderBy: [{ tier: "asc" }, { title: "asc" }]
  });
}

export async function createGenericTitle(data: {
  title               : string;
  tier?               : string;
  exemptInBookTypeIds?: string[];
  description?        : string;
  source?             : string;
}) {
  return prisma.genericTitleRule.create({
    data: {
      title              : data.title,
      tier               : data.tier ?? "DEFAULT",
      exemptInBookTypeIds: data.exemptInBookTypeIds ?? undefined,
      description        : data.description,
      source             : data.source ?? "MANUAL"
    }
  });
}

export async function updateGenericTitle(
  id: string,
  data: {
    tier?               : string;
    exemptInBookTypeIds?: string[] | null;
    description?        : string;
    isActive?           : boolean;
  }
) {
  return prisma.genericTitleRule.update({
    where: { id },
    data : {
      ...(data.tier !== undefined && { tier: data.tier }),
      ...(data.exemptInBookTypeIds !== undefined && {
        exemptInBookTypeIds: data.exemptInBookTypeIds ?? []
      }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.isActive !== undefined && { isActive: data.isActive })
    }
  });
}

export async function deleteGenericTitle(id: string) {
  const entry = await prisma.genericTitleRule.findUnique({ where: { id } });
  if (entry?.tier === "SAFETY") {
    throw new Error("SAFETY 级别称谓不可删除，仅可停用");
  }
  return prisma.genericTitleRule.delete({ where: { id } });
}

export async function testGenericTitle(title: string, genreKey?: string) {
  const entry = await prisma.genericTitleRule.findUnique({ where: { title } });
  if (!entry || !entry.isActive) {
    return { title, genre: genreKey ?? null, result: "not_found" as const, reason: "未在词库中找到该称谓", tier: null };
  }

  if (entry.tier === "SAFETY") {
    return { title, genre: genreKey ?? null, result: "generic" as const, reason: "该称谓为安全泛称，任何情况下不个体化", tier: entry.tier };
  }

  // 检查书籍类型豁免
  if (genreKey && entry.exemptInBookTypeIds) {
    const exempt = entry.exemptInBookTypeIds;
    if (exempt.includes(genreKey)) {
      return { title, genre: genreKey, result: "exempt" as const, reason: `该称谓在${genreKey}书籍类型下已豁免（exemptInBookTypeIds）`, tier: entry.tier };
    }
  }

  return { title, genre: genreKey ?? null, result: "generic" as const, reason: "该称谓为默认泛称", tier: entry.tier };
}
