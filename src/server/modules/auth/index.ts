import { ERROR_CODES, type ErrorCode } from "@/types/api";

/**
 * 功能：描述当前请求可见的认证上下文。
 * 输入：无。
 * 输出：userId 与 role 的只读认证信息。
 * 异常：无。
 * 副作用：无。
 */
export interface AuthContext {
  userId: string | null;
  role: "admin" | "viewer";
}

/**
 * 功能：表示认证或鉴权失败的领域错误。
 * 输入：code 为稳定错误码；message 为用户可见或日志可读的错误说明。
 * 输出：AuthError 实例。
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
 * 功能：从中间件注入的请求头中恢复认证上下文。
 * 输入：headers，要求由 Middleware 写入 `x-auth-role` 与可选的 `x-auth-user-id`。
 * 输出：标准化 AuthContext；缺失或非法角色一律降级为 viewer。
 * 异常：无。
 * 副作用：无。
 */
export function getAuthContext(headers: Headers): AuthContext {
  const roleHeader = headers.get("x-auth-role");
  const userIdHeader = headers.get("x-auth-user-id");

  return {
    userId: userIdHeader,
    role: roleHeader === "admin" ? "admin" : "viewer"
  };
}

/**
 * 功能：断言当前请求具备管理员权限。
 * 输入：auth，为当前请求的认证上下文。
 * 输出：无；通过时静默返回。
 * 异常：当 role 不是 admin 时抛出 AuthError(AUTH_FORBIDDEN)。
 * 副作用：无。
 */
export function requireAdmin(auth: AuthContext): void {
  if (auth.role !== "admin") {
    throw new AuthError(ERROR_CODES.AUTH_FORBIDDEN, "当前用户没有管理员权限");
  }
}

export { hashPassword, verifyPassword } from "./password";
