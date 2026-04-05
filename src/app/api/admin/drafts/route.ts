import { randomUUID } from "node:crypto";

import { headers } from "next/headers";
import { z } from "zod";

import { RecordSource } from "@/generated/prisma/enums";
import { createApiMeta, errorResponse, toNextJson } from "@/server/http/api-response";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import {
  listAdminDrafts,
  REVIEW_DRAFT_TAB_VALUES,
  type AdminDraftsResult
} from "@/server/modules/review/listDrafts";
import { ERROR_CODES } from "@/types/api";

/**
 * =============================================================================
 * 文件定位（Next.js Route Handler：管理端草稿查询）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/app/api/admin/drafts/route.ts`
 *
 * 框架语义：
 * - `app/api/.../route.ts` 是 Next.js App Router 的接口约定文件；
 * - 导出的 `GET` 函数会响应同路径 HTTP GET 请求；
 * - 运行在服务端（Node.js Runtime），可直接访问鉴权上下文与数据库服务模块。
 *
 * 业务职责：
 * 1) 接收管理端审核页面的查询参数（书籍、Tab、来源）；
 * 2) 校验参数合法性，防止非法参数穿透到数据层；
 * 3) 调用 `listAdminDrafts` 组装审核看板数据；
 * 4) 按项目统一响应协议返回成功/失败结构。
 *
 * 上游输入：
 * - 来自 `ReviewPanel` 客户端调用的 `/api/admin/drafts` 请求；
 * - 鉴权中间件注入的请求头与 Cookie（`getAuthContext` 读取）。
 *
 * 下游输出：
 * - 返回 `AdminDraftsResult` 给前端服务层 `src/lib/services/reviews.ts`；
 * - 错误时返回统一错误码，供前端统一提示。
 *
 * 注意：
 * - 这里的参数校验与错误码属于接口契约的一部分，这是业务规则，不是技术限制；
 * - 不应在此层调整字段命名，否则会破坏前端既有解析逻辑。
 * =============================================================================
 */
/** 管理端草稿看板查询参数 Schema。 */
const draftsQuerySchema = z.object({
  /** 书籍 ID（可选）。 */
  bookId: z.string().uuid("书籍 ID 不合法").optional(),
  /** 草稿类型 Tab（可选）。 */
  tab   : z.enum(REVIEW_DRAFT_TAB_VALUES).optional(),
  /** 来源过滤（AI/MANUAL，可选）。 */
  source: z.nativeEnum(RecordSource).optional()
});

/**
 * GET `/api/admin/drafts`
 * 功能：查询审核草稿列表（支持书籍/Tab/来源筛选）。
 * 入参：query `bookId/tab/source`（均可选）。
 * 返回：`AdminDraftsResult`。
 */
export async function GET(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    // 第一步：鉴权与角色校验。
    // 业务意图：审核数据只允许管理员访问，避免普通用户越权读取待审核内容。
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    // 第二步：解析 query 参数并执行白名单校验。
    // 业务意图：将参数错误尽早拦截在接口层，避免 service 层收到“看似有值但语义非法”的输入。
    const url = new URL(request.url);
    const parsedQuery = draftsQuerySchema.safeParse({
      bookId: url.searchParams.get("bookId") ?? undefined,
      tab   : url.searchParams.get("tab") ?? undefined,
      source: url.searchParams.get("source") ?? undefined
    });
    if (!parsedQuery.success) {
      // 参数不合法统一返回 400，并附带首个可读错误提示，前端可直接展示。
      const meta = createApiMeta("/api/admin/drafts", requestId, startedAt);
      return toNextJson(
        errorResponse(
          ERROR_CODES.COMMON_BAD_REQUEST,
          "请求参数不合法",
          {
            type  : "ValidationError",
            detail: parsedQuery.error.issues[0]?.message ?? "请求参数不合法"
          },
          meta
        ),
        400
      );
    }

    // 第三步：调用服务层获取审核看板数据。
    // 注意：服务层会进一步约束查询条件与软删除过滤，这里不重复实现数据规则。
    const data = await listAdminDrafts(parsedQuery.data);
    return okJson<AdminDraftsResult>({
      path   : "/api/admin/drafts",
      requestId,
      startedAt,
      code   : "ADMIN_DRAFTS_LISTED",
      message: "草稿列表获取成功",
      data
    });
  } catch (error) {
    // 第四步：兜底异常处理。
    // 业务意图：保证任何未预期异常都返回统一结构，避免前端因响应格式变化而二次报错。
    return failJson({
      path           : "/api/admin/drafts",
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "草稿列表获取失败"
    });
  }
}
