"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";

export type ReviewModeNavMode = "matrix" | "relations" | "time";
export type ReviewMode = ReviewModeNavMode;

interface ReviewModeNavProps {
  bookId        : string;
  activeMode   ?: ReviewModeNavMode;
  active       ?: ReviewModeNavMode;
  preserveQuery?: boolean;
}

const REVIEW_MODES: Array<{
  mode : ReviewModeNavMode;
  label: string;
  href : (bookId: string) => string;
}> = [
  {
    mode : "matrix",
    label: "人物 x 章节",
    href : (bookId) => `/admin/review/${bookId}`
  },
  {
    mode : "relations",
    label: "人物关系",
    href : (bookId) => `/admin/review/${bookId}/relations`
  },
  {
    mode : "time",
    label: "人物 x 时间",
    href : (bookId) => `/admin/review/${bookId}/time`
  }
];

/**
 * 审核工作台的模式导航。
 * 保持为无状态 Server-friendly 组件，避免不同审核页面各自硬编码路由。
 */
export function ReviewModeNav({
  bookId,
  activeMode,
  active,
  preserveQuery
}: ReviewModeNavProps) {
  const current      = active ?? activeMode;
  const searchParams = useSearchParams();
  const queryString  = preserveQuery ? (searchParams?.toString() ?? "") : "";

  return (
    <nav
      aria-label="审核模式"
      className="review-mode-nav flex flex-wrap gap-2 rounded-lg border bg-muted/30 p-1"
    >
      {REVIEW_MODES.map((item) => {
        const isActive = item.mode === current;
        const baseHref = item.href(bookId);
        const href     = queryString ? `${baseHref}?${queryString}` : baseHref;

        return (
          <Link
            key={item.mode}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              isActive
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:bg-background/70 hover:text-foreground"
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
