import { randomUUID } from "node:crypto";

import { headers } from "next/headers";
import { z } from "zod";

import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { validationAgentService } from "@/server/modules/analysis/services/ValidationAgentService";
import { ERROR_CODES } from "@/types/api";

/**
 * 文件定位（Next.js Route Handler）：
 * - 路由：`GET /api/books/:id/validation-reports`。
 * - 作用：返回指定书籍的“分析自检报告列表”，供管理端/运营端排查解析质量。
 *
 * 层级职责：
 * - Route 层负责：鉴权、参数校验、响应封装；
 * - 服务层负责：查询与聚合报告数据。
 *
 * 在渲染链路中的位置：
 * - 本文件不参与页面 HTML 渲染；
 * - 由后台页面/客户端服务在需要时按需请求，属于“服务端接口层”。
 *
 * 业务规则强调：
 * - 自检报告属于内部质量治理数据，只对管理员开放；
 * - 这是业务访问控制规则，不是技术限制。
 */

/**
 * 路由参数校验：
 * - `id` 来自动态路由段 `[id]`；
 * - 要求 UUID，避免无效参数进入服务层。
 */
const routeParamsSchema = z.object({
  id: z.string().uuid("书籍 ID 不合法")
});

/**
 * 构造 400 响应。
 *
 * @param path 当前路由路径标识。
 * @param requestId 请求追踪 ID。
 * @param startedAt 请求开始时间戳。
 * @param detail 具体参数错误信息。
 * @returns 标准错误 JSON 响应（HTTP 400）。
 *
 * 设计原因：
 * - 保持与其他 API 一致的错误信封结构，便于前端统一处理；
 * - 参数错误属于调用方问题，因此明确返回 400。
 */
function badRequestJson(
  path: string,
  requestId: string,
  startedAt: number,
  detail: string
): Response {
  return failJson({
    path,
    requestId,
    startedAt,
    // 使用 Error 包装 detail，是为了复用 failJson 统一错误提取逻辑。
    error          : new Error(detail),
    fallbackCode   : ERROR_CODES.COMMON_BAD_REQUEST,
    fallbackMessage: detail,
    status         : 400
  });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const routePath = "/api/books/[id]/validation-reports";

  try {
    // Step 1) 鉴权与角色校验：
    // 自检报告包含内部质量诊断信息，必须限制在管理员域。
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    // Step 2) 路由参数校验：
    // `id` 来自动态路由段 `[id]`，必须是 UUID。
    const parsedParams = routeParamsSchema.safeParse(await context.params);
    if (!parsedParams.success) {
      return badRequestJson(routePath, requestId, startedAt, parsedParams.error.issues[0]?.message ?? "书籍 ID 不合法");
    }

    // Step 3) 查询报告列表：
    // 具体查询与排序逻辑由 ValidationAgentService 决定，路由层只做协议编排。
    const data = await validationAgentService.listValidationReports(parsedParams.data.id);

    // Step 4) 返回统一成功响应，供前端列表/详情直接消费。
    return okJson({
      path   : routePath,
      requestId,
      startedAt,
      code   : "BOOK_VALIDATION_REPORTS_LISTED",
      message: "自检报告列表获取成功",
      data
    });
  } catch (error) {
    // Step 5) 兜底异常：统一映射为 500，避免暴露内部错误细节。
    return failJson({
      path           : routePath,
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "自检报告列表获取失败"
    });
  }
}
