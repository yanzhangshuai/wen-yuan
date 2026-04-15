import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { previewCombinedPromptRules } from "@/server/modules/knowledge";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson, previewPromptExtractionRulesSchema } from "../../_shared";

const PATH = "/api/admin/knowledge/prompt-extraction-rules/preview-combined";

export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const parsed = previewPromptExtractionRulesSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return badRequestJson(PATH, requestId, startedAt, parsed.error.issues[0]?.message ?? "参数不合法");
    }

    const data = await previewCombinedPromptRules(parsed.data.ruleType, parsed.data.bookTypeId);
    return okJson({ path: PATH, requestId, startedAt, code: "ADMIN_PROMPT_RULES_PREVIEW", message: "规则组合预览成功", data });
  } catch (error) {
    return failJson({ path: PATH, requestId, startedAt, error, fallbackCode: ERROR_CODES.COMMON_INTERNAL_ERROR, fallbackMessage: "规则组合预览失败" });
  }
}
