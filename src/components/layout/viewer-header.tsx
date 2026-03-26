"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Library, LogOut } from "lucide-react";
import { ThemeToggle } from "@/theme";
import { cn } from "@/lib/utils";

export interface ViewerHeaderProps {
  isAdmin?    : boolean; // Make it optional to avoid TS errors if not passed
  currentPath?: string;
  user?       : { name?: string | null; image?: string | null };
}

export function ViewerHeader({ isAdmin, currentPath = "/", user }: ViewerHeaderProps) {
  const pathname = usePathname();

  const handleLogout = () => {
    fetch("/api/auth/logout", { method: "POST" })
      .then(() => window.location.reload())
      .catch((error) => console.error("Logout failed", error));
  };

  const loginRedirectHref = `/login?redirect=${encodeURIComponent(currentPath)}`;

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-[56px] flex items-center justify-between border-b border-[var(--color-border)] px-4 bg-[var(--color-bg)]/80 backdrop-blur-md transition-colors duration-300">
      <div className="flex items-center gap-8">
        {/* Logo */}
        <Link href="/" className="group flex items-center gap-2 no-underline">
          <span className={cn(
            "text-xl font-bold transition-colors duration-300",
            "font-serif tracking-tight", // Noto Serif fallback
            "text-[var(--color-primary)] group-hover:text-[var(--color-primary-hover)]"
          )}>
            文渊
          </span>
        </Link>

        {/* Nav */}
        <nav className="hidden md:flex items-center gap-6">
          <Link 
            href="/" 
            className={cn(
              "text-sm font-medium flex items-center gap-2 transition-colors duration-200",
              pathname === "/" 
                ? "text-[var(--color-primary)]" 
                : "text-[var(--color-fg)] hover:text-[var(--color-primary)]"
            )}
          >
            <Library size={18} />
            <span>书库</span>
          </Link>
        </nav>
      </div>

      <div className="flex items-center gap-4">
        {/* Theme Switcher */}
        <ThemeToggle />

        {/* Auth / Profile */}
        <div className="h-4 w-[1px] bg-[var(--color-border)] mx-1" />
        
        {isAdmin ? (
          <div className="flex items-center gap-3">
            <Link 
              href="/admin" 
              className="text-sm font-medium text-[var(--color-muted-fg)] hover:text-[var(--color-primary)] transition-colors hidden sm:block"
            >
              管理后台
            </Link>
            <button
              onClick={handleLogout}
              className="p-2 text-[var(--color-muted-fg)] hover:text-[var(--color-danger)] hover:bg-[var(--color-primary-subtle)]/30 rounded-full transition-all"
              title="退出登录"
              aria-label="退出登录"
            >
              <LogOut size={18} />
            </button>
          </div>
        ) : (
          <Link 
            href={loginRedirectHref} 
            className="text-sm font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-hover)] px-3 py-1.5 rounded-md hover:bg-[var(--color-primary-subtle)] transition-colors"
          >
            管理员登录
          </Link>
        )}
      </div>
    </header>
  );
}
