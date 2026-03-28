interface ClientApiSuccessResponse {
  success : true;
  data    : unknown;
  message?: string;
}

interface ClientApiErrorResponse {
  success : false;
  message?: string;
  error?: {
    detail?: string;
  };
}

export type ClientApiResponse = ClientApiSuccessResponse | ClientApiErrorResponse;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * 功能：在客户端以轻量方式读取统一 API 响应结构。
 * 输入：`fetch().json()` 返回值（unknown）。
 * 输出：识别成功返回 `ClientApiResponse`，否则返回 `null`。
 */
export function readClientApiResponse(payload: unknown): ClientApiResponse | null {
  if (!isRecord(payload) || typeof payload.success !== "boolean") {
    return null;
  }

  if (payload.success) {
    return {
      success: true,
      data   : payload.data,
      message: typeof payload.message === "string" ? payload.message : undefined
    };
  }

  const error = isRecord(payload.error) ? payload.error : undefined;
  return {
    success: false,
    message: typeof payload.message === "string" ? payload.message : undefined,
    error  : error && typeof error.detail === "string"
      ? { detail: error.detail }
      : undefined
  };
}

/**
 * 功能：读取可展示的错误信息。
 * 输入：原始 payload 与兜底文案。
 * 输出：优先 detail，其次 message，最后 fallback。
 */
export function readClientApiErrorMessage(payload: unknown, fallback = "请求失败，请稍后重试"): string {
  const response = readClientApiResponse(payload);
  if (!response) {
    return fallback;
  }

  if (response.success) {
    return response.message ?? fallback;
  }

  return response.error?.detail ?? response.message ?? fallback;
}

/**
 * 功能：统一客户端 fetch 工具，自动解析响应结构并在失败时抛出错误。
 * 输入：请求 URL、可选 RequestInit。
 * 输出：响应 data 字段（泛型 T）。
 * 异常：
 *   - 401 时自动跳转登录页（Session 过期）
 *   - 响应解析失败或 success=false 时抛出 Error（message 为可展示文案）。
 */
export async function clientFetch<T = unknown>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(url, options);

  if (res.status === 401 && typeof window !== "undefined") {
    const redirect = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.assign(`/login?redirect=${redirect}`);
    return new Promise<T>(() => { /* 等待页面跳转，永不 resolve */ });
  }

  const payload: unknown = await res.json();
  const response = readClientApiResponse(payload);
  if (!response?.success) {
    throw new Error(readClientApiErrorMessage(payload));
  }
  return response.data as T;
}

/**
 * 功能：写操作专用 fetch（PATCH/POST/DELETE），不解析响应 data，只处理错误。
 * 输入：请求 URL、可选 RequestInit。
 * 输出：void。
 * 异常：
 *   - 401 时自动跳转登录页（Session 过期）
 *   - 响应非 ok 时抛出 Error（message 为可展示文案）。
 */
export async function clientMutate(
  url: string,
  options?: RequestInit
): Promise<void> {
  const res = await fetch(url, options);

  if (res.status === 401 && typeof window !== "undefined") {
    const redirect = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.assign(`/login?redirect=${redirect}`);
    return new Promise<void>(() => { /* 等待页面跳转，永不 resolve */ });
  }

  if (!res.ok) {
    let payload: unknown = null;
    try { payload = await res.json(); } catch { /* ignore */ }
    throw new Error(readClientApiErrorMessage(payload));
  }
}
