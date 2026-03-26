import { randomUUID } from "node:crypto";

import { z } from "zod";

import { createApiMeta, errorResponse, toNextJson } from "@/server/http/api-response";
import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import {
  deletePersona,
  type DeletePersonaResult
} from "@/server/modules/personas/deletePersona";
import { PersonaNotFoundError } from "@/server/modules/personas/errors";
import {
  getPersonaById,
  type PersonaDetailSnapshot
} from "@/server/modules/personas/getPersonaById";
import {
  updatePersona,
  type UpdatePersonaResult
} from "@/server/modules/personas/updatePersona";
import { ERROR_CODES } from "@/types/api";
import { NameType } from "@/generated/prisma/enums";

const personaRouteParamsSchema = z.object({
  id: z.string().uuid("人物 ID 不合法")
});

/**
 * 功能：人物更新请求体校验。
 * 输入字段：
 * - `name/aliases/gender/hometown/nameType` 人物主档字段。
 * - `globalTags` 全局标签数组。
 * - `confidence` AI 置信度（0~1）。
 * 输出：可直接传入 `updatePersona` 的局部更新对象。
 * 异常：空对象会被 `refine` 拦截并返回校验失败。
 * 副作用：无。
 */
const updatePersonaBodySchema = z.object({
  name      : z.string().trim().min(1, "人物姓名不能为空").optional(),
  aliases   : z.array(z.string().trim().min(1, "人物别名不能为空")).optional(),
  gender    : z.string().trim().min(1, "人物性别不能为空").nullable().optional(),
  hometown  : z.string().trim().min(1, "人物籍贯不能为空").nullable().optional(),
  nameType  : z.nativeEnum(NameType).optional(),
  globalTags: z.array(z.string().trim().min(1, "人物标签不能为空")).optional(),
  confidence: z.number().min(0, "置信度不能小于 0").max(1, "置信度不能大于 1").optional()
}).refine((data) => Object.keys(data).length > 0, {
  message: "至少需要一个可更新字段"
});

interface PersonaRouteContext {
  params: Promise<{ id: string }>;
}

function notFoundJson(requestId: string, startedAt: number, personaId: string) {
  const meta = createApiMeta(`/api/personas/${personaId}`, requestId, startedAt);
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
 * 功能：查询人物详情快照（主档 + 关系 + 时间轴）。
 * 输入：路由参数 `id`。
 * 输出：`PersonaDetailSnapshot` 结构，供图谱侧边栏与审核页复用。
 * 异常：参数错误 400；人物不存在 404；其余失败 500。
 * 副作用：无（只读查询）。
 */
export async function GET(
  _request: Request,
  context: PersonaRouteContext
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const params = await context.params;
    const parsedParams = personaRouteParamsSchema.safeParse(params);
    if (!parsedParams.success) {
      const meta = createApiMeta("/api/personas/:id", requestId, startedAt);
      return toNextJson(
        errorResponse(
          ERROR_CODES.COMMON_BAD_REQUEST,
          "请求参数不合法",
          {
            type  : "ValidationError",
            detail: parsedParams.error.issues[0]?.message ?? "请求参数不合法"
          },
          meta
        ),
        400
      );
    }

    const data = await getPersonaById(parsedParams.data.id);
    return okJson<PersonaDetailSnapshot>({
      path   : `/api/personas/${parsedParams.data.id}`,
      requestId,
      startedAt,
      code   : "PERSONA_FETCHED",
      message: "人物详情获取成功",
      data
    });
  } catch (error) {
    if (error instanceof PersonaNotFoundError) {
      return notFoundJson(requestId, startedAt, error.personaId);
    }

    return failJson({
      path           : "/api/personas/:id",
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "人物详情获取失败"
    });
  }
}

/**
 * 功能：更新人物主档字段。
 * 输入：管理员身份 + 路由参数 `id` + 局部更新请求体。
 * 输出：更新后的人物核心字段。
 * 异常：参数错误 400；人物不存在 404；其余失败 500。
 * 副作用：写入 `personas` 表。
 */
export async function PATCH(
  request: Request,
  context: PersonaRouteContext
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const path = "/api/personas/:id";

  try {
    const auth = await getAuthContext(request.headers);
    requireAdmin(auth);

    const params = await context.params;
    const parsedParams = personaRouteParamsSchema.safeParse(params);
    if (!parsedParams.success) {
      const meta = createApiMeta(path, requestId, startedAt);
      return toNextJson(
        errorResponse(
          ERROR_CODES.COMMON_BAD_REQUEST,
          "请求参数不合法",
          {
            type  : "ValidationError",
            detail: parsedParams.error.issues[0]?.message ?? "请求参数不合法"
          },
          meta
        ),
        400
      );
    }

    const parsedBody = updatePersonaBodySchema.safeParse(await readJsonBody(request));
    if (!parsedBody.success) {
      const meta = createApiMeta(path, requestId, startedAt);
      return toNextJson(
        errorResponse(
          ERROR_CODES.COMMON_BAD_REQUEST,
          "请求参数不合法",
          {
            type  : "ValidationError",
            detail: parsedBody.error.issues[0]?.message ?? "请求参数不合法"
          },
          meta
        ),
        400
      );
    }

    const data = await updatePersona(parsedParams.data.id, parsedBody.data);
    return okJson<UpdatePersonaResult>({
      path   : `/api/personas/${parsedParams.data.id}`,
      requestId,
      startedAt,
      code   : "PERSONA_UPDATED",
      message: "人物更新成功",
      data
    });
  } catch (error) {
    if (error instanceof PersonaNotFoundError) {
      return notFoundJson(requestId, startedAt, error.personaId);
    }

    return failJson({
      path,
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "人物更新失败"
    });
  }
}

/**
 * 功能：软删除人物并级联处理关联数据状态。
 * 输入：管理员身份 + 路由参数 `id`。
 * 输出：删除结果（包含级联影响计数）。
 * 异常：参数错误 400；人物不存在 404；其余失败 500。
 * 副作用：写入 `personas/relationships/biography/mentions/profiles`。
 */
export async function DELETE(
  request: Request,
  context: PersonaRouteContext
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const path = "/api/personas/:id";

  try {
    const auth = await getAuthContext(request.headers);
    requireAdmin(auth);

    const params = await context.params;
    const parsedParams = personaRouteParamsSchema.safeParse(params);
    if (!parsedParams.success) {
      const meta = createApiMeta(path, requestId, startedAt);
      return toNextJson(
        errorResponse(
          ERROR_CODES.COMMON_BAD_REQUEST,
          "请求参数不合法",
          {
            type  : "ValidationError",
            detail: parsedParams.error.issues[0]?.message ?? "请求参数不合法"
          },
          meta
        ),
        400
      );
    }

    const data = await deletePersona(parsedParams.data.id);
    return okJson<DeletePersonaResult>({
      path   : `/api/personas/${parsedParams.data.id}`,
      requestId,
      startedAt,
      code   : "PERSONA_DELETED",
      message: "人物删除成功",
      data
    });
  } catch (error) {
    if (error instanceof PersonaNotFoundError) {
      return notFoundJson(requestId, startedAt, error.personaId);
    }

    return failJson({
      path,
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "人物删除失败"
    });
  }
}
