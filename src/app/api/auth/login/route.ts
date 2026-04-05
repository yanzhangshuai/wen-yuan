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

/**
 * =============================================================================
 * 文件定位（Next.js Route Handler：登录接口）
 * -----------------------------------------------------------------------------
 * 文件路径：`app/api/auth/login/route.ts`
 *
 * 在 Next.js 中，`app/api/<...>/route.ts` 会被框架识别为服务端接口路由：
 * - 该文件导出的 `POST` 函数对应 HTTP POST 方法；
 * - 运行环境为服务端（Node.js Runtime），可安全访问数据库、密钥、Cookie；
 * - 不参与 React 组件渲染，而是作为前后端边界，负责输入校验、鉴权、响应协议。
 *
 * 本文件核心业务职责：
 * 1) 管理员登录入口：校验入参并调用 `authenticateAdmin` 完成账号密码认证；
 * 2) 登录风控：按 IP 做失败限流，减少暴力破解风险；
 * 3) 会话建立：签发 JWT，并通过 httpOnly Cookie 写回浏览器；
 * 4) 安全防护：执行同源校验 + redirect 清洗，降低 CSRF 与开放重定向风险；
 * 5) 错误语义统一：输出标准化错误码，便于前端一致处理。
 *
 * 上游输入：
 * - 登录页提交的 JSON 请求体（identifier/password/redirect）；
 * - 请求头中的 `origin`、代理 IP 相关头；
 * - 运行时环境变量（JWT_SECRET 等，通过 auth 模块间接使用）。
 *
 * 下游输出：
 * - 成功：标准 JSON 成功体 + `AUTH_COOKIE_NAME` 会话 Cookie；
 * - 失败：标准 JSON 失败体（400/403/429/500）。
 *
 * 维护注意：
 * - 频控阈值、Cookie 策略、同源校验属于安全边界，改动需联动评估；
 * - 认证失败信息必须保持统一文案，避免暴露账号存在性（这是业务安全规则，不是技术限制）。
 * =============================================================================
 */

/** 登录请求体 Schema（仅支持 `identifier` 标准字段）。 */
const loginBodySchema = z.object({
  /**
   * 登录标识：支持用户名或邮箱。
   * 业务语义：降低后台账号登录门槛，用户可按习惯输入任一标识。
   */
  identifier: z.string({
    required_error: "请输入邮箱或用户名"
  }).trim().min(1, "请输入邮箱或用户名"),
  /**
   * 明文密码。
   * 业务语义：仅用于本次认证，后端会做哈希比对，不应在前端持久化。
   */
  password: z.string().min(1, "请输入密码"),
  /**
   * 登录后跳转路径（可选）。
   * 业务语义：用于登录后回跳原目标页面，最终会在服务端清洗为安全站内路径。
   */
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
    /**
     * 角色（固定 admin）。
     * 说明：当前接口仅允许管理员登录，这是产品权限模型的业务规则，不是技术限制。
     */
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
    // 业务安全策略：登录接口要求显式携带 Origin，缺失视为可疑来源。
    return false;
  }

  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    // 防御式降级：任一 URL 解析失败都按不可信来源处理，避免放过异常输入。
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
  // 为每次请求生成链路追踪元信息，便于日志排查与统一响应封装。
  const startedAt = Date.now();
  const requestId = randomUUID();
  // 风控维度：当前仅按 IP 做限流；若后续需要更细粒度可扩展“账号 + IP”联合键。
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

    // 3) 解析并校验 JSON 请求体，确保进入认证流程前数据结构已达标。
    const parsedResult = loginBodySchema.safeParse(await readJsonBody(request));

    if (!parsedResult.success) {
      return badRequestJson(requestId, startedAt, parsedResult.error.issues[0]?.message ?? "请求参数不合法");
    }

    // 4) 统一 users 表认证链路，保证错误语义对外一致（不暴露账号存在性）。
    const user = await authenticateAdmin({
      identifier: parsedResult.data.identifier,
      password  : parsedResult.data.password
    });

    // 5) 清洗 redirect，防止将用户重定向到站外恶意地址。
    const redirect = sanitizeRedirectPath(parsedResult.data.redirect);
    // 6) 签发 JWT 作为会话凭证。
    const token = await issueAuthToken(user.name);
    // 7) 登录成功后清空该 IP 的失败历史，避免影响后续正常登录。
    clearLoginFailures(clientIp);

    // 8) 产出统一成功响应体，返回前端所需最小用户快照与跳转目标。
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
      // 生产环境必须开启 secure，避免凭证在明文 HTTP 链路传输。
      secure  : process.env.NODE_ENV === "production"
    });

    return response;
  } catch (error) {
    if (error instanceof AuthError && error.code === ERROR_CODES.AUTH_UNAUTHORIZED) {
      // 仅“账号密码错误”计入失败次数；其他系统错误不应误伤用户并触发锁定。
      const lockResult = recordLoginFailure(clientIp);
      if (lockResult.locked && lockResult.retryAfterSeconds) {
        return rateLimitedJson(requestId, startedAt, lockResult.retryAfterSeconds);
      }
    }

    // 统一错误出口：保证前端始终收到标准错误结构，减少分支处理复杂度。
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
