import { randomUUID } from "node:crypto";

import { parseBookIdFromRoute, type BookRouteParamsContext } from "@/app/api/books/[id]/_shared";
import { createApiMeta, errorResponse, toNextJson } from "@/server/http/api-response";
import { failJson, okJson } from "@/server/http/route-utils";
import { BookNotFoundError, getBookStatus, type BookStatusSnapshot } from "@/server/modules/books/getBookStatus";
import { ERROR_CODES } from "@/types/api";

/**
 * ============================================================================
 * 文件定位：`src/app/api/books/[id]/status/route.ts`
 * ----------------------------------------------------------------------------
 * 这是 Next.js App Router 下的 Route Handler 文件。
 *
 * 框架语义：
 * - 文件名为 `route.ts` 且位于 `app/api/...`，会被 Next.js 注册为 HTTP 接口；
 * - 当前路径对应 `GET /api/books/:id/status`；
 * - 运行环境为服务端（Node.js），不参与客户端打包。
 *
 * 业务职责：
 * - 返回书籍解析流程的“状态快照”：
 *   包含状态机阶段、进度百分比、错误摘要与可选章节状态；
 * - 被管理台书籍详情页的“解析进度面板”轮询调用，用于驱动 UI 实时刷新。
 *
 * 上下游关系：
 * - 上游输入：动态路由参数 `:id`（书籍主键）；
 * - 下游输出：标准 API 响应，数据源来自 `getBookStatus` 服务模块。
 *
 * 异常语义约定：
 * - 参数非法 -> 400（由 `parseBookIdFromRoute` 统一处理）；
 * - 书籍不存在 -> 404（业务实体缺失）；
 * - 其他未预期错误 -> 500（服务端故障兜底）。
 * ============================================================================
 */

/**
 * 构造“书籍不存在”错误响应（状态查询接口专用）。
 *
 * 为什么单独封装：
 * - 404 是该接口的高频业务分支（例如前端引用了已删除书籍）；
 * - 统一 `path/requestId/startedAt` 元信息，便于日志链路追踪。
 *
 * @param requestId 请求追踪 ID，用于跨层日志关联。
 * @param startedAt 请求开始时间戳，用于监控耗时。
 * @param bookId 触发错误的书籍 ID（用于 detail 定位问题）。
 */
function notFoundJson(
  requestId: string,
  startedAt: number,
  bookId: string
) {
  const meta = createApiMeta(`/api/books/${bookId}/status`, requestId, startedAt);
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
 * GET `/api/books/:id/status`
 *
 * 该函数在业务流程中的位置：
 * - 属于“接口层查询入口”，负责参数解析、错误分流、调用服务模块并封装响应；
 * - 不包含复杂业务计算，核心计算在 `getBookStatus`。
 *
 * @param _request HTTP 请求对象。当前接口不读取 query/body，故命名为 `_request` 表示有意未使用。
 * @param context Next.js 注入的动态路由上下文，包含 `params.id`。
 * @returns 标准 JSON Response：
 * - 成功：`BookStatusSnapshot`；
 * - 失败：按错误类型返回 400/404/500。
 */
export async function GET(
  _request: Request,
  context: BookRouteParamsContext
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    // 第一步：解析并校验书籍 ID。
    // 设计原因：把所有参数合法性检查前置，防止脏输入进入服务层。
    const parsed = await parseBookIdFromRoute(context, "/api/books/:id/status", requestId, startedAt);
    if ("response" in parsed) {
      // 分支说明：
      // `parseBookIdFromRoute` 在失败时直接返回可响应对象，路由层立即返回即可。
      // 这是“共享参数网关”模式，避免每个路由重复写 400 逻辑。
      return parsed.response;
    }

    // 第二步：查询书籍解析状态快照。
    // 这里调用的是服务模块，路由层只做编排，不承载数据组装细节。
    const data = await getBookStatus(parsed.bookId);

    // 第三步：返回标准成功响应。
    // path 使用实际 bookId，便于日志与监控按实体聚合查询。
    return okJson<BookStatusSnapshot>({
      path   : `/api/books/${parsed.bookId}/status`,
      requestId,
      startedAt,
      code   : "BOOK_STATUS_FETCHED",
      message: "书籍状态获取成功",
      data
    });
  } catch (error) {
    if (error instanceof BookNotFoundError) {
      // 业务分支：参数合法但实体不存在，返回 404 而非 500。
      return notFoundJson(requestId, startedAt, error.bookId);
    }

    // 兜底分支：未知异常统一按 500 返回，避免泄露内部细节。
    return failJson({
      path           : "/api/books/:id/status",
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "书籍状态获取失败"
    });
  }
}
