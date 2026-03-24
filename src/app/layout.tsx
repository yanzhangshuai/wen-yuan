import type { Metadata } from "next";

import "./globals.css";


export const metadata: Metadata = {
  title      : "儒林外史人物关系图谱",
  description: "基于 Next.js + Prisma + Neo4j 的人物关系图谱项目"
};

interface RootLayoutProps {
  children: React.ReactNode;
}

export default function RootLayout({
  children
}: RootLayoutProps) {
  return (
    <html lang="zh-CN" className="root-layout" suppressHydrationWarning>
      <body>
        {children}
      </body>
    </html>
  );
}
