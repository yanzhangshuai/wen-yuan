import { headers } from "next/headers";
import { ViewerHeader } from "@/components/layout/viewer-header";
import { AUTH_ADMIN_ROLE, getAuthContext, sanitizeRedirectPath } from "@/server/modules/auth";

/**
 * =============================================================================
 * 文件定位（viewer 路由组布局）
 * -----------------------------------------------------------------------------
 * 本文件是 App Router 路由组 `(viewer)` 的 `layout.tsx`。
 *
 * Next.js 语义说明：
 * - 路由组名 `(viewer)` 不参与 URL 路径，仅用于组织目录和共享布局；
 * - 该 layout 会包裹 viewer 组下的所有页面（如首页、图谱页）；
 * - 因为是 async Server Component，可在服务端直接读取 headers 并决定渲染入参。
 *
 * 业务职责：
 * 1) 渲染访客端统一头部 `ViewerHeader`；
 * 2) 解析当前登录角色，用于头部显示“管理入口”等差异化能力；
 * 3) 读取当前路径，作为登录跳转或状态展示的上下文。
 *
 * 上下游关系：
 * - 上游：middleware 注入的 `x-auth-*` headers；
 * - 下游：ViewerHeader（isAdmin/currentPath）与子页面内容。
 * =============================================================================
 */
export default async function ViewerLayout({
  children
}: {
  /** Next.js 注入的该路由组子树内容。 */
  children: React.ReactNode;
}) {
  // Server Component 在服务端读取 request headers，不依赖客户端 JS。
  const requestHeaders = await headers();
  // 统一通过 AuthContext 解析角色，避免布局层重复写 cookie/token 解析。
  const auth = await getAuthContext(requestHeaders);
  const isAdmin = auth.role === AUTH_ADMIN_ROLE;
  
  // currentPath 来自 middleware 注入；若缺失/非法，sanitize 会兜底为 "/".
  const headerPath = requestHeaders.get("x-auth-current-path");
  const currentPath = sanitizeRedirectPath(headerPath);

  return (
    <div className="flex flex-col min-h-screen">
      <ViewerHeader isAdmin={isAdmin} currentPath={currentPath} />
      <main className="mx-auto w-full max-w-[1440px] flex-1 animate-page-enter">
        {children}
      </main>
    </div>
  );
}
