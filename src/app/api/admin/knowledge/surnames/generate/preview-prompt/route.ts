import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { previewSurnameGenerationPrompt } from "@/server/modules/knowledge";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson } from "../../../_shared";

const PATH = "/api/admin/knowledge/surnames/generate/preview-prompt";

export async function GET(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const url = new URL(request.url);
    const targetCount = Number(url.searchParams.get("targetCount") ?? "30");
    const referenceBookTypeId = url.searchParams.get("referenceBookTypeId") ?? undefined;
    const additionalInstructions = url.searchParams.get("additionalInstructions") ?? undefined;

    if (!Number.isFinite(targetCount)) {
      return badRequestJson(PATH, requestId, startedAt, "targetCount 不合法");
    }

    const data = await previewSurnameGenerationPrompt({
      targetCount,
      referenceBookTypeId,
      additionalInstructions
    });

    return okJson({
      path   : PATH,
      requestId,
      startedAt,
      code   : "ADMIN_SURNAME_GENERATE_PROMPT_PREVIEW",
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
