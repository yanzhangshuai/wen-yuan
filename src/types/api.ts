/**
 * 功能：定义统一 API 元信息结构。
 * 输入：无。
 * 输出：类型约束 ApiMeta。
 * 异常：无。
 * 副作用：无。
 */
export interface ApiMeta {
  requestId  : string;
  timestamp  : string;
  path       : string;
  durationMs?: number;
  pagination?: ApiPagination;
}

/**
 * 功能：定义统一分页元信息。
 * 输入：无。
 * 输出：类型约束 ApiPagination。
 * 异常：无。
 * 副作用：无。
 */
export interface ApiPagination {
  page    : number;
  pageSize: number;
  total   : number;
}

/**
 * 功能：定义统一 API 错误结构。
 * 输入：无。
 * 输出：类型约束 ApiErrorDetail。
 * 异常：无。
 * 副作用：无。
 */
export interface ApiErrorDetail {
  type   : string;
  detail?: string;
  field? : string;
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
  code   : string;
  message: string;
  data   : T;
  meta   : ApiMeta;
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
  code   : string;
  message: string;
  error  : ApiErrorDetail;
  meta   : ApiMeta;
}

/**
 * 功能：定义统一 API 返回联合类型。
 * 输入：无。
 * 输出：ApiResponse<T>。
 * 异常：无。
 * 副作用：无。
 */
export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

/**
 * 功能：定义统一错误码常量，避免字符串散落。
 * 输入：无。
 * 输出：ERROR_CODES 常量对象。
 * 异常：无。
 * 副作用：无。
 */
export const ERROR_CODES = {
  COMMON_BAD_REQUEST           : "COMMON_BAD_REQUEST",
  COMMON_NOT_FOUND             : "COMMON_NOT_FOUND",
  COMMON_INTERNAL_ERROR        : "COMMON_INTERNAL_ERROR",
  COMMON_RATE_LIMITED          : "COMMON_RATE_LIMITED",
  AUTH_UNAUTHORIZED            : "AUTH_UNAUTHORIZED",
  AUTH_FORBIDDEN               : "AUTH_FORBIDDEN",
  AUTH_INVALID_SCOPE           : "AUTH_INVALID_SCOPE",
  PROJECT_DUPLICATED_CODE      : "PROJECT_DUPLICATED_CODE",
  PROJECT_NOT_FOUND            : "PROJECT_NOT_FOUND",
  WORK_DUPLICATED_TITLE        : "WORK_DUPLICATED_TITLE",
  WORK_NOT_FOUND               : "WORK_NOT_FOUND",
  WORK_VERSION_DUPLICATED_LABEL: "WORK_VERSION_DUPLICATED_LABEL",
  WORK_VERSION_NOT_FOUND       : "WORK_VERSION_NOT_FOUND"
} as const;

/**
 * 功能：从 ERROR_CODES 推导统一错误码联合类型。
 * 输入：无。
 * 输出：ErrorCode 类型。
 * 异常：无。
 * 副作用：无。
 */
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
