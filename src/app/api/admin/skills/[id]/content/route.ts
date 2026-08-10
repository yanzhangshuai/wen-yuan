import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { skillService } from "@/server/modules/skills";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson, notFoundJson, updateSkillContentSchema } from "../../_shared";

/**
 * PUT `/api/admin/skills/:id/content`
 * 管理端：保存技能 MD 内容（保存即覆盖当前内容，无版本历史）。
 * frontmatter 非法时由服务层校验拒绝，保证落库即可装载。
 */
export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const path = "/api/admin/skills/[id]/content";

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const { id } = await context.params;
    const existing = await skillService.getSkill(id);
    if (!existing) {
      return notFoundJson(path, requestId, startedAt, "技能包不存在");
    }

    const parsedBody = updateSkillContentSchema.safeParse(await readJsonBody(request));
    if (!parsedBody.success) {
      return badRequestJson(
        path,
        requestId,
        startedAt,
        parsedBody.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    const saved = await skillService.updateSkillContent({
      skillId: id,
      content: parsedBody.data.content
    });

    return okJson({
      path,
      requestId,
      startedAt,
      code   : "ADMIN_SKILL_CONTENT_UPDATED",
      message: "技能内容已保存",
      data   : saved
    });
  } catch (error) {
    return failJson({
      path,
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "技能内容保存失败"
    });
  }
}
