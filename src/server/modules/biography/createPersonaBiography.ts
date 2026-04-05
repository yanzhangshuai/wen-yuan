/**
 * =============================================================================
 * 文件定位（服务层：人物传记事件创建）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/server/modules/biography/createPersonaBiography.ts`
 *
 * 模块职责：
 * - 为指定人物在指定章节下新增一条传记事件；
 * - 统一处理字段标准化、默认分类、来源与审核状态初始化。
 *
 * 业务语义：
 * - 传记事件是“人物在书中经历”的结构化表达，后续用于时间线与人物详情展示；
 * - `chapterId` 绑定可追溯事件出处，是后续纠错与审计的关键索引。
 *
 * 上下游：
 * - 上游：`POST /api/personas/:id/biography`；
 * - 下游：传记记录表与前端时间线模块。
 * =============================================================================
 */
import type { PrismaClient } from "@/generated/prisma/client";
import {
  BioCategory,
  ProcessingStatus,
  RecordSource
} from "@/generated/prisma/enums";
import { prisma } from "@/server/db/prisma";
import { PersonaNotFoundError } from "@/server/modules/personas/errors";
import { BiographyInputError } from "@/server/modules/biography/errors";

/**
 * 手动新增传记事件输入。
 */
export interface CreatePersonaBiographyInput {
  /** 章节 ID。 */
  chapterId   : string;
  /** 事件分类，默认 `EVENT`。 */
  category?   : BioCategory;
  /** 事件标题，可为空。 */
  title?      : string | null;
  /** 事件地点，可为空。 */
  location?   : string | null;
  /** 事件正文（必填）。 */
  event       : string;
  /** 虚拟年号/时间标注，可为空。 */
  virtualYear?: string | null;
}

/**
 * 手动新增传记事件返回体。
 */
export interface CreatePersonaBiographyResult {
  /** 事件 ID。 */
  id          : string;
  /** 所属人物 ID。 */
  personaId   : string;
  /** 所属章节 ID。 */
  chapterId   : string;
  /** 所属章节序号。 */
  chapterNo   : number;
  /** 事件分类。 */
  category    : BioCategory;
  /** 事件标题。 */
  title       : string | null;
  /** 事件地点。 */
  location    : string | null;
  /** 事件正文。 */
  event       : string;
  /** 虚拟年号/时间标注。 */
  virtualYear : string | null;
  /** 数据来源（MANUAL）。 */
  recordSource: RecordSource;
  /** 审核状态（VERIFIED）。 */
  status      : ProcessingStatus;
  /** 创建时间（ISO 字符串）。 */
  createdAt   : string;
}

/**
 * 可空文本标准化：空串归一为 `null`。
 */
function normalizeNullableText(input: string | null | undefined): string | null {
  if (input == null) {
    return null;
  }

  const value = input.trim();
  return value.length > 0 ? value : null;
}

export function createCreatePersonaBiographyService(
  prismaClient: PrismaClient = prisma
) {
  /**
   * 功能：为指定人物新增一条手动传记事件。
   * 输入：`personaId` + 事件内容。
   * 输出：创建后的事件快照。
   * 异常：
   * - `PersonaNotFoundError`：人物不存在；
   * - `BiographyInputError`：章节不存在。
   * 副作用：写入 `biographyRecord`，`recordSource=MANUAL`，`status=VERIFIED`。
   */
  async function createPersonaBiography(
    personaId: string,
    input: CreatePersonaBiographyInput
  ): Promise<CreatePersonaBiographyResult> {
    return prismaClient.$transaction(async (tx) => {
      const persona = await tx.persona.findFirst({
        where: {
          id       : personaId,
          deletedAt: null
        },
        select: { id: true }
      });
      if (!persona) {
        throw new PersonaNotFoundError(personaId);
      }

      const chapter = await tx.chapter.findFirst({
        where: {
          id: input.chapterId
        },
        select: {
          id: true,
          no: true
        }
      });
      if (!chapter) {
        throw new BiographyInputError("章节不存在");
      }

      const created = await tx.biographyRecord.create({
        data: {
          personaId,
          chapterId   : chapter.id,
          chapterNo   : chapter.no,
          category    : input.category ?? BioCategory.EVENT,
          title       : normalizeNullableText(input.title),
          location    : normalizeNullableText(input.location),
          event       : input.event.trim(),
          virtualYear : normalizeNullableText(input.virtualYear),
          recordSource: RecordSource.MANUAL,
          status      : ProcessingStatus.VERIFIED
        },
        select: {
          id          : true,
          personaId   : true,
          chapterId   : true,
          chapterNo   : true,
          category    : true,
          title       : true,
          location    : true,
          event       : true,
          virtualYear : true,
          recordSource: true,
          status      : true,
          createdAt   : true
        }
      });

      return {
        id          : created.id,
        personaId   : created.personaId,
        chapterId   : created.chapterId,
        chapterNo   : created.chapterNo,
        category    : created.category,
        title       : created.title,
        location    : created.location,
        event       : created.event,
        virtualYear : created.virtualYear,
        recordSource: created.recordSource,
        status      : created.status,
        createdAt   : created.createdAt.toISOString()
      };
    });
  }

  return {
    createPersonaBiography
  };
}

export const { createPersonaBiography } = createCreatePersonaBiographyService();
