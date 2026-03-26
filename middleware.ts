import { NextResponse, type NextRequest } from "next/server";

import {
  AUTH_ADMIN_ROLE,
  AUTH_COOKIE_NAME,
  AUTH_VIEWER_ROLE,
  type AuthRole
} from "@/server/modules/auth/constants";
import { verifyAuthTokenForEdge } from "@/server/modules/auth/edge-token";

export type MiddlewareAuthRole = AuthRole;

/**
 * 功能：将 pathname 与 search 统一拼成当前请求路径，供 header 注入与登录跳转复用。
 * 输入：pathname、search。
 * 输出：`/path?query=1` 形式的站内路径。
 * 异常：无。
 * 副作用：无。
 */
export function buildCurrentPath(pathname: string, search: string): string {
  return `${pathname}${search}`;
}

/**
 * 功能：从 request.url 解析当前请求路径。
 * 输入：完整请求 URL。
 * 输出：`/path?query=1` 形式的站内路径。
 * 异常：URL 解析失败时回退到 `/`。
 * 副作用：无。
 */
export function buildCurrentPathFromUrl(requestUrl: string): string {
  try {
    const url = new URL(requestUrl);
    return buildCurrentPath(url.pathname, url.search);
  } catch {
    return "/";
  }
}

/**
 * 功能：根据鉴权 cookie 解析当前角色。
 * 输入：token，可为空。
 * 输出：ADMIN 或 VIEWER。
 * 异常：verifyAuthToken 抛错时降级为 viewer。
 * 副作用：无。
 */
export async function resolveAuthRole(token: string | undefined): Promise<MiddlewareAuthRole> {
  if (!token) {
    return AUTH_VIEWER_ROLE;
  }

  try {
    const payload = await verifyAuthTokenForEdge(token);
    return payload ? AUTH_ADMIN_ROLE : AUTH_VIEWER_ROLE;
  } catch {
    return AUTH_VIEWER_ROLE;
  }
}

/**
 * 功能：构造管理员鉴权失败时的登录跳转目标。
 * 输入：currentPath，当前站内路径。
 * 输出：`/login?redirect=...`。
 * 异常：无。
 * 副作用：无。
 */
export function buildRedirectTarget(currentPath: string): string {
  return `/login?redirect=${encodeURIComponent(currentPath)}`;
}

/**
 * 功能：构造注入到下游请求的鉴权头。
 * 输入：requestHeaders、role、currentPath。
 * 输出：带鉴权上下文的新 Headers。
 * 异常：无。
 * 副作用：无。
 */
export function buildInjectedHeaders(
  requestHeaders: Headers,
  role: MiddlewareAuthRole,
  currentPath: string
): Headers {
  const headers = new Headers(requestHeaders);
  headers.set("x-auth-role", role);
  headers.set("x-auth-user-id", "");
  headers.set("x-auth-current-path", currentPath);

  return headers;
}

/**
 * 功能：为所有请求注入鉴权上下文，并保护 /admin 路径。
 * 输入：NextRequest。
 * 输出：放行响应或重定向响应。
 * 异常：无，鉴权异常统一降级为 viewer。
 * 副作用：无。
 */
export async function middleware(request: NextRequest): Promise<NextResponse> {
  const currentPath = buildCurrentPathFromUrl(request.url);
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const role = await resolveAuthRole(token);
  const requestHeaders = buildInjectedHeaders(request.headers, role, currentPath);
  const pathname = request.nextUrl.pathname;

  if (pathname === "/admin" || pathname.startsWith("/admin/") || pathname.startsWith("/api/admin/")) {
    if (role === AUTH_VIEWER_ROLE) {
      const redirectUrl = new URL(buildRedirectTarget(currentPath), request.url);
      return NextResponse.redirect(redirectUrl);
    }
  }

  return NextResponse.next({
    request: {
      headers: requestHeaders
    }
  });
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"]
};
