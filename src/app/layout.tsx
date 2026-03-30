import type { Metadata } from "next";
import localFont from "next/font/local";
import { Toaster } from "sonner";
import { THEME_IDS } from "@/theme";
import { ThemeProvider, DecorativeLayer } from "@/components/theme";
import "./globals.css";

const monoFont = localFont({
  src     : "../assets/fonts/jetbrains-mono/JetBrainsMono-Variable.woff2",
  variable: "--font-jetbrains-mono",
  display : "swap",
  fallback: ["monospace"]
});

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
    <html
      lang="zh-CN"
      suppressHydrationWarning
      className={monoFont.variable}
    >
      <body className="font-serif antialiased" suppressHydrationWarning>
        <ThemeProvider
          attribute="data-theme"
          defaultTheme="danqing"
          themes={[...THEME_IDS]}
          enableSystem={false}
          storageKey="wen-yuan-theme"
        >
          <DecorativeLayer />
          <Toaster position="top-right" richColors closeButton />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
