/**
 * 文件定位（跨层 API 契约层）：
 * - 该文件定义全项目 HTTP 响应的公共类型契约，供 route handler、服务层、前端调用层共享。
 * - 在 Next.js 架构中，它不参与路由匹配，但决定了接口“返回长什么样”。
 *
 * 设计目标：
 * - 统一成功/失败响应结构，降低前后端联调摩擦；
 * - 用稳定错误码替代随意字符串，便于埋点统计、告警聚合与国际化。
 */
export interface ApiMeta {
  /** 请求链路唯一 ID：用于日志串联与问题追踪。 */
  requestId  : string;
  /** 响应时间戳（ISO 字符串）。 */
  timestamp  : string;
  /** 当前接口路径（通常为业务路由模板或实际路径）。 */
  path       : string;
  /** 请求耗时（毫秒）；部分场景可省略。 */
  durationMs?: number;
  /** 分页信息，仅分页接口返回。 */
  pagination?: ApiPagination;
}

/**
 * 统一分页元信息。
 * 业务语义：
 * - 用于列表接口，让调用方无须读取业务数据本体即可做分页控件渲染。
 */
export interface ApiPagination {
  /** 当前页码（从 1 开始）。 */
  page    : number;
  /** 每页条数。 */
  pageSize: number;
  /** 总记录数。 */
  total   : number;
}

/**
 * 统一错误详情结构。
 * 说明：
 * - `type` 用于机器识别错误类别；
 * - `detail` 与 `field` 用于人类排障与表单定位。
 */
export interface ApiErrorDetail {
  /** 错误类别标识，如 ValidationError/NotFoundError。 */
  type   : string;
  /** 错误补充描述（可选）。 */
  detail?: string;
  /** 出错字段名（表单/参数校验场景可选）。 */
  field? : string;
}

/**
 * 统一成功响应结构。
 * `T` 表示具体业务数据类型，避免每个接口重复定义壳层结构。
 */
export interface ApiSuccessResponse<T> {
  /** 成功标记，固定 true。 */
  success: true;
  /** 业务成功码。 */
  code   : string;
  /** 面向调用方/日志的成功描述。 */
  message: string;
  /** 业务数据载荷。 */
  data   : T;
  /** 请求元信息。 */
  meta   : ApiMeta;
}

/**
 * 统一失败响应结构。
 */
export interface ApiErrorResponse {
  /** 成功标记，固定 false。 */
  success: false;
  /** 业务错误码。 */
  code   : string;
  /** 人类可读错误信息。 */
  message: string;
  /** 结构化错误详情。 */
  error  : ApiErrorDetail;
  /** 请求元信息。 */
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
