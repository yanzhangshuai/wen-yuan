/**
 * 功能：定义统一 API 元信息结构。
 * 输入：无。
 * 输出：类型约束 ApiMeta。
 * 异常：无。
 * 副作用：无。
 */
export interface ApiMeta {
  requestId: string;
  timestamp: string;
  path: string;
  durationMs?: number;
}

/**
 * 功能：定义统一 API 错误结构。
 * 输入：无。
 * 输出：类型约束 ApiErrorDetail。
 * 异常：无。
 * 副作用：无。
 */
export interface ApiErrorDetail {
  type: string;
  detail?: string;
}

/**
 * 功能：定义统一成功返回结构。
 * 输入：无。
 * 输出：类型约束 ApiSuccessResponse<T>。
 * 异常：无。
 * 副作用：无。
 */
export interface ApiSuccessResponse<T> {
  success: true;
  code: string;
  message: string;
  data: T;
  meta: ApiMeta;
}

/**
 * 功能：定义统一失败返回结构。
 * 输入：无。
 * 输出：类型约束 ApiErrorResponse。
 * 异常：无。
 * 副作用：无。
 */
export interface ApiErrorResponse {
  success: false;
  code: string;
  message: string;
  error: ApiErrorDetail;
  meta: ApiMeta;
}

/**
 * 功能：定义统一 API 返回联合类型。
 * 输入：无。
 * 输出：ApiResponse<T>。
 * 异常：无。
 * 副作用：无。
 */
export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

