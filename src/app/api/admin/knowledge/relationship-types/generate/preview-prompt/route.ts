import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { previewRelationshipTypeGenerationPrompt } from "@/server/modules/knowledge";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson, relationshipTypeGroupSchema } from "../../../_shared";

const PATH = "/api/admin/knowledge/relationship-types/generate/preview-prompt";

export async function GET(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const url = new URL(request.url);
    const targetCount = Number(url.searchParams.get("targetCount") ?? "30");
    const targetGroup = url.searchParams.get("targetGroup") ?? undefined;
    const additionalInstructions = url.searchParams.get("additionalInstructions") ?? undefined;
    const parsedGroup = targetGroup ? relationshipTypeGroupSchema.safeParse(targetGroup) : null;

    if (!Number.isInteger(targetCount) || targetCount < 1 || targetCount > 100) {
      return badRequestJson(PATH, requestId, startedAt, "targetCount 不合法");
    }
    if (parsedGroup && !parsedGroup.success) {
      return badRequestJson(PATH, requestId, startedAt, "targetGroup 不合法");
    }

    const data = await previewRelationshipTypeGenerationPrompt({
      targetCount,
      targetGroup: parsedGroup?.data,
      additionalInstructions
    });

    return okJson({ path: PATH, requestId, startedAt, code: "ADMIN_RELATIONSHIP_TYPE_GENERATE_PROMPT_PREVIEW", message: "提示词预览成功", data });
  } catch (error) {
    return failJson({ path: PATH, requestId, startedAt, error, fallbackCode: ERROR_CODES.COMMON_INTERNAL_ERROR, fallbackMessage: "提示词预览失败" });
  }
}
