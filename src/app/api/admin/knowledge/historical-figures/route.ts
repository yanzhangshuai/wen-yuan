import { randomUUID } from "node:crypto";

import { headers } from "next/headers";
import { z } from "zod";

import { prisma } from "@/server/db/prisma";
import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson, parsePagination } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson } from "../_shared";

const PATH = "/api/admin/knowledge/historical-figures";

const createSchema = z.object({
  name       : z.string().trim().min(1, "名称不能为空").max(100),
  aliases    : z.array(z.string().trim()).default([]),
  dynasty    : z.string().trim().max(50).optional(),
  category   : z.enum(["EMPEROR", "SAGE", "POET", "GENERAL", "MYTHICAL", "STATESMAN"]),
  description: z.string().optional(),
  isVerified : z.boolean().optional()
});

export async function GET(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const url = new URL(request.url);
    const category = url.searchParams.get("category") ?? undefined;
    const dynasty = url.searchParams.get("dynasty") ?? undefined;
    const q = url.searchParams.get("q") ?? undefined;
    const { page, pageSize } = parsePagination(url.searchParams);

    const where: Record<string, unknown> = {};
    if (category) where.category = category;
    if (dynasty) where.dynasty = dynasty;
    if (q) where.name = { contains: q, mode: "insensitive" };

    const [data, total] = await Promise.all([
      prisma.historicalFigureEntry.findMany({
        where,
        skip   : (page - 1) * pageSize,
        take   : pageSize,
        orderBy: { createdAt: "desc" }
      }),
      prisma.historicalFigureEntry.count({ where })
    ]);

    return okJson({
      path      : PATH, requestId, startedAt,
      code      : "HISTORICAL_FIGURES_LISTED",
      message   : "历史人物列表获取成功",
      data,
      pagination: { page, pageSize, total }
    });
  } catch (error) {
    return failJson({
      path           : PATH, requestId, startedAt, error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "历史人物列表获取失败"
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

    const data = await prisma.historicalFigureEntry.create({ data: parsed.data });
    return okJson({
      path   : PATH, requestId, startedAt,
      code   : "HISTORICAL_FIGURE_CREATED",
      message: "历史人物创建成功",
      data,
      status : 201
    });
  } catch (error) {
    return failJson({
      path           : PATH, requestId, startedAt, error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "历史人物创建失败"
    });
  }
}
