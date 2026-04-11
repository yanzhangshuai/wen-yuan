import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { getPromptTemplate } from "@/server/modules/knowledge";
import { ERROR_CODES } from "@/types/api";

import { notFoundJson } from "../../_shared";

const PATH = "/api/admin/knowledge/prompt-templates/[slug]";

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> }
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const { slug } = await context.params;
    const data = await getPromptTemplate(slug);
    if (!data) {
      return notFoundJson(PATH, requestId, startedAt, "模板不存在");
    }

    return okJson({ path: PATH, requestId, startedAt, code: "ADMIN_PROMPT_TEMPLATE_DETAIL", message: "模板详情获取成功", data });
  } catch (error) {
    return failJson({ path: PATH, requestId, startedAt, error, fallbackCode: ERROR_CODES.COMMON_INTERNAL_ERROR, fallbackMessage: "模板详情获取失败" });
  }
}
