import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { previewCombinedExtractionRules } from "@/server/modules/knowledge";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson, previewExtractionRulesSchema } from "../../_shared";

const PATH = "/api/admin/knowledge/extraction-rules/preview";

export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const url = new URL(request.url);
    const ruleType = url.searchParams.get("ruleType") ?? undefined;
    const bookTypeId = url.searchParams.get("bookTypeId") ?? undefined;

    const parsed = previewExtractionRulesSchema.safeParse({ ruleType, bookTypeId: bookTypeId || undefined });
    if (!parsed.success) {
      return badRequestJson(PATH, requestId, startedAt, parsed.error.issues[0]?.message ?? "参数不合法");
    }

    const data = await previewCombinedExtractionRules(parsed.data.ruleType, parsed.data.bookTypeId);
    return okJson({ path: PATH, requestId, startedAt, code: "ADMIN_EXTRACTION_RULES_PREVIEWED", message: "提取规则预览成功", data });
  } catch (error) {
    return failJson({ path: PATH, requestId, startedAt, error, fallbackCode: ERROR_CODES.COMMON_INTERNAL_ERROR, fallbackMessage: "提取规则预览失败" });
  }
}
