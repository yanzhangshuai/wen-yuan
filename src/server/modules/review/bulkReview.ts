import { ProcessingStatus } from "@/generated/prisma/enums";
import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";

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
    if (normalizedIds.length === 0) {
      throw new BulkReviewInputError("至少需要传入一个草稿 ID");
    }

    const result = await prismaClient.$transaction(async (tx) => {
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
