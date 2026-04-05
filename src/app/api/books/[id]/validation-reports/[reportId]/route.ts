/**
 * =============================================================================
 * 文件定位（Next.js Route Handler：校验报告读取与自动修复）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/app/api/books/[id]/validation-reports/[reportId]/route.ts`
 *
 * 路由语义：
 * - `GET`：读取指定书籍的指定校验报告；
 * - `POST`：执行报告动作（当前支持 `apply-auto-fixes` 自动修复）。
 *
 * 业务定位：
 * - 属于“解析质量保障”链路的接口层；
 * - 上游是审核端质量面板，下游是 `validationAgentService`。
 *
 * 设计原因：
 * - 通过 `reportId` 进行精确操作，防止误对其他报告执行修复；
 * - 把动作封装为 `action` 字段，便于后续扩展更多报告动作而不改路由语义。
 * =============================================================================
 */
import { randomUUID } from "node:crypto";

import { headers } from "next/headers";
import { z } from "zod";

import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { validationAgentService } from "@/server/modules/analysis/services/ValidationAgentService";
import { ERROR_CODES } from "@/types/api";

const routeParamsSchema = z.object({
  id      : z.string().uuid("书籍 ID 不合法"),
  reportId: z.string().uuid("报告 ID 不合法")
});

const actionBodySchema = z.object({
  action: z.literal("apply-auto-fixes")
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
  context: { params: Promise<{ id: string; reportId: string }> }
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const routePath = "/api/books/[id]/validation-reports/[reportId]";

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const parsedParams = routeParamsSchema.safeParse(await context.params);
    if (!parsedParams.success) {
      return badRequestJson(routePath, requestId, startedAt, parsedParams.error.issues[0]?.message ?? "路由参数不合法");
    }

    const data = await validationAgentService.getValidationReportDetail(
      parsedParams.data.id,
      parsedParams.data.reportId
    );

    if (!data) {
      return failJson({
        path           : routePath,
        requestId,
        startedAt,
        error          : new Error("自检报告不存在"),
        fallbackCode   : ERROR_CODES.COMMON_NOT_FOUND,
        fallbackMessage: "自检报告不存在",
        status         : 404
      });
    }

    return okJson({
      path   : routePath,
      requestId,
      startedAt,
      code   : "BOOK_VALIDATION_REPORT_DETAIL",
      message: "自检报告详情获取成功",
      data
    });
  } catch (error) {
    return failJson({
      path           : routePath,
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "自检报告详情获取失败"
    });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; reportId: string }> }
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const routePath = "/api/books/[id]/validation-reports/[reportId]";

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const parsedParams = routeParamsSchema.safeParse(await context.params);
    if (!parsedParams.success) {
      return badRequestJson(routePath, requestId, startedAt, parsedParams.error.issues[0]?.message ?? "路由参数不合法");
    }

    const parsedBody = actionBodySchema.safeParse(await readJsonBody(request));
    if (!parsedBody.success) {
      return badRequestJson(routePath, requestId, startedAt, parsedBody.error.issues[0]?.message ?? "请求体不合法");
    }

    // 校验 report 归属当前 bookId，防止跨书操作
    const report = await validationAgentService.getValidationReportDetail(
      parsedParams.data.id,
      parsedParams.data.reportId
    );
    if (!report) {
      return failJson({
        path           : routePath,
        requestId,
        startedAt,
        error          : new Error("自检报告不存在"),
        fallbackCode   : ERROR_CODES.COMMON_NOT_FOUND,
        fallbackMessage: "自检报告不存在",
        status         : 404
      });
    }

    const appliedCount = await validationAgentService.applyAutoFixes(parsedParams.data.reportId);
    return okJson({
      path   : routePath,
      requestId,
      startedAt,
      code   : "BOOK_VALIDATION_REPORT_APPLIED",
      message: "自检修正已应用",
      data   : { appliedCount }
    });
  } catch (error) {
    return failJson({
      path           : routePath,
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "应用自检修正失败"
    });
  }
}
