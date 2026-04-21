import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdminActorUserId } from "@/server/modules/auth";
import { createReviewMutationService } from "@/server/modules/review/evidence-review/review-mutation-service";
import { reviewMergePersonasRequestSchema } from "@/server/modules/review/evidence-review/review-api-schemas";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson } from "../../_shared";

const PATH = "/api/admin/review/personas/merge";

/**
 * POST `/api/admin/review/personas/merge`
 * 功能：把一组 persona candidate 的已接受身份 claim 重定向到目标 persona。
 */
export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    const actorUserId = requireAdminActorUserId(auth);

    const parsedBody = reviewMergePersonasRequestSchema.safeParse(await readJsonBody(request));
    if (!parsedBody.success) {
      return badRequestJson(
        PATH,
        requestId,
        startedAt,
        parsedBody.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    await createReviewMutationService().mergePersona({
      ...parsedBody.data,
      actorUserId
    });

    return okJson({
      path   : PATH,
      requestId,
      startedAt,
      code   : "REVIEW_PERSONA_MERGED",
      message: "人物合并审核动作执行成功",
      data   : null
    });
  } catch (error) {
    return failJson({
      path           : PATH,
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "人物合并审核动作执行失败"
    });
  }
}
