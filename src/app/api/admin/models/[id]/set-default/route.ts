import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { setDefaultAdminModel } from "@/server/modules/models";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson, modelRouteParamsSchema } from "../../_shared";

/**
 * 文件定位（Next.js Route Handler）：
 * - `app/api/admin/models/[id]/set-default/route.ts` 会映射为 `POST /api/admin/models/:id/set-default`。
 * - 属于管理后台接口层，负责“鉴权 + 参数校验 + 调用服务 + 返回统一响应”。
 *
 * 业务链路位置：
 * - 上游：管理端页面点击“设为默认模型”触发请求。
 * - 下游：`setDefaultAdminModel` 服务负责真正的数据更新与业务规则校验。
 *
 * 关键业务规则（不是技术限制）：
 * - 任意时刻系统只允许一个默认模型，避免任务执行时出现“默认模型歧义”；
 * - 因此该接口是系统全局配置写入口，必须要求管理员权限。
 *
 * POST `/api/admin/models/:id/set-default`
 * 功能：将指定模型设为默认模型（管理员操作）。
 * 入参：路由参数 `id`（模型 UUID）。
 * 返回：默认模型设置结果。
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    // Step 1) 权限边界：
    // 默认模型会影响后续分析任务的兜底策略，属于高风险配置，仅管理员可改。
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    // Step 2) 参数校验：
    // 参数来源是动态路由段而非 body；safeParse 可把异常转换为可控 400 响应。
    const parsedParams = modelRouteParamsSchema.safeParse(await context.params);
    if (!parsedParams.success) {
      return badRequestJson(
        "/api/admin/models/[id]/set-default",
        requestId,
        startedAt,
        parsedParams.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    // Step 3) 调用服务层执行默认模型切换。
    // “取消旧默认 + 设置新默认”的一致性由服务层保障，Route 层只负责协议编排。
    const data = await setDefaultAdminModel(parsedParams.data.id);

    // Step 4) 返回成功响应，前端据此更新 UI 中“默认”标识。
    return okJson({
      path   : `/api/admin/models/${parsedParams.data.id}/set-default`,
      requestId,
      startedAt,
      code   : "ADMIN_MODEL_DEFAULT_SET",
      message: "默认模型设置成功",
      data
    });
  } catch (error) {
    // 兜底异常统一映射，避免泄露内部实现细节并保持错误协议稳定。
    return failJson({
      path           : "/api/admin/models/[id]/set-default",
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "默认模型设置失败"
    });
  }
}
