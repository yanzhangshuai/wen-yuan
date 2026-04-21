import { NextResponse, type NextRequest } from "next/server";

import {
  AUTH_ADMIN_ROLE,
  AUTH_COOKIE_NAME,
  AUTH_VIEWER_ROLE,
  type AuthRole
} from "@/server/modules/auth/constants";
import { verifyAuthTokenForEdge } from "@/server/modules/auth/edge-token";

/**
 * =============================================================================
 * 文件定位（Next.js 框架角色）
 * -----------------------------------------------------------------------------
 * 这是 Next.js App Router 的 `middleware.ts`，属于“请求进入应用前”的统一拦截层。
 *
 * 在 Next.js 中，`middleware.ts` 会运行在 Edge Runtime：
 * 1) 执行时机早于页面渲染与 Route Handler；
 * 2) 可以读取请求 URL / Header / Cookie，并决定放行、改写或重定向；
 * 3) 适合做轻量鉴权门禁、上下文注入，不适合做重型数据库查询。
 *
 * 本文件的业务职责：
 * 1) 保护管理域路由：`/admin/*` 与 `/api/admin/*`；
 * 2) 将鉴权上下文注入到请求头（`x-auth-*`），供下游 layout 与 API 复用；
 * 3) 未登录访问管理域时，统一重定向到登录页，并保留 redirect 回跳地址。
 *
 * 上游输入：
 * - 浏览器请求 URL（pathname + search）
 * - 登录 Cookie（AUTH_COOKIE_NAME）
 *
 * 下游输出：
 * - 放行请求（并附带 x-auth-role / x-auth-current-path 等头）
 * - 或重定向到 `/login?redirect=...`
 *
 * 维护注意：
 * - `config.matcher` 决定了中间件生效范围，改动会直接影响权限边界；
 * - 角色判定失败统一降级 VIEWER 是防御策略，避免异常变成越权；
 * - `x-auth-*` 是下游鉴权上下文来源之一，字段名属于跨层契约，不能随意改。
 * =============================================================================
 */
export type MiddlewareAuthRole = AuthRole;

/**
 * 功能：将 pathname 与 search 统一拼成当前请求路径，供 header 注入与登录跳转复用。
 * 输入：pathname、search。
 * 输出：`/path?query=1` 形式的站内路径。
 * 异常：无。
 * 副作用：无。
 */
export function buildCurrentPath(pathname: string, search: string): string {
  // 业务意图：保留用户“原始访问意图”，用于登录后精准回跳。
  // 例如：/admin/model?tab=keys -> 登录成功后应回到该精确位置，而不是仅回到 /admin。
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
    // 防御原因：URL 理论上应总是合法，但这里兜底可避免解析异常导致中间件崩溃。
    // 兜底到 "/" 的业务含义是“最安全的站内首页”。
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
    // 业务规则：无 token 统一视为访客，而不是抛错。
    return AUTH_VIEWER_ROLE;
  }

  try {
    const payload = await verifyAuthTokenForEdge(token);
    // 只要 token 可被验证为合法管理员载荷，就认定 ADMIN；否则降级 VIEWER。
    return payload ? AUTH_ADMIN_ROLE : AUTH_VIEWER_ROLE;
  } catch {
    // 防御原因：鉴权异常不能阻断全站请求，否则会出现“因为一次 token 异常导致全站不可用”。
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
  // 这里必须 encodeURIComponent，避免 query 注入破坏 redirect 参数结构。
  return `/login?redirect=${encodeURIComponent(currentPath)}`;
}

/**
 * 功能：构造注入到下游请求的鉴权头。
 * 输入：requestHeaders、role、currentPath、userId。
 * 输出：带鉴权上下文的新 Headers。
 * 异常：无。
 * 副作用：无。
 */
export function buildInjectedHeaders(
  requestHeaders: Headers,
  role: MiddlewareAuthRole,
  currentPath: string,
  userId: string | null
): Headers {
  // 复制原 headers，避免直接修改原对象带来框架不可预期行为。
  const headers = new Headers(requestHeaders);
  // x-auth-role：下游统一读取角色，不需要每层重复解析 token。
  headers.set("x-auth-role", role);
  // x-auth-user-id：review 审计链路依赖它做操作者归因；游客保持空串兼容现有 header 契约。
  headers.set("x-auth-user-id", userId ?? "");
  // x-auth-current-path：用于 layout/API 在重定向时复用当前路径，避免丢失上下文。
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
  // 第 1 步：构建“当前访问路径快照”，供后续重定向与上下文注入复用。
  const currentPath = buildCurrentPathFromUrl(request.url);
  // 第 2 步：读取登录 token，并在 Edge 环境做轻量角色判定。
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const payload = token ? await verifyAuthTokenForEdge(token) : null;
  const role = payload ? AUTH_ADMIN_ROLE : AUTH_VIEWER_ROLE;
  // 第 3 步：把鉴权上下文写入请求头，传给后续页面/API 层。
  const requestHeaders = buildInjectedHeaders(request.headers, role, currentPath, payload?.userId ?? null);
  const pathname = request.nextUrl.pathname;

  // 第 4 步：访客访问管理域的分支处理。
  if (role === AUTH_VIEWER_ROLE) {
    if (pathname.startsWith("/api/admin/")) {
      // 业务规则：即使是 API 路由，也沿用“跳登录页”的产品语义（与管理页面一致）。
      // 这不是技术限制；是当前产品对未登录管理访问的统一流程设计。
      const redirectUrl = new URL(buildRedirectTarget(currentPath), request.url);
      return NextResponse.redirect(redirectUrl);
    }

    if (pathname === "/admin" || pathname.startsWith("/admin/")) {
      // 页面路由直接重定向登录页，保证后台入口始终受保护。
      const redirectUrl = new URL(buildRedirectTarget(currentPath), request.url);
      return NextResponse.redirect(redirectUrl);
    }
  }

  // 第 5 步：通过门禁后放行，并把注入后的 headers 传给下游。
  return NextResponse.next({
    request: {
      headers: requestHeaders
    }
  });
}

/**
 * Next.js `middleware` 匹配规则：
 * - 只有命中 matcher 的请求才会执行本中间件；
 * - 本项目仅拦截管理页面与管理 API，避免对公开 viewer 流量增加额外开销。
 */
export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"]
};
