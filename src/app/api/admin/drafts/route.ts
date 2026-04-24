import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { failJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";

import { retiredLegacyReviewStackJson } from "../_shared/retired-legacy-review-stack";

/**
 * GET `/api/admin/drafts`
 * 功能：返回旧版草稿审核接口的退役提示。
 * 说明：鉴权仍保留在最前，避免未授权请求通过退役路径探测后台能力。
 */
export async function GET(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const path = "/api/admin/drafts";

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const bookId = new URL(request.url).searchParams.get("bookId");
    const replacementPath = bookId ? `/admin/review/${bookId}` : "/admin/review";
    return retiredLegacyReviewStackJson({
      path,
      requestId,
      startedAt,
      replacementPath
    });
  } catch (error) {
    return failJson({
      path,
      requestId,
      startedAt,
      error,
      fallbackCode   : "ADMIN_DRAFTS_ROUTE_RETIRED_FAILED",
      fallbackMessage: "旧版草稿审核接口退役失败"
    });
  }
}
