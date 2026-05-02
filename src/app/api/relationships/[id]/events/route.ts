import { randomUUID } from "node:crypto";

import { z } from "zod";

import { createApiMeta, errorResponse, toNextJson } from "@/server/http/api-response";
import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import {
  createRelationshipEvent,
  type CreateRelationshipEventInput
} from "@/server/modules/relationships/createRelationshipEvent";
import {
  RelationshipInputError,
  RelationshipNotFoundError
} from "@/server/modules/relationships/errors";
import type { RelationshipEventResult } from "@/server/modules/relationships/relationshipEventUtils";
import { ERROR_CODES } from "@/types/api";

const relationshipRouteParamsSchema = z.object({
  id: z.string().uuid("关系 ID 不合法")
});

const createRelationshipEventBodySchema = z.object({
  chapterId   : z.string().uuid("章节 ID 不合法"),
  summary     : z.string().trim().min(1, "事件摘要不能为空").max(2000, "事件摘要过长"),
  evidence    : z.string().max(4000, "证据文本过长").nullable().optional(),
  attitudeTags: z.array(z.string().max(32, "态度标签过长")).max(32, "态度标签过多").optional(),
  paraIndex   : z.number().int().min(0).nullable().optional(),
  confidence  : z.number().min(0).max(1).optional()
});

type CreateRelationshipEventBody = z.infer<typeof createRelationshipEventBodySchema>;

function toCreateRelationshipEventInput(body: CreateRelationshipEventBody): CreateRelationshipEventInput {
  return {
    chapterId   : body.chapterId,
    summary     : body.summary,
    evidence    : body.evidence,
    attitudeTags: body.attitudeTags,
    paraIndex   : body.paraIndex,
    confidence  : body.confidence
  };
}

interface RelationshipEventsRouteContext {
  params: Promise<{ id: string }>;
}

function badRequestJson(requestId: string, startedAt: number, detail: string): Response {
  const meta = createApiMeta("/api/relationships/:id/events", requestId, startedAt);
  return toNextJson(errorResponse(
    ERROR_CODES.COMMON_BAD_REQUEST,
    "请求参数不合法",
    { type: "ValidationError", detail },
    meta
  ), 400);
}

function notFoundJson(requestId: string, startedAt: number, relationshipId: string): Response {
  const meta = createApiMeta(`/api/relationships/${relationshipId}/events`, requestId, startedAt);
  return toNextJson(errorResponse(
    ERROR_CODES.COMMON_NOT_FOUND,
    "关系不存在",
    { type: "NotFoundError", detail: `Relationship not found: ${relationshipId}` },
    meta
  ), 404);
}

export async function POST(
  request: Request,
  context: RelationshipEventsRouteContext
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const path = "/api/relationships/:id/events";

  try {
    const auth = await getAuthContext(request.headers);
    requireAdmin(auth);

    const parsedParams = relationshipRouteParamsSchema.safeParse(await context.params);
    if (!parsedParams.success) {
      return badRequestJson(requestId, startedAt, parsedParams.error.issues[0]?.message ?? "请求参数不合法");
    }

    const parsedBody = createRelationshipEventBodySchema.safeParse(await readJsonBody(request));
    if (!parsedBody.success) {
      return badRequestJson(requestId, startedAt, parsedBody.error.issues[0]?.message ?? "请求参数不合法");
    }

    const data = await createRelationshipEvent(
      parsedParams.data.id,
      toCreateRelationshipEventInput(parsedBody.data)
    );
    return okJson<RelationshipEventResult>({
      path   : `/api/relationships/${parsedParams.data.id}/events`,
      requestId,
      startedAt,
      code   : "RELATIONSHIP_EVENT_CREATED",
      message: "关系事件创建成功",
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
      fallbackMessage: "关系事件创建失败"
    });
  }
}
