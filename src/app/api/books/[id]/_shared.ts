import { z } from "zod";

import { createApiMeta, errorResponse, toNextJson } from "@/server/http/api-response";
import { ERROR_CODES } from "@/types/api";

export const bookRouteParamsSchema = z.object({
  id: z.string().uuid("书籍 ID 不合法")
});

export interface BookRouteParamsContext {
  params: Promise<{ id: string }>;
}

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

