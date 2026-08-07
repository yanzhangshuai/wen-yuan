import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { skillService } from "@/server/modules/skills";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson, notFoundJson, setSkillEnabledSchema } from "../_shared";

/**
 * GET `/api/admin/skills/:id`
 * 管理端：技能包详情 + 激活版 frontmatter 契约（关系码 / 虚指名单，只读展示）。
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
 * 管理端：切换技能包独立启停开关（isEnabled=false = 全局不可用）。
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

    const parsedBody = setSkillEnabledSchema.safeParse(await readJsonBody(request));
    if (!parsedBody.success) {
      return badRequestJson(
        path,
        requestId,
        startedAt,
        parsedBody.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    await skillService.setSkillEnabled(id, parsedBody.data.isEnabled);

    return okJson({
      path,
      requestId,
      startedAt,
      code   : "ADMIN_SKILL_ENABLED_UPDATED",
      message: parsedBody.data.isEnabled ? "技能包已启用" : "技能包已停用",
      data   : { id, isEnabled: parsedBody.data.isEnabled }
    });
  } catch (error) {
    return failJson({
      path,
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "技能包启停切换失败"
    });
  }
}
