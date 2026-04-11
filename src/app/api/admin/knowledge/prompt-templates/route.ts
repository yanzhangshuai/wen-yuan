import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { listPromptTemplates } from "@/server/modules/knowledge";
import { ERROR_CODES } from "@/types/api";

const PATH = "/api/admin/knowledge/prompt-templates";

export async function GET(): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const data = await listPromptTemplates();
    return okJson({ path: PATH, requestId, startedAt, code: "ADMIN_PROMPT_TEMPLATES_LISTED", message: "提示词模板列表获取成功", data });
  } catch (error) {
    return failJson({ path: PATH, requestId, startedAt, error, fallbackCode: ERROR_CODES.COMMON_INTERNAL_ERROR, fallbackMessage: "提示词模板列表获取失败" });
  }
}
