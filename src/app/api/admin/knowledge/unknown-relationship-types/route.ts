import { randomUUID } from "node:crypto";

import { headers } from "next/headers";
import { z } from "zod";

import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import {
  listUnknownRelationshipTypeDrafts,
  UNKNOWN_RELATIONSHIP_TYPE_DRAFT_STATUSES
} from "@/server/modules/knowledge";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson, uuidParamSchema } from "../_shared";

const PATH = "/api/admin/knowledge/unknown-relationship-types";
const statusSchema = z.enum(UNKNOWN_RELATIONSHIP_TYPE_DRAFT_STATUSES);

export async function GET(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const url = new URL(request.url);
    const status = url.searchParams.get("status") ?? undefined;
    const bookId = url.searchParams.get("bookId") ?? undefined;
    const parsedStatus = status ? statusSchema.safeParse(status) : null;
    const parsedBookId = bookId ? uuidParamSchema.shape.id.safeParse(bookId) : null;

    if (parsedStatus && !parsedStatus.success) {
      return badRequestJson(PATH, requestId, startedAt, "status 不合法");
    }
    if (parsedBookId && !parsedBookId.success) {
      return badRequestJson(PATH, requestId, startedAt, "bookId 不合法");
    }

    const data = await listUnknownRelationshipTypeDrafts({
      status: parsedStatus?.data,
      bookId: parsedBookId?.data
    });
    return okJson({ path: PATH, requestId, startedAt, code: "ADMIN_UNKNOWN_RELATIONSHIP_TYPES_LISTED", message: "未知关系类型列表获取成功", data });
  } catch (error) {
    return failJson({ path: PATH, requestId, startedAt, error, fallbackCode: ERROR_CODES.COMMON_INTERNAL_ERROR, fallbackMessage: "未知关系类型列表获取失败" });
  }
}
