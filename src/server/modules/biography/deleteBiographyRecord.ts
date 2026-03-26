import type { PrismaClient } from "@/generated/prisma/client";
import { ProcessingStatus } from "@/generated/prisma/enums";
import { prisma } from "@/server/db/prisma";
import { BiographyRecordNotFoundError } from "@/server/modules/biography/errors";

/**
 * 传记记录软删除返回结果。
 */
export interface DeleteBiographyRecordResult {
  /** 事件 ID。 */
  id       : string;
  /** 删除后状态（REJECTED）。 */
  status   : ProcessingStatus;
  /** 软删除时间（ISO 字符串）。 */
  deletedAt: string;
}

export function createDeleteBiographyRecordService(
  prismaClient: PrismaClient = prisma
) {
  /**
   * 功能：软删除传记记录。
   * 输入：`biographyId` 传记记录 ID。
   * 输出：删除结果快照。
   * 异常：记录不存在时抛出 `BiographyRecordNotFoundError`。
   * 副作用：更新 `status=REJECTED` 并写入 `deletedAt`。
   */
  async function deleteBiographyRecord(
    biographyId: string
  ): Promise<DeleteBiographyRecordResult> {
    return prismaClient.$transaction(async (tx) => {
      const current = await tx.biographyRecord.findFirst({
        where: {
          id       : biographyId,
          deletedAt: null
        },
        select: { id: true }
      });
      if (!current) {
        throw new BiographyRecordNotFoundError(biographyId);
      }

      const deletedAt = new Date();
      const updated = await tx.biographyRecord.update({
        where: { id: biographyId },
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
    deleteBiographyRecord
  };
}

export const { deleteBiographyRecord } = createDeleteBiographyRecordService();
