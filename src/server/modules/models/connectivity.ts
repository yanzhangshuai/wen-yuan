import type { ModelConnectivityErrorType, SupportedProvider } from "./index";

export const connectivityHostAllowList: Record<SupportedProvider, readonly string[]> = {
  deepseek: ["api.deepseek.com", "dashscope.aliyuncs.com"],
  qwen    : ["dashscope.aliyuncs.com"],
  doubao  : ["ark.cn-beijing.volces.com"],
  gemini  : ["generativelanguage.googleapis.com"],
  glm     : ["open.bigmodel.cn"]
};

/**
 * 功能：解析额外连通性测试白名单域名（逗号分隔）。
 * 输入：`MODEL_TEST_ALLOWED_HOSTS` 原始环境变量字符串。
 * 输出：去重前的标准化域名数组（小写、trim 后）。
 * 异常：无。
 * 副作用：无。
 */
export function parseExtraConnectivityHosts(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }

  return raw
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 0);
}

/**
 * 功能：判断目标域名是否命中允许列表。
 * 输入：hostname 与 allowList。
 * 输出：布尔值，true 表示允许发起连通性请求。
 * 异常：无。
 * 副作用：无。
 */
export function isAllowedHost(hostname: string, allowList: readonly string[]): boolean {
  const normalizedHost = hostname.toLowerCase();
  return allowList.some((allowedHost) => normalizedHost === allowedHost.toLowerCase());
}

/**
 * 功能：对连通性测试 BaseURL 做安全边界校验（协议 + 域名白名单）。
 * 输入：provider、baseUrl。
 * 输出：void，校验通过即允许继续请求。
 * 异常：BaseURL 非法、非 HTTPS、域名不在白名单时抛错。
 * 副作用：无。
 */
export function assertConnectivityBaseUrlAllowed(provider: SupportedProvider, baseUrl: string): void {
  let parsedBaseUrl: URL;

  try {
    parsedBaseUrl = new URL(baseUrl);
  } catch {
    throw new Error("BaseURL 不合法");
  }

  if (parsedBaseUrl.protocol !== "https:") {
    throw new Error("连通性测试仅支持 HTTPS BaseURL");
  }

  const allowList = [
    ...connectivityHostAllowList[provider],
    ...parseExtraConnectivityHosts(process.env.MODEL_TEST_ALLOWED_HOSTS)
  ];

  if (!isAllowedHost(parsedBaseUrl.hostname, allowList)) {
    throw new Error("连通性测试地址不在白名单内");
  }
}

export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * 功能：根据 HTTP 状态码归类模型连通性失败类型，供前端做稳定文案分支。
 * 输入：status（HTTP 响应状态码）。
 * 输出：标准错误类型枚举。
 * 异常：无。
 * 副作用：无。
 */
export function classifyHttpErrorType(status: number): ModelConnectivityErrorType {
  if (status === 401 || status === 403) {
    return "AUTH_ERROR";
  }

  if (status === 408 || status === 504) {
    return "TIMEOUT";
  }

  if (status === 404 || status === 429 || status >= 500) {
    return "MODEL_UNAVAILABLE";
  }

  return "NETWORK_ERROR";
}

/**
 * 功能：根据抛错信息兜底识别失败类型（如超时、网络层异常）。
 * 输入：unknown error。
 * 输出：标准错误类型枚举。
 * 异常：无。
 * 副作用：无。
 */
export function classifyThrownErrorType(error: unknown): ModelConnectivityErrorType {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "TIMEOUT";
  }

  const message = getErrorMessage(error, "").toLowerCase();
  if (message.includes("timeout")) {
    return "TIMEOUT";
  }

  if (message.includes("network") || message.includes("fetch")) {
    return "NETWORK_ERROR";
  }

  return "NETWORK_ERROR";
}

export function classifySemanticErrorType(detail: string): ModelConnectivityErrorType {
  const normalized = detail.toLowerCase();
  if (
    normalized.includes("api key")
    || normalized.includes("unauthorized")
    || normalized.includes("forbidden")
    || normalized.includes("鉴权")
    || normalized.includes("令牌")
  ) {
    return "AUTH_ERROR";
  }

  return "MODEL_UNAVAILABLE";
}

export function hasOpenAiCompatibleMessage(payload: Record<string, unknown>): boolean {
  const choices = payload.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return false;
  }

  const firstChoice: unknown = choices[0];
  if (!isRecord(firstChoice)) {
    return false;
  }

  const message = firstChoice.message;
  if (!isRecord(message)) {
    return false;
  }

  const content = message.content;
  if (typeof content === "string") {
    return true;
  }

  if (!Array.isArray(content)) {
    return false;
  }

  return content.some((part) => {
    if (!isRecord(part)) {
      return false;
    }

    return typeof part.text === "string";
  });
}

export function validateOpenAiCompatibleProbePayload(payload: Record<string, unknown> | null): {
  success: boolean;
  detail?: string;
} {
  if (!payload) {
    return {
      success: false,
      detail : "响应不是合法 JSON，无法确认模型可用"
    };
  }

  const payloadError = payload.error;
  if (isRecord(payloadError) && typeof payloadError.message === "string" && payloadError.message.trim().length > 0) {
    return {
      success: false,
      detail : payloadError.message
    };
  }

  if (!Array.isArray(payload.choices) || payload.choices.length === 0) {
    return {
      success: false,
      detail : "响应缺少 choices，无法确认模型可用"
    };
  }

  if (!hasOpenAiCompatibleMessage(payload)) {
    return {
      success: false,
      detail : "响应缺少可读内容，无法确认模型可用"
    };
  }

  return { success: true };
}

export interface ExtractedResponseDetail {
  detail : string;
  payload: Record<string, unknown> | null;
}

/**
 * 功能：提取 provider 返回中的可读错误信息，统一返回给管理端测试弹窗。
 * 输入：response、fallback。
 * 输出：优先级为 `error.message` > `message` > `text` > fallback。
 * 异常：解析失败时吞掉异常并回退 fallback。
 * 副作用：消耗一次 response body 读取流。
 */
export async function extractResponseDetail(response: Response, fallback: string): Promise<ExtractedResponseDetail> {
  const contentType = response.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("application/json")) {
      const rawPayload: unknown = await response.json();
      if (!isRecord(rawPayload)) {
        return {
          detail : fallback,
          payload: null
        };
      }

      const payloadError = rawPayload.error;
      if (isRecord(payloadError) && typeof payloadError.message === "string" && payloadError.message.trim().length > 0) {
        return {
          detail : payloadError.message,
          payload: rawPayload
        };
      }

      if (typeof rawPayload.message === "string" && rawPayload.message.trim().length > 0) {
        return {
          detail : rawPayload.message,
          payload: rawPayload
        };
      }

      return {
        detail : fallback,
        payload: rawPayload
      };
    } else {
      const rawText = await response.text();
      if (rawText.trim()) {
        return {
          detail : rawText.trim().slice(0, 200),
          payload: null
        };
      }
    }
  } catch {
    return {
      detail : fallback,
      payload: null
    };
  }

  return {
    detail : fallback,
    payload: null
  };
}

