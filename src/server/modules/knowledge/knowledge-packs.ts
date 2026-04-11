import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";

/**
 * 知识包 CRUD 服务。
 */

/** 列出知识包（支持按 bookTypeId / scope 过滤）。 */
export async function listKnowledgePacks(params?: {
  bookTypeId?: string;
  scope?     : string;
}) {
  const where: Prisma.KnowledgePackWhereInput = {};
  if (params?.bookTypeId) where.bookTypeId = params.bookTypeId;
  if (params?.scope) where.scope = params.scope;

  const packs = await prisma.knowledgePack.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
    include: {
      bookType: { select: { id: true, key: true, name: true } },
      _count  : {
        select: {
          entries  : true,
          bookPacks: true
        }
      }
    }
  });

  if (packs.length === 0) {
    return [];
  }

  const statusGroups = await prisma.knowledgeEntry.groupBy({
    by    : ["packId", "reviewStatus"],
    where : { packId: { in: packs.map((pack) => pack.id) } },
    _count: true
  });

  const statusCountMap = new Map<string, Record<string, number>>();
  for (const item of statusGroups) {
    const existing = statusCountMap.get(item.packId) ?? {};
    existing[item.reviewStatus] = item._count;
    statusCountMap.set(item.packId, existing);
  }

  return packs.map((pack) => ({
    ...pack,
    statusCounts: statusCountMap.get(pack.id) ?? {}
  }));
}

/** 获取单个知识包详情。 */
export async function getKnowledgePack(id: string) {
  const pack = await prisma.knowledgePack.findUnique({
    where  : { id },
    include: {
      bookType: { select: { id: true, key: true, name: true } },
      _count  : {
        select: {
          entries: true
        }
      }
    }
  });

  if (!pack) return null;

  const statusCounts = await prisma.knowledgeEntry.groupBy({
    by    : ["reviewStatus"],
    where : { packId: id },
    _count: true
  });

  return {
    ...pack,
    statusCounts: statusCounts.reduce(
      (acc, item) => {
        acc[item.reviewStatus] = item._count;
        return acc;
      },
      {} as Record<string, number>
    )
  };
}

/** 创建知识包。 */
export async function createKnowledgePack(data: {
  bookTypeId? : string;
  name        : string;
  scope       : string;
  description?: string;
}) {
  return prisma.knowledgePack.create({
    data: {
      bookTypeId : data.bookTypeId,
      name       : data.name,
      scope      : data.scope,
      description: data.description
    }
  });
}

/** 更新知识包。 */
export async function updateKnowledgePack(
  id: string,
  data: {
    name?       : string;
    description?: string;
    isActive?   : boolean;
    version?    : number;
  }
) {
  return prisma.knowledgePack.update({
    where: { id },
    data : {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
      ...(data.version !== undefined && { version: data.version })
    }
  });
}

/** 删除知识包（级联删除条目）。 */
export async function deleteKnowledgePack(id: string) {
  return prisma.knowledgePack.delete({ where: { id } });
}
