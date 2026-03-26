import type { PrismaClient } from "@/generated/prisma/client";
import { type BioCategory, type ProcessingStatus } from "@/generated/prisma/enums";
import { prisma } from "@/server/db/prisma";
import {
  BiographyInputError,
  BiographyRecordNotFoundError
} from "@/server/modules/biography/errors";

/**
 * 传记记录更新输入。
 * 字段全部可选，但至少需要提供一个。
 */
export interface UpdateBiographyRecordInput {
  /** 新章节 ID。 */
  chapterId?  : string;
  /** 新事件分类。 */
  category?   : BioCategory;
  /** 新标题，可置空。 */
  title?      : string | null;
  /** 新地点，可置空。 */
  location?   : string | null;
  /** 新事件正文。 */
  event?      : string;
  /** 新虚拟年号/时间标注，可置空。 */
  virtualYear?: string | null;
  /** 新审核状态。 */
  status?     : ProcessingStatus;
}

/**
 * 传记记录更新结果。
 */
export interface UpdateBiographyRecordResult {
  /** 事件 ID。 */
  id         : string;
  /** 所属人物 ID。 */
  personaId  : string;
  /** 所属章节 ID。 */
  chapterId  : string;
  /** 所属章节序号。 */
  chapterNo  : number;
  /** 事件分类。 */
  category   : BioCategory;
  /** 标题。 */
  title      : string | null;
  /** 地点。 */
  location   : string | null;
  /** 事件正文。 */
  event      : string;
  /** 虚拟年号/时间标注。 */
  virtualYear: string | null;
  /** 审核状态。 */
  status     : ProcessingStatus;
  /** 更新时间（ISO 字符串）。 */
  updatedAt  : string;
}

/**
 * 可空文本标准化：trim 后空串转 null。
 */
function normalizeNullableText(input: string | null): string | null {
  if (input === null) {
    return null;
  }

  const value = input.trim();
  return value.length > 0 ? value : null;
}

export function createUpdateBiographyRecordService(
  prismaClient: PrismaClient = prisma
) {
  /**
   * 功能：更新单条传记记录。
   * 输入：传记 ID + 更新字段。
   * 输出：更新后的传记快照。
   * 异常：
   * - `BiographyInputError`：未提供更新字段或章节不存在；
   * - `BiographyRecordNotFoundError`：记录不存在或已软删除。
   * 副作用：更新 `biographyRecord` 记录。
   */
  async function updateBiographyRecord(
    biographyId: string,
    input: UpdateBiographyRecordInput
  ): Promise<UpdateBiographyRecordResult> {
    if (Object.keys(input).length === 0) {
      throw new BiographyInputError("至少需要一个可更新字段");
    }

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

      const data: {
        chapterId?  : string;
        chapterNo?  : number;
        category?   : BioCategory;
        title?      : string | null;
        location?   : string | null;
        event?      : string;
        virtualYear?: string | null;
        status?     : ProcessingStatus;
      } = {};

      if (input.chapterId !== undefined) {
        const chapter = await tx.chapter.findFirst({
          where : { id: input.chapterId },
          select: {
            id: true,
            no: true
          }
        });
        if (!chapter) {
          throw new BiographyInputError("章节不存在");
        }
        data.chapterId = chapter.id;
        data.chapterNo = chapter.no;
      }
      if (input.category !== undefined) {
        data.category = input.category;
      }
      if (input.title !== undefined) {
        data.title = normalizeNullableText(input.title);
      }
      if (input.location !== undefined) {
        data.location = normalizeNullableText(input.location);
      }
      if (input.event !== undefined) {
        data.event = input.event.trim();
      }
      if (input.virtualYear !== undefined) {
        data.virtualYear = normalizeNullableText(input.virtualYear);
      }
      if (input.status !== undefined) {
        data.status = input.status;
      }

      const updated = await tx.biographyRecord.update({
        where : { id: biographyId },
        data,
        select: {
          id         : true,
          personaId  : true,
          chapterId  : true,
          chapterNo  : true,
          category   : true,
          title      : true,
          location   : true,
          event      : true,
          virtualYear: true,
          status     : true,
          updatedAt  : true
        }
      });

      return {
        id         : updated.id,
        personaId  : updated.personaId,
        chapterId  : updated.chapterId,
        chapterNo  : updated.chapterNo,
        category   : updated.category,
        title      : updated.title,
        location   : updated.location,
        event      : updated.event,
        virtualYear: updated.virtualYear,
        status     : updated.status,
        updatedAt  : updated.updatedAt.toISOString()
      };
    });
  }

  return {
    updateBiographyRecord
  };
}

export const { updateBiographyRecord } = createUpdateBiographyRecordService();
