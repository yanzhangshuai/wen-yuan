import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { failJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { exportEntries } from "@/server/modules/knowledge";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson, uuidParamSchema } from "../../../_shared";

/**
 * GET `/api/admin/knowledge/alias-packs/:id/export?format=json|csv`
 * 导出知识包条目。
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const parsedParams = uuidParamSchema.safeParse(await context.params);
    if (!parsedParams.success) {
      return badRequestJson("/api/admin/knowledge/alias-packs/[id]/export", requestId, startedAt, "知识包 ID 不合法");
    }

    const url = new URL(request.url);
    const format = url.searchParams.get("format") === "csv" ? "csv" as const : "json" as const;
    const reviewScope = url.searchParams.get("reviewStatus") === "all" ? "ALL" as const : "VERIFIED" as const;

    const result = await exportEntries(parsedParams.data.id, format, reviewScope);

    return new Response(result.content, {
      status : 200,
      headers: {
        "Content-Type"       : result.contentType,
        "Content-Disposition": `attachment; filename="knowledge-pack-export-${reviewScope.toLowerCase()}.${format}"`
      }
    });
  } catch (error) {
    return failJson({
      path           : "/api/admin/knowledge/alias-packs/[id]/export",
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "导出失败"
    });
  }
}
