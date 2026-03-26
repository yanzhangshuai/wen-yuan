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
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const url = new URL(request.url);
    const parsedQuery = draftsQuerySchema.safeParse({
      bookId: url.searchParams.get("bookId") ?? undefined,
      tab   : url.searchParams.get("tab") ?? undefined,
      source: url.searchParams.get("source") ?? undefined
    });
    if (!parsedQuery.success) {
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
