import type { PrismaClient } from "@/generated/prisma/client";
import { ProcessingStatus } from "@/generated/prisma/enums";
import { prisma } from "@/server/db/prisma";
import { RelationshipNotFoundError } from "@/server/modules/relationships/errors";

/**
 * 关系软删除返回结果。
 */
export interface DeleteRelationshipResult {
  /** 关系主键 ID。 */
  id       : string;
  /** 删除后状态（固定为 REJECTED）。 */
  status   : ProcessingStatus;
  /** 软删除时间（ISO 字符串）。 */
  deletedAt: string;
}

export function createDeleteRelationshipService(
  prismaClient: PrismaClient = prisma
) {
  /**
   * 功能：软删除单条关系记录。
   * 输入：`relationshipId` 关系 ID。
   * 输出：删除后的最小快照（id/status/deletedAt）。
   * 异常：关系不存在时抛出 `RelationshipNotFoundError`。
   * 副作用：更新 `relationship.status=REJECTED` 并写入 `deletedAt`。
   */
  async function deleteRelationship(
    relationshipId: string
  ): Promise<DeleteRelationshipResult> {
    return prismaClient.$transaction(async (tx) => {
      const current = await tx.relationship.findFirst({
        where: {
          id       : relationshipId,
          deletedAt: null
        },
        select: { id: true }
      });
      if (!current) {
        throw new RelationshipNotFoundError(relationshipId);
      }

      const deletedAt = new Date();
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
        id       : updated.id,
        status   : updated.status,
        deletedAt: (updated.deletedAt ?? deletedAt).toISOString()
      };
    });
  }

  return {
    deleteRelationship
  };
}

export const { deleteRelationship } = createDeleteRelationshipService();
