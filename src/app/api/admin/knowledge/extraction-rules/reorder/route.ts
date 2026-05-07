import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { reorderExtractionRules } from "@/server/modules/knowledge";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson, reorderExtractionRulesSchema } from "../../_shared";

const PATH = "/api/admin/knowledge/extraction-rules/reorder";

export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const parsed = reorderExtractionRulesSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return badRequestJson(PATH, requestId, startedAt, parsed.error.issues[0]?.message ?? "参数不合法");
    }

    await reorderExtractionRules(parsed.data.orderedIds);
    return okJson({ path: PATH, requestId, startedAt, code: "ADMIN_EXTRACTION_RULES_REORDERED", message: "提取规则排序成功", data: null });
  } catch (error) {
    return failJson({ path: PATH, requestId, startedAt, error, fallbackCode: ERROR_CODES.COMMON_INTERNAL_ERROR, fallbackMessage: "提取规则排序失败" });
  }
}
