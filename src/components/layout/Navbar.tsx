"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookMarked, ChartNoAxesCombined, Network, Settings } from "lucide-react";

import { ThemeToggle } from "@/components/ThemeToggle";

const NAV_ITEMS = [
  { href: "/books", label: "书籍管理", icon: BookMarked },
  { href: "/analyze", label: "解析控制台", icon: ChartNoAxesCombined },
  { href: "/graph", label: "知识图谱", icon: Network },
  { href: "/settings", label: "设置", icon: Settings }
];

interface NavbarProps {}

export function Navbar({}: NavbarProps) {
  const pathname = usePathname();

  return (
    <header className="layout-navbar sticky top-0 z-40 border-b border-slate-200/70 bg-slate-50/80 backdrop-blur-md dark:border-slate-800/70 dark:bg-[#020617]/80">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 md:px-8">
        <Link href="/" className="flex shrink-0 items-center gap-2 text-slate-900 dark:text-slate-100">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-amber-600/90 text-xs font-semibold text-white">文</span>
          <span className="font-medium tracking-wide">文渊 · Wen Yuan</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/70 dark:hover:text-slate-100"
                }`}
              >
                <item.icon className="h-4 w-4" />
                <span className="relative">
                  {item.label}
                  <span className="absolute -bottom-1 left-0 h-px w-0 bg-amber-600 transition-all duration-200 group-hover:w-full" />
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300"
            aria-label="用户头像"
            title="当前用户"
          >
            WY
          </button>
        </div>
      </div>
    </header>
  );
}
