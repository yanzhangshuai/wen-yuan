/**
 * =============================================================================
 * 文件定位（Next.js Route Handler：单本书籍读写接口）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/app/api/books/[id]/route.ts`
 *
 * Next.js 约定行为：
 * - 动态段 `[id]` 绑定书籍 ID；
 * - 同一 `route.ts` 内通过 `GET`/`DELETE` 导出函数映射不同 HTTP 方法。
 *
 * 业务职责：
 * 1) `GET`：读取单本书籍详情给管理端；
 * 2) `DELETE`：执行书籍删除（含关联资源处理，由下游 service 实现）。
 *
 * 上下游：
 * - 上游：管理后台书籍详情与列表操作；
 * - 下游：`getBookById`、`deleteBook` 领域服务。
 *
 * 注意：
 * - 书籍删除影响范围通常较广（章节/人物/关系/分析任务），接口层必须维持严格鉴权；
 * - 404 语义是业务契约，前端据此决定提示文案与刷新策略。
 * =============================================================================
 */
import { randomUUID } from "node:crypto";

import { parseBookIdFromRoute, type BookRouteParamsContext } from "@/app/api/books/[id]/_shared";
import { createApiMeta, errorResponse, toNextJson } from "@/server/http/api-response";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { deleteBook, type DeleteBookResult } from "@/server/modules/books/deleteBook";
import { BookNotFoundError } from "@/server/modules/books/errors";
import { getBookById } from "@/server/modules/books/getBookById";
import { type BookLibraryListItem } from "@/types/book";
import { ERROR_CODES } from "@/types/api";

/**
 * 功能：构造“书籍不存在”的标准错误响应。
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
  const meta = createApiMeta(`/api/books/${bookId}`, requestId, startedAt);
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
 * GET `/api/books/:id`
 * 功能：获取单本书籍详情（供书库详情/图谱入口等页面使用）。
 * 入参：
 * - `context.params.id`：书籍 ID（UUID）。
 * 返回：`BookLibraryListItem` 标准成功响应。
 */
export async function GET(
  _request: Request,
  context: BookRouteParamsContext
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const parsed = await parseBookIdFromRoute(context, "/api/books/:id", requestId, startedAt);
    if ("response" in parsed) {
      return parsed.response;
    }

    const data = await getBookById(parsed.bookId);
    return okJson<BookLibraryListItem>({
      path   : `/api/books/${parsed.bookId}`,
      requestId,
      startedAt,
      code   : "BOOK_FETCHED",
      message: "书籍详情获取成功",
      data
    });
  } catch (error) {
    if (error instanceof BookNotFoundError) {
      return notFoundJson(requestId, startedAt, error.bookId);
    }

    return failJson({
      path           : "/api/books/:id",
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "书籍详情获取失败"
    });
  }
}

/**
 * DELETE `/api/books/:id`
 * 功能：删除书籍（管理员操作，软删除策略由服务层实现）。
 * 入参：
 * - 请求头登录态（需 `admin`）；
 * - `context.params.id`：书籍 ID（UUID）。
 * 返回：`DeleteBookResult` 标准成功响应。
 */
export async function DELETE(
  request: Request,
  context: BookRouteParamsContext
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(request.headers);
    requireAdmin(auth);

    const parsed = await parseBookIdFromRoute(context, "/api/books/:id", requestId, startedAt);
    if ("response" in parsed) {
      return parsed.response;
    }

    const data = await deleteBook(parsed.bookId);
    return okJson<DeleteBookResult>({
      path   : `/api/books/${parsed.bookId}`,
      requestId,
      startedAt,
      code   : "BOOK_DELETED",
      message: "书籍删除成功",
      data
    });
  } catch (error) {
    if (error instanceof BookNotFoundError) {
      return notFoundJson(requestId, startedAt, error.bookId);
    }

    return failJson({
      path           : "/api/books/:id",
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "书籍删除失败"
    });
  }
}
