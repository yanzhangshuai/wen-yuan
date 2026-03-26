import { randomUUID } from "node:crypto";

import { headers } from "next/headers";
import { z } from "zod";

import { createApiMeta, errorResponse, toNextJson } from "@/server/http/api-response";
import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { bulkVerifyDrafts, BulkReviewInputError, type BulkReviewResult } from "@/server/modules/review/bulkReview";
import { ERROR_CODES } from "@/types/api";

/**
 * 功能：批量确认审核草稿请求体校验。
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

/**
 * 功能：确认一批 DRAFT 审核记录（关系/传记事件）。
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
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const parsedBody = bulkVerifyBodySchema.safeParse(await readJsonBody(request));
    if (!parsedBody.success) {
      return badRequestJson(
        requestId,
        startedAt,
        parsedBody.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    const data = await bulkVerifyDrafts(parsedBody.data.ids);
    return okJson<BulkReviewResult>({
      path,
      requestId,
      startedAt,
      code   : "ADMIN_DRAFTS_BULK_VERIFIED",
      message: "批量确认成功",
      data
    });
  } catch (error) {
    if (error instanceof BulkReviewInputError) {
      return badRequestJson(requestId, startedAt, error.message);
    }

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
