import { randomUUID } from "node:crypto";

import { z } from "zod";

import { ProcessingStatus, RecordSource } from "@/generated/prisma/enums";
import { createApiMeta, errorResponse, toNextJson } from "@/server/http/api-response";
import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import {
  deleteRelationshipEvent,
  type DeleteRelationshipEventResult
} from "@/server/modules/relationships/deleteRelationshipEvent";
import {
  RelationshipEventNotFoundError,
  RelationshipInputError
} from "@/server/modules/relationships/errors";
import type { RelationshipEventResult } from "@/server/modules/relationships/relationshipEventUtils";
import {
  updateRelationshipEvent,
  type UpdateRelationshipEventInput
} from "@/server/modules/relationships/updateRelationshipEvent";
import { ERROR_CODES } from "@/types/api";

const relationshipEventRouteParamsSchema = z.object({
  id: z.string().uuid("关系事件 ID 不合法")
});

const updateRelationshipEventBodySchema = z.object({
  chapterId   : z.string().uuid("章节 ID 不合法").optional(),
  summary     : z.string().trim().min(1, "事件摘要不能为空").max(2000, "事件摘要过长").optional(),
  evidence    : z.string().max(4000, "证据文本过长").nullable().optional(),
  attitudeTags: z.array(z.string().max(32, "态度标签过长")).max(32, "态度标签过多").optional(),
  paraIndex   : z.number().int().min(0).nullable().optional(),
  confidence  : z.number().min(0).max(1).optional(),
  status      : z.enum(["DRAFT", "VERIFIED", "REJECTED"]).optional(),
  recordSource: z.enum(["DRAFT_AI", "AI", "MANUAL"]).optional()
}).refine((data) => Object.keys(data).length > 0, {
  message: "至少需要一个可更新字段"
});

type UpdateRelationshipEventBody = z.infer<typeof updateRelationshipEventBodySchema>;

function toUpdateRelationshipEventInput(body: UpdateRelationshipEventBody): UpdateRelationshipEventInput {
  return {
    chapterId   : body.chapterId,
    summary     : body.summary,
    evidence    : body.evidence,
    attitudeTags: body.attitudeTags,
    paraIndex   : body.paraIndex,
    confidence  : body.confidence,
    status      : body.status ? ProcessingStatus[body.status] : undefined,
    recordSource: body.recordSource ? RecordSource[body.recordSource] : undefined
  };
}

interface RelationshipEventRouteContext {
  params: Promise<{ id: string }>;
}

function badRequestJson(requestId: string, startedAt: number, detail: string): Response {
  const meta = createApiMeta("/api/relationship-events/:id", requestId, startedAt);
  return toNextJson(errorResponse(
    ERROR_CODES.COMMON_BAD_REQUEST,
    "请求参数不合法",
    { type: "ValidationError", detail },
    meta
  ), 400);
}

function notFoundJson(requestId: string, startedAt: number, eventId: string): Response {
  const meta = createApiMeta(`/api/relationship-events/${eventId}`, requestId, startedAt);
  return toNextJson(errorResponse(
    ERROR_CODES.COMMON_NOT_FOUND,
    "关系事件不存在",
    { type: "NotFoundError", detail: `Relationship event not found: ${eventId}` },
    meta
  ), 404);
}

export async function PATCH(
  request: Request,
  context: RelationshipEventRouteContext
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const path = "/api/relationship-events/:id";

  try {
    const auth = await getAuthContext(request.headers);
    requireAdmin(auth);

    const parsedParams = relationshipEventRouteParamsSchema.safeParse(await context.params);
    if (!parsedParams.success) {
      return badRequestJson(requestId, startedAt, parsedParams.error.issues[0]?.message ?? "请求参数不合法");
    }

    const parsedBody = updateRelationshipEventBodySchema.safeParse(await readJsonBody(request));
    if (!parsedBody.success) {
      return badRequestJson(requestId, startedAt, parsedBody.error.issues[0]?.message ?? "请求参数不合法");
    }

    const data = await updateRelationshipEvent(
      parsedParams.data.id,
      toUpdateRelationshipEventInput(parsedBody.data)
    );
    return okJson<RelationshipEventResult>({
      path   : `/api/relationship-events/${parsedParams.data.id}`,
      requestId,
      startedAt,
      code   : "RELATIONSHIP_EVENT_UPDATED",
      message: "关系事件更新成功",
      data
    });
  } catch (error) {
    if (error instanceof RelationshipEventNotFoundError) {
      return notFoundJson(requestId, startedAt, error.eventId);
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
      fallbackMessage: "关系事件更新失败"
    });
  }
}

export async function DELETE(
  request: Request,
  context: RelationshipEventRouteContext
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const path = "/api/relationship-events/:id";

  try {
    const auth = await getAuthContext(request.headers);
    requireAdmin(auth);

    const parsedParams = relationshipEventRouteParamsSchema.safeParse(await context.params);
    if (!parsedParams.success) {
      return badRequestJson(requestId, startedAt, parsedParams.error.issues[0]?.message ?? "请求参数不合法");
    }

    const data = await deleteRelationshipEvent(parsedParams.data.id);
    return okJson<DeleteRelationshipEventResult>({
      path   : `/api/relationship-events/${parsedParams.data.id}`,
      requestId,
      startedAt,
      code   : "RELATIONSHIP_EVENT_DELETED",
      message: "关系事件删除成功",
      data
    });
  } catch (error) {
    if (error instanceof RelationshipEventNotFoundError) {
      return notFoundJson(requestId, startedAt, error.eventId);
    }

    return failJson({
      path,
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "关系事件删除失败"
    });
  }
}
