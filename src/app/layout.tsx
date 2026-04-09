import type { Metadata } from "next";
import localFont from "next/font/local";
import { Toaster } from "@/components/ui/sonner";
import { THEME_IDS } from "@/theme";
import { ThemeProvider, ClientThemeBackground } from "@/components/theme";
import "./globals.css";

/**
 * =============================================================================
 * 文件定位（App Router 根布局）
 * -----------------------------------------------------------------------------
 * 本文件是 Next.js App Router 约定的 `app/layout.tsx`：
 * - 会包裹整个应用的所有路由段；
 * - 只会在首次进入时加载，路由切换时通常不会整体卸载；
 * - 适合承载全局字体、主题、全局提示组件（Toaster）等“应用级壳层能力”。
 *
 * 业务职责：
 * 1) 注入全局字体变量与基础样式；
 * 2) 提供全局主题上下文（ThemeProvider）；
 * 3) 提供全局装饰层与消息提示容器；
 * 4) 定义站点级 metadata（SEO、OpenGraph）。
 *
 * 渲染与运行环境：
 * - 这是 Server Component（未使用 "use client"），在服务端参与首屏 HTML 生成；
 * - 其中 ThemeProvider/Toaster 为客户端组件，会在 hydration 后接管交互。
 *
 * 维护注意：
 * - `metadata` 属于 Next.js 特殊导出，字段会被框架用于 head 渲染；
 * - `html/body` 上的 suppressHydrationWarning 是为主题/字体动态差异提供容错；
 * - 这里的 Provider 顺序会影响全站上下文，变更需谨慎。
 * =============================================================================
 */
const monoFont = localFont({
  // 本地字体打包到 next/font 管道，可获得自动 preload 与子集优化能力。
  src     : "../assets/fonts/jetbrains-mono/JetBrainsMono-Variable.woff2",
  variable: "--font-jetbrains-mono",
  display : "swap",
  fallback: ["monospace"]
});

export const metadata: Metadata = {
  // Next.js 会把 title.default/template 组合为各页面默认标题策略。
  title: {
    default : "文渊 — AI 古典文学人物关系图谱",
    template: "%s — 文渊"
  },
  description: "探索中国古典文学作品中的人物关系网络",
  openGraph  : {
    // OG 信息用于社交平台分享卡片，属于站点级 SEO 基础配置。
    title      : "文渊 — AI 古典文学人物关系图谱",
    description: "探索中国古典文学作品中的人物关系网络",
    siteName   : "文渊",
    type       : "website"
  }
};

export default function RootLayout({
  children
}: {
  /** Next.js 注入的子路由内容，占位所有下级 page/layout。 */
  children: React.ReactNode;
}) {
  return (
    <html
      lang="zh-CN"
      // 主题/系统偏好可能导致 SSR 与 CSR class 差异，抑制无意义 hydration 警告。
      suppressHydrationWarning
      className={monoFont.variable}
    >
      <body className="min-w-[1280px] font-serif antialiased" suppressHydrationWarning>
        <ThemeProvider
          // 使用 data-theme 驱动主题变量，避免 className 冲突。
          attribute="data-theme"
          defaultTheme="danqing"
          themes={[...THEME_IDS]}
          // 业务选择：禁用 system，确保视觉风格可控且与设计稿一致。
          enableSystem={false}
          storageKey="wen-yuan-theme"
        >
          {/* 全局消息提示：任意页面都可调用 toast。 */}
          <Toaster position="top-right" richColors closeButton />
          {children}
          <ClientThemeBackground />
        </ThemeProvider>
      </body>
    </html>
  );
}
