import { randomUUID } from "node:crypto";

import { headers } from "next/headers";
import { z } from "zod";

import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import {
  ALIAS_MAPPING_STATUS_VALUES,
  aliasRegistryService
} from "@/server/modules/analysis/services/AliasRegistryService";
import { ERROR_CODES } from "@/types/api";

/**
 * 文件定位（Next.js Route Handler / 别名映射审核）：
 * - 路由 `app/api/books/[id]/alias-mappings/[mappingId]/route.ts`
 *   映射为 `/api/books/:id/alias-mappings/:mappingId`。
 * - 该文件仅开放 PATCH：用于录入/校对人员更新单条别名映射状态。
 *
 * 业务规则：
 * - 只允许 `CONFIRMED` 与 `REJECTED`，不允许任意状态写入；
 * - 这是审核流约束，不是 Zod 技术限制。
 */

const routeParamsSchema = z.object({
  id       : z.string().uuid("书籍 ID 不合法"),
  mappingId: z.string().uuid("映射 ID 不合法")
});

const updateStatusBodySchema = z.object({
  status: z.enum(ALIAS_MAPPING_STATUS_VALUES).refine(
    (value) => value === "CONFIRMED" || value === "REJECTED",
    "仅支持 CONFIRMED 或 REJECTED"
  )
});

function badRequestJson(
  path: string,
  requestId: string,
  startedAt: number,
  detail: string
): Response {
  // 统一 bad request 结构，保证前端能稳定按 code/message 渲染提示。
  return failJson({
    path,
    requestId,
    startedAt,
    error          : new Error(detail),
    fallbackCode   : ERROR_CODES.COMMON_BAD_REQUEST,
    fallbackMessage: detail,
    status         : 400
  });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; mappingId: string }> }
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const routePath = "/api/books/[id]/alias-mappings/[mappingId]";

  try {
    // 审核动作需要管理员权限。
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    // 先校验动态路由参数，阻断非法 UUID。
    const parsedParams = routeParamsSchema.safeParse(await context.params);
    if (!parsedParams.success) {
      return badRequestJson(routePath, requestId, startedAt, parsedParams.error.issues[0]?.message ?? "路由参数不合法");
    }

    // 请求体只允许携带目标审核状态，并限定可选值。
    const parsedBody = updateStatusBodySchema.safeParse(await readJsonBody(request));
    if (!parsedBody.success) {
      return badRequestJson(routePath, requestId, startedAt, parsedBody.error.issues[0]?.message ?? "请求体不合法");
    }

    const data = await aliasRegistryService.updateMappingStatus(
      parsedParams.data.mappingId,
      parsedParams.data.id,
      parsedBody.data.status
    );

    if (!data) {
      // service 返回 null 代表记录不存在：显式映射为 404，避免误判为系统异常。
      return failJson({
        path           : routePath,
        requestId,
        startedAt,
        error          : new Error("别名映射不存在"),
        fallbackCode   : ERROR_CODES.COMMON_NOT_FOUND,
        fallbackMessage: "别名映射不存在",
        status         : 404
      });
    }

    return okJson({
      path   : routePath,
      requestId,
      startedAt,
      code   : "BOOK_ALIAS_MAPPING_UPDATED",
      message: "别名映射状态更新成功",
      data
    });
  } catch (error) {
    // 兜底：未预期错误统一走内部错误分支。
    return failJson({
      path           : routePath,
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "别名映射状态更新失败"
    });
  }
}
