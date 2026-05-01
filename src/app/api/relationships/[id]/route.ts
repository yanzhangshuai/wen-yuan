/**
 * =============================================================================
 * 文件定位（Next.js Route Handler：单条关系更新/删除）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/app/api/relationships/[id]/route.ts`
 *
 * 路由语义：
 * - `PATCH /api/relationships/:id`：更新关系字段（按需部分更新）；
 * - `DELETE /api/relationships/:id`：删除指定关系。
 *
 * 业务职责：
 * - 提供关系审核阶段的精细编辑能力；
 * - 接口层负责输入校验、错误映射和鉴权，不直接承载领域规则细节。
 *
 * 关键约束：
 * - `id` 是关系主键，必须通过 UUID 强校验；
 * - PATCH 字段可选但至少一项，这是业务规则（防止空提交造成“成功但无变化”的误导）。
 * =============================================================================
 */
import { randomUUID } from "node:crypto";

import { z } from "zod";

import { ProcessingStatus, RecordSource } from "@/generated/prisma/enums";
import { createApiMeta, errorResponse, toNextJson } from "@/server/http/api-response";
import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import {
  deleteRelationship,
  type DeleteRelationshipResult
} from "@/server/modules/relationships/deleteRelationship";
import {
  RelationshipInputError,
  RelationshipNotFoundError
} from "@/server/modules/relationships/errors";
import {
  updateRelationship,
  type UpdateRelationshipInput,
  type UpdateRelationshipResult
} from "@/server/modules/relationships/updateRelationship";
import { ERROR_CODES } from "@/types/api";

/**
 * 路由参数校验：关系主键 ID。
 */
const relationshipRouteParamsSchema = z.object({
  id: z.string().uuid("关系 ID 不合法")
});

/**
 * PATCH 请求体校验：允许按需更新书级关系字段。
 */
const updateRelationshipBodySchema = z.object({
  relationshipTypeCode: z.string().trim().min(1, "关系类型不能为空").max(64, "关系类型过长").optional(),
  status              : z.enum(["DRAFT", "VERIFIED", "REJECTED"]).optional(),
  recordSource        : z.enum(["DRAFT_AI", "AI", "MANUAL"]).optional()
}).refine((data) => Object.keys(data).length > 0, {
  message: "至少需要一个可更新字段"
});

type UpdateRelationshipBody = z.infer<typeof updateRelationshipBodySchema>;

function toUpdateRelationshipInput(body: UpdateRelationshipBody): UpdateRelationshipInput {
  return {
    relationshipTypeCode: body.relationshipTypeCode,
    status              : body.status ? ProcessingStatus[body.status] : undefined,
    recordSource        : body.recordSource ? RecordSource[body.recordSource] : undefined
  };
}

/**
 * Next.js App Router 的动态路由上下文。
 */
interface RelationshipRouteContext {
  /** 路由参数 Promise（由框架注入）。 */
  params: Promise<{ id: string }>;
}

/**
 * 构造「关系不存在」统一响应。
 */
function notFoundJson(
  requestId: string,
  startedAt: number,
  relationshipId: string
): Response {
  const meta = createApiMeta(`/api/relationships/${relationshipId}`, requestId, startedAt);
  return toNextJson(
    errorResponse(
      ERROR_CODES.COMMON_NOT_FOUND,
      "关系不存在",
      {
        type  : "NotFoundError",
        detail: `Relationship not found: ${relationshipId}`
      },
      meta
    ),
    404
  );
}

/**
 * 构造参数错误统一响应。
 */
function badRequestJson(
  requestId: string,
  startedAt: number,
  detail: string
): Response {
  const meta = createApiMeta("/api/relationships/:id", requestId, startedAt);
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
 * 功能：更新关系。
 * 输入：路由参数 `id` + JSON body（可选更新字段）。
 * 输出：统一 API 成功响应，`data` 为更新后的关系快照。
 * 异常：参数错误返回 400；关系不存在返回 404；其余返回 500。
 * 副作用：要求管理员权限，写入关系更新。
 */
export async function PATCH(
  request: Request,
  context: RelationshipRouteContext
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const path = "/api/relationships/:id";

  try {
    const auth = await getAuthContext(request.headers);
    requireAdmin(auth);

    const params = await context.params;
    const parsedParams = relationshipRouteParamsSchema.safeParse(params);
    if (!parsedParams.success) {
      return badRequestJson(
        requestId,
        startedAt,
        parsedParams.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    const parsedBody = updateRelationshipBodySchema.safeParse(await readJsonBody(request));
    if (!parsedBody.success) {
      return badRequestJson(
        requestId,
        startedAt,
        parsedBody.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    const data = await updateRelationship(
      parsedParams.data.id,
      toUpdateRelationshipInput(parsedBody.data)
    );
    return okJson<UpdateRelationshipResult>({
      path   : `/api/relationships/${parsedParams.data.id}`,
      requestId,
      startedAt,
      code   : "RELATIONSHIP_UPDATED",
      message: "关系更新成功",
      data
    });
  } catch (error) {
    if (error instanceof RelationshipNotFoundError) {
      return notFoundJson(requestId, startedAt, error.relationshipId);
    }
    if (error instanceof RelationshipInputError) {
      return badRequestJson(requestId, startedAt, error.message);
    }

    return failJson({
      path,
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "关系更新失败"
    });
  }
}

/**
 * 功能：软删除关系。
 * 输入：路由参数 `id`。
 * 输出：统一 API 成功响应，`data` 为删除结果快照。
 * 异常：参数错误返回 400；关系不存在返回 404；其余返回 500。
 * 副作用：要求管理员权限，更新关系状态为 `REJECTED` 并写入 `deletedAt`。
 */
export async function DELETE(
  request: Request,
  context: RelationshipRouteContext
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const path = "/api/relationships/:id";

  try {
    const auth = await getAuthContext(request.headers);
    requireAdmin(auth);

    const params = await context.params;
    const parsedParams = relationshipRouteParamsSchema.safeParse(params);
    if (!parsedParams.success) {
      return badRequestJson(
        requestId,
        startedAt,
        parsedParams.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    const data = await deleteRelationship(parsedParams.data.id);
    return okJson<DeleteRelationshipResult>({
      path   : `/api/relationships/${parsedParams.data.id}`,
      requestId,
      startedAt,
      code   : "RELATIONSHIP_DELETED",
      message: "关系删除成功",
      data
    });
  } catch (error) {
    if (error instanceof RelationshipNotFoundError) {
      return notFoundJson(requestId, startedAt, error.relationshipId);
    }

    return failJson({
      path,
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "关系删除失败"
    });
  }
}
