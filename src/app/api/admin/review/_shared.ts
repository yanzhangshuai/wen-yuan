import { createApiMeta, errorResponse, toNextJson } from "@/server/http/api-response";
import { ERROR_CODES } from "@/types/api";

/**
 * review 管理端路由共用的错误响应 helper。
 * 这里保持与其他 admin route 一致的 envelope，避免各 review 子路由自行散落 400/404 格式。
 */
export function badRequestJson(
  path: string,
  requestId: string,
  startedAt: number,
  detail: string,
  message = "请求参数不合法"
): Response {
  const meta = createApiMeta(path, requestId, startedAt);
  return toNextJson(
    errorResponse(ERROR_CODES.COMMON_BAD_REQUEST, message, { type: "ValidationError", detail }, meta),
    400
  );
}

export function notFoundJson(
  path: string,
  requestId: string,
  startedAt: number,
  detail: string,
  message = "资源不存在"
): Response {
  const meta = createApiMeta(path, requestId, startedAt);
  return toNextJson(
    errorResponse(ERROR_CODES.COMMON_NOT_FOUND, message, { type: "NotFoundError", detail }, meta),
    404
  );
}
