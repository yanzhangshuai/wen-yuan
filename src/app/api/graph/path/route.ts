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
 * ============================================================================
 * 文件定位：`src/app/api/graph/path/route.ts`
 * ----------------------------------------------------------------------------
 * 这是 Next.js App Router 的接口文件，映射 POST `/api/graph/path`。
 *
 * 框架语义：
 * - 位于 `app/api/<...>/route.ts` 目录约定下，由 Next.js 自动注册为 Route Handler；
 * - 本文件处理 JSON 请求体，不参与页面组件渲染。
 *
 * 业务职责：
 * - 在“单本书图谱域”内查询两个人物的最短关系路径；
 * - 对请求参数做严格 UUID 校验；
 * - 将领域错误（书不存在 / 人物不存在）映射为 404。
 *
 * 上下游关系：
 * - 上游：图谱工具栏“路径查找”交互（客户端服务层 `searchPersonaPath`）；
 * - 下游：`findPersonaPath` 服务（Neo4j 优先 + PostgreSQL 回退）。
 * ============================================================================
 */

/**
 * 人物最短路径查询请求体 Schema。
 * 三个 ID 都必须是 UUID，避免进入服务层后才报错。
 */
const graphPathBodySchema = z.object({
  bookId         : z.string().uuid("书籍 ID 不合法"),
  sourcePersonaId: z.string().uuid("起点人物 ID 不合法"),
  targetPersonaId: z.string().uuid("终点人物 ID 不合法")
});

/**
 * 构造 400 响应。
 * 设计原因：参数错误应尽早返回，避免不必要的数据库/图查询开销。
 */
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

/**
 * 构造 404 响应。
 * 说明：此处 404 统一表达“请求目标不存在”（书籍不存在或人物不存在）。
 */
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
    // Step 1) 读取并校验 JSON body。
    const parsedBody = graphPathBodySchema.safeParse(await readJsonBody(request));
    if (!parsedBody.success) {
      return badRequestJson(requestId, startedAt, parsedBody.error.issues[0]?.message ?? "请求参数不合法");
    }

    // Step 2) 调用路径查询服务（内部已处理 Neo4j/PG 双轨策略）。
    const data = await findPersonaPath(parsedBody.data);

    // Step 3) 返回成功响应；未找到路径仍是业务成功（found=false）。
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
      // 书域不存在：路径查询没有业务意义，返回 404。
      return notFoundJson(requestId, startedAt, `Book not found: ${error.bookId}`);
    }

    if (error instanceof PersonaNotFoundError) {
      // 起点或终点人物不在当前书域图谱内，返回 404。
      return notFoundJson(requestId, startedAt, `Persona not found: ${error.personaId}`);
    }

    // 兜底未知异常，保证响应契约稳定。
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
