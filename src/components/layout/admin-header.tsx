"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Library, ClipboardCheck, Settings2, LogOut, UserCircle2 } from "lucide-react";
import { ThemeToggle } from "@/components/theme";
import { logout } from "@/lib/services/auth";

export interface AdminHeaderProps {
  userName?: string | null;
}

export function AdminHeader({ userName }: AdminHeaderProps) {
  const pathname = usePathname();

  const handleLogout = () => {
    void logout().finally(() => window.location.assign("/"));
  };

  // Nav configuration
  const navItems = [
    { label: "书库管理", href: "/admin/books", icon: Library, match: "/admin/books" },
    { label: "审核中心", href: "/admin/review", icon: ClipboardCheck, match: "/admin/review" },
    { label: "模型设置", href: "/admin/model", icon: Settings2, match: "/admin/model" }
  ];

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-[56px] flex items-center justify-between px-6 bg-(--color-admin-header-bg) border-b border-(--color-border-strong) transition-colors">
      <div className="flex items-center h-full">
        {/* Admin Logo */}
        <Link href="/admin" className="text-xl font-bold text-white no-underline mr-8 flex items-center gap-2 hover:opacity-90 transition-opacity">
          <span className="bg-(--color-admin-sidebar-active) text-white w-6 h-6 rounded-sm flex items-center justify-center text-sm font-serif">文</span>
          <span className="text-gray-100 tracking-wide">文渊Admin</span>
        </Link>
        
        {/* Nav Items */}
        <nav className="flex items-center h-full gap-1 ml-4 overflow-x-auto no-scrollbar">
          {navItems.map((item) => {
            const isActive = pathname.startsWith(item.match);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group flex items-center gap-2 h-full px-4 text-sm font-medium transition-all relative
                  ${isActive 
                    ? "text-white" 
                    : "text-(--color-admin-sidebar-fg) hover:text-white"
                  }`}
              >
                <item.icon size={16} className={isActive ? "text-(--color-admin-sidebar-active)" : "text-current group-hover:text-white transition-colors"} />
                {item.label}
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-(--color-admin-sidebar-active)" />
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="flex items-center gap-6">
        {/* Theme Switcher even in Admin as per spec */}
        <div className="hidden sm:block">
           <ThemeToggle />
        </div>
        
        <div className="h-4 w-[1px] bg-white/10" />

        {userName && (
          <span className="hidden sm:flex items-center gap-1.5 text-sm text-(--color-admin-sidebar-fg)">
            <UserCircle2 size={14} />
            {userName}
          </span>
        )}

        <Link href="/" className="text-sm text-(--color-admin-sidebar-fg) hover:text-white transition-colors">
          返回前台
        </Link>
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 text-sm text-(--color-admin-sidebar-fg) hover:text-destructive transition-colors px-2 py-1 rounded hover:bg-white/5"
          title="退出登录"
        >
          <LogOut size={16} />
          <span className="hidden sm:inline">退出</span>
        </button>
      </div>
    </header>
  );
}
