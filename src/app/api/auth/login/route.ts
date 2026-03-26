import { randomUUID } from "node:crypto";

import { z } from "zod";

import { createApiMeta, errorResponse, toNextJson } from "@/server/http/api-response";
import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import {
  AuthError,
  type AUTH_ADMIN_ROLE,
  authenticateAdmin,
  AUTH_COOKIE_NAME,
  AUTH_TOKEN_TTL_SECONDS,
  issueAuthToken,
  sanitizeRedirectPath
} from "@/server/modules/auth";
import {
  clearLoginFailures,
  getLoginLockRetryAfterSeconds,
  recordLoginFailure,
  resolveClientIp
} from "@/server/modules/auth/login-rate-limit";
import { ERROR_CODES } from "@/types/api";

/** 登录请求体 Schema（仅支持 `identifier` 标准字段）。 */
const loginBodySchema = z.object({
  /** 用户名或邮箱。 */
  identifier: z.string({
    required_error: "请输入邮箱或用户名"
  }).trim().min(1, "请输入邮箱或用户名"),
  /** 明文密码（服务端做 Argon2id 校验）。 */
  password: z.string().min(1, "请输入密码"),
  /** 登录后跳转路径（可选，必须是站内路径）。 */
  redirect: z.string().optional()
});

/** 登录成功响应数据。 */
interface LoginResponseData {
  /** 登录成功后的前端跳转路径。 */
  redirect: string;
  /** 当前管理员用户信息快照。 */
  user: {
    /** 用户 ID（UUID）。 */
    id      : string;
    /** 用户名。 */
    username: string;
    /** 邮箱。 */
    email   : string;
    /** 显示名称。 */
    name    : string;
    /** 角色（固定 admin）。 */
    role    : typeof AUTH_ADMIN_ROLE;
  };
}

/**
 * 功能：构造登录参数错误响应。
 * 输入：requestId、startedAt、detail。
 * 输出：HTTP 400 响应。
 * 异常：无。
 * 副作用：无。
 */
function badRequestJson(
  requestId: string,
  startedAt: number,
  detail: string
): Response {
  const meta = createApiMeta("/api/auth/login", requestId, startedAt);

  return toNextJson(
    errorResponse(
      ERROR_CODES.COMMON_BAD_REQUEST,
      "登录参数不合法",
      {
        type: "ValidationError",
        detail
      },
      meta
    ),
    400
  );
}

/**
 * 功能：构造非法来源请求响应（同源校验失败）。
 * 输入：requestId、startedAt、detail。
 * 输出：HTTP 403 响应。
 * 异常：无。
 * 副作用：无。
 */
function forbiddenJson(
  requestId: string,
  startedAt: number,
  detail: string
): Response {
  const meta = createApiMeta("/api/auth/login", requestId, startedAt);

  return toNextJson(
    errorResponse(
      ERROR_CODES.AUTH_FORBIDDEN,
      "非法请求来源",
      {
        type: "AuthError",
        detail
      },
      meta
    ),
    403
  );
}

/**
 * 功能：构造登录频控响应。
 * 输入：requestId、startedAt、retryAfterSeconds。
 * 输出：HTTP 429 响应（附 `Retry-After` 头）。
 * 异常：无。
 * 副作用：设置响应头 `Retry-After`。
 */
function rateLimitedJson(
  requestId: string,
  startedAt: number,
  retryAfterSeconds: number
): Response {
  const meta = createApiMeta("/api/auth/login", requestId, startedAt);
  const response = toNextJson(
    errorResponse(
      ERROR_CODES.COMMON_RATE_LIMITED,
      "登录尝试过多，请稍后再试",
      {
        type  : "RateLimitError",
        detail: `Retry after ${retryAfterSeconds} seconds`
      },
      meta
    ),
    429
  );

  response.headers.set("Retry-After", String(retryAfterSeconds));
  return response;
}

/**
 * 功能：校验登录请求是否同源，阻断跨站表单或脚本携带 Cookie 发起登录。
 * 输入：原始 Request（读取 origin + 当前 URL）。
 * 输出：同源返回 true，否则返回 false。
 * 异常：URL 解析失败时安全降级为 false。
 * 副作用：无。
 */
function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) {
    return false;
  }

  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

/**
 * POST `/api/auth/login`
 * 功能：管理员登录（同源校验 + 速率限制 + users 表认证 + JWT Cookie 签发）。
 * 入参：请求体 `identifier/password/redirect`。
 * 返回：登录成功响应，并设置 `httpOnly` 登录 Cookie。
 */
export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const clientIp = resolveClientIp(request.headers);

  try {
    // 1) 先做速率限制，避免异常流量继续占用数据库与密码哈希计算。
    const retryAfterSeconds = getLoginLockRetryAfterSeconds(clientIp);
    if (retryAfterSeconds) {
      return rateLimitedJson(requestId, startedAt, retryAfterSeconds);
    }

    // 2) 再做同源校验，拒绝跨站来源请求。
    if (!isSameOriginRequest(request)) {
      return forbiddenJson(requestId, startedAt, "Origin header is missing or mismatched");
    }

    const parsedResult = loginBodySchema.safeParse(await readJsonBody(request));

    if (!parsedResult.success) {
      return badRequestJson(requestId, startedAt, parsedResult.error.issues[0]?.message ?? "请求参数不合法");
    }

    // 3) 统一 users 表认证链路，保证错误语义对外一致（不暴露账号存在性）。
    const user = await authenticateAdmin({
      identifier: parsedResult.data.identifier,
      password  : parsedResult.data.password
    });

    const redirect = sanitizeRedirectPath(parsedResult.data.redirect);
    const token = await issueAuthToken();
    clearLoginFailures(clientIp);

    const response = okJson<LoginResponseData>({
      path   : "/api/auth/login",
      requestId,
      startedAt,
      code   : "AUTH_LOGGED_IN",
      message: "登录成功",
      data   : {
        redirect,
        user
      }
    });

    response.cookies.set({
      name    : AUTH_COOKIE_NAME,
      value   : token,
      httpOnly: true,
      maxAge  : AUTH_TOKEN_TTL_SECONDS,
      path    : "/",
      // Strict + Origin 校验共同构成 CSRF 防护基线。
      sameSite: "strict",
      secure  : process.env.NODE_ENV === "production"
    });

    return response;
  } catch (error) {
    if (error instanceof AuthError && error.code === ERROR_CODES.AUTH_UNAUTHORIZED) {
      const lockResult = recordLoginFailure(clientIp);
      if (lockResult.locked && lockResult.retryAfterSeconds) {
        return rateLimitedJson(requestId, startedAt, lockResult.retryAfterSeconds);
      }
    }

    return failJson({
      path           : "/api/auth/login",
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "登录失败"
    });
  }
}
