import type { PrismaClient } from "@/generated/prisma/client";
import { ProcessingStatus } from "@/generated/prisma/enums";
import { prisma } from "@/server/db/prisma";
import { RelationshipEventNotFoundError } from "@/server/modules/relationships/errors";

export interface DeleteRelationshipEventResult {
  id       : string;
  status   : ProcessingStatus;
  deletedAt: string;
}

export function createDeleteRelationshipEventService(
  prismaClient: PrismaClient = prisma
) {
  async function deleteRelationshipEvent(eventId: string): Promise<DeleteRelationshipEventResult> {
    return prismaClient.$transaction(async (tx) => {
      const current = await tx.relationshipEvent.findUnique({
        where : { id: eventId },
        select: { id: true, status: true, deletedAt: true }
      });
      if (!current) {
        throw new RelationshipEventNotFoundError(eventId);
      }

      if (current.deletedAt) {
        return {
          id       : current.id,
          status   : current.status,
          deletedAt: current.deletedAt.toISOString()
        };
      }

      const deletedAt = new Date();
      const event = await tx.relationshipEvent.update({
        where : { id: eventId },
        data  : { status: ProcessingStatus.REJECTED, deletedAt },
        select: { id: true, status: true, deletedAt: true }
      });

      return {
        id       : event.id,
        status   : event.status,
        deletedAt: (event.deletedAt ?? deletedAt).toISOString()
      };
    });
  }

  return { deleteRelationshipEvent };
}

export const { deleteRelationshipEvent } = createDeleteRelationshipEventService();
