import { ProcessingStatus } from "@/generated/prisma/enums";
import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";

/**
 * =============================================================================
 * 文件定位（服务端领域模块：批量审核写操作）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/server/modules/review/bulkReview.ts`
 *
 * 分层角色：
 * - 属于审核域的“写服务层”，被 `/api/admin/bulk-verify` 与 `/api/admin/bulk-reject` 调用；
 * - 负责把上游传入的一组草稿 ID 事务化地写入目标状态。
 *
 * 业务职责：
 * 1) 标准化并校验 ID 列表（去空、去重）；
 * 2) 仅更新 `DRAFT` 且未软删除的数据，避免重复审核已处理记录；
 * 3) 同时覆盖关系草稿与传记草稿两张表，返回统一统计结果。
 *
 * 业务边界：
 * - 不处理人物草稿（人物审核当前走其它确认路径）；
 * - 不做角色鉴权，鉴权由 API 层完成；
 * - 输入为空抛 `BulkReviewInputError`，由接口层转换成 400。
 *
 * 维护注意：
 * - `status` 只允许 VERIFIED/REJECTED，这不是技术限制，而是审核流程业务规则；
 * - 事务更新能保证“关系/传记”两类草稿在同次操作中一致提交或回滚。
 * =============================================================================
 */

/** 批量审核操作结果。 */
export interface BulkReviewResult {
  /** 本次请求去重后的草稿 ID 列表。 */
  ids                 : string[];
  /** 批量写入的目标状态：VERIFIED 或 REJECTED。 */
  status              : typeof ProcessingStatus.VERIFIED | typeof ProcessingStatus.REJECTED;
  /** 实际更新到的关系草稿数量。 */
  relationshipCount   : number;
  /** 实际更新到的传记草稿数量。 */
  biographyRecordCount: number;
  /** 总更新数（关系 + 传记）。 */
  totalCount          : number;
}

/** 批量审核输入不合法时抛出的业务异常。 */
export class BulkReviewInputError extends Error {
  constructor(message: string) {
    super(message);
  }
}

/**
 * 功能：标准化草稿 ID 列表（trim + 去重 + 过滤空值）。
 * 输入：原始 `ids` 字符串数组。
 * 输出：可用于数据库查询的规范化 ID 数组。
 * 异常：无。
 * 副作用：无。
 */
function normalizeIds(ids: string[]): string[] {
  // 设计原因：
  // 1) 去除首尾空格，兼容调用方误传；
  // 2) 去重，避免重复 ID 导致无效写放大；
  // 3) 保持输入顺序，便于日志追踪与问题排查。
  const seen = new Set<string>();
  const result: string[] = [];

  for (const id of ids) {
    const normalized = id.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

export function createBulkReviewService(
  prismaClient: PrismaClient = prisma
) {
  /**
   * 功能：批量将草稿状态写为目标状态（支持 VERIFIED / REJECTED）。
   * 输入：`ids` 草稿 ID 列表，`status` 目标状态。
   * 输出：`BulkReviewResult`，包含命中数量统计。
   * 异常：`ids` 为空时抛 `BulkReviewInputError`。
   * 副作用：事务内更新 `relationship` 与 `biographyRecord` 两张表。
   */
  async function applyReviewStatus(
    ids: string[],
    status: typeof ProcessingStatus.VERIFIED | typeof ProcessingStatus.REJECTED
  ): Promise<BulkReviewResult> {
    const normalizedIds = normalizeIds(ids);
    // 防御分支：即使 API 层已做 zod 校验，服务层仍二次校验，避免被其他调用方绕过。
    if (normalizedIds.length === 0) {
      throw new BulkReviewInputError("至少需要传入一个草稿 ID");
    }

    const result = await prismaClient.$transaction(async (tx) => {
      // 只更新 DRAFT：这是审核状态机约束，避免已确认/已拒绝记录被重复覆盖。
      const relationshipResult = await tx.relationship.updateMany({
        where: {
          id       : { in: normalizedIds },
          status   : ProcessingStatus.DRAFT,
          deletedAt: null
        },
        data: {
          status
        }
      });

      // 与关系草稿同样的状态机约束，保证不同草稿类型的行为一致。
      const biographyResult = await tx.biographyRecord.updateMany({
        where: {
          id       : { in: normalizedIds },
          status   : ProcessingStatus.DRAFT,
          deletedAt: null
        },
        data: {
          status
        }
      });

      return {
        relationshipCount   : relationshipResult.count,
        biographyRecordCount: biographyResult.count
      };
    });

    // 输出统一统计，供前端提示“本次批量操作实际命中条数”。
    return {
      ids                 : normalizedIds,
      status,
      relationshipCount   : result.relationshipCount,
      biographyRecordCount: result.biographyRecordCount,
      totalCount          : result.relationshipCount + result.biographyRecordCount
    };
  }

  /**
   * 功能：批量确认草稿（DRAFT -> VERIFIED）。
   * 输入：草稿 ID 数组。
   * 输出：`BulkReviewResult`。
   * 异常：透传 `BulkReviewInputError`/数据库错误。
   * 副作用：更新数据库草稿状态。
   */
  async function bulkVerifyDrafts(ids: string[]): Promise<BulkReviewResult> {
    return applyReviewStatus(ids, ProcessingStatus.VERIFIED);
  }

  /**
   * 功能：批量拒绝草稿（DRAFT -> REJECTED）。
   * 输入：草稿 ID 数组。
   * 输出：`BulkReviewResult`。
   * 异常：透传 `BulkReviewInputError`/数据库错误。
   * 副作用：更新数据库草稿状态。
   */
  async function bulkRejectDrafts(ids: string[]): Promise<BulkReviewResult> {
    return applyReviewStatus(ids, ProcessingStatus.REJECTED);
  }

  return {
    bulkVerifyDrafts,
    bulkRejectDrafts
  };
}

export const { bulkVerifyDrafts, bulkRejectDrafts } = createBulkReviewService();
