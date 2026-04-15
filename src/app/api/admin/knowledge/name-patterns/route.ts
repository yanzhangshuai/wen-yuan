import { randomUUID } from "node:crypto";

import { headers } from "next/headers";
import { z } from "zod";

import { prisma } from "@/server/db/prisma";
import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson, parsePagination } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson } from "../_shared";
import { validateRegexSafety } from "./_d9";

const PATH = "/api/admin/knowledge/name-patterns";

const createSchema = z.object({
  ruleType   : z.enum(["FAMILY_HOUSE", "DESCRIPTIVE_PHRASE", "RELATIONAL_COMPOUND"]),
  pattern    : z.string().trim().min(1, "正则模式不能为空").max(200, "正则模式不能超过 200 字符"),
  action     : z.enum(["BLOCK", "WARN"]),
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
    const ruleType = url.searchParams.get("ruleType") ?? undefined;
    const action = url.searchParams.get("action") ?? undefined;
    const { page, pageSize } = parsePagination(url.searchParams);

    const where: Record<string, unknown> = {};
    if (ruleType) where.ruleType = ruleType;
    if (action) where.action = action;

    const [data, total] = await Promise.all([
      prisma.namePatternRule.findMany({
        where,
        skip   : (page - 1) * pageSize,
        take   : pageSize,
        orderBy: { createdAt: "desc" }
      }),
      prisma.namePatternRule.count({ where })
    ]);

    return okJson({
      path      : PATH, requestId, startedAt,
      code      : "NAME_PATTERNS_LISTED",
      message   : "名字模式规则列表获取成功",
      data,
      pagination: { page, pageSize, total }
    });
  } catch (error) {
    return failJson({
      path           : PATH, requestId, startedAt, error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "名字模式规则列表获取失败"
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

    const regexCheck = validateRegexSafety(parsed.data.pattern);
    if (!regexCheck.valid) {
      return badRequestJson(PATH, requestId, startedAt, regexCheck.error!);
    }

    const data = await prisma.namePatternRule.create({ data: parsed.data });
    return okJson({
      path   : PATH, requestId, startedAt,
      code   : "NAME_PATTERN_CREATED",
      message: "名字模式规则创建成功",
      data,
      status : 201
    });
  } catch (error) {
    return failJson({
      path           : PATH, requestId, startedAt, error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "名字模式规则创建失败"
    });
  }
}
