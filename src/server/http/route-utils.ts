import type { NextResponse } from "next/server";

import { createApiMeta, errorResponse, successResponse, toNextJson } from "@/server/http/api-response";
import { AuthError } from "@/server/modules/auth";
import { ERROR_CODES, type ApiResponse } from "@/types/api";

/**
 * =============================================================================
 * 文件定位（Route Handler 通用工具层）
 * -----------------------------------------------------------------------------
 * 本文件是 `app/api/[...]/route.ts` 的高频辅助函数集合，负责把“成功输出/失败映射/分页解析”
 * 这些跨接口重复逻辑统一封装。
 *
 * 在 Next.js 中的上下游关系：
 * - 上游：各个 Route Handler 传入 path/requestId/startedAt/业务数据；
 * - 下游：调用 `api-response.ts` 生成标准响应并返回 NextResponse。
 *
 * 业务意图：
 * - 让所有 API 保持一致 contract；
 * - 把 AuthError -> HTTP 状态码映射收敛在一处；
 * - 避免每个 route 手写重复错误处理模板。
 *
 * 维护注意：
 * - `failJson` 的错误映射规则是接口行为的一部分，不应随意变更；
 * - `parsePagination` 的默认值与上限属于产品约定，不只是技术默认。
 * =============================================================================
 */

export interface PaginationParams {
  /** 当前页码（从 1 开始）。 */
  page    : number;
  /** 每页条数。 */
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
  // 允许前端传字符串，这里统一转 number 并做边界收敛。
  const page = Number(searchParams.get("page") ?? "1");
  const pageSize = Number(searchParams.get("page_size") ?? "20");

  return {
    // page 非法时回退 1，避免负数/NaN 进入数据库 offset 计算。
    page    : Number.isFinite(page) && page > 0 ? Math.floor(page) : 1,
    // pageSize 默认 20，最大 100，防止单次请求拉取过大数据导致性能抖动。
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
  // 每次响应都生成 meta，确保 requestId/耗时对齐日志链路。
  const meta = createApiMeta(args.path, args.requestId, args.startedAt);
  if (args.pagination) {
    // 只有分页接口才附 pagination，避免无关接口污染响应体。
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
    // 鉴权错误单独映射：未认证 401，已认证但无权限 403。
    // 这是对外 API 语义的一部分，客户端会据此决定“跳登录”还是“提示无权限”。
    const status = args.error.code === ERROR_CODES.AUTH_UNAUTHORIZED ? 401 : 403;
    return toNextJson(
      errorResponse(args.error.code, args.error.message, { type: "AuthError", detail: args.error.message }, meta),
      status
    );
  }

  // 非鉴权错误统一转为可展示文本，避免把 unknown 直接暴露给客户端。
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
