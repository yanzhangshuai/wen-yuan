/**
 * =============================================================================
 * 文件定位（服务层：两人物关系聚合查询）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/server/modules/relationships/getPersonaPair.ts`
 *
 * 模块职责：
 * - 校验书籍与两端人物存在；
 * - 一次性查询两个人物之间的双向结构关系与关系事件；
 * - 输出供 Pair 详情面板直接消费的聚合 DTO。
 * =============================================================================
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { BookNotFoundError } from "@/server/modules/books/errors";
import { PersonaNotFoundError } from "@/server/modules/personas/errors";
import { RelationshipInputError } from "@/server/modules/relationships/errors";
import type {
  PersonaPairDirectionMode,
  PersonaPairRelationship,
  PersonaPairResponse
} from "@/types/persona-pair";

export interface GetPersonaPairInput {
  bookId: string;
  aId   : string;
  bId   : string;
}

export type GetPersonaPairResult = PersonaPairResponse;

const RELATIONSHIP_DIRECTION_MODES = new Set<string>(["SYMMETRIC", "INVERSE", "DIRECTED"]);

function toDirectionMode(value: string): PersonaPairDirectionMode {
  if (RELATIONSHIP_DIRECTION_MODES.has(value)) {
    return value as PersonaPairDirectionMode;
  }

  throw new RelationshipInputError(`关系类型方向不合法: ${value}`);
}

export function createGetPersonaPairService(
  prismaClient: PrismaClient = prisma
) {
  /**
   * 查询 Pair 聚合详情。关系事件通过 nested include 一次取齐，避免按关系逐条查询造成 N+1。
   */
  async function getPersonaPair(input: GetPersonaPairInput): Promise<GetPersonaPairResult> {
    if (input.aId === input.bId) {
      throw new RelationshipInputError("起点和终点不能相同");
    }

    const [book, personas] = await Promise.all([
      prismaClient.book.findFirst({
        where : { id: input.bookId, deletedAt: null },
        select: { id: true }
      }),
      prismaClient.persona.findMany({
        where : { id: { in: [input.aId, input.bId] }, deletedAt: null },
        select: { id: true, name: true, aliases: true }
      })
    ]);

    if (!book) {
      throw new BookNotFoundError(input.bookId);
    }

    const personasById = new Map(personas.map((persona) => [persona.id, persona]));
    const personaA = personasById.get(input.aId);
    if (!personaA) {
      throw new PersonaNotFoundError(input.aId);
    }
    const personaB = personasById.get(input.bId);
    if (!personaB) {
      throw new PersonaNotFoundError(input.bId);
    }

    const relationships = await prismaClient.relationship.findMany({
      where: {
        bookId   : input.bookId,
        deletedAt: null,
        OR       : [
          { sourceId: input.aId, targetId: input.bId },
          { sourceId: input.bId, targetId: input.aId }
        ]
      },
      include: {
        relationshipType: {
          select: {
            code            : true,
            name            : true,
            group           : true,
            directionMode   : true,
            reverseEdgeLabel: true
          }
        },
        events: {
          where  : { deletedAt: null },
          orderBy: [{ chapterNo: "asc" }, { paraIndex: "asc" }, { createdAt: "asc" }],
          include: {
            chapter: { select: { id: true, no: true, title: true } }
          }
        }
      },
      orderBy: [{ relationshipTypeCode: "asc" }]
    });

    return {
      bookId  : input.bookId,
      aId     : input.aId,
      bId     : input.bId,
      personas: [
        {
          id         : personaA.id,
          name       : personaA.name,
          aliases    : personaA.aliases,
          portraitUrl: null
        },
        {
          id         : personaB.id,
          name       : personaB.name,
          aliases    : personaB.aliases,
          portraitUrl: null
        }
      ],
      relationships: relationships.map((relationship): PersonaPairRelationship => {
        const chapterNumbers = relationship.events.map((event) => event.chapterNo);

        return {
          id                  : relationship.id,
          sourceId            : relationship.sourceId,
          targetId            : relationship.targetId,
          relationshipTypeCode: relationship.relationshipTypeCode,
          relationshipType    : {
            code         : relationship.relationshipType.code,
            name         : relationship.relationshipType.name,
            group        : relationship.relationshipType.group,
            directionMode: toDirectionMode(relationship.relationshipType.directionMode),
            inverseLabel : relationship.relationshipType.reverseEdgeLabel
          },
          recordSource  : relationship.recordSource,
          status        : relationship.status,
          firstChapterNo: chapterNumbers.length > 0 ? Math.min(...chapterNumbers) : null,
          lastChapterNo : chapterNumbers.length > 0 ? Math.max(...chapterNumbers) : null,
          eventCount    : relationship.events.length,
          events        : relationship.events.map((event) => ({
            id          : event.id,
            chapterId   : event.chapterId,
            chapterNo   : event.chapterNo,
            chapterTitle: event.chapter.title,
            sourceId    : event.sourceId,
            targetId    : event.targetId,
            summary     : event.summary,
            evidence    : event.evidence,
            attitudeTags: event.attitudeTags,
            paraIndex   : event.paraIndex,
            confidence  : event.confidence,
            recordSource: event.recordSource,
            status      : event.status
          }))
        };
      })
    };
  }

  return {
    getPersonaPair
  };
}

export const { getPersonaPair } = createGetPersonaPairService();
