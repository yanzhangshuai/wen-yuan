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
 * ============================================================================
 * 文件定位：`src/app/api/admin/books/[id]/model-strategy/route.ts`
 * ----------------------------------------------------------------------------
 * Next.js 管理端路由处理器，提供“书籍级模型策略”的查询与保存能力。
 *
 * 路由约定与语义：
 * - 文件名 `route.ts` + 路径 `app/api/admin/books/[id]/model-strategy`，
 *   对应接口 `/api/admin/books/:id/model-strategy`；
 * - 暴露两个 HTTP 方法：
 *   - `GET`：读取当前书籍绑定的模型策略；
 *   - `PUT`：覆盖保存当前书籍的阶段模型策略。
 *
 * 在系统中的职责：
 * - 属于“接口层 + 管理鉴权边界”；
 * - 负责鉴权、参数校验、请求体校验、业务异常映射；
 * - 具体策略读取/落库存储由 `modelStrategyAdminService` 负责。
 *
 * 安全边界（业务规则，不是技术限制）：
 * - 仅管理员可访问，普通用户即使知道 URL 也不可读写策略；
 * - 该策略会影响后续任务模型选择，误改可能导致成本与质量波动。
 * ============================================================================
 */

/**
 * GET `/api/admin/books/:id/model-strategy`
 *
 * @param _ Request 对象。该方法不读取请求体，保留参数以匹配 Next.js 签名。
 * @param context 动态路由上下文，包含 `params.id`。
 * @returns
 * - 成功：当前书籍策略（或 null）；
 * - 失败：参数错误 400、书籍不存在 404、未知错误 500。
 */
export async function GET(
  _: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const routePath = "/api/admin/books/[id]/model-strategy";

  try {
    // 第一步：鉴权 + 权限校验。
    // 使用 next/headers() 读取当前请求头，确保在服务端上下文中获取会话信息。
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    // 第二步：校验路由参数。
    // 这里使用 safeParse 而不是 parse，目的是把校验失败转成可控 400 响应。
    const parsedParams = strategyRouteParamsSchema.safeParse(await context.params);
    if (!parsedParams.success) {
      return badRequestJson(
        routePath,
        requestId,
        startedAt,
        parsedParams.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    // 第三步：查询书籍策略（可能为 null，表示尚未配置书籍级覆盖策略）。
    const data = await getBookStrategy(parsedParams.data.id);

    // 第四步：返回标准成功响应。
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
      // 业务分支：参数合法但目标书籍不存在。
      return notFoundJson(
        `/api/admin/books/${error.bookId}/model-strategy`,
        requestId,
        startedAt,
        "书籍不存在",
        error.message
      );
    }

    // 兜底分支：不可预期异常统一返回 500。
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
 *
 * 业务语义：
 * - 按请求体里的 `stages` 保存“书籍级覆盖策略”；
 * - 后续该书触发分析任务时，会优先使用这里配置的模型参数。
 *
 * @param request Request 对象，包含 JSON 请求体。
 * @param context 动态路由上下文，包含 `params.id`。
 * @returns
 * - 成功：保存后的策略记录；
 * - 失败：400（参数或策略内容校验失败）/404（书籍不存在）/500（其他错误）。
 */
export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const routePath = "/api/admin/books/[id]/model-strategy";

  try {
    // 第一步：鉴权与管理员校验。
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    // 第二步：校验路由参数中的书籍 ID。
    const parsedParams = strategyRouteParamsSchema.safeParse(await context.params);
    if (!parsedParams.success) {
      return badRequestJson(
        routePath,
        requestId,
        startedAt,
        parsedParams.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    // 第三步：读取请求体并校验策略结构。
    // 防御目的：避免非法阶段名或非法模型参数写入数据库，污染后续任务配置。
    const parsedBody = upsertStrategyBodySchema.safeParse(await readJsonBody(request));
    if (!parsedBody.success) {
      return badRequestJson(
        `/api/admin/books/${parsedParams.data.id}/model-strategy`,
        requestId,
        startedAt,
        parsedBody.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    // 第四步：持久化策略。
    // 注意：这里是覆盖式保存，调用方应提交完整的 stages 视图状态。
    const data = await saveBookStrategy(parsedParams.data.id, parsedBody.data.stages);

    // 第五步：返回保存结果，供前端提示“保存成功”并刷新本地状态。
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
      // 业务实体不存在。
      return notFoundJson(
        `/api/admin/books/${error.bookId}/model-strategy`,
        requestId,
        startedAt,
        "书籍不存在",
        error.message
      );
    }

    if (error instanceof ModelStrategyValidationError) {
      // 业务校验失败（例如阶段策略组合冲突）归类为 400，而非 500。
      return badRequestJson(routePath, requestId, startedAt, error.message, error.message);
    }

    // 未知异常兜底。
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
