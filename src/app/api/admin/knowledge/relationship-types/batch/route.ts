import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import {
  batchChangeRelationshipTypeGroup,
  batchDeleteRelationshipTypes,
  batchUpdateRelationshipTypeStatus
} from "@/server/modules/knowledge";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson, relationshipTypeBatchActionSchema } from "../../_shared";

const PATH = "/api/admin/knowledge/relationship-types/batch";

export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const parsed = relationshipTypeBatchActionSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return badRequestJson(PATH, requestId, startedAt, parsed.error.issues[0]?.message ?? "参数不合法");
    }

    const payload = parsed.data;
    let data: { count: number };

    switch (payload.action) {
      case "delete":
        data = await batchDeleteRelationshipTypes(payload.ids);
        break;
      case "enable":
        data = await batchUpdateRelationshipTypeStatus(payload.ids, "ACTIVE");
        break;
      case "disable":
        data = await batchUpdateRelationshipTypeStatus(payload.ids, "INACTIVE");
        break;
      case "markPendingReview":
        data = await batchUpdateRelationshipTypeStatus(payload.ids, "PENDING_REVIEW");
        break;
      case "changeGroup":
        data = await batchChangeRelationshipTypeGroup(payload.ids, payload.group);
        break;
    }

    return okJson({ path: PATH, requestId, startedAt, code: "ADMIN_RELATIONSHIP_TYPES_BATCH_UPDATED", message: "关系类型批量操作成功", data });
  } catch (error) {
    return failJson({ path: PATH, requestId, startedAt, error, fallbackCode: ERROR_CODES.COMMON_INTERNAL_ERROR, fallbackMessage: "关系类型批量操作失败" });
  }
}
