import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import {
  safeParseReviewManualClaimDraft,
  reviewClaimActionRequestSchema,
  reviewClaimDetailQuerySchema,
  reviewClaimRouteParamsSchema,
  reviewManualClaimKindSchema
} from "@/server/modules/review/evidence-review/review-api-schemas";
import { createReviewMutationService } from "@/server/modules/review/evidence-review/review-mutation-service";
import { getAuthContext, requireAdminActorUserId } from "@/server/modules/auth";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson } from "../../../../_shared";

const PATH = "/api/admin/review/claims/[claimKind]/[claimId]/actions";

/**
 * POST `/api/admin/review/claims/:claimKind/:claimId/actions`
 * 功能：执行审核动作，包括 accept/reject/defer/edit/relink evidence。
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ claimKind: string; claimId: string }> }
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    const actorUserId = requireAdminActorUserId(auth);

    const parsedParams = reviewClaimRouteParamsSchema.safeParse(await context.params);
    if (!parsedParams.success) {
      return badRequestJson(
        PATH,
        requestId,
        startedAt,
        parsedParams.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    const parsedBody = reviewClaimActionRequestSchema.safeParse(await readJsonBody(request));
    if (!parsedBody.success) {
      return badRequestJson(
        PATH,
        requestId,
        startedAt,
        parsedBody.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    const service = createReviewMutationService();
    const { claimKind, claimId } = parsedParams.data;
    const { bookId } = parsedBody.data;

    if (parsedBody.data.action === "EDIT") {
      const manualKindResult = reviewManualClaimKindSchema.safeParse(claimKind);
      if (!manualKindResult.success) {
        return badRequestJson(
          PATH,
          requestId,
          startedAt,
          "Only manual-override claim kinds support EDIT or RELINK_EVIDENCE"
        );
      }

      const parsedDraft = safeParseReviewManualClaimDraft(
        manualKindResult.data,
        parsedBody.data.draft
      );
      if (!parsedDraft.success) {
        return badRequestJson(
          PATH,
          requestId,
          startedAt,
          parsedDraft.error.issues[0]?.message ?? "请求参数不合法"
        );
      }

      const parsedDraftBookId = reviewClaimDetailQuerySchema.safeParse({
        bookId: parsedDraft.data.bookId
      });
      if (!parsedDraftBookId.success) {
        return badRequestJson(
          PATH,
          requestId,
          startedAt,
          parsedDraftBookId.error.issues[0]?.message ?? "请求参数不合法"
        );
      }

      if (parsedDraftBookId.data.bookId !== bookId) {
        return badRequestJson(PATH, requestId, startedAt, "bookId must match draft.bookId");
      }

      await service.editClaim({
        bookId,
        claimKind: manualKindResult.data,
        claimId,
        draft    : parsedDraft.data,
        note     : parsedBody.data.note ?? null,
        actorUserId
      });
    } else if (parsedBody.data.action === "RELINK_EVIDENCE") {
      const manualKindResult = reviewManualClaimKindSchema.safeParse(claimKind);
      if (!manualKindResult.success) {
        return badRequestJson(
          PATH,
          requestId,
          startedAt,
          "Only manual-override claim kinds support EDIT or RELINK_EVIDENCE"
        );
      }

      await service.relinkEvidence({
        bookId,
        claimKind      : manualKindResult.data,
        claimId,
        evidenceSpanIds: parsedBody.data.evidenceSpanIds,
        note           : parsedBody.data.note ?? null,
        actorUserId
      });
    } else {
      await service.applyClaimAction({
        bookId,
        claimKind,
        claimId,
        action: parsedBody.data.action,
        note  : parsedBody.data.note ?? null,
        actorUserId
      });
    }

    return okJson({
      path   : `/api/admin/review/claims/${claimKind}/${claimId}/actions`,
      requestId,
      startedAt,
      code   : "REVIEW_CLAIM_ACTION_APPLIED",
      message: "审核动作已执行",
      data   : {
        claimKind,
        claimId,
        action: parsedBody.data.action
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Only manual-override claim kinds support EDIT or RELINK_EVIDENCE") {
      return badRequestJson(PATH, requestId, startedAt, error.message);
    }

    return failJson({
      path           : PATH,
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "审核动作执行失败"
    });
  }
}
