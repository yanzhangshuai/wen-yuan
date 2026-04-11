import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { diffPromptVersions } from "@/server/modules/knowledge";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson } from "../../../_shared";

const PATH = "/api/admin/knowledge/prompt-templates/[slug]/diff";

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> }
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const { slug } = await context.params;
    const url = new URL(request.url);
    const v1 = url.searchParams.get("v1");
    const v2 = url.searchParams.get("v2");

    if (!v1 || !v2) {
      return badRequestJson(PATH, requestId, startedAt, "v1 和 v2 参数为必填");
    }

    const data = await diffPromptVersions(slug, v1, v2);
    return okJson({ path: PATH, requestId, startedAt, code: "ADMIN_PROMPT_VERSION_DIFF", message: "版本对比获取成功", data });
  } catch (error) {
    return failJson({ path: PATH, requestId, startedAt, error, fallbackCode: ERROR_CODES.COMMON_INTERNAL_ERROR, fallbackMessage: "版本对比失败" });
  }
}
