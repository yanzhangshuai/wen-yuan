import type { PrismaClient } from "@/generated/prisma/client";
import {
  ProcessingStatus,
  RecordSource
} from "@/generated/prisma/enums";
import { prisma } from "@/server/db/prisma";
import { BookNotFoundError } from "@/server/modules/books/errors";
import { PersonaNotFoundError } from "@/server/modules/personas/errors";
import { RelationshipInputError } from "@/server/modules/relationships/errors";

/**
 * 手动创建关系的输入参数。
 * 由 API 层完成字段格式校验后传入 service。
 */
export interface CreateBookRelationshipInput {
  /** 关系首次出现章节 ID（UUID，且必须属于目标书籍）。 */
  chapterId   : string;
  /** 关系起点人物 ID（UUID）。 */
  sourceId    : string;
  /** 关系终点人物 ID（UUID）。 */
  targetId    : string;
  /** 关系类型（如 `师生`、`同僚`、`敌对`）。 */
  type        : string;
  /** 关系权重，默认 1。 */
  weight?     : number;
  /** 关系背景描述，可选。 */
  description?: string | null;
  /** 原文证据片段，可选。 */
  evidence?   : string | null;
  /** 置信度，默认 1（手动录入视为高置信）。 */
  confidence? : number;
}

/**
 * 手动创建关系后的返回快照。
 * 用于 API 响应与前端列表即时刷新。
 */
export interface CreateBookRelationshipResult {
  /** 关系主键 ID。 */
  id          : string;
  /** 关系所属书籍 ID。 */
  bookId      : string;
  /** 关系首次出现章节 ID。 */
  chapterId   : string;
  /** 关系首次出现章节序号。 */
  chapterNo   : number;
  /** 起点人物 ID。 */
  sourceId    : string;
  /** 终点人物 ID。 */
  targetId    : string;
  /** 关系类型。 */
  type        : string;
  /** 关系权重。 */
  weight      : number;
  /** 关系背景描述。 */
  description : string | null;
  /** 原文证据片段。 */
  evidence    : string | null;
  /** 关系置信度。 */
  confidence  : number;
  /** 数据来源（MANUAL）。 */
  recordSource: RecordSource;
  /** 审核状态（手动录入默认 VERIFIED）。 */
  status      : ProcessingStatus;
}

/**
 * 将可空文本标准化为「trim 后字符串或 null」。
 * 避免空白字符串进入数据库。
 */
function normalizeNullableText(input: string | null | undefined): string | null {
  if (input == null) {
    return null;
  }

  const value = input.trim();
  return value.length > 0 ? value : null;
}

export function createCreateBookRelationshipService(
  prismaClient: PrismaClient = prisma
) {
  /**
   * 功能：为指定书籍手动新增一条人物关系。
   * 输入：`bookId` + `CreateBookRelationshipInput`。
   * 输出：创建后的关系快照。
   * 异常：
   * - `BookNotFoundError`：书籍不存在；
   * - `PersonaNotFoundError`：起点/终点人物不存在；
   * - `RelationshipInputError`：关系不合法（自环、重复、章节不匹配）。
   * 副作用：写入 `relationship` 表，`recordSource=MANUAL`，`status=VERIFIED`。
   */
  async function createBookRelationship(
    bookId: string,
    input: CreateBookRelationshipInput
  ): Promise<CreateBookRelationshipResult> {
    if (input.sourceId === input.targetId) {
      throw new RelationshipInputError("关系起点和终点不能相同");
    }

    return prismaClient.$transaction(async (tx) => {
      const book = await tx.book.findFirst({
        where: {
          id       : bookId,
          deletedAt: null
        },
        select: { id: true }
      });
      if (!book) {
        throw new BookNotFoundError(bookId);
      }

      const chapter = await tx.chapter.findFirst({
        where: {
          id: input.chapterId,
          bookId
        },
        select: {
          id: true,
          no: true
        }
      });
      if (!chapter) {
        throw new RelationshipInputError("章节不存在或不属于当前书籍");
      }

      const personas = await tx.persona.findMany({
        where: {
          id       : { in: [input.sourceId, input.targetId] },
          deletedAt: null
        },
        select: { id: true }
      });
      const source = personas.find((item) => item.id === input.sourceId);
      if (!source) {
        throw new PersonaNotFoundError(input.sourceId);
      }
      const target = personas.find((item) => item.id === input.targetId);
      if (!target) {
        throw new PersonaNotFoundError(input.targetId);
      }

      const normalizedType = input.type.trim();
      const duplicated = await tx.relationship.findFirst({
        where: {
          deletedAt   : null,
          chapterId   : chapter.id,
          sourceId    : source.id,
          targetId    : target.id,
          type        : normalizedType,
          recordSource: RecordSource.MANUAL
        },
        select: {
          id: true
        }
      });
      if (duplicated) {
        throw new RelationshipInputError("关系已存在");
      }

      const created = await tx.relationship.create({
        data: {
          chapterId   : chapter.id,
          sourceId    : source.id,
          targetId    : target.id,
          type        : normalizedType,
          weight      : input.weight ?? 1,
          description : normalizeNullableText(input.description),
          evidence    : normalizeNullableText(input.evidence),
          confidence  : input.confidence ?? 1,
          recordSource: RecordSource.MANUAL,
          status      : ProcessingStatus.VERIFIED
        },
        select: {
          id          : true,
          chapterId   : true,
          sourceId    : true,
          targetId    : true,
          type        : true,
          weight      : true,
          description : true,
          evidence    : true,
          confidence  : true,
          recordSource: true,
          status      : true
        }
      });

      return {
        id          : created.id,
        bookId,
        chapterId   : created.chapterId,
        chapterNo   : chapter.no,
        sourceId    : created.sourceId,
        targetId    : created.targetId,
        type        : created.type,
        weight      : created.weight,
        description : created.description,
        evidence    : created.evidence,
        confidence  : created.confidence,
        recordSource: created.recordSource,
        status      : created.status
      };
    });
  }

  return {
    createBookRelationship
  };
}

export const { createBookRelationship } = createCreateBookRelationshipService();
