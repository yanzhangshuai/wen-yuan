import { randomUUID } from "node:crypto";

import { z } from "zod";

import { parseBookIdFromRoute, type BookRouteParamsContext } from "@/app/api/books/[id]/_shared";
import { createApiMeta, errorResponse, toNextJson } from "@/server/http/api-response";
import { failJson, okJson } from "@/server/http/route-utils";
import { BookNotFoundError } from "@/server/modules/books/errors";
import { getBookGraph, type BookGraphSnapshot } from "@/server/modules/books/getBookGraph";
import { ERROR_CODES } from "@/types/api";

/**
 * ============================================================================
 * 文件定位：`src/app/api/books/[id]/graph/route.ts`
 * ----------------------------------------------------------------------------
 * 这是 Next.js App Router 的 Route Handler 文件。
 *
 * 框架语义：
 * - 文件名为 `route.ts` 且位于 `app/api/...` 下，Next.js 会将其注册为 HTTP 接口；
 * - 当前文件路径映射为：`GET /api/books/:id/graph`；
 * - `context.params` 为 Promise（App Router 约定），需 await 后再读动态参数。
 *
 * 业务职责：
 * - 返回单本书的人物关系图谱快照（节点/边）；
 * - 支持可选 `chapter` 参数，按章节上限裁剪图谱时间切片；
 * - 统一输出项目标准响应结构（okJson/failJson + meta）。
 *
 * 渲染与运行环境：
 * - 该文件运行在服务端（Node.js runtime）；
 * - 不直接参与页面渲染，但被页面/客户端服务层调用。
 *
 * 关键维护点：
 * - `chapter` 是业务筛选参数，不是分页参数；
 * - 书籍不存在返回 404，而不是空图，这是一条明确业务规则。
 * ============================================================================
 */

/** 图谱查询参数校验：chapter 可选，且必须是正整数。 */
const graphQuerySchema = z.object({
  /** 截止章节号（可选）；存在时表示“只看该章节及之前的数据”。 */
  chapter: z.coerce.number().int().positive("章节筛选参数不合法").optional()
});

/**
 * 功能：构造“书籍不存在”错误响应（图谱查询专用）。
 * 输入：requestId、startedAt、bookId。
 * 输出：HTTP 404 响应。
 * 异常：无。
 * 副作用：无。
 */
function notFoundJson(
  requestId: string,
  startedAt: number,
  bookId: string
) {
  // meta 里保留真实 bookId，方便日志检索与问题定位。
  const meta = createApiMeta(`/api/books/${bookId}/graph`, requestId, startedAt);
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
 * GET `/api/books/:id/graph`
 * 功能：获取指定书籍的人物图谱快照（节点/边/统计）。
 * 入参：
 * - 路由参数：`id`（书籍 UUID）；
 * - 查询参数：`chapter`（可选，按章节截断图谱）。
 * 返回：`BookGraphSnapshot` 标准成功响应。
 */
export async function GET(
  request: Request,
  context: BookRouteParamsContext
): Promise<Response> {
  // 每次请求生成 requestId，贯穿所有成功/失败响应，便于链路追踪。
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    // Step 1) 解析并校验动态路由参数 id（共享逻辑封装在 parseBookIdFromRoute）。
    const parsedBook = await parseBookIdFromRoute(context, "/api/books/:id/graph", requestId, startedAt);
    if ("response" in parsedBook) {
      // 解析失败时直接返回共享层生成的标准错误响应。
      return parsedBook.response;
    }

    // Step 2) 解析查询参数 chapter。
    const url = new URL(request.url);
    const parsedQuery = graphQuerySchema.safeParse({
      chapter: url.searchParams.get("chapter") ?? undefined
    });
    if (!parsedQuery.success) {
      // 业务上把无效 chapter 明确判定为 400，避免“悄悄忽略参数”引发用户误解。
      const meta = createApiMeta("/api/books/:id/graph", requestId, startedAt);
      return toNextJson(
        errorResponse(
          ERROR_CODES.COMMON_BAD_REQUEST,
          "请求参数不合法",
          {
            type  : "ValidationError",
            detail: parsedQuery.error.issues[0]?.message ?? "请求参数不合法"
          },
          meta
        ),
        400
      );
    }

    // Step 3) 调用领域服务获取图谱快照。
    const data = await getBookGraph({
      bookId : parsedBook.bookId,
      chapter: parsedQuery.data.chapter
    });

    // Step 4) 返回标准成功响应（含业务 code/message，便于前端统一提示）。
    return okJson<BookGraphSnapshot>({
      path   : `/api/books/${parsedBook.bookId}/graph`,
      requestId,
      startedAt,
      code   : "BOOK_GRAPH_FETCHED",
      message: "图谱数据获取成功",
      data
    });
  } catch (error) {
    if (error instanceof BookNotFoundError) {
      // 业务规则：不存在的书不返回空图，返回 404，提醒上游路由参数或数据状态异常。
      return notFoundJson(requestId, startedAt, error.bookId);
    }

    // 未知异常统一降级为 500，并保留 requestId 便于排查。
    return failJson({
      path           : "/api/books/:id/graph",
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "图谱数据获取失败"
    });
  }
}
