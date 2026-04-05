/**
 * =============================================================================
 * 文件定位（Next.js App Router 动态路由接口）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/app/api/biography/[id]/route.ts`
 *
 * 这是 App Router 的 `route.ts` 文件：Next.js 会把它注册为 `/api/biography/:id` 接口，
 * 并按导出函数名自动映射 HTTP 方法（本文件为 `PATCH` 与 `DELETE`）。
 *
 * 核心业务职责：
 * 1) 处理“人物传记事件”的更新与删除；
 * 2) 统一完成鉴权、路由参数校验、请求体校验、错误码映射；
 * 3) 作为前端管理台与 biography service 之间的协议边界，保证输入输出稳定。
 *
 * 运行环境与链路位置：
 * - 仅在服务端执行（非 React 组件，不参与页面渲染）；
 * - 上游输入来自管理端 HTTP 请求（路径参数 + JSON body + Cookie 登录态）；
 * - 下游调用 `updateBiographyRecord/deleteBiographyRecord` 领域服务并返回标准 API 响应。
 *
 * 维护约束：
 * - 这是对外 API 合同层，错误码/响应结构属于业务契约，不是技术细节，不能随意改动；
 * - `id` 对应传记记录主键，不能误解为 personaId，否则会导致误删/误改风险。
 * =============================================================================
 */
import { randomUUID } from "node:crypto";

import { z } from "zod";

import { BioCategory, ProcessingStatus } from "@/generated/prisma/enums";
import { createApiMeta, errorResponse, toNextJson } from "@/server/http/api-response";
import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import {
  deleteBiographyRecord,
  type DeleteBiographyRecordResult
} from "@/server/modules/biography/deleteBiographyRecord";
import {
  BiographyInputError,
  BiographyRecordNotFoundError
} from "@/server/modules/biography/errors";
import {
  updateBiographyRecord,
  type UpdateBiographyRecordResult
} from "@/server/modules/biography/updateBiographyRecord";
import { ERROR_CODES } from "@/types/api";

/**
 * 路由参数校验：传记记录 ID。
 */
const biographyRouteParamsSchema = z.object({
  id: z.string().uuid("传记记录 ID 不合法")
});

/**
 * PATCH 请求体校验：传记记录可更新字段。
 */
const updateBiographyBodySchema = z.object({
  chapterId  : z.string().uuid("章节 ID 不合法").optional(),
  category   : z.nativeEnum(BioCategory).optional(),
  title      : z.string().trim().nullable().optional(),
  location   : z.string().trim().nullable().optional(),
  event      : z.string().trim().min(1, "事件内容不能为空").optional(),
  virtualYear: z.string().trim().nullable().optional(),
  status     : z.nativeEnum(ProcessingStatus).optional()
}).refine((data) => Object.keys(data).length > 0, {
  message: "至少需要一个可更新字段"
});

/**
 * Next.js 动态路由上下文。
 */
interface BiographyRouteContext {
  /** 路由参数 Promise（由框架注入）。 */
  params: Promise<{ id: string }>;
}

/**
 * 构造参数错误统一响应。
 */
function badRequestJson(
  requestId: string,
  startedAt: number,
  detail: string
): Response {
  const meta = createApiMeta("/api/biography/:id", requestId, startedAt);
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
 * 构造「传记记录不存在」统一响应。
 */
function notFoundJson(
  requestId: string,
  startedAt: number,
  biographyId: string
): Response {
  const meta = createApiMeta(`/api/biography/${biographyId}`, requestId, startedAt);
  return toNextJson(
    errorResponse(
      ERROR_CODES.COMMON_NOT_FOUND,
      "传记记录不存在",
      {
        type  : "NotFoundError",
        detail: `Biography record not found: ${biographyId}`
      },
      meta
    ),
    404
  );
}

/**
 * 功能：更新单条传记记录。
 * 输入：路由参数 `id` + JSON body（章节/类型/事件/状态等）。
 * 输出：统一 API 成功响应，`data` 为更新后的传记记录。
 * 异常：参数错误返回 400；记录不存在返回 404；其余返回 500。
 * 副作用：要求管理员权限，写入传记记录更新。
 */
export async function PATCH(
  request: Request,
  context: BiographyRouteContext
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const path = "/api/biography/:id";

  try {
    const auth = await getAuthContext(request.headers);
    requireAdmin(auth);

    const params = await context.params;
    const parsedParams = biographyRouteParamsSchema.safeParse(params);
    if (!parsedParams.success) {
      return badRequestJson(
        requestId,
        startedAt,
        parsedParams.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    const parsedBody = updateBiographyBodySchema.safeParse(await readJsonBody(request));
    if (!parsedBody.success) {
      return badRequestJson(
        requestId,
        startedAt,
        parsedBody.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    const data = await updateBiographyRecord(parsedParams.data.id, parsedBody.data);
    return okJson<UpdateBiographyRecordResult>({
      path   : `/api/biography/${parsedParams.data.id}`,
      requestId,
      startedAt,
      code   : "BIOGRAPHY_UPDATED",
      message: "传记记录更新成功",
      data
    });
  } catch (error) {
    if (error instanceof BiographyRecordNotFoundError) {
      return notFoundJson(requestId, startedAt, error.biographyId);
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
      fallbackMessage: "传记记录更新失败"
    });
  }
}

/**
 * 功能：软删除单条传记记录。
 * 输入：路由参数 `id`。
 * 输出：统一 API 成功响应，`data` 为删除结果。
 * 异常：参数错误返回 400；记录不存在返回 404；其余返回 500。
 * 副作用：要求管理员权限，更新传记记录状态并写入 `deletedAt`。
 */
export async function DELETE(
  request: Request,
  context: BiographyRouteContext
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const path = "/api/biography/:id";

  try {
    const auth = await getAuthContext(request.headers);
    requireAdmin(auth);

    const params = await context.params;
    const parsedParams = biographyRouteParamsSchema.safeParse(params);
    if (!parsedParams.success) {
      return badRequestJson(
        requestId,
        startedAt,
        parsedParams.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    const data = await deleteBiographyRecord(parsedParams.data.id);
    return okJson<DeleteBiographyRecordResult>({
      path   : `/api/biography/${parsedParams.data.id}`,
      requestId,
      startedAt,
      code   : "BIOGRAPHY_DELETED",
      message: "传记记录删除成功",
      data
    });
  } catch (error) {
    if (error instanceof BiographyRecordNotFoundError) {
      return notFoundJson(requestId, startedAt, error.biographyId);
    }

    return failJson({
      path,
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "传记记录删除失败"
    });
  }
}
