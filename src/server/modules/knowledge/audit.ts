import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";

/**
 * 知识变更审计日志工具。
 * 在知识库 CRUD 操作中统一调用，自动记录变更快照。
 */
export async function auditLog(
  params: {
    objectType    : string;
    objectId      : string;
    objectName    : string;
    action        : string;
    before?       : object | null;
    after?        : object | null;
    operatorId?   : string;
    operatorNote? : string;
    relatedBookId?: string;
  },
  client: PrismaClient = prisma
): Promise<void> {
  await client.knowledgeAuditLog.create({
    data: {
      objectType   : params.objectType,
      objectId     : params.objectId,
      objectName   : params.objectName,
      action       : params.action,
      before       : params.before ?? undefined,
      after        : params.after ?? undefined,
      operatorId   : params.operatorId,
      operatorNote : params.operatorNote,
      relatedBookId: params.relatedBookId
    }
  });
}
