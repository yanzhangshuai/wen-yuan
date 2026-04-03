import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import {
  getBookStrategy,
  ModelStrategyValidationError,
  saveBookStrategy
} from "@/server/modules/analysis/services/modelStrategyAdminService";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { BookNotFoundError } from "@/server/modules/books/errors";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson, notFoundJson, strategyRouteParamsSchema, upsertStrategyBodySchema } from "../../../model-strategy/_shared";

/**
 * GET `/api/admin/books/:id/model-strategy`
 * 功能：查询书籍级模型策略（管理员鉴权）。
 */
export async function GET(
  _: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const routePath = "/api/admin/books/[id]/model-strategy";

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const parsedParams = strategyRouteParamsSchema.safeParse(await context.params);
    if (!parsedParams.success) {
      return badRequestJson(
        routePath,
        requestId,
        startedAt,
        parsedParams.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    const data = await getBookStrategy(parsedParams.data.id);
    return okJson({
      path   : `/api/admin/books/${parsedParams.data.id}/model-strategy`,
      requestId,
      startedAt,
      code   : "ADMIN_BOOK_MODEL_STRATEGY_FETCHED",
      message: "书籍模型策略获取成功",
      data
    });
  } catch (error) {
    if (error instanceof BookNotFoundError) {
      return notFoundJson(
        `/api/admin/books/${error.bookId}/model-strategy`,
        requestId,
        startedAt,
        "书籍不存在",
        error.message
      );
    }

    return failJson({
      path           : routePath,
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "书籍模型策略获取失败"
    });
  }
}

/**
 * PUT `/api/admin/books/:id/model-strategy`
 * 功能：保存书籍级模型策略（管理员鉴权）。
 */
export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const routePath = "/api/admin/books/[id]/model-strategy";

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const parsedParams = strategyRouteParamsSchema.safeParse(await context.params);
    if (!parsedParams.success) {
      return badRequestJson(
        routePath,
        requestId,
        startedAt,
        parsedParams.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    const parsedBody = upsertStrategyBodySchema.safeParse(await readJsonBody(request));
    if (!parsedBody.success) {
      return badRequestJson(
        `/api/admin/books/${parsedParams.data.id}/model-strategy`,
        requestId,
        startedAt,
        parsedBody.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    const data = await saveBookStrategy(parsedParams.data.id, parsedBody.data.stages);
    return okJson({
      path   : `/api/admin/books/${parsedParams.data.id}/model-strategy`,
      requestId,
      startedAt,
      code   : "ADMIN_BOOK_MODEL_STRATEGY_SAVED",
      message: "书籍模型策略保存成功",
      data
    });
  } catch (error) {
    if (error instanceof BookNotFoundError) {
      return notFoundJson(
        `/api/admin/books/${error.bookId}/model-strategy`,
        requestId,
        startedAt,
        "书籍不存在",
        error.message
      );
    }

    if (error instanceof ModelStrategyValidationError) {
      return badRequestJson(routePath, requestId, startedAt, error.message, error.message);
    }

    return failJson({
      path           : routePath,
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "书籍模型策略保存失败"
    });
  }
}
