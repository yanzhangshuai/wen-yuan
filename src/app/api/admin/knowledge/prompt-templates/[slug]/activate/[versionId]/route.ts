import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { activatePromptVersion } from "@/server/modules/knowledge";
import { ERROR_CODES } from "@/types/api";

const PATH = "/api/admin/knowledge/prompt-templates/[slug]/activate/[versionId]";

export async function POST(
  _request: Request,
  context: { params: Promise<{ slug: string; versionId: string }> }
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const { slug, versionId } = await context.params;
    const data = await activatePromptVersion(slug, versionId);
    return okJson({ path: PATH, requestId, startedAt, code: "ADMIN_PROMPT_VERSION_ACTIVATED", message: "版本激活成功", data });
  } catch (error) {
    return failJson({ path: PATH, requestId, startedAt, error, fallbackCode: ERROR_CODES.COMMON_INTERNAL_ERROR, fallbackMessage: "版本激活失败" });
  }
}
