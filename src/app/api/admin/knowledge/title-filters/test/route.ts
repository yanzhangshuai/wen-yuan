import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { testGenericTitle } from "@/server/modules/knowledge";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson } from "../../_shared";

const PATH = "/api/admin/knowledge/title-filters/test";

export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const body = await readJsonBody(request);
    if (!body || typeof body !== "object" || !("title" in body) || typeof body.title !== "string" || !body.title.trim()) {
      return badRequestJson(PATH, requestId, startedAt, "title 字段不能为空");
    }

    const genreKey = "genreKey" in body && typeof body.genreKey === "string" ? body.genreKey : undefined;
    const data = await testGenericTitle(body.title, genreKey);
    return okJson({ path: PATH, requestId, startedAt, code: "ADMIN_GENERIC_TITLE_TESTED", message: "测试完成", data });
  } catch (error) {
    return failJson({ path: PATH, requestId, startedAt, error, fallbackCode: ERROR_CODES.COMMON_INTERNAL_ERROR, fallbackMessage: "泛化称谓测试失败" });
  }
}
