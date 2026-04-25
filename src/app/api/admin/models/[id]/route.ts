import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { Prisma } from "@/generated/prisma/client";
import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { deleteAdminModel, updateAdminModel } from "@/server/modules/models";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson, modelRouteParamsSchema, updateModelBodySchema } from "../_shared";

/**
 * 文件定位（Next.js App Router Route Handler）：
 * - 文件名 `route.ts` + 目录 `app/api/admin/models/[id]` 会被 Next.js 自动映射为
 *   `/api/admin/models/:id` 接口。
 * - 本文件处理 PATCH（更新配置）和 DELETE（删除模型）两个方法。
 *
 * 执行时机与环境：
 * - 每次客户端/服务端请求该 API 时在服务端执行；
 * - 依赖 `next/headers` 读取请求头并完成鉴权，无法在浏览器端运行。
 */

/**
 * PATCH `/api/admin/models/:id`
 * 功能：更新单个模型配置（模型标识 / API Key / BaseURL / 启用状态）。
 * 入参：
 * - 路由参数：`id`（模型 UUID）；
 * - 请求体：`providerModelId | apiKey | baseUrl | isEnabled`（至少一个字段）。
 * 返回：更新后的模型配置快照。
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  // 统一埋点元信息：用于响应 meta、日志串联和耗时统计。
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    // 管理员鉴权前置：这是业务权限规则，不是技术限制。
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    // 先校验动态路由参数，拦截非法 ID，避免把脏值传入 service 层。
    const parsedParams = modelRouteParamsSchema.safeParse(await context.params);
    if (!parsedParams.success) {
      return badRequestJson(
        "/api/admin/models/[id]",
        requestId,
        startedAt,
        parsedParams.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    const parsedBody = updateModelBodySchema.safeParse(await readJsonBody(request));
    if (!parsedBody.success) {
      // 请求体校验失败直接返回 400，保证 API 合同稳定可预期。
      return badRequestJson(
        `/api/admin/models/${parsedParams.data.id}`,
        requestId,
        startedAt,
        parsedBody.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    const data = await updateAdminModel(parsedParams.data.id, parsedBody.data);

    // 使用统一成功壳（okJson），保持全项目 API 响应结构一致。
    return okJson({
      path   : `/api/admin/models/${parsedParams.data.id}`,
      requestId,
      startedAt,
      code   : "ADMIN_MODEL_UPDATED",
      message: "模型配置更新成功",
      data
    });
  } catch (error) {
    // 未命中已知业务错误时统一落到内部错误，避免泄露底层细节。
    return failJson({
      path           : "/api/admin/models/[id]",
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "模型配置更新失败"
    });
  }
}

/**
 * DELETE `/api/admin/models/:id`
 * 功能：永久删除指定模型配置（不可恢复）。
 * 入参：路由参数 `id`（模型 UUID）。
 * 返回：删除成功的标准响应（data 为 null）。
 */
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const parsedParams = modelRouteParamsSchema.safeParse(await context.params);
    if (!parsedParams.success) {
      return badRequestJson(
        "/api/admin/models/[id]",
        requestId,
        startedAt,
        parsedParams.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    await deleteAdminModel(parsedParams.data.id);

    return okJson({
      path     : `/api/admin/models/${parsedParams.data.id}`,
      requestId,
      startedAt,
      code     : "ADMIN_MODEL_DELETED",
      message  : "模型已删除",
      data     : null
    });
  } catch (error) {
    // Handle Prisma P2025 (record not found) as 404
    const isPrismaNotFound = (e: unknown): e is { code: string } => {
       if (e instanceof Prisma.PrismaClientKnownRequestError) return (e as { code: string }).code === "P2025";
       return e != null && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2025";
    };
    if (isPrismaNotFound(error)) {
      return okJson({
         path     : "/api/admin/models/[id]",
        requestId,
        startedAt,
        code     : "COMMON_NOT_FOUND",
        message  : "模型不存在",
        data     : null,
        status   : 404
      });
    }

    return failJson({
      path           : "/api/admin/models/[id]",
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "模型删除失败"
    });
  }
}
