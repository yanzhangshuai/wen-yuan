import type { PrismaClient } from "@/generated/prisma/client";
import { AppRole } from "@/generated/prisma/enums";
import { prisma } from "@/server/db/prisma";
import { ERROR_CODES, type ErrorCode } from "@/types/api";

import {
  AUTH_ADMIN_ROLE,
  AUTH_COOKIE_NAME,
  AUTH_VIEWER_ROLE,
  type AuthRole,
  type AuthTokenPayload
} from "./constants";
import { verifyPassword } from "./password";
import {
  issueAuthToken as issueAuthTokenWithJose,
  verifyAuthToken as verifyAuthTokenWithJose
} from "./token";

export interface AuthContext {
  /** 当前请求关联用户 ID；未识别时为 `null`。 */
  userId         : string | null;
  /** 当前请求角色：`ADMIN` 或 `VIEWER`。 */
  role           : AuthRole;
  /** 管理员展示名（Token 中得）；非管理员时为 `null`。 */
  name           : string | null;
  /** 是否已通过有效 JWT 认证（未登录时为 false）。 */
  isAuthenticated: boolean;
}

export interface LoginInput {
  /** 登录标识，支持用户名或邮箱。 */
  identifier: string;
  /** 登录明文密码（服务端使用 Argon2id 验证）。 */
  password  : string;
}

export interface AuthenticatedAdminUser {
  /** 用户主键 ID（UUID）。 */
  id      : string;
  /** 用户名（唯一）。 */
  username: string;
  /** 邮箱（唯一）。 */
  email   : string;
  /** 展示名称。 */
  name    : string;
  /** 角色，固定为管理员。 */
  role    : typeof AUTH_ADMIN_ROLE;
}

/**
 * 功能：封装认证域错误，并携带统一错误码。
 * 输入：`code`（ErrorCode）、`message`（业务可读错误信息）。
 * 输出：`AuthError` 实例。
 * 异常：无。
 * 副作用：无。
 */
export class AuthError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "AuthError";
  }
}

/**
 * 功能：清洗登录后的跳转路径，防止开放重定向。
 * 输入：`redirect`（可能来自 query/body 的目标路径）。
 * 输出：合法站内路径；非法值统一回退到 `/`。
 * 异常：无。
 * 副作用：无。
 */
export function sanitizeRedirectPath(redirect: string | null | undefined): string {
  if (!redirect) {
    return "/";
  }

  if (!redirect.startsWith("/") || redirect.startsWith("//")) {
    return "/";
  }

  return redirect;
}

/**
 * 功能：从请求头推导鉴权上下文（角色 + 用户 ID）。
 * 输入：`headers: Headers`（包含中间件注入头与可选 Cookie）。
 * 输出：`AuthContext`。
 * 异常：无（校验失败降级为 `viewer`）。
 * 副作用：可能读取并校验 Cookie token（纯计算，无写操作）。
 */
export async function getAuthContext(headers: Headers): Promise<AuthContext> {
  const roleHeader = headers.get("x-auth-role");
  const userIdHeader = headers.get("x-auth-user-id");
  const token = readCookieValue(headers.get("cookie"), AUTH_COOKIE_NAME);
  const payload = token ? await verifyAuthToken(token) : null;

  if (roleHeader === AUTH_ADMIN_ROLE) {
    // 中间件已验证 JWT 有效，此处信任头注入。
    return {
      userId         : userIdHeader,
      role           : AUTH_ADMIN_ROLE,
      name           : payload?.name ?? null,
      isAuthenticated: true
    };
  }

  if (payload?.role === AUTH_ADMIN_ROLE) {
    return {
      userId         : userIdHeader,
      role           : AUTH_ADMIN_ROLE,
      name           : payload.name ?? null,
      isAuthenticated: true
    };
  }

  if (roleHeader === AUTH_VIEWER_ROLE) {
    return {
      userId         : userIdHeader,
      role           : AUTH_VIEWER_ROLE,
      name           : null,
      isAuthenticated: false
    };
  }

  return {
    userId         : userIdHeader,
    role           : AUTH_VIEWER_ROLE,
    name           : null,
    isAuthenticated: false
  };
}

