import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { reviewPersonaChapterMatrixQuerySchema } from "@/server/modules/review/evidence-review/review-api-schemas";
import { createReviewQueryService } from "@/server/modules/review/evidence-review/review-query-service";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson } from "../_shared";

const PATH = "/api/admin/review/persona-chapter-matrix";

function toOptionalStringArray(searchParams: URLSearchParams, key: string): string[] | undefined {
  const values = searchParams
    .getAll(key)
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  return values.length > 0 ? values : undefined;
}

function buildPersonaChapterMatrixQuery(searchParams: URLSearchParams) {
  return {
    bookId        : searchParams.get("bookId") ?? undefined,
    personaId     : searchParams.get("personaId") ?? undefined,
    chapterId     : searchParams.get("chapterId") ?? undefined,
    reviewStates  : toOptionalStringArray(searchParams, "reviewStates"),
    conflictState : searchParams.get("conflictState") ?? undefined,
    limitPersonas : searchParams.get("limitPersonas") ?? undefined,
    offsetPersonas: searchParams.get("offsetPersonas") ?? undefined
  };
}

/**
 * GET `/api/admin/review/persona-chapter-matrix`
 * 功能：返回人物 x 章节审核矩阵摘要，供审核首页首屏加载与筛选刷新复用。
 */
export async function GET(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const parsedQuery = reviewPersonaChapterMatrixQuerySchema.safeParse(
      buildPersonaChapterMatrixQuery(new URL(request.url).searchParams)
    );
    if (!parsedQuery.success) {
      return badRequestJson(
        PATH,
        requestId,
        startedAt,
        parsedQuery.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    const data = await createReviewQueryService().getPersonaChapterMatrix(parsedQuery.data);

    return okJson({
      path   : PATH,
      requestId,
      startedAt,
      code   : "REVIEW_PERSONA_CHAPTER_MATRIX_FETCHED",
      message: "人物章节审核矩阵获取成功",
      data
    });
  } catch (error) {
    return failJson({
      path           : PATH,
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "人物章节审核矩阵获取失败"
    });
  }
}
