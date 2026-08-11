import { randomUUID } from "node:crypto";

import { z } from "zod";

import { parseBookIdFromRoute, type BookRouteParamsContext } from "@/app/api/books/[id]/_shared";
import { createApiMeta, errorResponse, toNextJson } from "@/server/http/api-response";
import { failJson, okJson } from "@/server/http/route-utils";
import { BookNotFoundError } from "@/server/modules/books/errors";
import {
  getPersonaDetail,
  PersonaNotFoundError,
  type PersonaDetailResult
} from "@/server/modules/graph/getPersonaDetail";
import { ERROR_CODES } from "@/types/api";

/**
 * ============================================================================
 * 文件定位：`src/app/api/books/[id]/personas/[personaId]/route.ts`
 * ----------------------------------------------------------------------------
 * 这是 Next.js App Router 的 Route Handler 文件。
 *
 * 路由映射：`GET /api/books/:id/personas/:personaId`
 *
 * 业务职责：
 * - 返回单本书域内某个人物的详情聚合数据（主档/档案/关系/时间轴/出场统计）；
 * - 供图谱页面“点击角色 → 右侧详情面板”消费；
 * - 统一输出项目标准响应结构（okJson/failJson + meta）。
 *
 * 关键维护点：
 * - `personaId` 与 `id` 都要求 UUID，尽早拦截非法输入；
 * - 书籍不存在返回 404；人物不在该书域返回 404（与图谱路径查询口径一致）。
 * ============================================================================
 */

/** 人物详情路由参数校验：bookId + personaId 均须为 UUID。 */
const personaRouteParamsSchema = z.object({
  /** 人物主键 UUID。 */
  personaId: z.string().uuid("人物 ID 不合法")
});

/** Next.js 动态路由上下文（含两层动态参数）。 */
export interface PersonaRouteParamsContext extends BookRouteParamsContext {
  params: Promise<{ id: string; personaId: string }>;
}

/**
 * 统一构造“资源不存在”错误响应（书籍或人物共用）。
 * 返回联合类型由调用方判断，减少重复的错误映射代码。
 */
function notFoundJson(
  requestId: string,
  startedAt: number,
  path    : string,
  message : string,
  detail  : string
): Response {
  const meta = createApiMeta(path, requestId, startedAt);
  return toNextJson(
    errorResponse(
      ERROR_CODES.COMMON_NOT_FOUND,
      message,
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
 * GET `/api/books/:id/personas/:personaId`
 * 功能：获取指定书籍内某个人物的详情聚合数据。
 * 入参：路由参数 `id`（书籍 UUID）、`personaId`（人物 UUID）。
 * 返回：`PersonaDetailResult` 标准成功响应。
 */
export async function GET(
  _request: Request,
  context: PersonaRouteParamsContext
): Promise<Response> {
  // 每次请求生成 requestId，贯穿所有成功/失败响应，便于链路追踪。
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    // Step 1) 解析并校验路由参数 id（复用共享逻辑）。
    const parsedBook = await parseBookIdFromRoute(context, "/api/books/:id/personas/:personaId", requestId, startedAt);
    if ("response" in parsedBook) {
      return parsedBook.response;
    }

    // Step 2) 解析并校验 personaId。
    const params = await context.params;
    const parsedPersona = personaRouteParamsSchema.safeParse(params);
    if (!parsedPersona.success) {
      const meta = createApiMeta("/api/books/:id/personas/:personaId", requestId, startedAt);
      return toNextJson(
        errorResponse(
          ERROR_CODES.COMMON_BAD_REQUEST,
          "请求参数不合法",
          {
            type  : "ValidationError",
            detail: parsedPersona.error.issues[0]?.message ?? "请求参数不合法"
          },
          meta
        ),
        400
      );
    }

    // Step 3) 调用领域服务获取人物详情。
    const data = await getPersonaDetail({
      bookId   : parsedBook.bookId,
      personaId: parsedPersona.data.personaId
    });

    // Step 4) 返回标准成功响应。
    return okJson<PersonaDetailResult>({
      path   : `/api/books/${parsedBook.bookId}/personas/${parsedPersona.data.personaId}`,
      requestId,
      startedAt,
      code   : "PERSONA_DETAIL_FETCHED",
      message: "人物详情获取成功",
      data
    });
  } catch (error) {
    if (error instanceof BookNotFoundError) {
      return notFoundJson(
        requestId,
        startedAt,
        "/api/books/:id/personas/:personaId",
        "书籍不存在",
        `Book not found: ${error.bookId}`
      );
    }
    if (error instanceof PersonaNotFoundError) {
      return notFoundJson(
        requestId,
        startedAt,
        "/api/books/:id/personas/:personaId",
        "人物不存在",
        `Persona not found: ${error.personaId}`
      );
    }

    // 未知异常统一降级为 500，并保留 requestId 便于排查。
    return failJson({
      path           : "/api/books/:id/personas/:personaId",
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "人物详情获取失败"
    });
  }
}