/**
 * 功能：断言当前请求必须为管理员。
 * 输入：`auth: AuthContext`。
 * 输出：无（通过时正常返回）。
 * 异常：非管理员时抛出 `AuthError(AUTH_FORBIDDEN)`。
 * 副作用：无。
 */
export function requireAdmin(auth: AuthContext): void {
  if (auth.role !== AUTH_ADMIN_ROLE) {
    throw new AuthError(ERROR_CODES.AUTH_FORBIDDEN, "当前用户没有管理员权限");
  }
}

/**
 * 功能：执行管理员登录认证（users 表 + Argon2id）。
 * 输入：`identifier/password` 与可注入 `prismaClient`。
 * 输出：认证成功后的管理员快照（不含密码）。
 * 异常：账号不存在、禁用、角色非管理员或密码错误时抛 `AuthError(AUTH_UNAUTHORIZED)`。
 * 副作用：更新 `users.last_login_at`。
 */
export async function authenticateAdmin(
  input: LoginInput,
  prismaClient: PrismaClient = prisma
): Promise<AuthenticatedAdminUser> {
  const user = await prismaClient.user.findFirst({
    where: {
      OR: [{ email: input.identifier }, { username: input.identifier }]
    }
  });

  if (!user || !user.isActive || user.role !== AppRole.ADMIN) {
    throw new AuthError(ERROR_CODES.AUTH_UNAUTHORIZED, "账号或密码错误");
  }

  const passwordMatched = await verifyPassword(input.password, user.password);
  if (!passwordMatched) {
    throw new AuthError(ERROR_CODES.AUTH_UNAUTHORIZED, "账号或密码错误");
  }

  await prismaClient.user.update({
    where: { id: user.id },
    data : { lastLoginAt: new Date() }
  });

  return {
    id      : user.id,
    username: user.username,
    email   : user.email,
    name    : user.name,
    role    : AUTH_ADMIN_ROLE
  };
}

/**
 * 功能：签发管理员会话 token。
 * 输入：`now`（秒级时间戳，默认当前时间）。
 * 输出：JWT 字符串。
 * 异常：签发失败时由底层抛错。
 * 副作用：无。
 */
export async function issueAuthToken(name: string, now = Math.floor(Date.now() / 1000)): Promise<string> {
  return issueAuthTokenWithJose(name, now);
}

/**
 * 功能：校验会话 token 有效性。
 * 输入：`token`（JWT 字符串）、`now`（秒级时间戳）。
 * 输出：合法时返回 `AuthTokenPayload`，否则返回 `null`。
 * 异常：无（校验失败由底层转为 `null`）。
 * 副作用：无。
 */
export async function verifyAuthToken(
  token: string,
  now = Math.floor(Date.now() / 1000)
): Promise<AuthTokenPayload | null> {
  return verifyAuthTokenWithJose(token, now);
}

/**
 * 功能：从 `Cookie` 请求头中提取指定键值。
 * 输入：`cookieHeader`（完整 Cookie 字符串）、`cookieName`（目标键名）。
 * 输出：解码后的 cookie 值；不存在或空值返回 `null`。
 * 异常：无（URL 解码失败时返回原始值）。
 * 副作用：无。
 */
function readCookieValue(cookieHeader: string | null, cookieName: string): string | null {
  if (!cookieHeader) {
    return null;
  }

  const items = cookieHeader.split(";");
  for (const item of items) {
    const [namePart, ...valueParts] = item.split("=");
    const name = namePart?.trim();
    if (name !== cookieName) {
      continue;
    }

    const rawValue = valueParts.join("=").trim();
    if (!rawValue) {
      return null;
    }

    try {
      return decodeURIComponent(rawValue);
    } catch {
      return rawValue;
    }
  }

  return null;
}

export {
  AUTH_ADMIN_ROLE,
  AUTH_COOKIE_NAME,
  AUTH_TOKEN_TTL_SECONDS,
  AUTH_VIEWER_ROLE
} from "./constants";
export type { AuthRole, AuthTokenPayload } from "./constants";
export { hashPassword, verifyPassword } from "./password";
