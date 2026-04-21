import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdminActorUserId } from "@/server/modules/auth";
import {
  reviewSplitPersonaRequestSchema
} from "@/server/modules/review/evidence-review/review-api-schemas";
import { createReviewMutationService } from "@/server/modules/review/evidence-review/review-mutation-service";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson } from "../../_shared";

const PATH = "/api/admin/review/personas/split";

/**
 * POST `/api/admin/review/personas/split`
 * 功能：把 source persona 下的 candidate 分拆到既有或新建 persona。
 */
export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    const actorUserId = requireAdminActorUserId(auth);

    const parsedBody = reviewSplitPersonaRequestSchema.safeParse(await readJsonBody(request));
    if (!parsedBody.success) {
      return badRequestJson(
        PATH,
        requestId,
        startedAt,
        parsedBody.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    const data = await createReviewMutationService().splitPersona({
      ...parsedBody.data,
      actorUserId
    });

    return okJson({
      path   : PATH,
      requestId,
      startedAt,
      code   : "REVIEW_PERSONA_SPLIT",
      message: "人物拆分审核动作执行成功",
      data
    });
  } catch (error) {
    return failJson({
      path           : PATH,
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "人物拆分审核动作执行失败"
    });
  }
}
