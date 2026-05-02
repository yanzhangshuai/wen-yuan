import type { PrismaClient } from "@/generated/prisma/client";
import { ProcessingStatus, RecordSource } from "@/generated/prisma/enums";
import { prisma } from "@/server/db/prisma";
import {
  RelationshipInputError,
  RelationshipNotFoundError
} from "@/server/modules/relationships/errors";
import {
  normalizeRelationshipEventTags,
  nullableTrim,
  RELATIONSHIP_EVENT_SELECT,
  toRelationshipEventResult,
  type RelationshipEventResult
} from "@/server/modules/relationships/relationshipEventUtils";

export interface CreateRelationshipEventInput {
  chapterId    : string;
  summary      : string;
  evidence?    : string | null;
  attitudeTags?: string[];
  paraIndex?   : number | null;
  confidence?  : number;
}

export function createCreateRelationshipEventService(
  prismaClient: PrismaClient = prisma
) {
  async function createRelationshipEvent(
    relationshipId: string,
    input: CreateRelationshipEventInput
  ): Promise<RelationshipEventResult> {
    const summary = input.summary.trim();
    if (!summary) {
      throw new RelationshipInputError("事件摘要不能为空");
    }

    return prismaClient.$transaction(async (tx) => {
      const relationship = await tx.relationship.findFirst({
        where : { id: relationshipId, deletedAt: null },
        select: { id: true, bookId: true, sourceId: true, targetId: true }
      });
      if (!relationship) {
        throw new RelationshipNotFoundError(relationshipId);
      }

      const chapter = await tx.chapter.findFirst({
        where : { id: input.chapterId, bookId: relationship.bookId },
        select: { id: true, no: true }
      });
      if (!chapter) {
        throw new RelationshipInputError("章节不存在或不属于当前书籍");
      }

      const event = await tx.relationshipEvent.create({
        data: {
          relationshipId: relationship.id,
          bookId        : relationship.bookId,
          chapterId     : chapter.id,
          chapterNo     : chapter.no,
          sourceId      : relationship.sourceId,
          targetId      : relationship.targetId,
          summary,
          evidence      : nullableTrim(input.evidence),
          attitudeTags  : normalizeRelationshipEventTags(input.attitudeTags),
          paraIndex     : input.paraIndex ?? null,
          confidence    : input.confidence ?? 0.8,
          recordSource  : RecordSource.MANUAL,
          status        : ProcessingStatus.VERIFIED
        },
        select: RELATIONSHIP_EVENT_SELECT
      });

      return toRelationshipEventResult(event);
    });
  }

  return { createRelationshipEvent };
}

export const { createRelationshipEvent } = createCreateRelationshipEventService();
