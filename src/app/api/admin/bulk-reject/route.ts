import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { failJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { retiredLegacyReviewStackJson } from "@/app/api/admin/_shared/retired-legacy-review-stack";
import { ERROR_CODES } from "@/types/api";

/**
 * =============================================================================
 * 文件定位（Next.js Route Handler：管理端批量拒绝）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/app/api/admin/bulk-reject/route.ts`
 *
 * 框架语义：
 * - `route.ts` 导出的 `POST` 对应接口 `POST /api/admin/bulk-reject`；
 * - 由 Next.js 在服务端执行，适合作为“有副作用写操作”的入口层。
 *
 * 业务职责：
 * - T20 起该旧写路径已退役，统一引导到新的审核工作台。
 *
 * 上游输入：
 * - 历史审核面板提交的 POST 请求；
 * - 登录态上下文（Header/Cookie），由 `getAuthContext` 解析。
 *
 * 下游输出：
 * - 不再执行旧批量写入；
 * - 返回统一 410 retired contract 与替代入口提示。
 *
 * 风险提示（仅注释说明，不改变行为）：
 * - 鉴权仍需先执行，再返回退役提示，避免掩盖权限边界。
 * =============================================================================
 */

/**
 * 功能：旧批量拒绝路由退役提示。
 * 输入：管理员身份的历史 POST 请求。
 * 输出：统一 410 退役响应，引导到新的审核工作台。
 * 异常：权限不足返回 403；其余错误返回 500。
 * 副作用：无。
 */
export async function POST(_request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const path = "/api/admin/bulk-reject";

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
      fallbackMessage: "批量拒绝失败"
    });
  }
}
