import { randomUUID } from "node:crypto";

import { z } from "zod";

import { createApiMeta, errorResponse, toNextJson } from "@/server/http/api-response";
import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import {
  splitPersona,
  PersonaSplitInputError,
  PersonaNotFoundError,
  type SplitPersonaResult
} from "@/server/modules/personas/splitPersona";
import { ERROR_CODES } from "@/types/api";

const splitPersonaBodySchema = z.object({
  sourceId  : z.string().uuid("源人物 ID 不合法"),
  bookId    : z.string().uuid("书籍 ID 不合法"),
  chapterNos: z.array(z.number().int().positive("章节号必须为正整数")).min(1, "至少选择一个章节"),
  name      : z.string().trim().min(1, "新人物名称不能为空"),
  aliases   : z.array(z.string().trim().min(1, "别名不能为空")).optional(),
  gender    : z.string().trim().min(1, "人物性别不能为空").nullable().optional(),
  hometown  : z.string().trim().min(1, "人物籍贯不能为空").nullable().optional(),
  globalTags: z.array(z.string().trim().min(1, "人物标签不能为空")).optional(),
  confidence: z.number().min(0, "置信度不能小于 0").max(1, "置信度不能大于 1").optional(),
  localName : z.string().trim().min(1, "书内称谓不能为空").optional()
});

function badRequestJson(
  requestId: string,
  startedAt: number,
  detail: string
): Response {
  const path = "/api/personas/split";
  const meta = createApiMeta(path, requestId, startedAt);
  return toNextJson(
    errorResponse(
      ERROR_CODES.COMMON_BAD_REQUEST,
      "人物拆分参数不合法",
      {
        type: "ValidationError",
        detail
      },
      meta
    ),
    400
  );
}

function notFoundJson(
  requestId: string,
  startedAt: number,
  personaId: string
): Response {
  const path = "/api/personas/split";
  const meta = createApiMeta(path, requestId, startedAt);
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
 * POST /api/personas/split
 * 功能：按章节把 source persona 数据拆分到新 persona。
 */
export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const path = "/api/personas/split";

  try {
    const auth = await getAuthContext(request.headers);
    requireAdmin(auth);

    const parsedBody = splitPersonaBodySchema.safeParse(await readJsonBody(request));
    if (!parsedBody.success) {
      return badRequestJson(
        requestId,
        startedAt,
        parsedBody.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    const data = await splitPersona(parsedBody.data);
    return okJson<SplitPersonaResult>({
      path,
      requestId,
      startedAt,
      code   : "PERSONA_SPLIT",
      message: "人物拆分成功",
      data
    });
  } catch (error) {
    if (error instanceof PersonaNotFoundError) {
      return notFoundJson(requestId, startedAt, error.personaId);
    }

    if (error instanceof PersonaSplitInputError) {
      return badRequestJson(requestId, startedAt, error.message);
    }

    return failJson({
      path,
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "人物拆分失败"
    });
  }
}
