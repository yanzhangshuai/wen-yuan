import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { importSurnames } from "@/server/modules/knowledge";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson } from "../../_shared";

const PATH = "/api/admin/knowledge/surnames/import";

export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const body = await readJsonBody(request);
    if (!body || typeof body !== "object" || !("text" in body) || typeof body.text !== "string" || !body.text.trim()) {
      return badRequestJson(PATH, requestId, startedAt, "text 字段不能为空");
    }

    const data = await importSurnames(body.text);
    return okJson({ path: PATH, requestId, startedAt, code: "ADMIN_SURNAMES_IMPORTED", message: `导入完成：新增 ${data.created} 条`, data });
  } catch (error) {
    return failJson({ path: PATH, requestId, startedAt, error, fallbackCode: ERROR_CODES.COMMON_INTERNAL_ERROR, fallbackMessage: "姓氏导入失败" });
  }
}
