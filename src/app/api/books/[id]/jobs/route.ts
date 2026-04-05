import { randomUUID } from "node:crypto";

import { parseBookIdFromRoute, type BookRouteParamsContext } from "@/app/api/books/[id]/_shared";
import { createApiMeta, errorResponse, toNextJson } from "@/server/http/api-response";
import { failJson, okJson } from "@/server/http/route-utils";
import { BookNotFoundError, listBookAnalysisJobs, type AnalysisJobListItem } from "@/server/modules/analysis/jobs/listBookAnalysisJobs";
import { ERROR_CODES } from "@/types/api";

/**
 * ============================================================================
 * 文件定位：`src/app/api/books/[id]/jobs/route.ts`
 * ----------------------------------------------------------------------------
 * Next.js Route Handler（`app/api/.../route.ts`）文件，对外暴露：
 * `GET /api/books/:id/jobs`
 *
 * 核心职责：
 * - 查询指定书籍的解析任务历史（通常按创建时间倒序）；
 * - 作为“管理台任务记录面板”的后端数据入口。
 *
 * 运行环境与链路位置：
 * - 服务端执行（Node.js）；
 * - 位于接口层，负责参数校验、错误语义映射、服务模块调用与响应封装。
 *
 * 业务边界：
 * - 不在本层做“任务状态机”判断，状态定义由分析任务模块维护；
 * - 本接口只负责“读”，不会产生数据库写入副作用。
 * ============================================================================
 */

/**
 * 构造“书籍不存在”场景的 404 响应。
 *
 * @param requestId 请求追踪 ID。
 * @param startedAt 请求开始时间戳。
 * @param bookId 触发错误的书籍 ID。
 */
function notFoundJson(
  requestId: string,
  startedAt: number,
  bookId: string
) {
  const meta = createApiMeta(`/api/books/${bookId}/jobs`, requestId, startedAt);
  return toNextJson(
    errorResponse(
      ERROR_CODES.COMMON_NOT_FOUND,
      "书籍不存在",
      {
        type  : "NotFoundError",
        detail: `Book not found: ${bookId}`
      },
      meta
    ),
    404
  );
}

/**
 * GET `/api/books/:id/jobs`
 *
 * @param _request Request 对象。当前无需读取请求体或查询参数，故占位未使用。
 * @param context 动态路由上下文，提供 `params.id`。
 * @returns
 * - 成功：解析任务列表 `AnalysisJobListItem[]`；
 * - 失败：参数错误 400 / 书籍缺失 404 / 未知异常 500。
 */
export async function GET(
  _request: Request,
  context: BookRouteParamsContext
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    // 第一步：统一参数校验（bookId 必须为 UUID）。
    // 这样做可以让所有 `/api/books/:id/*` 路由使用同一输入防线。
    const parsed = await parseBookIdFromRoute(context, "/api/books/:id/jobs", requestId, startedAt);
    if ("response" in parsed) {
      // 参数失败分支：直接返回共享模块构造的 400 响应。
      return parsed.response;
    }

    // 第二步：查询任务列表。
    // 业务语义：返回的是“该书历史任务集合”，用于运营定位重跑与失败原因。
    const data = await listBookAnalysisJobs(parsed.bookId);

    // 第三步：统一成功响应封装，保持前端消费契约稳定。
    return okJson<AnalysisJobListItem[]>({
      path   : `/api/books/${parsed.bookId}/jobs`,
      requestId,
      startedAt,
      code   : "BOOK_JOBS_FETCHED",
      message: "解析任务列表获取成功",
      data
    });
  } catch (error) {
    if (error instanceof BookNotFoundError) {
      // 业务实体缺失：说明 bookId 合法但无记录，语义上应返回 404。
      return notFoundJson(requestId, startedAt, error.bookId);
    }

    // 兜底错误：不可预期异常归类为内部错误。
    return failJson({
      path           : "/api/books/:id/jobs",
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "解析任务列表获取失败"
    });
  }
}
