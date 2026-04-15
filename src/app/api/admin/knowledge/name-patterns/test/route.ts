import { randomUUID } from "node:crypto";

import { headers } from "next/headers";
import { z } from "zod";

import { prisma } from "@/server/db/prisma";
import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson, notFoundJson } from "../../_shared";

const PATH = "/api/admin/knowledge/name-patterns/test";

const testSchema = z.object({
  name  : z.string().trim().min(1, "待测名字不能为空"),
  ruleId: z.string().uuid().optional()
});

export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const parsed = testSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return badRequestJson(PATH, requestId, startedAt, parsed.error.issues[0]?.message ?? "参数不合法");
    }

    const { name, ruleId } = parsed.data;

    let rules: Array<{ id: string; ruleType: string; pattern: string; action: string }>;

    if (ruleId) {
      const rule = await prisma.namePatternRule.findUnique({ where: { id: ruleId } });
      if (!rule) {
        return notFoundJson(PATH, requestId, startedAt, "指定规则不存在");
      }
      rules = [rule];
    } else {
      rules = await prisma.namePatternRule.findMany();
    }

    const matchedRules: Array<{ id: string; ruleType: string; pattern: string; action: string }> = [];

    for (const rule of rules) {
      try {
        const re = new RegExp(rule.pattern, "u");
        if (re.test(name)) {
          matchedRules.push({
            id      : rule.id,
            ruleType: rule.ruleType,
            pattern : rule.pattern,
            action  : rule.action
          });
        }
      } catch {
        // Skip rules with invalid regex — should not happen since we validate on create/update
      }
    }

    const matched = matchedRules.length > 0;

    return okJson({
      path   : PATH, requestId, startedAt,
      code   : "NAME_PATTERN_TESTED",
      message: matched ? "名字匹配到规则" : "名字未匹配到任何规则",
      data   : {
        name,
        matched,
        ...(matched && { matchedRules })
      }
    });
  } catch (error) {
    return failJson({
      path           : PATH, requestId, startedAt, error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "名字模式测试失败"
    });
  }
}
