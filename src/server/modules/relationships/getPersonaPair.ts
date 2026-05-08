/**
 * =============================================================================
 * 文件定位（服务层：两人物关系聚合查询）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/server/modules/relationships/getPersonaPair.ts`
 *
 * 模块职责：
 * - 校验书籍与两端人物存在；
 * - 一次性查询两个人物之间的双向关系；
 * - 输出供 Pair 详情面板直接消费的聚合 DTO。
 * =============================================================================
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { BookNotFoundError } from "@/server/modules/books/errors";
import { PersonaNotFoundError } from "@/server/modules/personas/errors";
import { RelationshipInputError } from "@/server/modules/relationships/errors";
import { lookupRelationshipTypeInfos } from "@/server/modules/knowledge/lookupTypeNames";
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

function toDirectionMode(input: string): PersonaPairDirectionMode {
  if (input === "SYMMETRIC" || input === "INVERSE" || input === "DIRECTED") {
    return input;
  }
  return "DIRECTED";
}

export function createGetPersonaPairService(
  prismaClient: PrismaClient = prisma
) {
  async function getPersonaPair(
    input: GetPersonaPairInput
  ): Promise<PersonaPairResponse> {
    const [book, personaA, personaB] = await Promise.all([
      prismaClient.book.findUnique({
        where : { id: input.bookId, deletedAt: null },
        select: { id: true }
      }),
      prismaClient.persona.findUnique({
        where : { id: input.aId, deletedAt: null },
        select: { id: true, name: true, aliases: true }
      }),
      prismaClient.persona.findUnique({
        where : { id: input.bId, deletedAt: null },
        select: { id: true, name: true, aliases: true }
      })
    ]);

    if (!book) {
      throw new BookNotFoundError(input.bookId);
    }
    if (!personaA) {
      throw new PersonaNotFoundError(input.aId);
    }
    if (!personaB) {
      throw new PersonaNotFoundError(input.bId);
    }
    if (personaA.id === personaB.id) {
      throw new RelationshipInputError("两人物不能相同");
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
      orderBy: [{ relationshipTypeCode: "asc" }]
    });

    const typeInfos = await lookupRelationshipTypeInfos(
      relationships.map((r) => r.relationshipTypeCode),
      prismaClient
    );

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
        const typeInfo = typeInfos.get(relationship.relationshipTypeCode);

        return {
          id                  : relationship.id,
          sourceId            : relationship.sourceId,
          targetId            : relationship.targetId,
          relationshipTypeCode: relationship.relationshipTypeCode,
          relationshipType    : typeInfo
            ? {
              code         : relationship.relationshipTypeCode,
              name         : typeInfo.name,
              group        : typeInfo.group,
              directionMode: toDirectionMode(typeInfo.directionMode),
              inverseLabel : typeInfo.sourceRoleLabel ?? typeInfo.name
            }
            : {
              code         : relationship.relationshipTypeCode,
              name         : relationship.relationshipTypeCode,
              group        : "",
              directionMode: "DIRECTED" as const,
              inverseLabel : null
            },
          recordSource: relationship.recordSource,
          status      : relationship.status,
          chapterId   : relationship.chapterId,
          chapterNo   : relationship.chapterNo,
          evidence    : relationship.evidence,
          summary     : relationship.summary,
          attitudeTags: relationship.attitudeTags
        };
      })
    };
  }

  return {
    getPersonaPair
  };
}

export const { getPersonaPair } = createGetPersonaPairService();
