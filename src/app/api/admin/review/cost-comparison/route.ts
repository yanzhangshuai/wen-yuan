import { randomUUID } from "node:crypto";

import { headers } from "next/headers";
import { z } from "zod";

import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import {
  compareReviewRunCostSummaries,
  ReviewRunCostSummaryNotFoundError,
  reviewRunCostSummaryService
} from "@/server/modules/review/evidence-review/costs";
import { ERROR_CODES } from "@/types/api";

import { serializeReviewRunCostComparison } from "../_cost-controls";
import { badRequestJson, notFoundJson } from "../_shared";

const PATH = "/api/admin/review/cost-comparison";

const costComparisonQuerySchema = z.object({
  baselineRunId : z.string().trim().min(1),
  candidateRunId: z.string().trim().min(1)
});

/**
 * GET `/api/admin/review/cost-comparison`
 * 功能：对比基线 run 与候选增量重跑 run 的成本差异，供审核控制面做 rerun 决策。
 */
export async function GET(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const searchParams = new URL(request.url).searchParams;
    const parsedQuery = costComparisonQuerySchema.safeParse({
      baselineRunId : searchParams.get("baselineRunId") ?? undefined,
      candidateRunId: searchParams.get("candidateRunId") ?? undefined
    });
    if (!parsedQuery.success) {
      return badRequestJson(
        PATH,
        requestId,
        startedAt,
        parsedQuery.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    const baseline = await reviewRunCostSummaryService.getSummary(parsedQuery.data.baselineRunId);
    const candidate = await reviewRunCostSummaryService.getSummary(parsedQuery.data.candidateRunId);
    const comparison = compareReviewRunCostSummaries(baseline, candidate);

    return okJson({
      path   : PATH,
      requestId,
      startedAt,
      code   : "REVIEW_RUN_COST_COMPARISON_FETCHED",
      message: "审核重跑成本对比获取成功",
      data   : serializeReviewRunCostComparison(comparison)
    });
  } catch (error) {
    if (error instanceof ReviewRunCostSummaryNotFoundError) {
      return notFoundJson(PATH, requestId, startedAt, error.message, "审核重跑记录不存在");
    }

    return failJson({
      path           : PATH,
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "审核重跑成本对比获取失败"
    });
  }
}
