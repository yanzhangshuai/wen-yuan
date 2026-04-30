import { randomUUID } from "node:crypto";

import { headers } from "next/headers";
import { z } from "zod";

import { createApiMeta, errorResponse, toNextJson } from "@/server/http/api-response";
import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { AUTH_COOKIE_NAME, getAuthContext, requireAdmin } from "@/server/modules/auth";
import { bulkVerifyDrafts, BulkDraftStatusInputError, type BulkDraftStatusResult } from "@/server/modules/roleWorkbench/bulkReview";
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
 * - 将一组 `DRAFT` 状态草稿批量改为 `VERIFIED`，用于管理员快速确认入库。
 *
 * 上游输入：
 * - 客户端 `RoleWorkbenchPanel` 发起的 JSON 请求体 `{ ids: string[] }`；
 * - 鉴权中间件/请求头提供的登录上下文。
 *
 * 下游输出：
 * - 调用 `server/modules/roleWorkbench/bulkReview.ts` 完成批量状态更新；
 * - 以统一 API 响应结构返回批量统计结果。
 *
 * 维护约束：
 * - 路径、错误码、响应结构均为前后端契约，属于业务规则，不应随意变更；
 * - 当前包含“Cookie 缺失时跳登录”的接口级兜底逻辑，用于覆盖 middleware 漏配场景。
 * =============================================================================
 */

/**
 * 功能：批量确认待确认草稿请求体校验。
 * 输入：`ids` 为待确认草稿 ID 数组（UUID），至少 1 个。
 * 输出：通过 `safeParse` 返回可安全传入 service 的强类型数据。
 * 异常：无（校验失败由调用方转换为 400 响应）。
 * 副作用：无。
 */
const bulkVerifyBodySchema = z.object({
  ids: z.array(
    z.string().uuid("草稿 ID 不合法")
  ).min(1, "至少需要传入一个草稿 ID")
});

function badRequestJson(
  requestId: string,
  startedAt: number,
  detail: string
): Response {
  // 统一的 400 构造器：确保该接口所有参数错误都返回同一消息模板，方便前端稳定处理。
  const path = "/api/admin/bulk-verify";
  const meta = createApiMeta(path, requestId, startedAt);
  return toNextJson(
    errorResponse(
      ERROR_CODES.COMMON_BAD_REQUEST,
      "批量确认参数不合法",
      {
        type: "ValidationError",
        detail
      },
      meta
    ),
    400
  );
}

function hasAuthCookie(cookieHeader: string | null): boolean {
  // 仅做“是否存在登录 Cookie”快速判断，不在这里解析 token 合法性；
  // 真正鉴权依然交给 `getAuthContext`，此处是路由层面的 UX 兜底。
  if (!cookieHeader) {
    return false;
  }

  return cookieHeader
    .split(";")
    .some((item) => item.trim().startsWith(`${AUTH_COOKIE_NAME}=`));
}

function buildCurrentPath(requestUrl: string): string {
  // 将当前路径（含 query）编码到登录回跳参数，确保登录后能返回原工作台页面。
  const parsed = new URL(requestUrl);
  return `${parsed.pathname}${parsed.search}`;
}

function redirectToLogin(request: Request): Response {
  // 307 保留原方法语义；这里用于未登录时统一回到登录页，而不是直接返回 401 文本。
  const redirectTarget = `/login?redirect=${encodeURIComponent(buildCurrentPath(request.url))}`;
  return Response.redirect(new URL(redirectTarget, request.url), 307);
}

/**
 * 功能：确认一批 DRAFT 待确认记录（关系/传记事件）。
 * 输入：管理员身份 + JSON `{ ids: string[] }`。
 * 输出：统一 API 响应，`data` 为批量确认统计结果。
 * 异常：参数不合法返回 400；权限不足返回 403；其余错误返回 500。
 * 副作用：写入数据库，将草稿状态改为 `VERIFIED`。
 */
export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const path = "/api/admin/bulk-verify";

  try {
    // 1) 读取请求头，优先利用 middleware 注入的角色信息，减少重复解析成本。
    const requestHeaders = await headers();
    const roleHeader = requestHeaders.get("x-auth-role");
    const cookieHeader = requestHeaders.get("cookie") ?? request.headers.get("cookie");

    // 在 API 路由未命中 middleware 注入时，兜底执行登录重定向语义（与 /admin 页面保持一致）。
    if (!roleHeader && !hasAuthCookie(cookieHeader)) {
      return redirectToLogin(request);
    }

    const auth = await getAuthContext(requestHeaders);
    requireAdmin(auth);

    // 2) 读取并校验 JSON body，拒绝空数组与非法 UUID，避免把脏数据写入批量更新逻辑。
    const parsedBody = bulkVerifyBodySchema.safeParse(await readJsonBody(request));
    if (!parsedBody.success) {
      return badRequestJson(
        requestId,
        startedAt,
        parsedBody.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    // 3) 执行领域服务：将符合条件的草稿状态改为 VERIFIED。
    const data = await bulkVerifyDrafts(parsedBody.data.ids);
    return okJson<BulkDraftStatusResult>({
      path,
      requestId,
      startedAt,
      code   : "ADMIN_DRAFTS_BULK_VERIFIED",
      message: "批量确认成功",
      data
    });
  } catch (error) {
    // 4) 输入异常转 400：比如 ID 经过 normalize 后为空，属于调用方参数问题。
    if (error instanceof BulkDraftStatusInputError) {
      return badRequestJson(requestId, startedAt, error.message);
    }

    // 5) 其他异常统一走 500，保持响应格式稳定。
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
