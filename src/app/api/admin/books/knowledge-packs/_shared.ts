import { z } from "zod";

import { createApiMeta, errorResponse, toNextJson } from "@/server/http/api-response";
import { ERROR_CODES } from "@/types/api";

export const bookKnowledgeRouteParamsSchema = z.object({
  id: z.string().uuid("书籍 ID 不合法")
});

export const bookKnowledgePackRouteParamsSchema = z.object({
  id    : z.string().uuid("书籍 ID 不合法"),
  packId: z.string().uuid("知识包 ID 不合法")
});

export const mountBookKnowledgePackBodySchema = z.object({
  packId  : z.string().uuid("知识包 ID 不合法"),
  priority: z.number().int().default(0)
});

export const updateBookKnowledgePackPriorityBodySchema = z.object({
  priority: z.number().int("priority 必须为整数")
});

export function badRequestJson(
  path: string,
  requestId: string,
  startedAt: number,
  detail: string,
  message = "请求参数不合法"
): Response {
  const meta = createApiMeta(path, requestId, startedAt);
  return toNextJson(
    errorResponse(
      ERROR_CODES.COMMON_BAD_REQUEST,
      message,
      {
        type: "ValidationError",
        detail
      },
      meta
    ),
    400
  );
}

export function notFoundJson(
  path: string,
  requestId: string,
  startedAt: number,
  message: string,
  detail: string
): Response {
  const meta = createApiMeta(path, requestId, startedAt);
  return toNextJson(
    errorResponse(
      ERROR_CODES.COMMON_NOT_FOUND,
      message,
      {
        type: "NotFoundError",
        detail
      },
      meta
    ),
    404
  );
}
