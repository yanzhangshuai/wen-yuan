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
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const parsedParams = routeParamsSchema.safeParse(await context.params);
    if (!parsedParams.success) {
      return badRequestJson(routePath, requestId, startedAt, parsedParams.error.issues[0]?.message ?? "路由参数不合法");
    }

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
