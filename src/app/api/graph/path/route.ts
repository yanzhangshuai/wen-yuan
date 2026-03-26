import { randomUUID } from "node:crypto";

import { z } from "zod";

import { createApiMeta, errorResponse, toNextJson } from "@/server/http/api-response";
import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { BookNotFoundError } from "@/server/modules/books/errors";
import {
  findPersonaPath,
  PersonaNotFoundError,
  type PersonaPathResult
} from "@/server/modules/graph/findPersonaPath";
import { ERROR_CODES } from "@/types/api";

/**
 * 功能：人物最短路径查询请求体校验。
 * 输入字段：
 * - `bookId: string` 当前图谱所属书籍 ID（UUID）。
 * - `sourcePersonaId: string` 起点人物 ID（UUID）。
 * - `targetPersonaId: string` 终点人物 ID（UUID）。
 * 输出：可直接传给 `findPersonaPath` 的强类型入参。
 * 异常：无（校验失败由路由返回 400）。
 * 副作用：无。
 */
const graphPathBodySchema = z.object({
  bookId         : z.string().uuid("书籍 ID 不合法"),
  sourcePersonaId: z.string().uuid("起点人物 ID 不合法"),
  targetPersonaId: z.string().uuid("终点人物 ID 不合法")
});

function badRequestJson(requestId: string, startedAt: number, detail: string) {
  const meta = createApiMeta("/api/graph/path", requestId, startedAt);
  return toNextJson(
    errorResponse(
      ERROR_CODES.COMMON_BAD_REQUEST,
      "请求参数不合法",
      {
        type: "ValidationError",
        detail
      },
      meta
    ),
    400
  );
}

function notFoundJson(requestId: string, startedAt: number, detail: string) {
  const meta = createApiMeta("/api/graph/path", requestId, startedAt);
  return toNextJson(
    errorResponse(
      ERROR_CODES.COMMON_NOT_FOUND,
      "资源不存在",
      {
        type: "NotFoundError",
        detail
      },
      meta
    ),
    404
  );
}

/**
 * 功能：查询两个人物在单书图谱内的最短关系路径。
 * 输入：请求体包含 `bookId/sourcePersonaId/targetPersonaId`。
 * 输出：路径查询结果（是否可达、路径节点与关系边）。
 * 异常：参数错误 400；书籍或人物不存在 404；其余失败 500。
 * 副作用：无（只读查询）。
 */
export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const parsedBody = graphPathBodySchema.safeParse(await readJsonBody(request));
    if (!parsedBody.success) {
      return badRequestJson(requestId, startedAt, parsedBody.error.issues[0]?.message ?? "请求参数不合法");
    }

    const data = await findPersonaPath(parsedBody.data);
    return okJson<PersonaPathResult>({
      path   : "/api/graph/path",
      requestId,
      startedAt,
      code   : "GRAPH_PATH_SEARCHED",
      message: data.found ? "关系路径查找成功" : "未找到可达路径",
      data
    });
  } catch (error) {
    if (error instanceof BookNotFoundError) {
      return notFoundJson(requestId, startedAt, `Book not found: ${error.bookId}`);
    }

    if (error instanceof PersonaNotFoundError) {
      return notFoundJson(requestId, startedAt, `Persona not found: ${error.personaId}`);
    }

    return failJson({
      path           : "/api/graph/path",
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "关系路径查找失败"
    });
  }
}
