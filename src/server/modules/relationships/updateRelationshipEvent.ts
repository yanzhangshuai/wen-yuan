import type { PrismaClient } from "@/generated/prisma/client";
import { type ProcessingStatus, type RecordSource } from "@/generated/prisma/enums";
import { prisma } from "@/server/db/prisma";
import {
  RelationshipEventNotFoundError,
  RelationshipInputError
} from "@/server/modules/relationships/errors";
import {
  normalizeRelationshipEventTags,
  nullableTrim,
  RELATIONSHIP_EVENT_SELECT,
  toRelationshipEventResult,
  type RelationshipEventResult
} from "@/server/modules/relationships/relationshipEventUtils";

export interface UpdateRelationshipEventInput {
  chapterId?   : string;
  summary?     : string;
  evidence?    : string | null;
  attitudeTags?: string[];
  paraIndex?   : number | null;
  confidence?  : number;
  recordSource?: RecordSource;
  status?      : ProcessingStatus;
}

export function createUpdateRelationshipEventService(
  prismaClient: PrismaClient = prisma
) {
  async function updateRelationshipEvent(
    eventId: string,
    input: UpdateRelationshipEventInput
  ): Promise<RelationshipEventResult> {
    if (Object.keys(input).length === 0) {
      throw new RelationshipInputError("至少需要一个可更新字段");
    }

    return prismaClient.$transaction(async (tx) => {
      const current = await tx.relationshipEvent.findFirst({
        where : { id: eventId, deletedAt: null },
        select: { id: true, bookId: true }
      });
      if (!current) {
        throw new RelationshipEventNotFoundError(eventId);
      }

      const data: {
        chapterId?   : string;
        chapterNo?   : number;
        summary?     : string;
        evidence?    : string | null;
        attitudeTags?: string[];
        paraIndex?   : number | null;
        confidence?  : number;
        recordSource?: RecordSource;
        status?      : ProcessingStatus;
      } = {};

      if (input.chapterId !== undefined) {
        const chapter = await tx.chapter.findFirst({
          where : { id: input.chapterId, bookId: current.bookId },
          select: { id: true, no: true }
        });
        if (!chapter) {
          throw new RelationshipInputError("章节不存在或不属于当前书籍");
        }
        data.chapterId = chapter.id;
        data.chapterNo = chapter.no;
      }

      if (input.summary !== undefined) {
        const summary = input.summary.trim();
        if (!summary) {
          throw new RelationshipInputError("事件摘要不能为空");
        }
        data.summary = summary;
      }
      if (input.evidence !== undefined) data.evidence = nullableTrim(input.evidence);
      if (input.attitudeTags !== undefined) data.attitudeTags = normalizeRelationshipEventTags(input.attitudeTags);
      if (input.paraIndex !== undefined) data.paraIndex = input.paraIndex;
      if (input.confidence !== undefined) data.confidence = input.confidence;
      if (input.recordSource !== undefined) data.recordSource = input.recordSource;
      if (input.status !== undefined) data.status = input.status;

      const event = await tx.relationshipEvent.update({
        where : { id: eventId },
        data,
        select: RELATIONSHIP_EVENT_SELECT
      });

      return toRelationshipEventResult(event);
    });
  }

  return { updateRelationshipEvent };
}

export const { updateRelationshipEvent } = createUpdateRelationshipEventService();
