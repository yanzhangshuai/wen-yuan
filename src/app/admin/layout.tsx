import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  AUTH_ADMIN_ROLE,
  getAuthContext,
  sanitizeRedirectPath
} from "@/server/modules/auth";

interface AdminLayoutProps {
  children: React.ReactNode;
}

export default async function AdminLayout({
  children
}: AdminLayoutProps) {
  const requestHeaders = await headers();
  const auth = getAuthContext(requestHeaders);
  const currentPath = sanitizeRedirectPath(
    requestHeaders.get("x-auth-current-path") ?? "/admin"
  );
  const loginRedirectTarget = `/login?redirect=${encodeURIComponent(currentPath)}`;

  if (auth.role !== AUTH_ADMIN_ROLE) {
    redirect(loginRedirectTarget);
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", color: "#0f172a" }}>
      <header style={{
        display       : "flex",
        alignItems    : "center",
        justifyContent: "space-between",
        padding       : "16px 24px",
        borderBottom  : "1px solid #e2e8f0",
        background    : "#ffffff"
      }}
      >
        <div style={{ fontSize: 18, fontWeight: 700 }}>管理后台</div>
        <nav style={{ display: "flex", gap: 16 }}>
          <Link href="/admin">管理中心</Link>
          <Link href="/admin/review">审核队列</Link>
          <Link href="/admin/model">模型设置</Link>
        </nav>
      </header>
      <main style={{ padding: 24 }}>
        {children}
      </main>
    </div>
  );
}
