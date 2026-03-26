import type { Metadata } from "next";
import { ThemeProvider, DecorativeLayer, THEME_IDS } from "@/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default : "文渊 — AI 古典文学人物关系图谱",
    template: "%s — 文渊"
  },
  description: "探索中国古典文学作品中的人物关系网络",
  openGraph  : {
    title      : "文渊 — AI 古典文学人物关系图谱",
    description: "探索中国古典文学作品中的人物关系网络",
    siteName   : "文渊",
    type       : "website"
  }
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        {/* Noto Serif SC（theme-01 / theme-03 共用，古风 + 典藏气质）*/}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;500;600;700&display=swap" />
        {/* Inter（theme-02 / theme-04 共用，简约 + 科技感）*/}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" />
        {/* JetBrains Mono（代码）*/}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap" />
      </head>
      <body>
        <ThemeProvider
          attribute="data-theme"
          defaultTheme="theme-01"
          themes={[...THEME_IDS]}
          enableSystem={false}
          storageKey="wen-yuan-theme"
        >
          <DecorativeLayer />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
