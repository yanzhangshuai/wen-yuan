import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { skillService } from "@/server/modules/skills";
import { ERROR_CODES } from "@/types/api";

/**
 * GET `/api/admin/skills`
 * 管理端：技能包列表（含独立启停开关与当前激活版本号）。
 * skills 管理页列表数据源。
 */
export async function GET(): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const path = "/api/admin/skills";

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const data = await skillService.listSkills();

    return okJson({
      path,
      requestId,
      startedAt,
      code   : "ADMIN_SKILLS_LISTED",
      message: "技能包列表获取成功",
      data
    });
  } catch (error) {
    return failJson({
      path,
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "技能包列表获取失败"
    });
  }
}
