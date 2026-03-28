"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Library, LogOut } from "lucide-react";
import { ThemeToggle } from "@/components/theme";
import { cn } from "@/lib/utils";
import { logout } from "@/lib/services/auth";

export interface ViewerHeaderProps {
  isAdmin?    : boolean; // Make it optional to avoid TS errors if not passed
  currentPath?: string;
  user?       : { name?: string | null; image?: string | null };
}

export function ViewerHeader({ isAdmin, currentPath = "/", user: _user }: ViewerHeaderProps) {
  const pathname = usePathname();

  const handleLogout = () => {
    void logout().finally(() => window.location.reload());
  };

  const loginRedirectHref = `/login?redirect=${encodeURIComponent(currentPath)}`;

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-[56px] flex items-center justify-between border-b border-border px-4 bg-(--color-bg)/80 backdrop-blur-md transition-colors duration-300">
      <div className="flex items-center gap-8">
        {/* Logo */}
        <Link href="/" className="group flex items-center gap-2 no-underline">
          <span className={cn(
            "text-xl font-bold transition-colors duration-300",
            "font-serif tracking-tight", // Noto Serif fallback
            "text-primary group-hover:text-(--color-primary-hover)"
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
                ? "text-primary" 
                : "text-foreground hover:text-primary"
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
        <div className="h-4 w-[1px] bg-border mx-1" />
        
        {isAdmin ? (
          <div className="flex items-center gap-3">
            <Link 
              href="/admin" 
              className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors hidden sm:block"
            >
              管理后台
            </Link>
            <button
              onClick={handleLogout}
              className="p-2 text-muted-foreground hover:text-destructive hover:bg-primary-subtle/30 rounded-full transition-all"
              title="退出登录"
              aria-label="退出登录"
            >
              <LogOut size={18} />
            </button>
          </div>
        ) : (
          <Link 
            href={loginRedirectHref} 
            className="text-sm font-medium text-primary hover:text-(--color-primary-hover) px-3 py-1.5 rounded-md hover:bg-primary-subtle transition-colors"
          >
            管理员登录
          </Link>
        )}
      </div>
    </header>
  );
}
