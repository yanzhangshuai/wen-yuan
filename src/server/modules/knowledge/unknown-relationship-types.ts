import { type Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import {
  createRelationshipType,
  type RelationshipTypeInput
} from "@/server/modules/knowledge/relationship-types";
import type { UnknownRelationshipTypeProposal } from "@/types/analysis";

export const UNKNOWN_RELATIONSHIP_TYPE_DRAFT_STATUSES = ["PENDING", "APPROVED", "REJECTED", "MERGED"] as const;
export type UnknownRelationshipTypeDraftStatus = typeof UNKNOWN_RELATIONSHIP_TYPE_DRAFT_STATUSES[number];

export type UnknownRelationshipTypeApproveInput =
  | { mode: "BIND_EXISTING"; relationshipTypeCode: string }
  | { mode: "CREATE_NEW"; input: RelationshipTypeInput };

const unknownRelationshipTypeDraftInclude = {
  book: {
    select: {
      id        : true,
      title     : true,
      bookTypeId: true,
      bookType  : { select: { id: true, key: true, name: true } }
    }
  },
  firstChapter: { select: { id: true, no: true, title: true } },
  occurrences : {
    orderBy: { createdAt: "desc" },
    include: {
      chapter: { select: { id: true, no: true, title: true } }
    }
  },
  mergedIntoDraft: {
    select: { id: true, proposedName: true }
  }
} satisfies Prisma.UnknownRelationshipTypeDraftInclude;

function normalizeSignaturePart(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function buildUnknownRelationshipTypeSignature(input: Pick<UnknownRelationshipTypeProposal, "proposedName" | "proposedDirectionMode" | "proposedSourceRoleLabel" | "proposedTargetRoleLabel">): string {
  return [
    normalizeSignaturePart(input.proposedName),
    input.proposedDirectionMode,
    normalizeSignaturePart(input.proposedSourceRoleLabel),
    normalizeSignaturePart(input.proposedTargetRoleLabel)
  ].join("|");
}

export async function recordUnknownRelationshipTypeOccurrence(
  tx: Prisma.TransactionClient,
  input: {
    bookId          : string;
    chapterId       : string;
    jobId?          : string | null;
    sourceName      : string;
    targetName      : string;
    sourcePersonaId?: string | null;
    targetPersonaId?: string | null;
    proposal        : UnknownRelationshipTypeProposal;
    evidence?       : string | null;
  }
): Promise<boolean> {
  const signature = buildUnknownRelationshipTypeSignature(input.proposal);
  let draft = await tx.unknownRelationshipTypeDraft.findFirst({
    where : { bookId: input.bookId, signature },
    select: { id: true }
  });
  const draftWasCreated = !draft;

  if (!draft) {
    draft = await tx.unknownRelationshipTypeDraft.create({
      data: {
        bookId                 : input.bookId,
        firstChapterId         : input.chapterId,
        firstJobId             : input.jobId ?? null,
        signature,
        proposedName           : input.proposal.proposedName.trim(),
        proposedGroup          : input.proposal.proposedGroup.trim(),
        proposedDirectionMode  : input.proposal.proposedDirectionMode,
        proposedSourceRoleLabel: input.proposal.proposedSourceRoleLabel?.trim() || null,
        proposedTargetRoleLabel: input.proposal.proposedTargetRoleLabel?.trim() || null,
        occurrenceCount        : 1
      },
      select: { id: true }
    });
  }

  const existingOccurrence = await tx.unknownRelationshipTypeOccurrence.findFirst({
    where: {
      draftId   : draft.id,
      chapterId : input.chapterId,
      sourceName: input.sourceName,
      targetName: input.targetName
    },
    select: { id: true }
  });

  if (existingOccurrence) {
    return false;
  }

  await tx.unknownRelationshipTypeOccurrence.create({
    data: {
      draftId        : draft.id,
      bookId         : input.bookId,
      chapterId      : input.chapterId,
      jobId          : input.jobId ?? null,
      sourceName     : input.sourceName,
      targetName     : input.targetName,
      sourcePersonaId: input.sourcePersonaId ?? null,
      targetPersonaId: input.targetPersonaId ?? null,
      evidence       : input.evidence?.trim() || input.proposal.evidence?.trim() || null
    }
  });

  if (!draftWasCreated) {
    await tx.unknownRelationshipTypeDraft.update({
      where: { id: draft.id },
      data : { occurrenceCount: { increment: 1 } }
    });
  }

  return true;
}

export async function listUnknownRelationshipTypeDrafts(params?: {
  bookId?: string;
  status?: UnknownRelationshipTypeDraftStatus;
}) {
  return prisma.unknownRelationshipTypeDraft.findMany({
    where: {
      ...(params?.bookId ? { bookId: params.bookId } : {}),
      ...(params?.status ? { status: params.status } : {})
    },
    orderBy: [
      { occurrenceCount: "desc" },
      { updatedAt: "desc" }
    ],
    include: unknownRelationshipTypeDraftInclude
  });
}

async function getUnknownRelationshipTypeDraft(id: string) {
  const draft = await prisma.unknownRelationshipTypeDraft.findUnique({
    where  : { id },
    include: unknownRelationshipTypeDraftInclude
  });
  if (!draft) {
    throw new Error("未知关系类型草稿不存在");
  }
  return draft;
}

export async function approveUnknownRelationshipTypeDraft(id: string, input: UnknownRelationshipTypeApproveInput) {
  const draft = await prisma.unknownRelationshipTypeDraft.findUnique({
    where : { id },
    select: { id: true, status: true }
  });
  if (!draft) {
    throw new Error("未知关系类型草稿不存在");
  }

  if (input.mode === "BIND_EXISTING") {
    const relationshipType = await prisma.relationshipTypeDefinition.findFirst({
      where : { code: input.relationshipTypeCode, status: "ACTIVE" },
      select: { code: true }
    });
    if (!relationshipType) {
      throw new Error("关系类型不存在或未启用");
    }

    await prisma.unknownRelationshipTypeDraft.update({
      where: { id },
      data : {
        status          : "APPROVED",
        approvedTypeCode: relationshipType.code
      }
    });
    return getUnknownRelationshipTypeDraft(id);
  }

  const createdType = await createRelationshipType(input.input);
  await prisma.unknownRelationshipTypeDraft.update({
    where: { id },
    data : {
      status          : "APPROVED",
      approvedTypeCode: createdType.code
    }
  });
  return getUnknownRelationshipTypeDraft(id);
}

export async function rejectUnknownRelationshipTypeDraft(id: string, rejectionReason?: string | null) {
  await prisma.unknownRelationshipTypeDraft.update({
    where: { id },
    data : {
      status         : "REJECTED",
      rejectionReason: rejectionReason?.trim() || null
    }
  });
  return getUnknownRelationshipTypeDraft(id);
}

export async function mergeUnknownRelationshipTypeDraft(id: string, targetDraftId: string) {
  if (id === targetDraftId) {
    throw new Error("不能合并到自身");
  }

  const target = await prisma.unknownRelationshipTypeDraft.findUnique({
    where : { id: targetDraftId },
    select: { id: true }
  });
  if (!target) {
    throw new Error("目标草稿不存在");
  }

  await prisma.unknownRelationshipTypeDraft.update({
    where: { id },
    data : {
      status           : "MERGED",
      mergedIntoDraftId: targetDraftId
    }
  });
  return getUnknownRelationshipTypeDraft(id);
}
