import { randomUUID } from "node:crypto";

import { z } from "zod";

import { createApiMeta, errorResponse, toNextJson } from "@/server/http/api-response";
import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import {
  mergePersonas,
  PersonaMergeInputError,
  PersonaNotFoundError,
  type MergePersonasResult
} from "@/server/modules/personas/mergePersonas";
import { ERROR_CODES } from "@/types/api";

/**
 * 功能：人物合并请求体校验。
 * 输入字段：
 * - `sourceId: string` 被合并人物 ID（UUID）。
 * - `targetId: string` 主人物 ID（UUID）。
 * 输出：可直接传入 `mergePersonas` 的强类型入参。
 * 异常：无（校验失败由路由返回 400）。
 * 副作用：无。
 */
const mergePersonasBodySchema = z.object({
  sourceId: z.string().uuid("源人物 ID 不合法"),
  targetId: z.string().uuid("目标人物 ID 不合法")
});

function badRequestJson(
  requestId: string,
  startedAt: number,
  detail: string
): Response {
  const path = "/api/personas/merge";
  const meta = createApiMeta(path, requestId, startedAt);
  return toNextJson(
    errorResponse(
      ERROR_CODES.COMMON_BAD_REQUEST,
      "人物合并参数不合法",
      {
        type: "ValidationError",
        detail
      },
      meta
    ),
    400
  );
}

function notFoundJson(
  requestId: string,
  startedAt: number,
  personaId: string
): Response {
  const path = "/api/personas/merge";
  const meta = createApiMeta(path, requestId, startedAt);
  return toNextJson(
    errorResponse(
      ERROR_CODES.COMMON_NOT_FOUND,
      "人物不存在",
      {
        type  : "NotFoundError",
        detail: `Persona not found: ${personaId}`
      },
      meta
    ),
    404
  );
}

/**
 * 功能：执行两个人物的实体合并。
 * 输入：管理员身份 + 合并请求体 `{ sourceId, targetId }`。
 * 输出：合并结果（重定向数量、冲突处理统计等）。
 * 异常：参数错误 400；人物不存在 404；其余失败 500。
 * 副作用：批量重定向关系、事件、提及并软删除 source 人物。
 */
export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const path = "/api/personas/merge";

  try {
    const auth = await getAuthContext(request.headers);
    requireAdmin(auth);

    const parsedBody = mergePersonasBodySchema.safeParse(await readJsonBody(request));
    if (!parsedBody.success) {
      return badRequestJson(
        requestId,
        startedAt,
        parsedBody.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    const data = await mergePersonas(parsedBody.data);
    return okJson<MergePersonasResult>({
      path,
      requestId,
      startedAt,
      code   : "PERSONA_MERGED",
      message: "人物合并成功",
      data
    });
  } catch (error) {
    if (error instanceof PersonaNotFoundError) {
      return notFoundJson(requestId, startedAt, error.personaId);
    }

    if (error instanceof PersonaMergeInputError) {
      return badRequestJson(requestId, startedAt, error.message);
    }

    return failJson({
      path,
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "人物合并失败"
    });
  }
}
