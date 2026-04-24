import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { failJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { ERROR_CODES } from "@/types/api";

import { retiredLegacyReviewStackJson } from "../_shared/retired-legacy-review-stack";

/**
 * =============================================================================
 * 文件定位（Next.js Route Handler：合并建议列表接口）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/app/api/admin/merge-suggestions/route.ts`
 *
 * 为什么文件名是 `route.ts`：
 * - 在 Next.js `app/` 路由约定中，`route.ts` 会被识别为 HTTP 接口入口；
 * - 本文件对应路径：`GET /api/admin/merge-suggestions`。
 *
 * T20 之后的职责：
 * - 保留旧 URL 作为显式退役边界；
 * - 完成管理员鉴权后直接返回统一 410；
 * - 指向新的 `/admin/review` 工作台，不再读取旧建议列表。
 *
 * 运行环境：
 * - 服务端（Node.js Runtime）执行，不在浏览器运行。
 *
 * 维护边界：
 * - 本层不再承载旧审核栈的读取逻辑；
 * - 任意继续依赖此路径的调用方都应迁移到新 review surface。
 * =============================================================================
 */

/**
 * GET `/api/admin/merge-suggestions`
 * 功能：返回旧合并建议列表接口的退役提示。
 */
export async function GET(_request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const path = "/api/admin/merge-suggestions";

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);
    return retiredLegacyReviewStackJson({
      path,
      requestId,
      startedAt,
      replacementPath: "/admin/review"
    });
  } catch (error) {
    return failJson({
      path,
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "合并建议列表获取失败"
    });
  }
}
