import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { updateExtractionRule, deleteExtractionRule } from "@/server/modules/knowledge";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson, uuidParamSchema, updateRuleSchema } from "../../_shared";

const PATH = "/api/admin/knowledge/ner-rules/[id]";

export async function PATCH(
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
      return badRequestJson(PATH, requestId, startedAt, "ID 不合法");
    }

    const parsedBody = updateRuleSchema.safeParse(await readJsonBody(request));
    if (!parsedBody.success) {
      return badRequestJson(PATH, requestId, startedAt, parsedBody.error.issues[0]?.message ?? "参数不合法");
    }

    const data = await updateExtractionRule(parsedParams.data.id, parsedBody.data);
    return okJson({ path: PATH, requestId, startedAt, code: "ADMIN_NER_RULE_UPDATED", message: "NER 规则更新成功", data });
  } catch (error) {
    return failJson({ path: PATH, requestId, startedAt, error, fallbackCode: ERROR_CODES.COMMON_INTERNAL_ERROR, fallbackMessage: "NER 规则更新失败" });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const parsedParams = uuidParamSchema.safeParse(await context.params);
    if (!parsedParams.success) {
      return badRequestJson(PATH, requestId, startedAt, "ID 不合法");
    }

    await deleteExtractionRule(parsedParams.data.id);
    return okJson({ path: PATH, requestId, startedAt, code: "ADMIN_NER_RULE_DELETED", message: "NER 规则删除成功", data: null });
  } catch (error) {
    return failJson({ path: PATH, requestId, startedAt, error, fallbackCode: ERROR_CODES.COMMON_INTERNAL_ERROR, fallbackMessage: "NER 规则删除失败" });
  }
}
