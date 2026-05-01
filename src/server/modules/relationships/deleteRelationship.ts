import type { PrismaClient } from "@/generated/prisma/client";
import { ProcessingStatus } from "@/generated/prisma/enums";
import { prisma } from "@/server/db/prisma";
import { RelationshipNotFoundError } from "@/server/modules/relationships/errors";

/**
 * 文件定位（服务端业务模块 / relationships）：
 * - 负责执行人物关系记录的软删除；
 * - 关系事件由 `RelationshipEvent` 保留章节证据，因此删除关系时必须同步软删事件。
 */
export interface DeleteRelationshipResult {
  id                   : string;
  status               : ProcessingStatus;
  deletedAt            : string;
  softDeletedEventCount: number;
}

export function createDeleteRelationshipService(
  prismaClient: PrismaClient = prisma
) {
  /**
   * 软删除关系。已软删除记录按幂等成功返回，避免重复点击删除变成 404。
   */
  async function deleteRelationship(
    relationshipId: string
  ): Promise<DeleteRelationshipResult> {
    return prismaClient.$transaction(async (tx) => {
      const current = await tx.relationship.findUnique({
        where : { id: relationshipId },
        select: {
          id       : true,
          status   : true,
          deletedAt: true
        }
      });
      if (!current) {
        throw new RelationshipNotFoundError(relationshipId);
      }

      if (current.deletedAt) {
        return {
          id                   : current.id,
          status               : current.status,
          deletedAt            : current.deletedAt.toISOString(),
          softDeletedEventCount: 0
        };
      }

      const deletedAt = new Date();
      const eventUpdate = await tx.relationshipEvent.updateMany({
        where: {
          relationshipId,
          deletedAt: null
        },
        data: { deletedAt }
      });
      const updated = await tx.relationship.update({
        where: { id: relationshipId },
        data : {
          status: ProcessingStatus.REJECTED,
          deletedAt
        },
        select: {
          id       : true,
          status   : true,
          deletedAt: true
        }
      });

      return {
        id                   : updated.id,
        status               : updated.status,
        deletedAt            : (updated.deletedAt ?? deletedAt).toISOString(),
        softDeletedEventCount: eventUpdate.count
      };
    });
  }

  return {
    deleteRelationship
  };
}

export const { deleteRelationship } = createDeleteRelationshipService();
