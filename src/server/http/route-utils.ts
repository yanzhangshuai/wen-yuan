import type { NextResponse } from "next/server";

import { createApiMeta, errorResponse, successResponse, toNextJson } from "@/server/http/api-response";
import { AuthError } from "@/server/modules/auth";
import { ERROR_CODES, type ApiResponse } from "@/types/api";

export interface PaginationParams {
  page    : number;
  pageSize: number;
}

/**
 * 功能：从 URL 参数解析标准分页参数。
 * 输入：URLSearchParams。
 * 输出：PaginationParams。
 * 异常：无。
 * 副作用：无。
 */
export function parsePagination(searchParams: URLSearchParams): PaginationParams {
  const page = Number(searchParams.get("page") ?? "1");
  const pageSize = Number(searchParams.get("page_size") ?? "20");

  return {
    page    : Number.isFinite(page) && page > 0 ? Math.floor(page) : 1,
    pageSize: Number.isFinite(pageSize) && pageSize > 0 ? Math.min(Math.floor(pageSize), 100) : 20
  };
}

/**
 * 功能：统一 route handler 的成功响应输出。
 * 输入：path/requestId/startedAt/code/message/data/pagination。
 * 输出：Response。
 * 异常：无。
 * 副作用：HTTP 响应写出。
 */
export function okJson<T>(args: {
  path       : string;
  requestId  : string;
  startedAt  : number;
  code       : string;
  message    : string;
  data       : T;
  pagination?: {
    page    : number;
    pageSize: number;
    total   : number;
  };
  status?: number;
}): NextResponse<ApiResponse<T>> {
  const meta = createApiMeta(args.path, args.requestId, args.startedAt);
  if (args.pagination) {
    meta.pagination = args.pagination;
  }

  const payload: ApiResponse<T> = successResponse(args.code, args.message, args.data, meta);
  return toNextJson(payload, args.status ?? 200);
}

/**
 * 功能：统一 route handler 错误响应输出。
 * 输入：path/requestId/startedAt/error。
 * 输出：Response。
 * 异常：无。
 * 副作用：HTTP 响应写出。
 */
export function failJson(args: {
  path            : string;
  requestId       : string;
  startedAt       : number;
  error           : unknown;
  fallbackCode?   : string;
  fallbackMessage?: string;
  status?         : number;
}): NextResponse<ApiResponse<null>> {
  const meta = createApiMeta(args.path, args.requestId, args.startedAt);

  if (args.error instanceof AuthError) {
    const status = args.error.code === ERROR_CODES.AUTH_UNAUTHORIZED ? 401 : 403;
    return toNextJson(
      errorResponse(args.error.code, args.error.message, { type: "AuthError", detail: args.error.message }, meta),
      status
    );
  }

  const message = args.error instanceof Error ? args.error.message : "Unknown error";

  return toNextJson(
    errorResponse(
      args.fallbackCode ?? ERROR_CODES.COMMON_INTERNAL_ERROR,
      args.fallbackMessage ?? "服务异常",
      { type: "InternalError", detail: message },
      meta
    ),
    args.status ?? 500
  );
}
