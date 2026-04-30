"use client";

import {
  BookMarked,
  BookOpenText,
  FileClock,
  Filter,
  History,
  Network,
  Regex,
  ScrollText,
  Sparkles,
  UserRoundSearch,
  type LucideIcon
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export type KnowledgeBaseNavIconKey =
  | "overview"
  | "book-type"
  | "alias-pack"
  | "surname"
  | "title-filter"
  | "prompt-template"
  | "ner-rule"
  | "prompt-extraction-rule"
  | "change-log"
  | "historical-figure"
  | "relationship-type"
  | "name-pattern";

export interface KnowledgeBaseNavLink {
  href   : string;
  label  : string;
  iconKey: KnowledgeBaseNavIconKey;
}

export interface KnowledgeBaseNavProps {
  links: ReadonlyArray<KnowledgeBaseNavLink>;
}

const knowledgeBaseNavIcons: Record<KnowledgeBaseNavIconKey, LucideIcon> = {
  overview                : BookMarked,
  "book-type"             : BookOpenText,
  "alias-pack"            : Sparkles,
  surname                 : UserRoundSearch,
  "title-filter"          : Filter,
  "prompt-template"       : ScrollText,
  "ner-rule"              : BookMarked,
  "prompt-extraction-rule": ScrollText,
  "historical-figure"     : History,
  "relationship-type"     : Network,
  "name-pattern"          : Regex,
  "change-log"            : FileClock
};

/**
 * 知识库侧边导航需要在客户端读取 pathname，才能为当前模块提供稳定高亮。
 */
export function KnowledgeBaseNav({ links }: KnowledgeBaseNavProps) {
  const pathname = usePathname();

  return (
    <nav className="knowledge-base-nav flex flex-col gap-1">
      {links.map((item) => {
        const Icon = knowledgeBaseNavIcons[item.iconKey];
        const isActive = item.href === "/admin/knowledge-base"
          ? pathname === item.href
          : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted hover:text-foreground",
              isActive
                ? "bg-muted font-medium text-foreground"
                : "text-muted-foreground"
            )}
          >
            <Icon className="h-4 w-4" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
