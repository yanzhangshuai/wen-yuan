import { NextResponse } from "next/server";

import type { ApiErrorDetail, ApiErrorResponse, ApiMeta, ApiResponse, ApiSuccessResponse } from "@/types/api";

/**
 * =============================================================================
 * 文件定位（API 响应协议基础层）
 * -----------------------------------------------------------------------------
 * 本文件属于服务端 HTTP 基础设施层，负责把“统一 API contract”落成可复用函数。
 *
 * 在 Next.js 中的作用：
 * - 被 `app/api/[...]/route.ts` 间接调用（通常通过 route-utils）；
 * - 输出 `NextResponse.json(...)`，是 Route Handler 的最终响应格式来源。
 *
 * 业务价值：
 * - 统一成功/失败结构，降低前后端联调与错误处理复杂度；
 * - 统一 meta（requestId/耗时/路径）便于排障与日志追踪；
 * - 保证不同接口在客户端可按同一读取逻辑消费。
 *
 * 维护注意：
 * - `ApiMeta` 与 `ApiResponse` 是跨层契约，字段改动会影响客户端解析；
 * - `durationMs` 的计算依赖 startedAt，调用方应在请求开始时记录。
 * =============================================================================
 *
 * 功能：创建统一响应元信息。
 * 输入：path、requestId、startedAt。
 * 输出：ApiMeta。
 * 异常：无。
 * 副作用：无。
 */
export function createApiMeta(path: string, requestId: string, startedAt: number): ApiMeta {
  return {
    requestId,
    // 统一 ISO 时间，便于跨时区系统日志对齐。
    timestamp : new Date().toISOString(),
    path,
    // durationMs 是“服务端处理耗时”，不含客户端网络传输时间。
    durationMs: Date.now() - startedAt
  };
}

/**
 * 功能：构建统一成功响应对象。
 * 输入：code、message、data、meta。
 * 输出：ApiSuccessResponse<T>。
 * 异常：无。
 * 副作用：无。
 */
export function successResponse<T>(
  code: string,
  message: string,
  data: T,
  meta: ApiMeta
): ApiSuccessResponse<T> {
  // success=true 分支的结构必须稳定，客户端会据此直接判定请求是否成功。
  return {
    success: true,
    code,
    message,
    data,
    meta
  };
}

/**
 * 功能：构建统一失败响应对象。
 * 输入：code、message、error、meta。
 * 输出：ApiErrorResponse。
 * 异常：无。
 * 副作用：无。
 */
export function errorResponse(
  code: string,
  message: string,
  error: ApiErrorDetail,
  meta: ApiMeta
): ApiErrorResponse {
  // success=false 分支承载结构化错误信息，便于前端精准提示与表单定位。
  return {
    success: false,
    code,
    message,
    error,
    meta
  };
}

/**
 * 功能：输出统一 NextResponse JSON。
 * 输入：payload、status。
 * 输出：NextResponse。
 * 异常：无。
 * 副作用：HTTP 响应写出。
 */
export function toNextJson<T>(payload: ApiResponse<T>, status: number): NextResponse<ApiResponse<T>> {
  // 统一由 NextResponse.json 输出，避免各路由自行构建响应导致格式漂移。
  return NextResponse.json(payload, { status });
}
