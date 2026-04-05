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
 * 文件定位（Next.js Route Handler）：
 * - 路由约定目录 `app/api/admin/analysis-jobs/[jobId]/cost-summary/route.ts`
 *   对应接口路径 `/api/admin/analysis-jobs/:jobId/cost-summary`。
 * - 属于管理后台成本统计接口层，负责鉴权、参数校验与响应封装。
 */

/**
 * GET `/api/admin/analysis-jobs/:jobId/cost-summary`
 * 功能：查询分析任务的阶段与模型成本汇总（管理员鉴权）。
 */
export async function GET(
  _: Request,
  context: { params: Promise<{ jobId: string }> }
): Promise<Response> {
  // requestId + startedAt 是统一观测字段，便于日志和前端问题排查。
  const startedAt = Date.now();
  const requestId = randomUUID();
  const routePath = "/api/admin/analysis-jobs/[jobId]/cost-summary";

  try {
    // 成本数据属于后台敏感信息，必须管理员权限才能读取。
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    // `jobId` 来自动态路由参数，先做 schema 校验再进入 service。
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
      // 业务明确区分“任务不存在”与“系统异常”，便于前端展示可操作提示。
      return notFoundJson(
        `/api/admin/analysis-jobs/${error.jobId}/cost-summary`,
        requestId,
        startedAt,
        "分析任务不存在",
        error.message
      );
    }

    // 其余异常统一兜底为 500，避免泄露内部实现细节。
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
