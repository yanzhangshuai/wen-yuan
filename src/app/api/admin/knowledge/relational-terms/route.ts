import { randomUUID } from "node:crypto";

import { headers } from "next/headers";
import { z } from "zod";

import { prisma } from "@/server/db/prisma";
import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson, parsePagination } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson } from "../_shared";

const PATH = "/api/admin/knowledge/relational-terms";

/**
 * 关系词现在由 GenericTitleRule.tier = RELATIONAL 驱动。
 * 本路由提供兼容接口，底层操作 genericTitleRule 表。
 */

const createSchema = z.object({
  title      : z.string().trim().min(1, "关系词不能为空").max(20),
  description: z.string().optional()
});

export async function GET(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const url = new URL(request.url);
    const q = url.searchParams.get("q") ?? undefined;
    const { page, pageSize } = parsePagination(url.searchParams);

    const where: Record<string, unknown> = { tier: "RELATIONAL" };
    if (q) where.title = { contains: q, mode: "insensitive" };

    const [data, total] = await Promise.all([
      prisma.genericTitleRule.findMany({
        where,
        skip   : (page - 1) * pageSize,
        take   : pageSize,
        orderBy: { createdAt: "desc" }
      }),
      prisma.genericTitleRule.count({ where })
    ]);

    return okJson({
      path      : PATH, requestId, startedAt,
      code      : "RELATIONAL_TERMS_LISTED",
      message   : "关系词列表获取成功",
      data,
      pagination: { page, pageSize, total }
    });
  } catch (error) {
    return failJson({
      path           : PATH, requestId, startedAt, error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "关系词列表获取失败"
    });
  }
}

export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const parsed = createSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return badRequestJson(PATH, requestId, startedAt, parsed.error.issues[0]?.message ?? "参数不合法");
    }

    const data = await prisma.genericTitleRule.create({
      data: {
        title      : parsed.data.title,
        tier       : "RELATIONAL",
        description: parsed.data.description ?? null
      }
    });
    return okJson({
      path   : PATH, requestId, startedAt,
      code   : "RELATIONAL_TERM_CREATED",
      message: "关系词创建成功",
      data,
      status : 201
    });
  } catch (error) {
    return failJson({
      path           : PATH, requestId, startedAt, error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "关系词创建失败"
    });
  }
}
