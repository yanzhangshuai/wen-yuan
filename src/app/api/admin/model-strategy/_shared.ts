import { z } from "zod";

import { createApiMeta, errorResponse, toNextJson } from "@/server/http/api-response";
import { strategyStagesSchema } from "@/server/modules/analysis/dto/modelStrategy";
import { ERROR_CODES } from "@/types/api";

export const strategyRouteParamsSchema = z.object({
  id: z.string().uuid("书籍 ID 不合法")
});

export const costSummaryRouteParamsSchema = z.object({
  jobId: z.string().uuid("任务 ID 不合法")
});

export const upsertStrategyBodySchema = z.object({
  stages: strategyStagesSchema
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
