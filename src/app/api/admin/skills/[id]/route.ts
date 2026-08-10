import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { skillService } from "@/server/modules/skills";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson, notFoundJson, updateSkillSchema } from "../_shared";

/**
 * GET `/api/admin/skills/:id`
 * 管理端：技能包详情（含完整 MD 内容与 frontmatter 契约）。
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const path = "/api/admin/skills/[id]";

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const { id } = await context.params;
    const skill = await skillService.getSkill(id);
    if (!skill) {
      return notFoundJson(path, requestId, startedAt, "技能包不存在");
    }

    const contract = await skillService.getSkillContract(id);

    return okJson({
      path,
      requestId,
      startedAt,
      code   : "ADMIN_SKILL_DETAIL",
      message: "技能包详情获取成功",
      data   : { ...skill, contract }
    });
  } catch (error) {
    return failJson({
      path,
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "技能包详情获取失败"
    });
  }
}

/**
 * PATCH `/api/admin/skills/:id`
 * 管理端：更新技能基本信息（name/description/scope/status，status 含启停）。
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const path = "/api/admin/skills/[id]";

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const { id } = await context.params;
    const existing = await skillService.getSkill(id);
    if (!existing) {
      return notFoundJson(path, requestId, startedAt, "技能包不存在");
    }

    const parsedBody = updateSkillSchema.safeParse(await readJsonBody(request));
    if (!parsedBody.success) {
      return badRequestJson(
        path,
        requestId,
        startedAt,
        parsedBody.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    const body = parsedBody.data;
    await skillService.updateSkillInfo({
      skillId: id,
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.scope !== undefined ? { scope: body.scope } : {}),
      ...(body.status !== undefined ? { status: body.status } : {})
    });

    return okJson({
      path,
      requestId,
      startedAt,
      code   : "ADMIN_SKILL_UPDATED",
      message: "技能信息已更新",
      data   : { id }
    });
  } catch (error) {
    return failJson({
      path,
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "技能信息更新失败"
    });
  }
}
