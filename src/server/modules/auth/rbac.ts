import { ERROR_CODES } from "@/types/api";

export type AppRole = "admin" | "reviewer" | "annotator" | "viewer";

export interface RequestAuthContext {
  userId: string;
  roles: AppRole[];
  tenantId?: string;
  projectIds: string[];
  workIds: string[];
}

/**
 * 功能：从请求头解析认证上下文。
 * 输入：Request 对象。
 * 输出：RequestAuthContext。
 * 异常：当缺失关键头部时抛错。
 * 副作用：无。
 */
export function readAuthContext(request: Request): RequestAuthContext {
  const userId = request.headers.get("x-user-id");
  const rolesHeader = request.headers.get("x-user-roles");
  const tenantId = request.headers.get("x-tenant-id") ?? undefined;
  const projectIds = splitHeader(request.headers.get("x-project-ids"));
  const workIds = splitHeader(request.headers.get("x-work-ids"));

  // 开发模式默认注入管理员上下文，降低本地联调门槛。
  if (process.env.NODE_ENV !== "production" && !userId && !rolesHeader) {
    return {
      userId: "dev-admin",
      roles: ["admin"],
      tenantId: "dev-tenant",
      projectIds: [],
      workIds: []
    };
  }

  if (!userId || !rolesHeader) {
    throw new AuthError(ERROR_CODES.AUTH_UNAUTHORIZED, "缺少认证信息");
  }

  const roles = splitHeader(rolesHeader) as AppRole[];

  if (roles.length === 0) {
    throw new AuthError(ERROR_CODES.AUTH_UNAUTHORIZED, "角色信息为空");
  }

  return {
    userId,
    roles,
    tenantId,
    projectIds,
    workIds
  };
}

/**
 * 功能：校验调用方是否包含任一允许角色。
 * 输入：auth 上下文与允许角色集合。
 * 输出：无。
 * 异常：不满足时抛 AuthError。
 * 副作用：无。
 */
export function requireAnyRole(auth: RequestAuthContext, allowed: AppRole[]): void {
  if (auth.roles.includes("admin")) {
    return;
  }

  const ok = auth.roles.some((role) => allowed.includes(role));
  if (!ok) {
    throw new AuthError(ERROR_CODES.AUTH_FORBIDDEN, "角色权限不足");
  }
}

/**
 * 功能：校验请求的项目作用域是否允许访问。
 * 输入：auth 上下文和项目 ID。
 * 输出：无。
 * 异常：不满足时抛 AuthError。
 * 副作用：无。
 */
export function requireProjectScope(auth: RequestAuthContext, projectId: string): void {
  if (!projectId) {
    throw new AuthError(ERROR_CODES.AUTH_INVALID_SCOPE, "projectId 不能为空");
  }

  if (auth.roles.includes("admin")) {
    return;
  }

  if (auth.projectIds.length > 0 && !auth.projectIds.includes(projectId)) {
    throw new AuthError(ERROR_CODES.AUTH_INVALID_SCOPE, "无权访问该项目");
  }
}

/**
 * 功能：校验请求的作品作用域是否允许访问。
 * 输入：auth 上下文和作品 ID。
 * 输出：无。
 * 异常：不满足时抛 AuthError。
 * 副作用：无。
 */
export function requireWorkScope(auth: RequestAuthContext, workId: string): void {
  if (!workId) {
    throw new AuthError(ERROR_CODES.AUTH_INVALID_SCOPE, "workId 不能为空");
  }

  if (auth.roles.includes("admin")) {
    return;
  }

  if (auth.workIds.length > 0 && !auth.workIds.includes(workId)) {
    throw new AuthError(ERROR_CODES.AUTH_INVALID_SCOPE, "无权访问该作品");
  }
}

/**
 * 功能：统一鉴权异常类型。
 * 输入：code 与 message。
 * 输出：AuthError。
 * 异常：无。
 * 副作用：无。
 */
export class AuthError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "AuthError";
  }
}

function splitHeader(raw: string | null): string[] {
  if (!raw) {
    return [];
  }

  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
