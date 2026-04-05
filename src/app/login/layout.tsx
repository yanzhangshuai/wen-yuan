import type { Metadata } from "next";

/**
 * =============================================================================
 * 文件定位（登录路由布局）
 * -----------------------------------------------------------------------------
 * 本文件是 `app/login/layout.tsx`，仅作用于 `/login` 路由段。
 *
 * 设计意图：
 * - 单独给登录页设置 metadata（标题）；
 * - 布局本身保持“透明包裹”，不引入额外骨架，便于登录页完全自定义视觉。
 *
 * Next.js 语义：
 * - 这是路由段级 layout，不影响其他页面；
 * - `metadata` 会与根布局 metadata 进行合并，登录页标题会覆盖默认标题。
 * =============================================================================
 */
export const metadata: Metadata = {
  title: "登录"
};

export default function LoginLayout({
  children
}: {
  /** 登录页实际内容（来自 page.tsx）。 */
  children: React.ReactNode;
}) {
  // 保持最小包裹，避免 layout 层引入额外 DOM 对登录页布局造成干扰。
  return <>{children}</>;
}
