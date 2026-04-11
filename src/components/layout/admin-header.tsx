"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BookOpen, CheckCircle, Settings2, LogOut, LayoutDashboard, BookMarked } from "lucide-react";
import { ThemeToggle } from "@/components/theme";
import { Button } from "@/components/ui/button";
import { logout } from "@/lib/services/auth";

/**
 * 文件定位（Client Component / 管理后台顶部导航）：
 * - 包含后台 Logo、主导航、主题切换、用户信息与退出入口。
 * - 因为依赖 `usePathname` 获取当前路径并驱动激活态，必须运行在客户端。
 */

export interface AdminHeaderProps {
  /** 当前登录管理员名称，可选（未取到用户信息时允许为空）。 */
  userName?: string | null;
}

/**
 * 后台主导航配置。
 * `href` 是路由契约，`label/icon` 是展示层信息。
 */
const adminLinks = [
  { href: "/admin",          label: "概览",     icon: LayoutDashboard },
  { href: "/admin/books",    label: "书籍管理", icon: BookOpen },
  { href: "/admin/review",   label: "审核中心", icon: CheckCircle },
  { href: "/admin/knowledge-base", label: "知识库", icon: BookMarked },
  { href: "/admin/model",    label: "模型设置", icon: Settings2 }
];

export function AdminHeader({ userName }: AdminHeaderProps) {
  // usePathname 在客户端读取当前路径，用于计算导航高亮。
  const pathname = usePathname();
  // useRouter 用于退出后导航到登录页。
  const router = useRouter();

  /**
   * 执行管理后台退出登录。
   * 调用 /api/auth/logout 清除服务端会话，成功后跳转到登录页。
   * 失败时仍跳转，确保用户离开受保护域。
   */
  async function handleLogout() {
    try {
      await logout();
    } catch {
      // 无论 API 是否成功，都要跳转到登录页以防止继续操作后台。
    }
    router.push("/login");
  }

  return (
    <header className="admin-header sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="admin-header-inner mx-auto flex h-14 max-w-[1440px] items-center justify-between px-6">
        {/* Logo */}
        <Link href="/" aria-label="返回主站" className="flex items-center gap-3 group">
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
            // 高亮规则：
            // 1) 完全匹配当前导航项；
            // 2) 非 /admin 根项时允许子路由前缀匹配。
            const isActive = pathname === link.href ||
              (link.href !== "/admin" && pathname.startsWith(link.href));

            return (
              <Button
                key={link.href}
                asChild
                variant="ghost"
                size="sm"
                data-active={isActive ? "true" : "false"}
                className="admin-header-nav-button gap-2 h-9"
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
            // 用户名非必需：缺失时仍保持头部结构稳定，不阻断导航与操作入口。
            <span className="hidden sm:flex items-center gap-1.5 text-sm text-muted-foreground">
              {userName}
            </span>
          )}

          <Button type="button" variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground" onClick={() => { void handleLogout(); }}>
            <LogOut className="h-4 w-4" />
            退出
          </Button>
        </div>
      </div>
    </header>
  );
}
