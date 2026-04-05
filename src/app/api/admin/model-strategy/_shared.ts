import { z } from "zod";

import { createApiMeta, errorResponse, toNextJson } from "@/server/http/api-response";
import { strategyStagesSchema } from "@/server/modules/analysis/dto/modelStrategy";
import { ERROR_CODES } from "@/types/api";

/**
 * ============================================================================
 * 文件定位：`src/app/api/admin/model-strategy/_shared.ts`
 * ----------------------------------------------------------------------------
 * 这是管理端“模型策略相关接口”的共享校验与错误响应模块。
 *
 * 在 Next.js 中的角色：
 * - 非 `route.ts` 文件，不直接对外暴露路由；
 * - 被 `/api/admin/model-strategy/*` 与 `/api/admin/books/:id/model-strategy` 等路由复用；
 * - 运行于服务端请求链路，用于统一参数校验与错误响应结构。
 *
 * 业务价值：
 * - 保证不同接口在“坏请求/资源不存在”场景下返回同构 JSON；
 * - 让前端管理页能够使用统一错误处理逻辑，不必按接口写分支；
 * - 把校验规则集中管理，避免多个路由出现规则漂移。
 * ============================================================================
 */

/**
 * 书籍级策略路由参数校验：
 * - `id` 来源于 URL `/api/admin/books/:id/model-strategy`；
 * - 必须是 UUID，防止非法字符串进入服务层查询。
 */
export const strategyRouteParamsSchema = z.object({
  id: z.string().uuid("书籍 ID 不合法")
});

/**
 * 任务成本汇总路由参数校验：
 * - `jobId` 来源于 URL `/api/admin/analysis-jobs/:jobId/cost-summary`；
 * - UUID 校验属于接口边界防御，不是技术上的可选项。
 */
export const costSummaryRouteParamsSchema = z.object({
  jobId: z.string().uuid("任务 ID 不合法")
});

/**
 * 策略保存请求体校验。
 *
 * `stages` 的业务语义：
 * - 代表“流水线阶段 -> 模型配置”的映射；
 * - 具体每个阶段字段由 `strategyStagesSchema` 统一约束，确保前后端一致。
 */
export const upsertStrategyBodySchema = z.object({
  stages: strategyStagesSchema
});

/**
 * 构造统一的 400 Bad Request 响应。
 *
 * 为什么抽成公共函数：
 * - 管理端模型策略接口较多，参数错误场景高度一致；
 * - 统一后可保证 `code/message/error/meta` 结构稳定，便于前端提示与日志排查。
 *
 * @param path 当前接口路径（模板或实际路径），用于响应元信息。
 * @param requestId 请求追踪 ID。
 * @param startedAt 请求开始时间戳。
 * @param detail 更细粒度错误描述（通常来自 zod issues）。
 * @param message 面向调用方的错误文案，默认“请求参数不合法”。
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
 * 构造统一的 404 Not Found 响应。
 *
 * 适用场景：
 * - 业务实体（书籍/任务）不存在；
 * - 路由参数合法，但查询结果为空。
 *
 * @param path 当前接口路径（建议传真实路径，便于观测系统检索）。
 * @param requestId 请求追踪 ID。
 * @param startedAt 请求开始时间戳。
 * @param message 面向客户端的提示文案。
 * @param detail 面向排障的细节描述（例如具体缺失的资源 ID）。
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
