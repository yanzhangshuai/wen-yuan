import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { testAdminModelConnection } from "@/server/modules/models";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson, modelRouteParamsSchema } from "../../_shared";

/**
 * 文件定位（Next.js Route Handler）：
 * - 路由：`POST /api/admin/models/:id/test`
 * - 作用：管理端触发指定模型连通性探测，验证配置是否可用。
 *
 * 运行时说明：
 * - 显式声明 `runtime = "nodejs"`，因为模型测试通常涉及 Node 侧网络/SDK能力，不适合 Edge 约束环境。
 */
export const runtime = "nodejs";

/**
 * POST `/api/admin/models/:id/test`
 * 功能：触发模型联通性测试（管理员操作）。
 * 入参：路由参数 `id`（模型 UUID）。
 * 返回：测试结果（成功/失败与耗时信息）。
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    // 管理接口：先鉴权再执行，避免普通用户探测后端模型连通信息。
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    // 动态路由参数校验，避免非法 ID 进入服务层引发不必要查询。
    const parsedParams = modelRouteParamsSchema.safeParse(await context.params);
    if (!parsedParams.success) {
      return badRequestJson(
        "/api/admin/models/[id]/test",
        requestId,
        startedAt,
        parsedParams.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    // 由服务层发起真实连通测试，Route 层只负责协议封装。
    const data = await testAdminModelConnection(parsedParams.data.id);

    return okJson({
      path   : `/api/admin/models/${parsedParams.data.id}/test`,
      requestId,
      startedAt,
      code   : "ADMIN_MODEL_CONNECTION_TESTED",
      message: "模型连通性测试完成",
      data
    });
  } catch (error) {
    // 兜底错误统一回包，防止将内部堆栈直接暴露给前端。
    return failJson({
      path           : "/api/admin/models/[id]/test",
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "模型连通性测试失败"
    });
  }
}
