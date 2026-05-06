import { randomUUID } from "node:crypto";

import { headers } from "next/headers";
import { z } from "zod";

import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { rejectUnknownRelationshipTypeDraft } from "@/server/modules/knowledge";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson, uuidParamSchema } from "../../../_shared";

const PATH = "/api/admin/knowledge/unknown-relationship-types/[id]/reject";
const rejectUnknownRelationshipTypeSchema = z.object({
  rejectionReason: z.string().trim().max(500).nullable().optional()
}).strict();

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const parsedParams = uuidParamSchema.safeParse(await context.params);
    if (!parsedParams.success) {
      return badRequestJson(PATH, requestId, startedAt, "ID 不合法");
    }

    const parsedBody = rejectUnknownRelationshipTypeSchema.safeParse(await readJsonBody(request));
    if (!parsedBody.success) {
      return badRequestJson(PATH, requestId, startedAt, parsedBody.error.issues[0]?.message ?? "参数不合法");
    }

    const data = await rejectUnknownRelationshipTypeDraft(parsedParams.data.id, parsedBody.data.rejectionReason);
    return okJson({ path: PATH, requestId, startedAt, code: "ADMIN_UNKNOWN_RELATIONSHIP_TYPE_REJECTED", message: "未知关系类型已驳回", data });
  } catch (error) {
    return failJson({ path: PATH, requestId, startedAt, error, fallbackCode: ERROR_CODES.COMMON_INTERNAL_ERROR, fallbackMessage: "未知关系类型驳回失败" });
  }
}
