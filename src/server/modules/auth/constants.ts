import { AppRole, type AppRole as PrismaAppRole } from "@/generated/prisma/enums";

/**
 * =============================================================================
 * 文件定位（服务端鉴权常量层）
 * -----------------------------------------------------------------------------
 * 本文件属于 `server/modules/auth` 的“跨层共享常量与基础类型”模块。
 *
 * 职责：
 * 1) 定义登录 Cookie 名称、JWT 过期策略、角色常量；
 * 2) 提供 Auth 模块内部与上下游共用的最小 token 载荷契约。
 *
 * 上下游关系：
 * - 上游：无（纯常量定义）；
 * - 下游：middleware、route handlers、layout 鉴权读取、token 签发/校验函数。
 *
 * 维护注意：
 * - 这里的字段名与值会影响多个层面（Cookie、JWT、权限判断），属于核心契约；
 * - 改动前必须全链路确认（登录、鉴权、重定向、测试）。
 * =============================================================================
 */

/** 认证 Cookie 名称（HTTP Only）。前后端通过同一键名读取登录态。 */
export const AUTH_COOKIE_NAME = "token";
/** JWT 有效期：7 天（秒）。体现“后台会话可持续使用但非永久登录”的业务平衡。 */
export const AUTH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;
/** 管理员角色（来源于 Prisma 枚举）。 */
export const AUTH_ADMIN_ROLE = AppRole.ADMIN;
/** 游客角色（来源于 Prisma 枚举）。用于未登录或降级场景。 */
export const AUTH_VIEWER_ROLE = AppRole.VIEWER;

/**
 * 鉴权角色类型，直接复用 Prisma 枚举联合。
 * 业务意图：让数据库角色定义与应用层保持单一事实源，避免出现双份角色枚举漂移。
 */
export type AuthRole = PrismaAppRole;

/**
 * 功能：定义系统 JWT 的最小负载字段契约。
 * 输入：无（类型声明）。
 * 输出：`AuthTokenPayload`，用于签发与校验 token 的跨层共享类型。
 * 异常：无。
 * 副作用：无。
 */
export interface AuthTokenPayload {
  /**
   * 用户角色：`ADMIN` 或 `VIEWER`。
   * 字段性质：安全上下文字段（用于授权判断），不是 UI 展示字段。
   */
  role: AuthRole;
  /**
   * 管理员展示名称。
   * 字段性质：展示字段，供后台头部等位置显示当前登录管理员名。
   */
  name: string;
  /**
   * 签发时间戳（秒）。
   * 字段性质：会话有效性基础字段，用于回放/过期判定。
   */
  iat : number;
  /**
   * 过期时间戳（秒）。
   * 字段性质：安全边界字段；过期即视为未登录，必须重新登录。
   */
  exp : number;
}
