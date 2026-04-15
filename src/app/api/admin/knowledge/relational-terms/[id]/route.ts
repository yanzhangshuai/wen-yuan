import { randomUUID } from "node:crypto";

import { headers } from "next/headers";
import { z } from "zod";

import { prisma } from "@/server/db/prisma";
import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson, notFoundJson, uuidParamSchema } from "../../_shared";

const PATH = "/api/admin/knowledge/relational-terms/[id]";

/**
 * 关系词现在由 GenericTitleRule.tier = RELATIONAL 驱动。
 * 本路由提供兼容接口，底层操作 genericTitleRule 表。
 */

const updateSchema = z.object({
  title      : z.string().trim().min(1).max(20).optional(),
  description: z.string().nullable().optional(),
  isActive   : z.boolean().optional()
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

    const existing = await prisma.genericTitleRule.findUnique({
      where: { id: parsedParams.data.id }
    });
    if (!existing || existing.tier !== "RELATIONAL") {
      return notFoundJson(PATH, requestId, startedAt, "关系词不存在");
    }

    const data = await prisma.genericTitleRule.update({
      where: { id: parsedParams.data.id },
      data : parsed.data
    });
    return okJson({
      path   : PATH, requestId, startedAt,
      code   : "RELATIONAL_TERM_UPDATED",
      message: "关系词更新成功",
      data
    });
  } catch (error) {
    return failJson({
      path           : PATH, requestId, startedAt, error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "关系词更新失败"
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

    const existing = await prisma.genericTitleRule.findUnique({
      where: { id: parsedParams.data.id }
    });
    if (!existing || existing.tier !== "RELATIONAL") {
      return notFoundJson(PATH, requestId, startedAt, "关系词不存在");
    }

    await prisma.genericTitleRule.delete({ where: { id: parsedParams.data.id } });
    return okJson({
      path   : PATH, requestId, startedAt,
      code   : "RELATIONAL_TERM_DELETED",
      message: "关系词删除成功",
      data   : { id: parsedParams.data.id }
    });
  } catch (error) {
    return failJson({
      path           : PATH, requestId, startedAt, error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "关系词删除失败"
    });
  }
}
