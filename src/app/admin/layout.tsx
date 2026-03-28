import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AdminHeader } from "@/components/layout/admin-header";
import { AUTH_ADMIN_ROLE, getAuthContext, sanitizeRedirectPath } from "@/server/modules/auth";

export const metadata: Metadata = {
  title: {
    default : "管理后台",
    template: "%s — 文渊管理"
  },
  robots: { index: false, follow: false }
};

export default async function AdminLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const requestHeaders = await headers();
  const auth = await getAuthContext(requestHeaders);

  if (auth.role !== AUTH_ADMIN_ROLE) {
    const headerPath = requestHeaders.get("x-auth-current-path");
    const currentPath = sanitizeRedirectPath(headerPath) || "/admin";
    redirect(`/login?redirect=${encodeURIComponent(currentPath)}`);
  }

  return (
    <div className="flex flex-col min-h-screen bg-(--color-admin-content-bg)">
      <AdminHeader userName={auth.name} />
      <main className="flex-1 w-full max-w-360 mx-auto px-6 py-6 pt-18 animate-page-enter">
        {children}
      </main>
    </div>
  );
}
