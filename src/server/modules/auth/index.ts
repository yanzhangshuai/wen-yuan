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

/**
 * =============================================================================
 * 文件定位（Auth 聚合服务入口）
 * -----------------------------------------------------------------------------
 * 本文件是服务端鉴权模块的统一出口，负责把“登录认证、Token、权限断言、上下文解析”
 * 聚合成可供 middleware / layout / route handlers 直接调用的 API。
 *
 * 在 Next.js 应用中的角色：
 * - 被 `middleware.ts`、`app/admin/layout.tsx`、`app/api/[...]/route.ts` 共同依赖；
 * - 属于“服务端逻辑层”，不直接参与 UI 渲染，但决定是否允许访问管理能力。
 *
 * 业务目标：
 * 1) 管理员登录校验（users 表 + 密码哈希校验）；
 * 2) 统一产出 AuthContext，供下游判断角色/登录态；
 * 3) 提供强约束权限守卫（requireAdmin）；
 * 4) 提供安全的 redirect 清洗，防止开放重定向。
 *
 * 上游输入：
 * - request headers（middleware 注入的 x-auth-* + cookie）
 * - 登录表单输入 identifier/password
 * - JWT token 字符串
 *
 * 下游输出：
 * - AuthContext（role/userId/name/isAuthenticated）
 * - AuthError（统一错误码）
 * - 认证通过的管理员快照与 token
 *
 * 维护注意：
 * - `getAuthContext` 兼容“有中间件头”与“仅 cookie”两类场景，这是有意设计；
 * - `sanitizeRedirectPath` 是安全边界函数，禁止放宽为任意绝对 URL；
 * - `requireAdmin` 的错误码对 API 响应映射有直接影响，属于跨层契约。
 * =============================================================================
 */
export interface AuthContext {
  /**
   * 当前请求关联用户 ID；未识别时为 `null`。
   * 字段性质：鉴权上下文字段。
   * 说明：当前中间件尚未解析具体 userId，因此常见为 null 或空串占位。
   */
  userId         : string | null;
  /**
   * 当前请求角色：`ADMIN` 或 `VIEWER`。
   * 字段性质：权限决策核心字段。
   */
  role           : AuthRole;
  /**
   * 管理员展示名（Token 中得）；非管理员时为 `null`。
   * 字段性质：展示字段（如 AdminHeader）。
   */
  name           : string | null;
  /**
   * 是否已通过有效 JWT 认证（未登录时为 false）。
   * 字段性质：会话状态字段，用于区分“游客角色”与“真实登录态”。
   */
  isAuthenticated: boolean;
}

export interface LoginInput {
  /**
   * 登录标识，支持用户名或邮箱。
   * 字段来源：用户输入。
   */
  identifier: string;
  /**
   * 登录明文密码（服务端使用 Argon2id 验证）。
   * 字段来源：用户输入。
   */
  password  : string;
}

export interface AuthenticatedAdminUser {
  /** 用户主键 ID（UUID），来自 users 表。 */
  id      : string;
  /** 用户名（唯一），可用于后续登录。 */
  username: string;
  /** 邮箱（唯一）。 */
  email   : string;
  /** 展示名称（用于后台 UI 展示）。 */
  name    : string;
  /** 角色，固定为管理员。属于业务规则，不是技术限制。 */
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
    // 空值回首页：保证登录成功后始终有稳定去向。
    return "/";
  }

  if (!redirect.startsWith("/") || redirect.startsWith("//")) {
    // 防御重点：拒绝外链与协议相对地址，避免开放重定向攻击。
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
  // 先读取中间件注入头：这是请求链路上最轻量、最统一的鉴权上下文来源。
  const roleHeader = headers.get("x-auth-role");
  const userIdHeader = normalizeOptionalHeaderValue(headers.get("x-auth-user-id"));
  // 同时读取 cookie 作为兜底，覆盖“API 未命中 middleware”或“直接调用”的场景。
  const token = readCookieValue(headers.get("cookie"), AUTH_COOKIE_NAME);
  const payload = token ? await verifyAuthToken(token) : null;

  if (roleHeader === AUTH_ADMIN_ROLE) {
    // 分支原因：命中该分支意味着上游中间件已完成管理员校验，可直接信任角色头。
    return {
      userId         : userIdHeader ?? payload?.userId ?? null,
      role           : AUTH_ADMIN_ROLE,
      name           : payload?.name ?? null,
      isAuthenticated: true
    };
  }

  if (payload?.role === AUTH_ADMIN_ROLE) {
    // 分支原因：当中间件头缺失或不可信时，以 token 校验结果作为后备真实来源。
    return {
      userId         : userIdHeader ?? payload.userId,
      role           : AUTH_ADMIN_ROLE,
      name           : payload.name ?? null,
      isAuthenticated: true
    };
  }

  if (roleHeader === AUTH_VIEWER_ROLE) {
    // 分支原因：显式访客头，直接返回最小访客上下文。
    return {
      userId         : userIdHeader,
      role           : AUTH_VIEWER_ROLE,
      name           : null,
      isAuthenticated: false
    };
  }

  // 最终兜底：任何无法识别的情况都降级为访客，避免异常导致越权。
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
    // 这里抛业务错误而非返回 boolean，是为了强制调用方显式处理权限失败分支。
    throw new AuthError(ERROR_CODES.AUTH_FORBIDDEN, "当前用户没有管理员权限");
  }
}

