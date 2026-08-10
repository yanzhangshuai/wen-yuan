import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { aiSkillGenerator } from "@/server/modules/skills";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson, generateSkillSchema } from "../_shared";

/**
 * POST `/api/admin/skills/generate`
 * 管理端：调用系统默认模型按用途描述生成新技能（DRAFT、source=AI）。
 */
export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const path = "/api/admin/skills/generate";

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const parsedBody = generateSkillSchema.safeParse(await readJsonBody(request));
    if (!parsedBody.success) {
      return badRequestJson(
        path,
        requestId,
        startedAt,
        parsedBody.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    const generated = await aiSkillGenerator.generateSkillFromPrompt(parsedBody.data);

    return okJson({
      path,
      requestId,
      startedAt,
      code   : "ADMIN_SKILL_GENERATED",
      message: "技能已生成（草稿，待编辑/激活）",
      data   : generated
    });
  } catch (error) {
    return failJson({
      path,
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "AI 生成技能失败"
    });
  }
}
