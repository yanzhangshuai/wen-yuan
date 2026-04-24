import { createApiMeta, errorResponse, toNextJson } from "@/server/http/api-response";

export const RETIRED_LEGACY_REVIEW_STACK = "RETIRED_LEGACY_REVIEW_STACK";
export const LEGACY_REVIEW_STACK_ROUTE_RETIRED = "LEGACY_REVIEW_STACK_ROUTE_RETIRED";

/**
 * 旧审核栈路由统一退役响应。
 * 鉴权必须由调用方先完成；这里仅负责输出稳定的 410 contract 和替代入口提示。
 */
export function retiredLegacyReviewStackJson(args: {
  path           : string;
  requestId      : string;
  startedAt      : number;
  replacementPath: string;
}): Response {
  const meta = createApiMeta(args.path, args.requestId, args.startedAt);
  const response = toNextJson(
    errorResponse(
      LEGACY_REVIEW_STACK_ROUTE_RETIRED,
      "旧版审核栈已退役，请改用新的审核工作台",
      {
        type  : "RouteRetiredError",
        detail: `请改用 ${args.replacementPath}`
      },
      meta
    ),
    410
  );
  response.headers.set("x-wen-yuan-read-boundary", RETIRED_LEGACY_REVIEW_STACK);
  response.headers.set("x-wen-yuan-replacement", args.replacementPath);
  return response;
}
