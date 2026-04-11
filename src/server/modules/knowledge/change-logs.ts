import { type Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";

/**
 * 知识变更审计日志查询服务。
 */

export async function listChangeLogs(params?: {
  objectType?: string;
  objectId?  : string;
  action?    : string;
  from?      : string;
  to?        : string;
  page?      : number;
  pageSize?  : number;
}) {
  const where: Prisma.KnowledgeAuditLogWhereInput = {};
  if (params?.objectType) where.objectType = params.objectType;
  if (params?.objectId) where.objectId = params.objectId;
  if (params?.action) where.action = params.action;
  if (params?.from || params?.to) {
    where.createdAt = {};
    if (params?.from) where.createdAt.gte = new Date(params.from);
    if (params?.to) where.createdAt.lte = new Date(params.to);
  }

  const page = params?.page ?? 1;
  const pageSize = Math.min(params?.pageSize ?? 20, 100);

  const [items, total] = await Promise.all([
    prisma.knowledgeAuditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip   : (page - 1) * pageSize,
      take   : pageSize
    }),
    prisma.knowledgeAuditLog.count({ where })
  ]);

  return { items, total, page, pageSize };
}

export async function getChangeLog(id: string) {
  return prisma.knowledgeAuditLog.findUnique({ where: { id } });
}
