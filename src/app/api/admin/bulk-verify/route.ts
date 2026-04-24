import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { failJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { retiredLegacyReviewStackJson } from "@/app/api/admin/_shared/retired-legacy-review-stack";
import { ERROR_CODES } from "@/types/api";

/**
 * =============================================================================
 * 文件定位（Next.js Route Handler：管理端批量确认）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/app/api/admin/bulk-verify/route.ts`
 *
 * 框架语义：
 * - 该文件是 App Router 下的接口路由实现，对应 `POST /api/admin/bulk-verify`；
 * - 运行在服务端，请求到达时由 Next.js 调用导出的 `POST` 函数；
 * - 主要承担“入参校验 + 鉴权 + 调用领域服务 + 协议化返回”职责。
 *
 * 业务目标：
 * - T20 起该旧写路径已退役，统一引导到新的审核工作台。
 *
 * 上游输入：
 * - 旧版 `ReviewPanel` 或历史调用方的 POST 请求；
 * - 鉴权中间件/请求头提供的登录上下文。
 *
 * 下游输出：
 * - 不再执行旧批量写入；
 * - 统一返回 410 retired contract 和替代入口提示。
 *
 * 维护约束：
 * - 路径、错误码、响应结构均为前后端契约，属于业务规则，不应随意变更；
 * - 鉴权仍必须先于退役响应执行，避免把权限边界藏进迁移提示里。
 * =============================================================================
 */

/**
 * 功能：旧批量确认路由退役提示。
 * 输入：管理员身份的历史 POST 请求。
 * 输出：统一 410 退役响应，引导到新的审核工作台。
 * 异常：权限不足返回 403；其余错误返回 500。
 * 副作用：无。
 */
export async function POST(_request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const path = "/api/admin/bulk-verify";

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
      fallbackMessage: "批量确认失败"
    });
  }
}
