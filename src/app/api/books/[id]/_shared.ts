import { z } from "zod";

import { createApiMeta, errorResponse, toNextJson } from "@/server/http/api-response";
import { ERROR_CODES } from "@/types/api";

/** 书籍路由参数校验 Schema（`/api/books/:id`）。 */
export const bookRouteParamsSchema = z.object({
  /** 书籍主键 UUID。 */
  id: z.string().uuid("书籍 ID 不合法")
});

/** 动态路由上下文类型（Next.js Route Handler `context` 结构）。 */
export interface BookRouteParamsContext {
  /** 动态参数 Promise，resolve 后包含 `{ id: string }`。 */
  params: Promise<{ id: string }>;
}

/**
 * 功能：统一解析并校验 `bookId` 路由参数。
 * 输入：路由 `context`、路径标识、请求元信息（requestId/startedAt）。
 * 输出：成功返回 `{ bookId }`；失败返回 `{ response }`（400 标准错误响应）。
 * 异常：无（内部使用 `safeParse`，不抛 ZodError）。
 * 副作用：无。
 */
export async function parseBookIdFromRoute(
  context: BookRouteParamsContext,
  path: string,
  requestId: string,
  startedAt: number
): Promise<{ bookId: string } | { response: Response }> {
  const params = await context.params;
  const parsedResult = bookRouteParamsSchema.safeParse(params);

  if (!parsedResult.success) {
    const meta = createApiMeta(path, requestId, startedAt);
    return {
      response: toNextJson(
        errorResponse(
          ERROR_CODES.COMMON_BAD_REQUEST,
          "请求参数不合法",
          {
            type  : "ValidationError",
            detail: parsedResult.error.issues[0]?.message ?? "请求参数不合法"
          },
          meta
        ),
        400
      )
    };
  }

  return {
    bookId: parsedResult.data.id
  };
}
