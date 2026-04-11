import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { previewAliasPackGenerationPrompt } from "@/server/modules/knowledge";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson, uuidParamSchema } from "../../../../_shared";

const PATH = "/api/admin/knowledge/alias-packs/[id]/generate/preview-prompt";

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
      return badRequestJson(PATH, requestId, startedAt, "知识包 ID 不合法");
    }

    const url = new URL(request.url);
    const targetCount = Number(url.searchParams.get("targetCount") ?? "50");
    const additionalInstructions = url.searchParams.get("additionalInstructions") ?? undefined;
    const bookId = url.searchParams.get("bookId") ?? undefined;

    const data = await previewAliasPackGenerationPrompt({
      packId     : parsedParams.data.id,
      targetCount: Number.isFinite(targetCount) ? targetCount : 50,
      bookId,
      additionalInstructions
    });

    return okJson({
      path   : PATH,
      requestId,
      startedAt,
      code   : "ADMIN_ALIAS_PACK_GENERATE_PROMPT_PREVIEW",
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
