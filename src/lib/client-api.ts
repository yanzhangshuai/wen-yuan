/**
 * =============================================================================
 * 文件定位（客户端 API 适配工具）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/lib/client-api.ts`
 *
 * 在 Next.js 项目中的角色：
 * - 属于前端服务访问层（client-side util），被 `src/lib/services/*` 复用；
 * - 统一解析后端 route 返回的 `{ success, data, message, error }` 响应格式。
 *
 * 业务职责：
 * - 封装成功/失败识别、错误文案提取、401 登录态失效跳转；
 * - 让调用方关注业务数据，不重复编写响应解析模板代码。
 *
 * 运行环境说明：
 * - 该工具设计用于浏览器端调用（CSR 交互阶段）；
 * - 对 401 的登录跳转依赖 `window.location`，因此不会在服务端执行。
 * =============================================================================
 */

interface ClientApiSuccessResponse {
  /** 统一成功标记。 */
  success : true;
  /** 成功数据载荷，具体结构由调用方泛型约束。 */
  data    : unknown;
  /** 可选提示文案（例如“保存成功”）。 */
  message?: string;
}

interface ClientApiErrorResponse {
  /** 统一失败标记。 */
  success : false;
  /** 面向用户的失败文案（可选）。 */
  message?: string;
  error?: {
    /** 更细粒度错误详情（可选）。 */
    detail?: string;
  };
}

export type ClientApiResponse = ClientApiSuccessResponse | ClientApiErrorResponse;

function isRecord(value: unknown): value is Record<string, unknown> {
  // 运行时类型守卫：响应源头是 unknown，先判断为对象再做字段读取更安全。
  return typeof value === "object" && value !== null;
}

/**
 * 功能：在客户端以轻量方式读取统一 API 响应结构。
 * 输入：`fetch().json()` 返回值（unknown）。
 * 输出：识别成功返回 `ClientApiResponse`，否则返回 `null`。
 */
export function readClientApiResponse(payload: unknown): ClientApiResponse | null {
  // 第一层防御：若缺少 success 布尔位，视为非约定响应，返回 null 交由上层兜底。
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
    // 理论上调用失败路径才会进入此函数；这里保留 message 是为了兼容弱约定后端。
    return response.message ?? fallback;
  }

  return response.error?.detail ?? response.message ?? fallback;
}

async function readJsonPayload(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    throw new Error("请求失败，请稍后重试");
  }
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
    // 业务规则：会话失效统一跳登录页，并带当前页面作为 redirect，便于登录后回跳。
    const redirect = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.assign(`/login?redirect=${redirect}`);
    return new Promise<T>(() => { /* 等待页面跳转，永不 resolve */ });
  }

  const payload = await readJsonPayload(res);
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
    // 写操作失败时尽量解析后端错误体；解析失败则回退统一文案。
    let payload: unknown = null;
    try { payload = await res.json(); } catch { /* ignore */ }
    throw new Error(readClientApiErrorMessage(payload));
  }
}
