"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, CheckCircle, Settings2, LogOut, LayoutDashboard } from "lucide-react";
import { ThemeToggle } from "@/components/theme";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface AdminHeaderProps {
  userName?: string | null;
}

const adminLinks = [
  { href: "/admin",          label: "概览",     icon: LayoutDashboard },
  { href: "/admin/books",    label: "书籍管理", icon: BookOpen },
  { href: "/admin/review",   label: "审核中心", icon: CheckCircle },
  { href: "/admin/model",    label: "模型设置", icon: Settings2 }
];

export function AdminHeader({ userName }: AdminHeaderProps) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between px-6">
        {/* Logo */}
        <Link href="/admin" className="flex items-center gap-3 group">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 border border-primary/20">
            <span className="text-lg font-bold text-primary font-serif">淵</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-base font-semibold">文淵</span>
            <span className="text-xs text-muted-foreground border-l border-border pl-2">管理后台</span>
          </div>
        </Link>

        {/* Navigation Links */}
        <nav className="flex items-center gap-1">
          {adminLinks.map((link) => {
            const Icon = link.icon;
            const isActive = pathname === link.href ||
              (link.href !== "/admin" && pathname.startsWith(link.href));

            return (
              <Button
                key={link.href}
                asChild
                variant="ghost"
                size="sm"
                className={cn(
                  "gap-2 h-9",
                  isActive && "bg-accent text-accent-foreground"
                )}
              >
                <Link href={link.href}>
                  <Icon className="h-4 w-4" />
                  {link.label}
                </Link>
              </Button>
            );
          })}
        </nav>

        {/* Right Actions */}
        <div className="flex items-center gap-2">
          <ThemeToggle />

          {userName && (
            <span className="hidden sm:flex items-center gap-1.5 text-sm text-muted-foreground">
              {userName}
            </span>
          )}

          <Button asChild variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
            <Link href="/">
              <LogOut className="h-4 w-4" />
              退出管理
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
