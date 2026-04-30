import { randomUUID } from "node:crypto";

import { headers } from "next/headers";
import { z } from "zod";

import { createApiMeta, errorResponse, toNextJson } from "@/server/http/api-response";
import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { bulkRejectDrafts, BulkDraftStatusInputError, type BulkDraftStatusResult } from "@/server/modules/roleWorkbench/bulkReview";
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
 * - 将一组草稿从 `DRAFT` 批量置为 `REJECTED`，用于管理员批量驳回低质量识别结果。
 *
 * 上游输入：
 * - 客户端角色资料工作台提交的 `{ ids: string[] }` 请求体；
 * - 登录态上下文（Header/Cookie），由 `getAuthContext` 解析。
 *
 * 下游输出：
 * - 调用 `bulkRejectDrafts` 执行事务更新；
 * - 返回批量拒绝统计结果给前端刷新列表。
 *
 * 风险提示（仅注释说明，不改变行为）：
 * - 与 `bulk-verify` 路由不同，这里未做“Cookie 缺失重定向登录”的兜底分支；
 * - 当前依赖 middleware 与 `getAuthContext` 共同保障鉴权流程，一旦中间件配置变更，
 *   可能出现两个接口在“未登录体验”上的差异。
 * =============================================================================
 */

/**
 * 功能：批量拒绝待确认草稿请求体校验。
 * 输入：`ids` 为待拒绝草稿 ID 数组（UUID），至少 1 个。
 * 输出：通过 `safeParse` 返回可安全传入 service 的强类型数据。
 * 异常：无（校验失败由调用方转换为 400 响应）。
 * 副作用：无。
 */
const bulkRejectBodySchema = z.object({
  ids: z.array(
    z.string().uuid("草稿 ID 不合法")
  ).min(1, "至少需要传入一个草稿 ID")
});

function badRequestJson(
  requestId: string,
  startedAt: number,
  detail: string
): Response {
  // 统一 400 响应构造：让调用方始终收到同形态错误结构，便于统一提示。
  const path = "/api/admin/bulk-reject";
  const meta = createApiMeta(path, requestId, startedAt);
  return toNextJson(
    errorResponse(
      ERROR_CODES.COMMON_BAD_REQUEST,
      "批量拒绝参数不合法",
      {
        type: "ValidationError",
        detail
      },
      meta
    ),
    400
  );
}

/**
 * 功能：拒绝一批 DRAFT 待确认记录（关系/传记事件）。
 * 输入：管理员身份 + JSON `{ ids: string[] }`。
 * 输出：统一 API 响应，`data` 为批量拒绝统计结果。
 * 异常：参数不合法返回 400；权限不足返回 403；其余错误返回 500。
 * 副作用：写入数据库，将草稿状态改为 `REJECTED`。
 */
export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const path = "/api/admin/bulk-reject";

  try {
    // 1) 校验管理员身份：拒绝非管理员对草稿确认状态的写操作。
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    // 2) 校验请求体：业务规则要求至少传入一个合法 UUID。
    const parsedBody = bulkRejectBodySchema.safeParse(await readJsonBody(request));
    if (!parsedBody.success) {
      return badRequestJson(
        requestId,
        startedAt,
        parsedBody.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    // 3) 调用领域服务执行批量拒绝。
    const data = await bulkRejectDrafts(parsedBody.data.ids);
    return okJson<BulkDraftStatusResult>({
      path,
      requestId,
      startedAt,
      code   : "ADMIN_DRAFTS_BULK_REJECTED",
      message: "批量拒绝成功",
      data
    });
  } catch (error) {
    // 输入非法（如归一化后 ID 为空）属于 400 范畴，单独映射给前端。
    if (error instanceof BulkDraftStatusInputError) {
      return badRequestJson(requestId, startedAt, error.message);
    }

    // 其余异常按 500 返回，避免泄漏内部实现细节。
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
