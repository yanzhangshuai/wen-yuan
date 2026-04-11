import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext } from "@/server/modules/auth";
import { listActiveBookTypes } from "@/server/modules/knowledge";
import { ERROR_CODES } from "@/types/api";

/**
 * GET `/api/book-types`
 * 公开接口：获取启用的书籍类型列表（导入页下拉选择用）。
 */
export async function GET(): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    if (!auth.isAuthenticated) {
      return failJson({
        path           : "/api/book-types",
        requestId,
        startedAt,
        error          : new Error("未登录"),
        fallbackCode   : ERROR_CODES.AUTH_UNAUTHORIZED,
        fallbackMessage: "请先登录"
      });
    }

    const data = await listActiveBookTypes();

    return okJson({
      path   : "/api/book-types",
      requestId,
      startedAt,
      code   : "BOOK_TYPES_LISTED",
      message: "书籍类型列表获取成功",
      data
    });
  } catch (error) {
    return failJson({
      path           : "/api/book-types",
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "书籍类型列表获取失败"
    });
  }
}
