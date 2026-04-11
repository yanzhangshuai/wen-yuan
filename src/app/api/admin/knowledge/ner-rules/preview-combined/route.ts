import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { previewCombinedRules } from "@/server/modules/knowledge";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson } from "../../_shared";

const PATH = "/api/admin/knowledge/ner-rules/preview-combined";

export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const body = await readJsonBody(request);
    if (!body || typeof body !== "object" || !("ruleType" in body) || typeof body.ruleType !== "string") {
      return badRequestJson(PATH, requestId, startedAt, "ruleType 字段为必填");
    }

    const genreKey = "genreKey" in body && typeof body.genreKey === "string" ? body.genreKey : undefined;
    const data = await previewCombinedRules(body.ruleType, genreKey);
    return okJson({ path: PATH, requestId, startedAt, code: "ADMIN_NER_RULES_PREVIEW", message: "规则组合预览成功", data });
  } catch (error) {
    return failJson({ path: PATH, requestId, startedAt, error, fallbackCode: ERROR_CODES.COMMON_INTERNAL_ERROR, fallbackMessage: "规则组合预览失败" });
  }
}
