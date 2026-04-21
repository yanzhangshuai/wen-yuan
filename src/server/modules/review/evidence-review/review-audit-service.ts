import { Prisma } from "@/generated/prisma/client";
import type { ClaimKind, ReviewAction } from "@/generated/prisma/enums";
import { prisma } from "@/server/db/prisma";

export interface LogClaimActionInput {
  bookId          : string;
  claimKind       : ClaimKind;
  claimId         : string;
  actorUserId     : string;
  action          : ReviewAction;
  beforeState     : Record<string, unknown> | null;
  afterState      : Record<string, unknown> | null;
  note?           : string | null;
  evidenceSpanIds?: string[];
  personaId?      : string | null;
}

export interface LogPersonaActionInput {
  bookId          : string;
  personaId       : string;
  actorUserId     : string;
  action          : ReviewAction;
  beforeState     : Record<string, unknown> | null;
  afterState      : Record<string, unknown> | null;
  note?           : string | null;
  evidenceSpanIds?: string[];
  claimKind?      : ClaimKind | null;
  claimId?        : string | null;
}

export interface ListAuditTrailInput {
  claimKind?: ClaimKind;
  claimId?  : string;
  personaId?: string;
}

function requireActorUserId(actorUserId: string): string {
  const trimmed = actorUserId.trim();

  if (trimmed.length === 0) {
    throw new Error("review audit actorUserId is required");
  }

  return trimmed;
}

/**
 * 统一在审计层规整证据跨度，确保不同 mutation 入口写出的审计行具备稳定可比较的证据顺序。
 */
function normalizeEvidenceSpanIds(evidenceSpanIds?: string[]): string[] {
  return Array.from(new Set(evidenceSpanIds ?? [])).sort();
}

function toAuditJsonState(
  state: Record<string, unknown> | null
): Prisma.NullableJsonNullValueInput | Prisma.InputJsonObject {
  return state === null ? Prisma.DbNull : (state as Prisma.InputJsonObject);
}

/**
 * review mutation 的审计写入口。
 * 这里故意只封装 `review_audit_logs` 的最小读写契约，后续 route/query/mutation 统一复用，
 * 以保证 actor 归因、证据顺序和 before/after 快照格式在所有写路径上一致。
 */
export function createReviewAuditService(prismaClient = prisma) {
  return {
    async logClaimAction(input: LogClaimActionInput) {
      return prismaClient.reviewAuditLog.create({
        data: {
          bookId         : input.bookId,
          claimKind      : input.claimKind,
          claimId        : input.claimId,
          personaId      : input.personaId ?? null,
          action         : input.action,
          actorUserId    : requireActorUserId(input.actorUserId),
          beforeState    : toAuditJsonState(input.beforeState),
          afterState     : toAuditJsonState(input.afterState),
          note           : input.note ?? null,
          evidenceSpanIds: normalizeEvidenceSpanIds(input.evidenceSpanIds)
        }
      });
    },

    async logPersonaAction(input: LogPersonaActionInput) {
      return prismaClient.reviewAuditLog.create({
        data: {
          bookId         : input.bookId,
          claimKind      : input.claimKind ?? null,
          claimId        : input.claimId ?? null,
          personaId      : input.personaId,
          action         : input.action,
          actorUserId    : requireActorUserId(input.actorUserId),
          beforeState    : toAuditJsonState(input.beforeState),
          afterState     : toAuditJsonState(input.afterState),
          note           : input.note ?? null,
          evidenceSpanIds: normalizeEvidenceSpanIds(input.evidenceSpanIds)
        }
      });
    },

    async listAuditTrail(input: ListAuditTrailInput) {
      return prismaClient.reviewAuditLog.findMany({
        where: {
          ...(input.claimKind ? { claimKind: input.claimKind } : {}),
          ...(input.claimId ? { claimId: input.claimId } : {}),
          ...(input.personaId ? { personaId: input.personaId } : {})
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }]
      });
    }
  };
}

export const reviewAuditService = createReviewAuditService();
