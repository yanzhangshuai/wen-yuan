import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { previewPromptExtractionGenerationPrompt } from "@/server/modules/knowledge";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson, generatePromptRulesSchema } from "../../../_shared";

const PATH = "/api/admin/knowledge/prompt-extraction-rules/generate/preview-prompt";

export async function GET(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const url = new URL(request.url);
    const targetCount = Number(url.searchParams.get("targetCount") ?? "30");
    const parsed = generatePromptRulesSchema.omit({ modelId: true }).safeParse({
      ruleType              : url.searchParams.get("ruleType"),
      targetCount,
      bookTypeId            : url.searchParams.get("bookTypeId") ?? undefined,
      additionalInstructions: url.searchParams.get("additionalInstructions") ?? undefined
    });

    if (!parsed.success) {
      return badRequestJson(PATH, requestId, startedAt, parsed.error.issues[0]?.message ?? "参数不合法");
    }

    const data = await previewPromptExtractionGenerationPrompt(parsed.data);
    return okJson({
      path   : PATH,
      requestId,
      startedAt,
      code   : "ADMIN_PROMPT_RULE_GENERATE_PROMPT_PREVIEW",
      message: "提示词预览成功",
      data
    });
  } catch (error) {
    return failJson({
      path           : PATH,
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "提示词预览失败"
    });
  }
}
