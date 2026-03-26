import { randomUUID } from "node:crypto";

import { z } from "zod";

import { BioCategory } from "@/generated/prisma/enums";
import { createApiMeta, errorResponse, toNextJson } from "@/server/http/api-response";
import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import {
  createPersonaBiography,
  type CreatePersonaBiographyResult
} from "@/server/modules/biography/createPersonaBiography";
import { BiographyInputError } from "@/server/modules/biography/errors";
import { PersonaNotFoundError } from "@/server/modules/personas/errors";
import { ERROR_CODES } from "@/types/api";

/** 人物路由参数 Schema（`/api/personas/:id/biography`）。 */
const personaRouteParamsSchema = z.object({
  /** 人物主键 UUID。 */
  id: z.string().uuid("人物 ID 不合法")
});

/** 创建传记事件请求体 Schema。 */
const createBiographyBodySchema = z.object({
  /** 章节 ID（UUID）。 */
  chapterId  : z.string().uuid("章节 ID 不合法"),
  /** 事件分类（可选，默认由服务层决定）。 */
  category   : z.nativeEnum(BioCategory).optional(),
  /** 事件标题（可空）。 */
  title      : z.string().trim().nullable().optional(),
  /** 事件地点（可空）。 */
  location   : z.string().trim().nullable().optional(),
  /** 事件正文，最少 1 个字符。 */
  event      : z.string().trim().min(1, "事件内容不能为空"),
  /** 虚拟年份（可空，保留字段）。 */
  virtualYear: z.string().trim().nullable().optional()
});

/** Route Handler 上下文。 */
interface PersonaBiographyRouteContext {
  /** 动态参数 Promise，resolve 后包含 `{ id: string }`。 */
  params: Promise<{ id: string }>;
}

/**
 * 功能：构造参数校验失败响应。
 * 输入：requestId、startedAt、错误详情。
 * 输出：HTTP 400 响应。
 * 异常：无。
 * 副作用：无。
 */
function badRequestJson(
  requestId: string,
  startedAt: number,
  detail: string
): Response {
  const meta = createApiMeta("/api/personas/:id/biography", requestId, startedAt);
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
 * 功能：构造“人物不存在”错误响应。
 * 输入：requestId、startedAt、personaId。
 * 输出：HTTP 404 响应。
 * 异常：无。
 * 副作用：无。
 */
function notFoundJson(
  requestId: string,
  startedAt: number,
  personaId: string
): Response {
  const meta = createApiMeta(`/api/personas/${personaId}/biography`, requestId, startedAt);
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
 * POST `/api/personas/:id/biography`
 * 功能：为指定人物新增一条传记事件（管理员操作）。
 * 入参：
 * - 路由参数：`id`（人物 UUID）；
 * - 请求体：`chapterId/category/title/location/event/virtualYear`。
 * 返回：`CreatePersonaBiographyResult`（HTTP 201）。
 */
export async function POST(
  request: Request,
  context: PersonaBiographyRouteContext
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const path = "/api/personas/:id/biography";

  try {
    const auth = await getAuthContext(request.headers);
    requireAdmin(auth);

    const params = await context.params;
    const parsedParams = personaRouteParamsSchema.safeParse(params);
    if (!parsedParams.success) {
      return badRequestJson(
        requestId,
        startedAt,
        parsedParams.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    const parsedBody = createBiographyBodySchema.safeParse(await readJsonBody(request));
    if (!parsedBody.success) {
      return badRequestJson(
        requestId,
        startedAt,
        parsedBody.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    const data = await createPersonaBiography(parsedParams.data.id, parsedBody.data);
    return okJson<CreatePersonaBiographyResult>({
      path   : `/api/personas/${parsedParams.data.id}/biography`,
      requestId,
      startedAt,
      code   : "PERSONA_BIOGRAPHY_CREATED",
      message: "传记事件创建成功",
      data,
      status : 201
    });
  } catch (error) {
    if (error instanceof PersonaNotFoundError) {
      return notFoundJson(requestId, startedAt, error.personaId);
    }
    if (error instanceof BiographyInputError) {
      return badRequestJson(requestId, startedAt, error.message);
    }

    return failJson({
      path,
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "传记事件创建失败"
    });
  }
}
