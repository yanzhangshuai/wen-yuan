import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { reviewRelationEditorQuerySchema } from "@/server/modules/review/evidence-review/review-api-schemas";
import { createReviewQueryService } from "@/server/modules/review/evidence-review/review-query-service";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson } from "../_shared";

const PATH = "/api/admin/review/relations";

function toOptionalStringArray(searchParams: URLSearchParams, key: string): string[] | undefined {
  const values = searchParams
    .getAll(key)
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  return values.length > 0 ? values : undefined;
}

function buildRelationEditorQuery(searchParams: URLSearchParams) {
  return {
    bookId          : searchParams.get("bookId") ?? undefined,
    personaId       : searchParams.get("personaId") ?? undefined,
    pairPersonaId   : searchParams.get("pairPersonaId") ?? undefined,
    relationTypeKeys: toOptionalStringArray(searchParams, "relationTypeKeys"),
    reviewStates    : toOptionalStringArray(searchParams, "reviewStates"),
    conflictState   : searchParams.get("conflictState") ?? undefined,
    limitPairs      : searchParams.get("limitPairs") ?? undefined,
    offsetPairs     : searchParams.get("offsetPairs") ?? undefined
  };
}

/**
 * GET `/api/admin/review/relations`
 * 功能：返回 claim-first 的人物关系审核视图，用于 pair list 与 selected pair 首屏加载。
 */
export async function GET(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const parsedQuery = reviewRelationEditorQuerySchema.safeParse(
      buildRelationEditorQuery(new URL(request.url).searchParams)
    );
    if (!parsedQuery.success) {
      return badRequestJson(
        PATH,
        requestId,
        startedAt,
        parsedQuery.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    const data = await createReviewQueryService().getRelationEditorView(parsedQuery.data);

    return okJson({
      path   : PATH,
      requestId,
      startedAt,
      code   : "REVIEW_RELATION_EDITOR_FETCHED",
      message: "人物关系审核视图获取成功",
      data
    });
  } catch (error) {
    return failJson({
      path           : PATH,
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "人物关系审核视图获取失败"
    });
  }
}
