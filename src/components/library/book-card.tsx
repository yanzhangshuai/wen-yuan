"use client";

import Link from "next/link";
import { BookCover } from "@/components/library/book-cover";
import { cn } from "@/lib/utils";
import { Users, FileText, Clock, Cpu, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip";
import type { BookLibraryListItem } from "@/types/book";

interface BookCardProps {
  book: BookLibraryListItem;
}

/**
 * 书库卡片组件——对齐 sheji 设计。
 *
 * 视觉层次：
 *   1. 封面（BookCover）—— 有图显图，无图显色块+大字
 *   2. hover 遮罩（bg-background/95）—— 仅已完成书籍触发，展示所有书籍详情
 *   3. 平面卡片阴影（无立体书架结构，保持和首页网格一致）
 *
 * 交互模式：
 *   - 已完成：Link 包裹，hover 轻微上移（平面卡片，不做立体旋转）
 *   - 未完成：div 包裹，cursor-not-allowed，灰度+透明，不触发 hover panel
 */
export function BookCard({ book }: BookCardProps) {
  const isCompleted = book.status === "COMPLETED";
  const isError = book.status === "ERROR";
  const href = `/books/${book.id}/graph`;

  /* 仅完成解析的书籍展示 hover 详情层；解析中/失败不响应 hover 详情，避免误导点击。 */
  const hoverPanel = isCompleted ? (
    <div className={cn(
      "library-book-card-hover absolute inset-0 z-30 flex flex-col rounded-md bg-background/92 p-4 backdrop-blur-[2px]",
      "opacity-0 translate-y-2 group-hover:translate-y-0 group-hover:opacity-100",
      "transition-all duration-300"
    )}>
      <h3 className="mb-1 line-clamp-2 text-base leading-tight font-semibold">{book.title}</h3>
      <p className="mb-4 text-sm text-muted-foreground">
        {book.author || "佚名"}
        {book.dynasty ? ` · ${book.dynasty}` : ""}
      </p>

      {/* 书籍统计信息 */}
      <div className="space-y-2 text-sm/5">
        <div className="flex items-center gap-2 text-muted-foreground">
          <FileText className="h-4 w-4 shrink-0" />
          <span>{book.chapterCount} 章回</span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Users className="h-4 w-4 shrink-0" />
          <span>{book.personaCount} 人物</span>
        </div>
        {book.lastAnalyzedAt && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="h-4 w-4 shrink-0" />
            <span>{new Date(book.lastAnalyzedAt).toLocaleDateString("zh-CN")}</span>
          </div>
        )}
        {book.currentModel && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Cpu className="h-4 w-4 shrink-0" />
            <span>{book.currentModel}</span>
          </div>
        )}
      </div>

      {/* 数据说明 tooltip（对齐 sheji 的 Info 按鈢） */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="mt-auto flex items-center gap-1 text-xs text-primary hover:underline"
              /* 阻断 Link 局部点击，保证 tooltip 可读而不触发跳转。 */
              onClick={(e) => e.preventDefault()}
            >
              <Info className="h-3 w-3" />
              数据说明
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            <p className="text-sm">
              {book.personaCount > 0
                ? `已解析 ${book.personaCount} 位人物，${book.chapterCount} 个章回。数据由 AI 自动生成，仅供参考。`
                : "数据由 AI 自动解析生成，可能存在误差，欢迎校对纠正。"}
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  ) : null;

  /* 未完成书籍状态标签 */
  const statusBadge = !isCompleted ? (
    <div className="absolute top-3 left-3 z-30 library-book-card-status">
      <Badge
        variant="outline"
        className={cn(
          "border-border/60 bg-background/75 text-xs backdrop-blur-sm",
          isError && "border-destructive/50 text-destructive"
        )}
      >
        {isError ? "解析失败" : "解析中"}
      </Badge>
    </div>
  ) : null;

  const cardContent = (
    <div className="relative">
      {/* 封面区域 */}
      <div
        className={cn(
          "library-book-card-surface relative aspect-2/3 overflow-hidden rounded-md border border-border/70 bg-card",
          "transition-all duration-300",
          isCompleted
            ? "shadow-lg group-hover:border-primary/30 group-hover:shadow-2xl"
            : "shadow-md"
        )}
      >
        <BookCover
          id={book.id}
          title={book.title}
          author={book.author}
          dynasty={book.dynasty}
          coverUrl={book.coverUrl}
          disabled={!isCompleted}
          className={cn(
            "h-full w-full transition-transform duration-500",
            isCompleted && "group-hover:scale-[1.01]",
            !isCompleted && "opacity-70 grayscale-[24%]"
          )}
        />
        <div
          className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/22 via-black/0 to-transparent"
          aria-hidden="true"
        />
        {statusBadge}
        {hoverPanel}
      </div>
    </div>
  );

  if (isCompleted) {
    return (
      <Link
        href={href}
        /* 书库保持平面卡片语言，只保留轻微上移动效。 */
        className="library-book-card group relative block rounded-md transition-transform duration-300 hover:-translate-y-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        aria-label={`查看「${book.title}」人物图谱`}
      >
        {cardContent}
      </Link>
    );
  }

  return (
    <div className="library-book-card group relative block cursor-not-allowed">
      {cardContent}
    </div>
  );
}
