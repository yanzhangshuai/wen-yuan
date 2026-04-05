"use client";

import { useEffect } from "react";

/**
 * 文件定位（认证链路前端兜底组件）：
 * - 文件路径：`src/components/auth/admin-login-redirect-fallback.tsx`
 * - 所属层次：前端展示层 / 认证流程辅助组件。
 *
 * 业务场景：
 * - 当页面需要“确保管理员身份”但当前上下文无法在服务端直接完成跳转时，
 *   使用该组件在客户端立即重定向到登录页。
 *
 * 为什么必须是 Client Component：
 * - 组件依赖 `window.location.replace`（浏览器 API）；
 * - 该能力只能在浏览器执行，因此必须声明 `"use client"`。
 *
 * 设计目的：
 * - 作为认证失败或权限不足场景的最后兜底，避免用户停留在无权限页面；
 * - 使用 `replace` 而不是 `push`，防止“返回上一页又回到无权限页”的历史栈循环。
 */
interface AdminLoginRedirectFallbackProps {
  /**
   * 登录跳转目标地址（可选）。
   * - 默认值：`/login?redirect=%2Fadmin`，表示登录成功后回到后台首页；
   * - 调用方可覆盖为更细粒度目标（如具体后台子页面）。
   */
  redirectTarget?: string;
}

/**
 * 管理员登录重定向兜底组件（展示型 + 副作用组件）。
 *
 * @param props 重定向目标配置
 * @returns 过渡提示 UI（在跳转发生前短暂可见）
 */
export default function AdminLoginRedirectFallback({
  redirectTarget = "/login?redirect=%2Fadmin"
}: AdminLoginRedirectFallbackProps) {
  useEffect(() => {
    /*
     * 副作用语义：
     * - 首次渲染后立即执行浏览器级跳转；
     * - 依赖 `redirectTarget`，确保调用方动态变更目标时能重新执行跳转。
     */
    window.location.replace(redirectTarget);
  }, [redirectTarget]);

  return (
    // 过渡 UI：在网络慢或浏览器调度延迟时，给用户明确“正在验证并跳转”的反馈，避免误以为页面卡死。
    <section style={{ padding: 24 }}>
      <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>正在跳转登录...</h1>
      <p style={{ marginTop: 10, color: "#475569" }}>
        正在验证管理员权限，请稍候。
      </p>
    </section>
  );
}
