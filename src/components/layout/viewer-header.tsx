"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Settings, User, LogOut } from "lucide-react";
import { ThemeToggle } from "@/components/theme";
import { Button } from "@/components/ui/button";
import { logout } from "@/lib/services/auth";

/**
 * 文件定位（Client Component / 访客端顶部导航）：
 * - 负责前台书库页的主导航、主题切换、登录/退出与管理入口切换。
 * - 依赖浏览器路由状态（`usePathname`）和点击事件（登出），必须是 Client Component。
 */

export interface ViewerHeaderProps {
  /** 当前用户是否具备管理员权限，决定右侧动作区渲染分支。 */
  isAdmin?    : boolean;
  /** 当前页面路径，用于构造登录后回跳地址。 */
  currentPath?: string;
  /** 预留用户信息字段（当前版本未直接使用）。 */
  user?       : { name?: string | null; image?: string | null };
}

export function ViewerHeader({ isAdmin, currentPath = "/" }: ViewerHeaderProps) {
  // 读取当前 pathname 以驱动导航按钮激活态。
  const pathname = usePathname();

  const handleLogout = () => {
    // 退出后刷新页面：确保服务端会话态与客户端 UI 同步。
    void logout().finally(() => window.location.reload());
  };

  return (
    <header className="viewer-header sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="viewer-header-inner mx-auto flex h-16 w-full max-w-[1440px] items-center justify-between px-6">
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
            className="viewer-header-nav-button gap-2"
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

          <Button asChild variant="ghost" size="sm" className="gap-2">
            <Link
              href={isAdmin ? "/admin" : `/login?redirect=${encodeURIComponent("/admin")}`}
              aria-label={isAdmin ? "进入管理后台" : "登录后进入管理后台"}
              title={isAdmin ? "进入管理后台" : "登录后进入管理后台"}
            >
              <Settings className="h-4 w-4" />
              <span className="hidden lg:inline">Admin</span>
            </Link>
          </Button>

          {isAdmin ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-2 text-muted-foreground hover:text-destructive"
              aria-label="退出登录"
              title="退出登录"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          ) : (
            // 非管理员展示登录入口，且保留 redirect 参数维持阅读上下文。
            <Button asChild variant="outline" size="sm" className="gap-2">
              <Link
                href={`/login?redirect=${encodeURIComponent(currentPath)}`}
                aria-label="登录"
                title="登录"
              >
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
