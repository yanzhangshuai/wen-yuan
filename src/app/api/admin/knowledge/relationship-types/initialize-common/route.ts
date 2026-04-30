import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { initializeCommonRelationshipTypes } from "@/server/modules/knowledge";
import { ERROR_CODES } from "@/types/api";

import {
  badRequestJson,
  initializeCommonRelationshipTypesSchema
} from "../../_shared";

const PATH = "/api/admin/knowledge/relationship-types/initialize-common";

export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const parsed = initializeCommonRelationshipTypesSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return badRequestJson(PATH, requestId, startedAt, parsed.error.issues[0]?.message ?? "参数不合法");
    }

    const data = await initializeCommonRelationshipTypes();
    return okJson({ path: PATH, requestId, startedAt, code: "ADMIN_RELATIONSHIP_TYPES_COMMON_INITIALIZED", message: "常用关系类型初始化完成", data });
  } catch (error) {
    return failJson({ path: PATH, requestId, startedAt, error, fallbackCode: ERROR_CODES.COMMON_INTERNAL_ERROR, fallbackMessage: "常用关系类型初始化失败" });
  }
}
