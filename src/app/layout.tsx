import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import Script from "next/script";

import {
  AUTH_ADMIN_ROLE,
  getAuthContext,
  sanitizeRedirectPath
} from "@/server/modules/auth";
import "./globals.css";


export const metadata: Metadata = {
  title      : "儒林外史人物关系图谱",
  description: "基于 Next.js + Prisma + Neo4j 的人物关系图谱项目"
};

interface RootLayoutProps {
  children: React.ReactNode;
}

function resolveCurrentPath(requestHeaders: Headers): string {
  const headerPath = requestHeaders.get("x-auth-current-path");
  return sanitizeRedirectPath(headerPath);
}

export default async function RootLayout({
  children
}: RootLayoutProps) {
  const requestHeaders = await headers();
  const auth = getAuthContext(requestHeaders);
  const currentPath = resolveCurrentPath(requestHeaders);
  const loginRedirectHref = `/login?redirect=${encodeURIComponent(currentPath)}`;

  return (
    <html lang="zh-CN" className="root-layout" suppressHydrationWarning>
      <body>
        <header style={{
          height        : 56,
          display       : "flex",
          alignItems    : "center",
          justifyContent: "space-between",
          borderBottom  : "1px solid #e2e8f0",
          padding       : "0 16px",
          background    : "#ffffff"
        }}
        >
          <Link href="/" style={{ color: "#0f172a", textDecoration: "none", fontWeight: 700 }}>
            文渊
          </Link>
          {auth.role === AUTH_ADMIN_ROLE ? (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ color: "#334155", fontSize: 14 }}>管理员</span>
              <button
                id="logout-button"
                data-redirect={currentPath}
                type="button"
                style={{
                  border      : "1px solid #cbd5e1",
                  background  : "#ffffff",
                  borderRadius: 8,
                  padding     : "6px 10px",
                  cursor      : "pointer"
                }}
              >
                退出登录
              </button>
            </div>
          ) : (
            <Link href={loginRedirectHref} style={{ color: "#2563eb", textDecoration: "none", fontSize: 14 }}>
              管理员登录
            </Link>
          )}
        </header>
        <main>
          {children}
        </main>
        <Script id="layout-logout-handler" strategy="afterInteractive">
          {`
            (() => {
              const button = document.getElementById("logout-button");
              if (!button) return;

              button.addEventListener("click", async () => {
                try {
                  await fetch("/api/auth/logout", { method: "POST" });
                } finally {
                  const redirectPath = button.getAttribute("data-redirect") || "/";
                  window.location.assign(redirectPath);
                }
              });
            })();
          `}
        </Script>
      </body>
    </html>
  );
}
