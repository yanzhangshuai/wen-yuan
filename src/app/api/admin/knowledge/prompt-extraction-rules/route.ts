import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { listPromptExtractionRules, createPromptExtractionRule } from "@/server/modules/knowledge";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson, createPromptExtractionRuleSchema } from "../_shared";

const PATH = "/api/admin/knowledge/prompt-extraction-rules";

export async function GET(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const url = new URL(request.url);
    const ruleType   = url.searchParams.get("ruleType") ?? undefined;
    const bookTypeId = url.searchParams.get("bookTypeId") ?? undefined;

    const data = await listPromptExtractionRules({ ruleType, bookTypeId });
    return okJson({ path: PATH, requestId, startedAt, code: "ADMIN_PROMPT_RULES_LISTED", message: "Prompt 规则列表获取成功", data });
  } catch (error) {
    return failJson({ path: PATH, requestId, startedAt, error, fallbackCode: ERROR_CODES.COMMON_INTERNAL_ERROR, fallbackMessage: "Prompt 规则列表获取失败" });
  }
}

export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const parsed = createPromptExtractionRuleSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return badRequestJson(PATH, requestId, startedAt, parsed.error.issues[0]?.message ?? "参数不合法");
    }

    const data = await createPromptExtractionRule(parsed.data);
    return okJson({ path: PATH, requestId, startedAt, code: "ADMIN_PROMPT_RULE_CREATED", message: "Prompt 规则创建成功", data, status: 201 });
  } catch (error) {
    return failJson({ path: PATH, requestId, startedAt, error, fallbackCode: ERROR_CODES.COMMON_INTERNAL_ERROR, fallbackMessage: "Prompt 规则创建失败" });
  }
}
