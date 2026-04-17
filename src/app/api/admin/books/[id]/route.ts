/**
 * =============================================================================
 * 文件定位：`src/app/api/admin/books/[id]/route.ts`
 * -----------------------------------------------------------------------------
 * Next.js 管理端路由处理器，提供"书籍基础字段"的读/改能力。
 *
 * 路由语义：
 * - `GET  /api/admin/books/:id` — 读取书籍三阶段管线所需的 typeCode 等基础字段；
 * - `PATCH /api/admin/books/:id` — 部分字段更新（当前仅 `typeCode`）。
 *
 * 设计说明：
 * - 该接口与既有 `PUT /api/admin/books/:id/model-strategy`（书籍级模型策略）
 *   解耦，避免把 BookTypeCode 写入到策略聚合体里引发语义混淆；
 * - Route Handler 仅负责鉴权、参数校验、错误映射；具体业务由服务层完成。
 *
 * 安全边界：
 * - 仅 ADMIN 可访问：BookType 切换会影响后续解析任务的阈值/Prompt 装配，
 *   误改可能导致识别质量波动。
 * =============================================================================
 */

import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { BookNotFoundError } from "@/server/modules/books/errors";
import { getBookById } from "@/server/modules/books/getBookById";
import { updateBookTypeCode } from "@/server/modules/books/updateBookTypeCode";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson, notFoundJson } from "../../model-strategy/_shared";
import { adminBookRouteParamsSchema, updateAdminBookBodySchema } from "./_shared";

/**
 * GET `/api/admin/books/:id`
 *
 * 返回书籍详情 DTO（`BookLibraryListItem`，包含 `typeCode`），供管理台详情页/编辑页使用。
 */
export async function GET(
  _: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const routePath = "/api/admin/books/[id]";

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const parsedParams = adminBookRouteParamsSchema.safeParse(await context.params);
    if (!parsedParams.success) {
      return badRequestJson(
        routePath,
        requestId,
        startedAt,
        parsedParams.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    const data = await getBookById(parsedParams.data.id);

    return okJson({
      path   : `/api/admin/books/${parsedParams.data.id}`,
      requestId,
      startedAt,
      code   : "ADMIN_BOOK_FETCHED",
      message: "书籍详情获取成功",
      data
    });
  } catch (error) {
    if (error instanceof BookNotFoundError) {
      return notFoundJson(
        `/api/admin/books/${error.bookId}`,
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
      fallbackMessage: "书籍详情获取失败"
    });
  }
}

/**
 * PATCH `/api/admin/books/:id`
 *
 * 当前支持字段：
 * - `typeCode`：写入 `Book.typeCode`（三阶段管线 BookType 分类）。
 *
 * 约束：
 * - 枚举非法值 → 400（由 zod 拦截）；
 * - 书籍不存在 → 404；
 * - 其他异常 → 500 统一兜底。
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const routePath = "/api/admin/books/[id]";

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const parsedParams = adminBookRouteParamsSchema.safeParse(await context.params);
    if (!parsedParams.success) {
      return badRequestJson(
        routePath,
        requestId,
        startedAt,
        parsedParams.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    const parsedBody = updateAdminBookBodySchema.safeParse(await readJsonBody(request));
    if (!parsedBody.success) {
      return badRequestJson(
        `/api/admin/books/${parsedParams.data.id}`,
        requestId,
        startedAt,
        parsedBody.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    const data = await updateBookTypeCode(parsedParams.data.id, parsedBody.data.typeCode);

    return okJson({
      path   : `/api/admin/books/${parsedParams.data.id}`,
      requestId,
      startedAt,
      code   : "ADMIN_BOOK_UPDATED",
      message: "书籍类型更新成功",
      data
    });
  } catch (error) {
    if (error instanceof BookNotFoundError) {
      return notFoundJson(
        `/api/admin/books/${error.bookId}`,
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
      fallbackMessage: "书籍更新失败"
    });
  }
}
