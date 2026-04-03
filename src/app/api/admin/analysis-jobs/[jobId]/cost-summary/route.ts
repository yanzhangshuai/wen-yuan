import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { failJson, okJson } from "@/server/http/route-utils";
import {
  AnalysisJobNotFoundError,
  getJobCostSummary
} from "@/server/modules/analysis/services/modelStrategyAdminService";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { ERROR_CODES } from "@/types/api";

import {
  badRequestJson,
  costSummaryRouteParamsSchema,
  notFoundJson
} from "../../../model-strategy/_shared";

/**
 * GET `/api/admin/analysis-jobs/:jobId/cost-summary`
 * 功能：查询分析任务的阶段与模型成本汇总（管理员鉴权）。
 */
export async function GET(
  _: Request,
  context: { params: Promise<{ jobId: string }> }
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const routePath = "/api/admin/analysis-jobs/[jobId]/cost-summary";

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const parsedParams = costSummaryRouteParamsSchema.safeParse(await context.params);
    if (!parsedParams.success) {
      return badRequestJson(
        routePath,
        requestId,
        startedAt,
        parsedParams.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    const data = await getJobCostSummary(parsedParams.data.jobId);
    return okJson({
      path   : `/api/admin/analysis-jobs/${parsedParams.data.jobId}/cost-summary`,
      requestId,
      startedAt,
      code   : "ADMIN_ANALYSIS_JOB_COST_SUMMARY_FETCHED",
      message: "任务成本概览获取成功",
      data
    });
  } catch (error) {
    if (error instanceof AnalysisJobNotFoundError) {
      return notFoundJson(
        `/api/admin/analysis-jobs/${error.jobId}/cost-summary`,
        requestId,
        startedAt,
        "分析任务不存在",
        error.message
      );
    }

    return failJson({
      path           : routePath,
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "任务成本概览获取失败"
    });
  }
}
