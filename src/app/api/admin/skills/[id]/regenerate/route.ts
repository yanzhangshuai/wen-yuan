import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { aiSkillGenerator, skillService } from "@/server/modules/skills";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson, notFoundJson, regenerateSkillSchema } from "../../_shared";

/**
 * POST `/api/admin/skills/:id/regenerate`
 * 管理端：用 AI 重新生成当前技能的 MD 内容（**不落库**）。
 * 返回生成的 content，前端预览确认后走 PUT /content 保存即覆盖。
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const path = "/api/admin/skills/[id]/regenerate";

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const { id } = await context.params;
    const existing = await skillService.getSkill(id);
    if (!existing) {
      return notFoundJson(path, requestId, startedAt, "技能包不存在");
    }

    const parsedBody = regenerateSkillSchema.safeParse(await readJsonBody(request));
    if (!parsedBody.success) {
      return badRequestJson(
        path,
        requestId,
        startedAt,
        parsedBody.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    const body = parsedBody.data;
    const purpose = body.purpose?.trim()
      || existing.description?.trim()
      || existing.name;

    const { markdown } = await aiSkillGenerator.generateSkillMarkdown({
      purpose,
      ...(body.name?.trim() ? { name: body.name.trim() } : {}),
      ...(body.scope ? { scope: body.scope } : {})
    });

    return okJson({
      path,
      requestId,
      startedAt,
      code   : "ADMIN_SKILL_REGENERATED",
      message: "技能已用 AI 重新生成（未保存），请确认后保存",
      data   : { id, content: markdown }
    });
  } catch (error) {
    return failJson({
      path,
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "AI 重新生成技能失败"
    });
  }
}
