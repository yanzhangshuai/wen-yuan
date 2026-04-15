import { randomUUID } from "node:crypto";

import { headers } from "next/headers";
import { z } from "zod";

import { prisma } from "@/server/db/prisma";
import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson } from "../../_shared";

const PATH = "/api/admin/knowledge/historical-figures/import";

const importSchema = z.object({
  entries: z.array(z.object({
    name       : z.string().trim().min(1).max(100),
    aliases    : z.array(z.string().trim()).default([]),
    dynasty    : z.string().trim().max(50).optional(),
    category   : z.enum(["EMPEROR", "SAGE", "POET", "GENERAL", "MYTHICAL", "STATESMAN"]),
    description: z.string().optional(),
    isVerified : z.boolean().optional()
  })).min(1, "至少提供一条记录")
});

export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const parsed = importSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return badRequestJson(PATH, requestId, startedAt, parsed.error.issues[0]?.message ?? "参数不合法");
    }

    // 使用 createMany 批量导入，skipDuplicates 避免重复导入报错
    const result = await prisma.historicalFigureEntry.createMany({
      data          : parsed.data.entries,
      skipDuplicates: true
    });

    return okJson({
      path   : PATH, requestId, startedAt,
      code   : "HISTORICAL_FIGURES_IMPORTED",
      message: `成功导入 ${result.count} 条历史人物`,
      data   : { imported: result.count, total: parsed.data.entries.length },
      status : 201
    });
  } catch (error) {
    return failJson({
      path           : PATH, requestId, startedAt, error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "历史人物批量导入失败"
    });
  }
}
