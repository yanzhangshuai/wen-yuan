import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { getChangeLog } from "@/server/modules/knowledge";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson, notFoundJson, uuidParamSchema } from "../../_shared";

const PATH = "/api/admin/knowledge/change-logs/[id]";

export async function GET(
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

    const data = await getChangeLog(parsedParams.data.id);
    if (!data) {
      return notFoundJson(PATH, requestId, startedAt, "日志不存在");
    }

    return okJson({ path: PATH, requestId, startedAt, code: "ADMIN_CHANGE_LOG_DETAIL", message: "变更日志详情获取成功", data });
  } catch (error) {
    return failJson({ path: PATH, requestId, startedAt, error, fallbackCode: ERROR_CODES.COMMON_INTERNAL_ERROR, fallbackMessage: "变更日志详情获取失败" });
  }
}
