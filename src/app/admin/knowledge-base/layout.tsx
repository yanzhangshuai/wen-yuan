import type { Metadata } from "next";
import Link from "next/link";
import { BookMarked, BookOpenText, FileClock, Filter, ScrollText, Sparkles, UserRoundSearch } from "lucide-react";

export const metadata: Metadata = {
  title: "知识库管理"
};

const knowledgeBaseLinks = [
  {
    href : "/admin/knowledge-base",
    label: "总览",
    icon : BookMarked
  },
  {
    href : "/admin/knowledge-base/book-types",
    label: "书籍类型",
    icon : BookOpenText
  },
  {
    href : "/admin/knowledge-base/alias-packs",
    label: "别名知识包",
    icon : Sparkles
  },
  {
    href : "/admin/knowledge-base/surnames",
    label: "姓氏词库",
    icon : UserRoundSearch
  },
  {
    href : "/admin/knowledge-base/title-filters",
    label: "泛化称谓",
    icon : Filter
  },
  {
    href : "/admin/knowledge-base/prompt-templates",
    label: "提示词模板",
    icon : ScrollText
  },
  {
    href : "/admin/knowledge-base/ner-rules",
    label: "提取规则",
    icon : Sparkles
  },
  {
    href : "/admin/knowledge-base/change-logs",
    label: "变更日志",
    icon : FileClock
  }
] as const;

/**
 * 知识库管理区域布局。
 * 提供子页面通用侧边导航。
 */
export default function KnowledgeBaseLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[calc(100vh-3.5rem)]">
      <aside className="hidden w-56 shrink-0 border-r bg-muted/30 p-4 md:block">
        <h3 className="mb-4 text-sm font-semibold text-muted-foreground">知识库管理</h3>
        <nav className="flex flex-col gap-1">
          {knowledgeBaseLinks.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.href} href={item.href}>
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </aside>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {children}
    </Link>
  );
}
