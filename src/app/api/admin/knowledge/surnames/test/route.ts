import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { testSurnameExtraction } from "@/server/modules/knowledge";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson } from "../../_shared";

const PATH = "/api/admin/knowledge/surnames/test";

export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const body = await readJsonBody(request);
    if (!body || typeof body !== "object" || !("name" in body) || typeof body.name !== "string" || !body.name.trim()) {
      return badRequestJson(PATH, requestId, startedAt, "name 字段不能为空");
    }

    const data = await testSurnameExtraction(body.name);
    return okJson({ path: PATH, requestId, startedAt, code: "ADMIN_SURNAME_TESTED", message: "测试完成", data });
  } catch (error) {
    return failJson({ path: PATH, requestId, startedAt, error, fallbackCode: ERROR_CODES.COMMON_INTERNAL_ERROR, fallbackMessage: "姓氏测试失败" });
  }
}
