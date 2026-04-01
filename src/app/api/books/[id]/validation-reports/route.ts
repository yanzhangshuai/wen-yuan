import { randomUUID } from "node:crypto";

import { headers } from "next/headers";
import { z } from "zod";

import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { validationAgentService } from "@/server/modules/analysis/services/ValidationAgentService";
import { ERROR_CODES } from "@/types/api";

const routeParamsSchema = z.object({
  id: z.string().uuid("书籍 ID 不合法")
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

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const routePath = "/api/books/[id]/validation-reports";

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const parsedParams = routeParamsSchema.safeParse(await context.params);
    if (!parsedParams.success) {
      return badRequestJson(routePath, requestId, startedAt, parsedParams.error.issues[0]?.message ?? "书籍 ID 不合法");
    }

    const data = await validationAgentService.listValidationReports(parsedParams.data.id);
    return okJson({
      path   : routePath,
      requestId,
      startedAt,
      code   : "BOOK_VALIDATION_REPORTS_LISTED",
      message: "自检报告列表获取成功",
      data
    });
  } catch (error) {
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
