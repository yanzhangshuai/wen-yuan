import { AppRole, type AppRole as PrismaAppRole } from "@/generated/prisma/enums";

/** 认证 Cookie 名称（HTTP Only）。 */
export const AUTH_COOKIE_NAME = "token";
/** JWT 有效期：7 天（秒）。 */
export const AUTH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;
/** 管理员角色（来源于 Prisma 枚举）。 */
export const AUTH_ADMIN_ROLE = AppRole.ADMIN;
/** 游客角色（来源于 Prisma 枚举）。 */
export const AUTH_VIEWER_ROLE = AppRole.VIEWER;

/** 鉴权角色类型，直接复用 Prisma 枚举联合。 */
export type AuthRole = PrismaAppRole;

/**
 * 功能：定义系统 JWT 的最小负载字段契约。
 * 输入：无（类型声明）。
 * 输出：`AuthTokenPayload`，用于签发与校验 token 的跨层共享类型。
 * 异常：无。
 * 副作用：无。
 */
export interface AuthTokenPayload {
  /** 用户角色：`ADMIN` 或 `VIEWER`。 */
  role: AuthRole;
  /** 管理员展示名称。 */
  name: string;
  /** 签发时间戳（秒）。 */
  iat : number;
  /** 过期时间戳（秒）。 */
  exp : number;
}
