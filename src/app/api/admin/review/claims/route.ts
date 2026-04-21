import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import {
  reviewClaimListQuerySchema,
  reviewCreateManualClaimRequestSchema,
  safeParseReviewManualClaimDraft
} from "@/server/modules/review/evidence-review/review-api-schemas";
import { createReviewMutationService } from "@/server/modules/review/evidence-review/review-mutation-service";
import { createReviewQueryService } from "@/server/modules/review/evidence-review/review-query-service";
import { getAuthContext, requireAdmin, requireAdminActorUserId } from "@/server/modules/auth";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson } from "../_shared";

const PATH = "/api/admin/review/claims";

function toOptionalStringArray(searchParams: URLSearchParams, key: string): string[] | undefined {
  const values = searchParams
    .getAll(key)
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  return values.length > 0 ? values : undefined;
}

function buildClaimListQuery(searchParams: URLSearchParams) {
  return {
    bookId       : searchParams.get("bookId") ?? undefined,
    claimKinds   : toOptionalStringArray(searchParams, "claimKinds"),
    reviewStates : toOptionalStringArray(searchParams, "reviewStates"),
    sources      : toOptionalStringArray(searchParams, "sources"),
    personaId    : searchParams.get("personaId") ?? undefined,
    chapterId    : searchParams.get("chapterId") ?? undefined,
    timeLabel    : searchParams.get("timeLabel") ?? undefined,
    conflictState: searchParams.get("conflictState") ?? undefined,
    limit        : searchParams.get("limit") ?? undefined,
    offset       : searchParams.get("offset") ?? undefined
  };
}

/**
 * GET `/api/admin/review/claims`
 * 功能：返回审核 claim 列表，供矩阵页和筛选面板直接消费。
 */
export async function GET(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const parsedQuery = reviewClaimListQuerySchema.safeParse(
      buildClaimListQuery(new URL(request.url).searchParams)
    );
    if (!parsedQuery.success) {
      return badRequestJson(
        PATH,
        requestId,
        startedAt,
        parsedQuery.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    const data = await createReviewQueryService().listClaims(parsedQuery.data);

    return okJson({
      path   : PATH,
      requestId,
      startedAt,
      code   : "REVIEW_CLAIMS_LISTED",
      message: "审核 claim 列表获取成功",
      data
    });
  } catch (error) {
    return failJson({
      path           : PATH,
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "审核 claim 列表获取失败"
    });
  }
}

/**
 * POST `/api/admin/review/claims`
 * 功能：创建人工 claim，作为审核面板下的手工补录入口。
 */
export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    const actorUserId = requireAdminActorUserId(auth);

    const parsedBody = reviewCreateManualClaimRequestSchema.safeParse(await readJsonBody(request));
    if (!parsedBody.success) {
      return badRequestJson(
        PATH,
        requestId,
        startedAt,
        parsedBody.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    const parsedDraft = safeParseReviewManualClaimDraft(
      parsedBody.data.claimKind,
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

    const data = await createReviewMutationService().createManualClaim({
      claimKind: parsedBody.data.claimKind,
      draft    : parsedDraft.data,
      note     : parsedBody.data.note ?? null,
      actorUserId
    });

    return okJson({
      path   : PATH,
      requestId,
      startedAt,
      code   : "REVIEW_MANUAL_CLAIM_CREATED",
      message: "人工 claim 创建成功",
      data
    });
  } catch (error) {
    return failJson({
      path           : PATH,
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "人工 claim 创建失败"
    });
  }
}
