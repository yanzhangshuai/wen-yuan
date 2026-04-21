import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { failJson, okJson } from "@/server/http/route-utils";
import {
  reviewClaimDetailQuerySchema,
  reviewClaimRouteParamsSchema
} from "@/server/modules/review/evidence-review/review-api-schemas";
import { createReviewQueryService } from "@/server/modules/review/evidence-review/review-query-service";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson, notFoundJson } from "../../../_shared";

const PATH = "/api/admin/review/claims/[claimKind]/[claimId]";

/**
 * GET `/api/admin/review/claims/:claimKind/:claimId`
 * 功能：返回单条审核 claim 的 detail 视图，用于 evidence panel 与审计历史抽屉。
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ claimKind: string; claimId: string }> }
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const parsedParams = reviewClaimRouteParamsSchema.safeParse(await context.params);
    if (!parsedParams.success) {
      return badRequestJson(
        PATH,
        requestId,
        startedAt,
        parsedParams.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    const parsedQuery = reviewClaimDetailQuerySchema.safeParse({
      bookId: new URL(request.url).searchParams.get("bookId") ?? undefined
    });
    if (!parsedQuery.success) {
      return badRequestJson(
        PATH,
        requestId,
        startedAt,
        parsedQuery.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    const data = await createReviewQueryService().getClaimDetail({
      bookId   : parsedQuery.data.bookId,
      claimKind: parsedParams.data.claimKind,
      claimId  : parsedParams.data.claimId
    });

    if (data === null) {
      return notFoundJson(PATH, requestId, startedAt, "审核 claim 不存在");
    }

    return okJson({
      path   : `/api/admin/review/claims/${parsedParams.data.claimKind}/${parsedParams.data.claimId}`,
      requestId,
      startedAt,
      code   : "REVIEW_CLAIM_DETAIL_FETCHED",
      message: "审核 claim 详情获取成功",
      data
    });
  } catch (error) {
    return failJson({
      path           : PATH,
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "审核 claim 详情获取失败"
    });
  }
}
