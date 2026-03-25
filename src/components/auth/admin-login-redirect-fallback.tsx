"use client";

import { useEffect } from "react";

interface AdminLoginRedirectFallbackProps {
  redirectTarget?: string;
}

export default function AdminLoginRedirectFallback({
  redirectTarget = "/login?redirect=%2Fadmin"
}: AdminLoginRedirectFallbackProps) {
  useEffect(() => {
    window.location.replace(redirectTarget);
  }, [redirectTarget]);

  return (
    <section style={{ padding: 24 }}>
      <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>正在跳转登录...</h1>
      <p style={{ marginTop: 10, color: "#475569" }}>
        正在验证管理员权限，请稍候。
      </p>
    </section>
  );
}
