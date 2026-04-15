import { randomUUID } from "node:crypto";

import { headers } from "next/headers";
import { z } from "zod";

import { prisma } from "@/server/db/prisma";
import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson, notFoundJson, uuidParamSchema } from "../../_shared";
import { validateRegexSafety } from "../_d9";

const PATH = "/api/admin/knowledge/name-patterns/[id]";

const updateSchema = z.object({
  ruleType   : z.enum(["FAMILY_HOUSE", "DESCRIPTIVE_PHRASE", "RELATIONAL_COMPOUND"]).optional(),
  pattern    : z.string().trim().min(1).max(200).optional(),
  action     : z.enum(["BLOCK", "WARN"]).optional(),
  description: z.string().nullable().optional(),
  isVerified : z.boolean().optional()
}).refine((v) => Object.keys(v).length > 0, { message: "至少提供一个可更新字段" });

export async function PATCH(
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

    const parsed = updateSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return badRequestJson(PATH, requestId, startedAt, parsed.error.issues[0]?.message ?? "参数不合法");
    }

    if (parsed.data.pattern) {
      const regexCheck = validateRegexSafety(parsed.data.pattern);
      if (!regexCheck.valid) {
        return badRequestJson(PATH, requestId, startedAt, regexCheck.error!);
      }
    }

    const existing = await prisma.namePatternRule.findUnique({ where: { id: parsedParams.data.id } });
    if (!existing) {
      return notFoundJson(PATH, requestId, startedAt, "名字模式规则不存在");
    }

    const data = await prisma.namePatternRule.update({ where: { id: parsedParams.data.id }, data: parsed.data });
    return okJson({
      path   : PATH, requestId, startedAt,
      code   : "NAME_PATTERN_UPDATED",
      message: "名字模式规则更新成功",
      data
    });
  } catch (error) {
    return failJson({
      path           : PATH, requestId, startedAt, error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "名字模式规则更新失败"
    });
  }
}

export async function DELETE(
  _request: Request,
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

    const existing = await prisma.namePatternRule.findUnique({ where: { id: parsedParams.data.id } });
    if (!existing) {
      return notFoundJson(PATH, requestId, startedAt, "名字模式规则不存在");
    }

    await prisma.namePatternRule.delete({ where: { id: parsedParams.data.id } });
    return okJson({
      path   : PATH, requestId, startedAt,
      code   : "NAME_PATTERN_DELETED",
      message: "名字模式规则删除成功",
      data   : { id: parsedParams.data.id }
    });
  } catch (error) {
    return failJson({
      path           : PATH, requestId, startedAt, error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "名字模式规则删除失败"
    });
  }
}
