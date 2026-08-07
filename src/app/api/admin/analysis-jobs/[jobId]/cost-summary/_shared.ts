import { z } from "zod";

import { createApiMeta, errorResponse, toNextJson } from "@/server/http/api-response";
import { ERROR_CODES } from "@/types/api";

/**
 * ============================================================================
 * 文件定位：`src/app/api/admin/analysis-jobs/[jobId]/cost-summary/_shared.ts`
 * ----------------------------------------------------------------------------
 * v5 阶段 4（08-07-v5-skill-loading）：随 `model-strategy` 接口族删除，任务成本汇总路由
 * 所需的参数校验与错误响应辅助收敛到本文件，保持该路由自包含。
 * ============================================================================
 */

/** 任务成本汇总路由参数校验：jobId 必须是 UUID，防止非法字符串进入服务层查询。 */
export const costSummaryRouteParamsSchema = z.object({
  jobId: z.string().uuid("任务 ID 不合法")
});

/**
 * 功能：构造统一的 400 Bad Request 响应。
 * 输入：path、requestId、startedAt、detail、可选 message。
 * 输出：HTTP 400 响应。
 * 异常：无。
 * 副作用：无。
 */
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

/**
 * 功能：构造统一的 404 Not Found 响应。
 * 输入：path、requestId、startedAt、message、detail。
 * 输出：HTTP 404 响应。
 * 异常：无。
 * 副作用：无。
 */
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
