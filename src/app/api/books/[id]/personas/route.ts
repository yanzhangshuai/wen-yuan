import { randomUUID } from "node:crypto";

import { z } from "zod";

import { parseBookIdFromRoute, type BookRouteParamsContext } from "@/app/api/books/[id]/_shared";
import { NameType } from "@/generated/prisma/enums";
import { createApiMeta, errorResponse, toNextJson } from "@/server/http/api-response";
import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { BookNotFoundError } from "@/server/modules/books/errors";
import {
  createBookPersona,
  type CreateBookPersonaResult
} from "@/server/modules/personas/createBookPersona";
import {
  listBookPersonas,
  type BookPersonaListItem
} from "@/server/modules/personas/listBookPersonas";
import { ERROR_CODES } from "@/types/api";

/**
 * 功能：手动新增人物请求体校验。
 * 输入字段：
 * - `name: string` 人物标准名（必填）。
 * - `aliases: string[] | undefined` 别名列表。
 * - `gender/hometown: string | null | undefined` 基础属性。
 * - `nameType: NameType | undefined` 人名类型（有名/仅称号）。
 * - `globalTags/localTags: string[] | undefined` 全局标签与书内标签。
 * - `localName/localSummary/officialTitle` 书内档案字段。
 * - `ironyIndex: number(0-10) | undefined` 讽刺指数。
 * - `confidence: number(0-1) | undefined` 置信度。
 * 输出：可直接写入人物与档案模块的强类型入参。
 * 异常：无（校验失败由路由返回 400）。
 * 副作用：无。
 */
const createBookPersonaBodySchema = z.object({
  name         : z.string().trim().min(1, "人物姓名不能为空"),
  aliases      : z.array(z.string().trim().min(1, "人物别名不能为空")).optional(),
  gender       : z.string().trim().min(1, "人物性别不能为空").nullable().optional(),
  hometown     : z.string().trim().min(1, "人物籍贯不能为空").nullable().optional(),
  nameType     : z.nativeEnum(NameType).optional(),
  globalTags   : z.array(z.string().trim().min(1, "人物标签不能为空")).optional(),
  localName    : z.string().trim().min(1, "书中称谓不能为空").optional(),
  localSummary : z.string().trim().nullable().optional(),
  officialTitle: z.string().trim().nullable().optional(),
  localTags    : z.array(z.string().trim().min(1, "本书标签不能为空")).optional(),
  ironyIndex   : z.number().min(0, "讽刺指数不能小于 0").max(10, "讽刺指数不能大于 10").optional(),
  confidence   : z.number().min(0, "置信度不能小于 0").max(1, "置信度不能大于 1").optional()
});

function notFoundJson(
  requestId: string,
  startedAt: number,
  bookId: string
): Response {
  const meta = createApiMeta(`/api/books/${bookId}/personas`, requestId, startedAt);
  return toNextJson(
    errorResponse(
      ERROR_CODES.COMMON_NOT_FOUND,
      "书籍不存在",
      {
        type  : "NotFoundError",
        detail: `Book not found: ${bookId}`
      },
      meta
    ),
    404
  );
}

function badRequestJson(
  requestId: string,
  startedAt: number,
  path: string,
  detail: string
): Response {
  const meta = createApiMeta(path, requestId, startedAt);
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
 * 功能：获取一本书的人物列表。
 * 输入：路由参数 `bookId`。
 * 输出：人物列表（含人物基础信息、置信度、审核状态等字段）。
 * 异常：书籍不存在返回 404；其余失败返回 500。
 * 副作用：无。
 */
export async function GET(
  _request: Request,
  context: BookRouteParamsContext
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const path = "/api/books/:id/personas";

  try {
    const parsedRoute = await parseBookIdFromRoute(context, path, requestId, startedAt);
    if ("response" in parsedRoute) {
      return parsedRoute.response;
    }

    const data = await listBookPersonas(parsedRoute.bookId);
    return okJson<BookPersonaListItem[]>({
      path   : `/api/books/${parsedRoute.bookId}/personas`,
      requestId,
      startedAt,
      code   : "BOOK_PERSONAS_FETCHED",
      message: "人物列表获取成功",
      data
    });
  } catch (error) {
    if (error instanceof BookNotFoundError) {
      return notFoundJson(requestId, startedAt, error.bookId);
    }

    return failJson({
      path,
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "人物列表获取失败"
    });
  }
}

/**
 * 功能：为一本书手动新增人物（MANUAL 来源）。
 * 输入：管理员身份 + 路由参数 `bookId` + 人物请求体。
 * 输出：201 Created，返回新人物与 profile 核心字段。
 * 异常：参数错误 400；书籍不存在 404；其余失败 500。
 * 副作用：写入 `personas` 与 `profiles` 表。
 */
export async function POST(
  request: Request,
  context: BookRouteParamsContext
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const path = "/api/books/:id/personas";

  try {
    const auth = await getAuthContext(request.headers);
    requireAdmin(auth);

    const parsedRoute = await parseBookIdFromRoute(context, path, requestId, startedAt);
    if ("response" in parsedRoute) {
      return parsedRoute.response;
    }

    const parsedBody = createBookPersonaBodySchema.safeParse(await readJsonBody(request));
    if (!parsedBody.success) {
      return badRequestJson(
        requestId,
        startedAt,
        path,
        parsedBody.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    const data = await createBookPersona(parsedRoute.bookId, parsedBody.data);
    return okJson<CreateBookPersonaResult>({
      path   : `/api/books/${parsedRoute.bookId}/personas`,
      requestId,
      startedAt,
      code   : "BOOK_PERSONA_CREATED",
      message: "人物创建成功",
      data,
      status : 201
    });
  } catch (error) {
    if (error instanceof BookNotFoundError) {
      return notFoundJson(requestId, startedAt, error.bookId);
    }

    return failJson({
      path,
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "人物创建失败"
    });
  }
}
