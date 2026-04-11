import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { reorderExtractionRules } from "@/server/modules/knowledge";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson, reorderRulesSchema } from "../../_shared";

const PATH = "/api/admin/knowledge/ner-rules/reorder";

export async function PUT(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const parsed = reorderRulesSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return badRequestJson(PATH, requestId, startedAt, parsed.error.issues[0]?.message ?? "参数不合法");
    }

    await reorderExtractionRules(parsed.data.ruleType, parsed.data.orderedIds);
    return okJson({ path: PATH, requestId, startedAt, code: "ADMIN_NER_RULES_REORDERED", message: "规则排序更新成功", data: null });
  } catch (error) {
    return failJson({ path: PATH, requestId, startedAt, error, fallbackCode: ERROR_CODES.COMMON_INTERNAL_ERROR, fallbackMessage: "规则排序更新失败" });
  }
}
