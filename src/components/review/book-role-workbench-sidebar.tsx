"use client";

import { useState } from "react";
import Link from "next/link";
import { BookOpen, PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { BookLibraryListItem } from "@/types/book";

interface BookRoleWorkbenchSidebarProps {
  books        : BookLibraryListItem[];
  currentBookId: string;
}

export function BookRoleWorkbenchSidebar({
  books,
  currentBookId
}: BookRoleWorkbenchSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const currentBook = books.find(book => book.id === currentBookId);

  if (collapsed) {
    return (
      <aside className="book-role-workbench-sidebar w-12 shrink-0">
        <div className="sticky top-20 flex flex-col items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setCollapsed(false)}
            aria-label="展开书籍选择侧栏"
            title="展开书籍选择侧栏"
          >
            <PanelLeftOpen className="size-4" />
          </Button>
          <Link
            href={`/admin/role-workbench/${currentBookId}`}
            className="flex min-h-36 w-10 flex-col items-center gap-2 rounded-md border border-border bg-card px-2 py-3 text-primary transition-colors hover:bg-accent"
            title={currentBook?.title ?? "当前书籍"}
            aria-label={`当前书籍：${currentBook?.title ?? "未知书籍"}`}
          >
            <BookOpen className="size-4 shrink-0" />
            <span className="line-clamp-6 text-xs font-medium [writing-mode:vertical-rl]">
              {currentBook?.title ?? "当前书籍"}
            </span>
          </Link>
        </div>
      </aside>
    );
  }

  return (
    <aside className="book-role-workbench-sidebar w-44 shrink-0">
      <div className="sticky top-20">
        <div className="mb-3 flex items-center justify-between gap-2 px-2">
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            选择书籍
          </h2>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => setCollapsed(true)}
            aria-label="收起书籍选择侧栏"
            title="收起书籍选择侧栏"
          >
            <PanelLeftClose className="size-4" />
          </Button>
        </div>
        <nav className="space-y-0.5">
          {books.map((book) => (
            <Link
              key={book.id}
              href={`/admin/role-workbench/${book.id}`}
              className={cn(
                "flex items-center justify-between rounded-md px-3 py-2 text-sm transition-colors",
                book.id === currentBookId
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-foreground hover:bg-accent"
              )}
            >
              <span className="truncate">{book.title}</span>
              <span className="ml-2 shrink-0 text-xs tabular-nums text-muted-foreground/70">
                {book.personaCount}
              </span>
            </Link>
          ))}
        </nav>
      </div>
    </aside>
  );
}
