import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { listMergeSuggestions } from "@/server/modules/roleWorkbench/mergeSuggestions";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson, mergeSuggestionQuerySchema } from "./_shared";

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
 * 在整体链路中的职责：
 * 1) 读取并校验 query 参数（bookId/status）；
 * 2) 完成管理员鉴权；
 * 3) 调用领域服务 `listMergeSuggestions`；
 * 4) 统一返回标准 API 响应结构。
 *
 * 运行环境：
 * - 服务端（Node.js Runtime）执行，不在浏览器运行。
 *
 * 维护边界：
 * - 本层负责“协议转换（HTTP <-> 领域服务）”，不承载具体合并业务规则；
 * - 业务规则在 `src/server/modules/roleWorkbench/mergeSuggestions.ts`。
 * =============================================================================
 */

/**
 * GET `/api/admin/merge-suggestions`
 * 功能：查询合并建议队列（支持书籍与状态筛选）。
 * 入参：query `bookId/status`（可选）。
 * 返回：合并建议列表。
 */
export async function GET(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    /**
     * 先鉴权再查库：
     * - `headers()` 读取当前请求头；
     * - `getAuthContext` 解析登录态；
     * - `requireAdmin` 强制管理员权限。
     */
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    // 从 URL 中提取 query，统一映射到共享 schema 做参数校验。
    const url = new URL(request.url);
    const parsedQuery = mergeSuggestionQuerySchema.safeParse({
      bookId: url.searchParams.get("bookId") ?? undefined,
      status: url.searchParams.get("status") ?? undefined
    });

    // 分支：参数不合法，返回 400（而不是抛 500），避免把用户输入错误当服务异常。
    if (!parsedQuery.success) {
      return badRequestJson(
        "/api/admin/merge-suggestions",
        requestId,
        startedAt,
        parsedQuery.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    const data = await listMergeSuggestions(parsedQuery.data);

    return okJson({
      path   : "/api/admin/merge-suggestions",
      requestId,
      startedAt,
      code   : "ADMIN_MERGE_SUGGESTIONS_LISTED",
      message: "合并建议列表获取成功",
      data
    });
  } catch (error) {
    // 未被显式识别的异常统一收敛为 failJson，保持 API 错误结构一致。
    return failJson({
      path           : "/api/admin/merge-suggestions",
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "合并建议列表获取失败"
    });
  }
}
