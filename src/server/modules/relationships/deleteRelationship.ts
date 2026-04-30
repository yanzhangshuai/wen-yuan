import type { PrismaClient } from "@/generated/prisma/client";
import { ProcessingStatus } from "@/generated/prisma/enums";
import { prisma } from "@/server/db/prisma";
import { RelationshipNotFoundError } from "@/server/modules/relationships/errors";

/**
 * 文件定位（服务端业务模块 / relationships）：
 * - 负责执行人物关系记录的软删除。
 * - 该能力通常由审核流触发，用于撤销误识别关系，同时保留历史痕迹便于追溯。
 *
 * 业务规则（重要）：
 * - 删除语义并非物理清除，而是状态流转到 `REJECTED` 并记录删除时间；
 * - 这是角色资料工作台域规则，不建议改成硬删除。
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
      // 仅允许删除“仍处于有效集合”的记录，避免重复操作导致状态语义混乱。
      const current = await tx.relationship.findFirst({
        where: {
          id       : relationshipId,
          deletedAt: null
        },
        select: { id: true }
      });
      if (!current) {
        // 未命中说明记录不存在或已软删除，交由上游统一按“未找到”处理。
        throw new RelationshipNotFoundError(relationshipId);
      }

      // 事务内完成状态变更，确保删除时间与状态一致写入。
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
        // 防御性回退：应对极端场景下 ORM 返回空值。
        deletedAt: (updated.deletedAt ?? deletedAt).toISOString()
      };
    });
  }

  return {
    deleteRelationship
  };
}

export const { deleteRelationship } = createDeleteRelationshipService();
