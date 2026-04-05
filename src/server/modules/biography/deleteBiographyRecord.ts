import type { PrismaClient } from "@/generated/prisma/client";
import { ProcessingStatus } from "@/generated/prisma/enums";
import { prisma } from "@/server/db/prisma";
import { BiographyRecordNotFoundError } from "@/server/modules/biography/errors";

/**
 * 文件定位（服务端业务模块 / biography）：
 * - 该文件提供“传记记录软删除”用例服务，通常由 Route Handler 或 Server Action 调用。
 * - 运行在 Node.js 服务端，属于数据写入链路，会影响后续审核列表可见性。
 *
 * 业务规则（重要）：
 * - 删除采用“软删除”而非物理删除：通过 `status=REJECTED` + `deletedAt` 标记失效；
 * - 这是业务可追溯要求，不是技术限制。
 */

/**
 * 传记记录软删除返回结果。
 * 该结构会直接作为 API data 下游消费，因此字段语义属于跨层契约。
 */
export interface DeleteBiographyRecordResult {
  /** 传记记录主键 ID。 */
  id       : string;
  /** 删除后状态：固定写成 REJECTED，表示被业务判定为无效。 */
  status   : ProcessingStatus;
  /** 软删除发生时间（ISO 字符串），用于审计与排序。 */
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
      // 第一步：只查询“未软删除”记录，避免重复删除已失效数据。
      const current = await tx.biographyRecord.findFirst({
        where: {
          id       : biographyId,
          deletedAt: null
        },
        select: { id: true }
      });
      if (!current) {
        // 统一抛业务异常，由上层 route 映射为 404/业务错误响应。
        throw new BiographyRecordNotFoundError(biographyId);
      }

      // 第二步：写入软删除标记。这里在事务内执行，确保“存在性检查 + 更新”原子化。
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
        // 理论上 update 后 deletedAt 必有值；`?? deletedAt` 是防御式兜底，避免类型层空值干扰下游。
        deletedAt: (updated.deletedAt ?? deletedAt).toISOString()
      };
    });
  }

  return {
    deleteBiographyRecord
  };
}

export const { deleteBiographyRecord } = createDeleteBiographyRecordService();
