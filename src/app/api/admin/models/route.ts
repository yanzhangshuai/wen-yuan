import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { createAdminModel, listAdminModels } from "@/server/modules/models";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson, createModelBodySchema } from "./_shared";

/**
 * 文件定位（Next.js Route Handler）：
 * - 路径：`app/api/admin/models/route.ts`，按 App Router 约定自动映射到 `GET /api/admin/models`。
 * - 层次：接口层（Route Handler），负责鉴权、调用服务模块、封装标准响应。
 *
 * 渲染/运行语义：
 * - 该文件运行在服务端（Node.js Runtime），不会参与前端 UI 渲染。
 * - 通过 `next/headers` 读取请求头，适配 Next.js 的服务器请求上下文。
 *
 * GET `/api/admin/models`
 * 功能：查询运营端模型配置列表（管理员鉴权）。
 * 入参：无（从请求头读取登录态）。
 * 返回：模型列表标准成功响应。
 *
 * 重要业务约束：
 * - 模型配置属于系统级治理数据，读取权限仅管理员开放；
 * - 这是业务权限规则，不是技术限制，避免普通用户推断模型供应商与密钥策略信息。
 */
export async function GET(): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    // Step 1) 鉴权先行：
    // - 通过 headers() 读取请求上下文；
    // - `requireAdmin` 作为强约束门禁，确保只有管理员可见模型清单。
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    // Step 2) 读取模型列表：
    // 路由层不关心具体数据来源（数据库/配置），由服务层统一编排字段。
    const data = await listAdminModels();

    // Step 3) 返回统一成功信封，保证前端调用方可复用同一解析逻辑。
    return okJson({
      path   : "/api/admin/models",
      requestId,
      startedAt,
      code   : "ADMIN_MODELS_LISTED",
      message: "模型列表获取成功",
      data
    });
  } catch (error) {
    // 统一错误出口：
    // - 避免把内部异常格式直接暴露给前端；
    // - 保留 requestId + startedAt，方便日志平台回溯同一请求链路。
    return failJson({
      path           : "/api/admin/models",
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "模型列表获取失败"
    });
  }
}

/**
 * POST `/api/admin/models`
 * 功能：创建新模型配置。
 * 入参：provider、name、providerModelId、baseUrl（必须）；apiKey（可选）。
 * 返回：新创建的模型配置快照（isEnabled=false，isDefault=false）。
 */
export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const parsedBody = createModelBodySchema.safeParse(await readJsonBody(request));
    if (!parsedBody.success) {
      return badRequestJson(
        "/api/admin/models",
        requestId,
        startedAt,
        parsedBody.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    const data = await createAdminModel(parsedBody.data);

    return okJson({
      path   : "/api/admin/models",
      requestId,
      startedAt,
      code   : "ADMIN_MODEL_CREATED",
      message: "模型创建成功",
      data
    });
  } catch (error) {
    return failJson({
      path           : "/api/admin/models",
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "模型创建失败"
    });
  }
}
