import { randomUUID } from "node:crypto";

import { headers } from "next/headers";
import { z } from "zod";

import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import {
  ReviewRunCostSummaryNotFoundError,
  reviewRunCostSummaryService
} from "@/server/modules/review/evidence-review/costs";
import { ERROR_CODES } from "@/types/api";

import { serializeReviewRunCostSummary } from "../_cost-controls";
import { badRequestJson, notFoundJson } from "../_shared";

const PATH = "/api/admin/review/cost-summary";

const costSummaryQuerySchema = z.object({
  runId: z.string().trim().min(1)
});

/**
 * GET `/api/admin/review/cost-summary`
 * 功能：返回单次审核重跑的 token / cost / duration 摘要，供控制面评估成本。
 */
export async function GET(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const parsedQuery = costSummaryQuerySchema.safeParse({
      runId: new URL(request.url).searchParams.get("runId") ?? undefined
    });
    if (!parsedQuery.success) {
      return badRequestJson(
        PATH,
        requestId,
        startedAt,
        parsedQuery.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    const data = await reviewRunCostSummaryService.getSummary(parsedQuery.data.runId);

    return okJson({
      path   : PATH,
      requestId,
      startedAt,
      code   : "REVIEW_RUN_COST_SUMMARY_FETCHED",
      message: "审核重跑成本摘要获取成功",
      data   : serializeReviewRunCostSummary(data)
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
      fallbackMessage: "审核重跑成本摘要获取失败"
    });
  }
}
