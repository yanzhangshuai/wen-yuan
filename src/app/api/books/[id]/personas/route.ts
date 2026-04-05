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
 * ============================================================================
 * 文件定位：`src/app/api/books/[id]/personas/route.ts`
 * ----------------------------------------------------------------------------
 * Next.js Route Handler 文件，对外暴露同一路径下的两个 HTTP 方法：
 * - `GET /api/books/:id/personas`：查询书籍人物列表
 * - `POST /api/books/:id/personas`：管理员手动新增人物
 *
 * 在整体架构中的角色：
 * - 属于接口层（API 层），负责输入校验、鉴权、服务编排、错误语义映射；
 * - 具体人物写入/读取逻辑由 server modules 承担，本文件不直接操作数据库。
 *
 * 业务背景：
 * - 人物既可来源于自动解析，也支持运营/标注人员手动补录；
 * - 手动新增是“人工校正链路”的关键入口，因此必须走管理员鉴权。
 *
 * 运行环境：
 * - 服务端（Node.js）执行，不参与客户端打包；
 * - 使用 Next.js App Router 路由约定自动注册为接口。
 * ============================================================================
 */

/**
 * 手动新增人物请求体校验 schema。
 *
 * 设计要点：
 * - 对字符串字段统一 `trim()`，避免“看起来有值、实际是空白字符”的脏数据；
 * - 通过 `optional` + `nullable` 区分“字段缺失”和“字段有意置空”两种业务语义；
 * - 数值字段设置上下界，保证评分体系（置信度/讽刺指数）在可解释范围内。
 *
 * 字段业务语义：
 * - `name`：人物标准名，必填，是去重与后续关联的核心键；
 * - `aliases`：人物别名集合，用于提升检索与识别召回；
 * - `gender/hometown`：基础资料，可空，空值表示“未知或暂不维护”；
 * - `nameType`：姓名类型，区分“正式姓名/称谓”，影响展示与后续规则；
 * - `globalTags`：跨书通用标签；`localTags`：仅当前书有效标签；
 * - `localName/localSummary/officialTitle`：书内档案字段，用于阅读与审校视图；
 * - `ironyIndex`：0~10 的领域评分；
 * - `confidence`：0~1 的可信度评分，供人工复核排序。
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

/**
 * 构造“书籍不存在”错误响应（404）。
 *
 * @param requestId 请求追踪 ID。
 * @param startedAt 请求开始时间戳。
 * @param bookId 不存在的书籍 ID。
 */
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

/**
 * 构造“请求参数不合法”错误响应（400）。
 *
 * @param requestId 请求追踪 ID。
 * @param startedAt 请求开始时间戳。
 * @param path 当前接口路径（模板路径或实际路径）。
 * @param detail 详细错误描述（通常来自校验器首条 issue）。
 */
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
 * GET `/api/books/:id/personas`
 *
 * 业务职责：获取一本书的人物列表（只读操作）。
 *
 * @param _request Request 对象。该方法无需读取请求体/查询参数。
 * @param context Next.js 动态路由上下文，含 `params.id`。
 * @returns
 * - 成功：`BookPersonaListItem[]`
 * - 失败：400（参数）/404（书不存在）/500（未知错误）
 */
export async function GET(
  _request: Request,
  context: BookRouteParamsContext
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const path = "/api/books/:id/personas";

  try {
    // 第一步：统一校验路由参数，非法输入在接口边界直接拦截。
    const parsedRoute = await parseBookIdFromRoute(context, path, requestId, startedAt);
    if ("response" in parsedRoute) {
      // 参数非法分支：直接返回共享层构造好的 400 响应。
      return parsedRoute.response;
    }

    // 第二步：查询书籍人物列表。
    // 注意：这里不做额外过滤，列表筛选策略应由调用方或下游服务约定。
    const data = await listBookPersonas(parsedRoute.bookId);

    // 第三步：返回标准成功响应，供管理台列表直接消费。
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
      // 业务分支：书籍主键格式合法，但实体不存在。
      return notFoundJson(requestId, startedAt, error.bookId);
    }

    // 兜底分支：系统内部异常。
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
 * POST `/api/books/:id/personas`
 *
 * 业务职责：为指定书籍手动新增人物（记录来源为 MANUAL）。
 * 这是“人工修订链路”的关键入口，必须强制管理员权限。
 *
 * 用户交互链路：
 * 1. 管理员在前端填写人物信息并提交；
 * 2. 路由层校验登录态与管理员角色；
 * 3. 校验路由参数与请求体；
 * 4. 调用服务层写入人物及档案；
 * 5. 返回 201，前端刷新人物列表。
 *
 * @param request HTTP 请求对象，包含 JSON 请求体与鉴权头信息。
 * @param context 动态路由上下文，含 `params.id`。
 * @returns
 * - 成功：`201 Created` + `CreateBookPersonaResult`
 * - 失败：400/404/500（401/403 由鉴权模块抛出后统一处理）
 */
export async function POST(
  request: Request,
  context: BookRouteParamsContext
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const path = "/api/books/:id/personas";

  try {
    // 第一步：鉴权与权限校验。
    // 这是业务规则，不是技术限制：手动新增人物只能由管理员执行。
    const auth = await getAuthContext(request.headers);
    requireAdmin(auth);

    // 第二步：校验路由参数中的 bookId，防止非法 ID 进入写入流程。
    const parsedRoute = await parseBookIdFromRoute(context, path, requestId, startedAt);
    if ("response" in parsedRoute) {
      return parsedRoute.response;
    }

    // 第三步：读取并校验请求体。
    // 防御目的：在真正写库前过滤掉空字段、越界数值和非法枚举。
    const parsedBody = createBookPersonaBodySchema.safeParse(await readJsonBody(request));
    if (!parsedBody.success) {
      return badRequestJson(
        requestId,
        startedAt,
        path,
        parsedBody.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    // 第四步：调用服务模块执行写入（personas + profiles）。
    // 副作用说明：会新增数据，调用方应在成功后刷新缓存或本地列表。
    const data = await createBookPersona(parsedRoute.bookId, parsedBody.data);

    // 第五步：返回 201 Created，明确这是创建语义而非普通查询。
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
      // 业务实体缺失：返回 404，提示前端书籍已不存在或被删除。
      return notFoundJson(requestId, startedAt, error.bookId);
    }

    // 未知异常兜底：避免将内部错误直接暴露给调用方。
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
