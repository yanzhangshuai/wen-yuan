import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AdminHeader } from "@/components/layout/admin-header";
import { AUTH_ADMIN_ROLE, getAuthContext, sanitizeRedirectPath } from "@/server/modules/auth";

/**
 * =============================================================================
 * 文件定位（admin 路由组布局）
 * -----------------------------------------------------------------------------
 * 本文件是 `app/admin/layout.tsx`，对应 `/admin/**` 管理域的统一布局。
 *
 * Next.js 语义：
 * - `layout.tsx` 会包裹同目录及子目录的所有 page；
 * - 在 App Router 中，layout 适合承载“该业务域通用的壳层职责”；
 * - async Server Component 可在服务端执行权限门禁，减少未授权内容下发。
 *
 * 业务职责：
 * 1) 管理后台二次鉴权（即便 middleware 存在，仍在服务端布局层再校验一次）；
 * 2) 渲染后台统一头部；
 * 3) 输出后台页面框架与默认 metadata（含 noindex）。
 *
 * 为什么要“middleware + layout”双层鉴权：
 * - middleware 是入口门禁，覆盖多数请求；
 * - layout 是业务层兜底，防止任何中间件遗漏场景造成越权。
 * 这是业务安全规则，不是技术限制。
 * =============================================================================
 */
export const metadata: Metadata = {
  // 管理后台默认标题模板。
  title: {
    default : "管理后台",
    template: "%s — 文渊管理"
  },
  // 业务策略：后台页面不允许被搜索引擎收录。
  robots: { index: false, follow: false }
};

export default async function AdminLayout({
  children
}: {
  /** Next.js 注入的后台子页面内容。 */
  children: React.ReactNode;
}) {
  // 在服务端读取请求头，获得中间件注入的 auth 上下文。
  const requestHeaders = await headers();
  const auth = await getAuthContext(requestHeaders);

  if (auth.role !== AUTH_ADMIN_ROLE) {
    // 未授权时保留原路径，登录成功后可回跳，提高运营使用连续性。
    const headerPath = requestHeaders.get("x-auth-current-path");
    const currentPath = sanitizeRedirectPath(headerPath) || "/admin";
    // redirect 是 Next.js 服务端导航中断函数：调用后不会继续渲染后续 JSX。
    redirect(`/login?redirect=${encodeURIComponent(currentPath)}`);
  }

  return (
    <div className="flex flex-col min-h-screen bg-(--color-admin-content-bg)">
      <AdminHeader userName={auth.name} />
      {/* 与 sheji 对齐：外层 layout 仅负责页面骨架，内容留白统一交给各页面的 PageContainer 控制。 */}
      <main className="flex-1 animate-page-enter">
        {children}
      </main>
    </div>
  );
}
