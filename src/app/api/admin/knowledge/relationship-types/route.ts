import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { createRelationshipType, listRelationshipTypes } from "@/server/modules/knowledge";
import { ERROR_CODES } from "@/types/api";

import {
  badRequestJson,
  createRelationshipTypeSchema,
  relationshipTypeDirectionModeSchema,
  relationshipTypeStatusSchema
} from "../_shared";

const PATH = "/api/admin/knowledge/relationship-types";

export async function GET(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const url = new URL(request.url);
    const directionMode = url.searchParams.get("directionMode") ?? undefined;
    const status = url.searchParams.get("status") ?? undefined;
    const parsedDirectionMode = directionMode ? relationshipTypeDirectionModeSchema.safeParse(directionMode) : null;
    const parsedStatus = status ? relationshipTypeStatusSchema.safeParse(status) : null;

    if (parsedDirectionMode && !parsedDirectionMode.success) {
      return badRequestJson(PATH, requestId, startedAt, "directionMode 不合法");
    }
    if (parsedStatus && !parsedStatus.success) {
      return badRequestJson(PATH, requestId, startedAt, "status 不合法");
    }

    const data = await listRelationshipTypes({
      q            : url.searchParams.get("q") ?? undefined,
      group        : url.searchParams.get("group") ?? undefined,
      directionMode: parsedDirectionMode?.data,
      status       : parsedStatus?.data
    });
    return okJson({ path: PATH, requestId, startedAt, code: "ADMIN_RELATIONSHIP_TYPES_LISTED", message: "关系类型列表获取成功", data });
  } catch (error) {
    return failJson({ path: PATH, requestId, startedAt, error, fallbackCode: ERROR_CODES.COMMON_INTERNAL_ERROR, fallbackMessage: "关系类型列表获取失败" });
  }
}

export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const parsed = createRelationshipTypeSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return badRequestJson(PATH, requestId, startedAt, parsed.error.issues[0]?.message ?? "参数不合法");
    }

    const data = await createRelationshipType(parsed.data);
    return okJson({ path: PATH, requestId, startedAt, code: "ADMIN_RELATIONSHIP_TYPE_CREATED", message: "关系类型创建成功", data, status: 201 });
  } catch (error) {
    return failJson({ path: PATH, requestId, startedAt, error, fallbackCode: ERROR_CODES.COMMON_INTERNAL_ERROR, fallbackMessage: "关系类型创建失败" });
  }
}