/**
 * 功能：断言当前管理员上下文具备可追溯的操作者 userId。
 * 输入：`auth: AuthContext`。
 * 输出：非空 `userId`。
 * 异常：非管理员或 userId 缺失时抛 `AuthError`。
 * 副作用：无。
 */
export function requireAdminActorUserId(auth: AuthContext): string {
  requireAdmin(auth);

  if (auth.userId === null || auth.userId.trim().length === 0) {
    throw new AuthError(ERROR_CODES.AUTH_UNAUTHORIZED, "Authenticated admin context is missing userId");
  }

  return auth.userId;
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
  // 第 1 步：根据“用户名或邮箱”检索用户，支持两种登录标识。
  const user = await prismaClient.user.findFirst({
    where: {
      OR: [{ email: input.identifier }, { username: input.identifier }]
    }
  });

  if (!user || !user.isActive || user.role !== AppRole.ADMIN) {
    // 业务安全规则：返回统一错误文案，避免暴露“账号不存在/被禁用/角色不符”的细节。
    throw new AuthError(ERROR_CODES.AUTH_UNAUTHORIZED, "账号或密码错误");
  }

  // 第 2 步：密码哈希校验。
  const passwordMatched = await verifyPassword(input.password, user.password);
  if (!passwordMatched) {
    throw new AuthError(ERROR_CODES.AUTH_UNAUTHORIZED, "账号或密码错误");
  }

  // 第 3 步：登录成功后更新最后登录时间，供审计与运营查看活跃度。
  await prismaClient.user.update({
    where: { id: user.id },
    data : { lastLoginAt: new Date() }
  });

  // 第 4 步：返回“无敏感信息”的管理员快照给上游响应层。
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
 * 输入：管理员身份快照与 `now`（秒级时间戳，默认当前时间）。
 * 输出：JWT 字符串。
 * 异常：签发失败时由底层抛错。
 * 副作用：无。
 */
export async function issueAuthToken(
  input: { userId: string; name: string },
  now = Math.floor(Date.now() / 1000)
): Promise<string> {
  // 仅做聚合转发，保持调用方只依赖 auth/index，不耦合底层 token 文件路径。
  return issueAuthTokenWithJose(input, now);
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
  // 统一透传到 token 实现，保持模块边界清晰。
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

  // Cookie 头格式：k1=v1; k2=v2; ...
  const items = cookieHeader.split(";");
  for (const item of items) {
    const [namePart, ...valueParts] = item.split("=");
    const name = namePart?.trim();
    if (name !== cookieName) {
      continue;
    }

    const rawValue = valueParts.join("=").trim();
    if (!rawValue) {
      // 出现空值时按“无有效 cookie”处理，避免把空串误当作已登录凭证。
      return null;
    }

    try {
      // 正常路径：cookie 值经 URL 编码后存储，读取时解码。
      return decodeURIComponent(rawValue);
    } catch {
      // 解码失败兜底返回原值，避免因为单个非法编码导致整个鉴权链路异常。
      return rawValue;
    }
  }

  return null;
}

function normalizeOptionalHeaderValue(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export {
  AUTH_ADMIN_ROLE,
  AUTH_COOKIE_NAME,
  AUTH_TOKEN_TTL_SECONDS,
  AUTH_VIEWER_ROLE
} from "./constants";
export type { AuthRole, AuthTokenPayload } from "./constants";
export { hashPassword, verifyPassword } from "./password";
