import { NextResponse } from "next/server";

import type { ApiErrorDetail, ApiErrorResponse, ApiMeta, ApiResponse, ApiSuccessResponse } from "@/types/api";

/**
 * 功能：创建统一响应元信息。
 * 输入：path、requestId、startedAt。
 * 输出：ApiMeta。
 * 异常：无。
 * 副作用：无。
 */
export function createApiMeta(path: string, requestId: string, startedAt: number): ApiMeta {
  return {
    requestId,
    timestamp : new Date().toISOString(),
    path,
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
  return NextResponse.json(payload, { status });
}

