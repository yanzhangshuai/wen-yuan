"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Settings, User, LogOut } from "lucide-react";
import { ThemeToggle } from "@/components/theme";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { logout } from "@/lib/services/auth";

export interface ViewerHeaderProps {
  isAdmin?    : boolean;
  currentPath?: string;
  user?       : { name?: string | null; image?: string | null };
}

export function ViewerHeader({ isAdmin, currentPath = "/" }: ViewerHeaderProps) {
  const pathname = usePathname();

  const handleLogout = () => {
    void logout().finally(() => window.location.reload());
  };

  const loginRedirectHref = `/login?redirect=${encodeURIComponent(currentPath)}`;

  return (
    <header className="viewer-header sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-6">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3 group">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 border border-primary/20 group-hover:bg-primary/20 transition-colors">
            <span className="text-xl font-bold text-primary font-serif">淵</span>
          </div>
          <div className="flex flex-col">
            <span className="text-lg font-semibold tracking-wide">文淵</span>
            <span className="text-[10px] text-muted-foreground tracking-widest">WEN YUAN</span>
          </div>
        </Link>

        {/* Navigation Links */}
        <nav className="flex items-center gap-1">
          <Button
            asChild
            variant="ghost"
            size="sm"
            data-active={pathname === "/" ? "true" : "false"}
            className={cn(
              "viewer-header-nav-button gap-2",
              pathname === "/" && "bg-accent/52 text-accent-foreground"
            )}
          >
            <Link href="/">
              <BookOpen className="h-4 w-4" />
              书库
            </Link>
          </Button>
        </nav>

        {/* Right Actions */}
        <div className="flex items-center gap-2">
          <ThemeToggle triggerClassName="viewer-header-theme-toggle" />

          {isAdmin ? (
            <>
              <Button asChild variant="ghost" size="sm" className="gap-2">
                <Link href="/admin">
                  <Settings className="h-4 w-4" />
                  <span className="hidden lg:inline">管理后台</span>
                </Link>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="gap-2 text-muted-foreground hover:text-destructive"
                onClick={handleLogout}
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <Button asChild variant="outline" size="sm" className="gap-2">
              <Link href={loginRedirectHref}>
                <User className="h-4 w-4" />
                <span className="hidden lg:inline">登录</span>
              </Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
