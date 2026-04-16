import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import {
  batchChangeBookTypeSurnames,
  batchDeleteSurnames,
  batchToggleSurnames
} from "@/server/modules/knowledge";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson, knowledgeBatchActionSchema } from "../../_shared";

const PATH = "/api/admin/knowledge/surnames/batch";

export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const parsed = knowledgeBatchActionSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return badRequestJson(PATH, requestId, startedAt, parsed.error.issues[0]?.message ?? "参数不合法");
    }

    const payload = parsed.data;
    const data = payload.action === "delete"
      ? await batchDeleteSurnames(payload.ids)
      : payload.action === "enable"
        ? await batchToggleSurnames(payload.ids, true)
        : payload.action === "disable"
          ? await batchToggleSurnames(payload.ids, false)
          : await batchChangeBookTypeSurnames(payload.ids, payload.bookTypeId);

    return okJson({ path: PATH, requestId, startedAt, code: "ADMIN_SURNAMES_BATCH_UPDATED", message: "姓氏批量操作成功", data });
  } catch (error) {
    return failJson({ path: PATH, requestId, startedAt, error, fallbackCode: ERROR_CODES.COMMON_INTERNAL_ERROR, fallbackMessage: "姓氏批量操作失败" });
  }
}
