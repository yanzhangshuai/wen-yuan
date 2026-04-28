import { lookup } from "node:dns/promises";
import net from "node:net";

import type { ModelConnectivityErrorType } from "./index";

function ipv4ToNumber(ipAddress: string): number {
  return ipAddress
    .split(".")
    .reduce((value, part) => (value * 256) + Number(part), 0);
}

function isIpv4InCidr(ipAddress: string, cidrBase: string, maskBits: number): boolean {
  const ipValue = ipv4ToNumber(ipAddress);
  const baseValue = ipv4ToNumber(cidrBase);
  const mask = maskBits === 0 ? 0 : (0xffffffff << (32 - maskBits)) >>> 0;
  return (ipValue & mask) === (baseValue & mask);
}

function normalizeIpv6(ipAddress: string): string {
  return ipAddress.toLowerCase();
}

export function isPrivateOrDangerousIp(ipAddress: string): boolean {
  const ipVersion = net.isIP(ipAddress);
  if (ipVersion === 4) {
    return (
      isIpv4InCidr(ipAddress, "127.0.0.0", 8)
      || isIpv4InCidr(ipAddress, "10.0.0.0", 8)
      || isIpv4InCidr(ipAddress, "172.16.0.0", 12)
      || isIpv4InCidr(ipAddress, "192.168.0.0", 16)
      || isIpv4InCidr(ipAddress, "169.254.0.0", 16)
    );
  }

  if (ipVersion === 6) {
    const normalized = normalizeIpv6(ipAddress);
    return (
      normalized === "::1"
      || normalized.startsWith("fc")
      || normalized.startsWith("fd")
      || normalized.startsWith("fe8")
      || normalized.startsWith("fe9")
      || normalized.startsWith("fea")
      || normalized.startsWith("feb")
    );
  }

  return false;
}

/**
 * 功能：对连通性测试 BaseURL 做安全边界校验（协议 + 私有地址黑名单）。
 * 输入：baseUrl。
 * 输出：void，校验通过即允许继续请求。
 * 异常：BaseURL 非法、协议非法、域名解析到私有/危险地址时抛错。
 * 副作用：解析 DNS。
 */
export async function assertConnectivityBaseUrlAllowed(baseUrl: string): Promise<void> {
  let parsedBaseUrl: URL;

  try {
    parsedBaseUrl = new URL(baseUrl);
  } catch {
    throw new Error("BaseURL 不合法");
  }

  if (parsedBaseUrl.protocol !== "https:" && parsedBaseUrl.protocol !== "http:") {
    throw new Error("连通性测试仅支持 HTTP/HTTPS BaseURL");
  }

  const hostname = parsedBaseUrl.hostname.replace(/^\[(.*)\]$/, "$1");
  if (hostname.toLowerCase() === "localhost") {
    throw new Error("连通性测试地址指向私有或危险网络");
  }

  const directIpVersion = net.isIP(hostname);
  if (directIpVersion !== 0) {
    if (isPrivateOrDangerousIp(hostname)) {
      throw new Error("连通性测试地址指向私有或危险网络");
    }
    return;
  }

  const resolvedAddresses = await lookup(hostname, { all: true, verbatim: true });
  if (resolvedAddresses.length === 0) {
    throw new Error("BaseURL 域名无法解析");
  }

  if (resolvedAddresses.some((address) => isPrivateOrDangerousIp(address.address))) {
    throw new Error("连通性测试地址指向私有或危险网络");
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
