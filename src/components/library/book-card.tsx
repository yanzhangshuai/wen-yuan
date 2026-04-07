"use client";

/**
 * =============================================================================
 * 文件定位（书库展示组件：单本书卡片）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/components/library/book-card.tsx`
 *
 * 组件职责：
 * - 负责在书库列表中渲染单本书的摘要信息（标题、作者、状态、统计等）；
 * - 按书籍状态决定视觉强调与跳转目标（阅读图谱页）。
 *
 * React/Next.js 语义：
 * - 这是 Client Component，主要因为依赖 Tooltip 等客户端交互组件；
 * - 组件本身不拉取数据，数据由父组件注入，符合“展示层纯渲染”职责划分。
 *
 * 维护注意：
 * - 状态颜色与文案映射属于业务表达，不建议仅按视觉偏好调整；
 * - 日期展示使用稳定 UTC 文案是为规避 hydration mismatch，属于渲染一致性防线。
 * =============================================================================
 */

import Link from "next/link";
import { Users, FileText, Clock, Cpu, Info } from "lucide-react";

import { BookCover } from "@/components/library/book-cover";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { BookLibraryListItem } from "@/types/book";

interface BookCardProps {
  book: BookLibraryListItem;
}

/**
 * 稳定日期文案，避免 SSR/CSR 受本地时区与 locale 影响导致 hydration mismatch。
 */
function formatStableDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function BookCard({ book }: BookCardProps) {
  const isCompleted = book.status === "COMPLETED";
  const isError = book.status === "ERROR";
  const href = `/books/${book.id}/graph`;

  // FG-10: 前台书库不展示解析状态 Badge（COMPLETED 外的书籍以灰度不可点击表达状态）。
  const statusBadge = null;

  const hoverPanel = isCompleted ? (
    <div className={cn(
      "library-book-card-hover absolute inset-[2px] z-30 flex flex-col rounded-[5px] p-4",
      // hover 信息层不再整面“盖死”封面，保留外沿/书脊可见，维持书本立体感。
      "bg-linear-to-b from-background/44 via-background/54 to-background/66 backdrop-blur-[1.25px]",
      "shadow-[inset_0_1px_0_rgba(255,255,255,0.12),inset_0_-20px_40px_rgba(0,0,0,0.22)]",
      "pointer-events-none translate-y-[4px] scale-[0.988] opacity-0 transition-[opacity,transform] duration-[340ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
      "group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100"
    )}>
      <h3 className="mb-1 line-clamp-2 text-base leading-tight font-semibold">{book.title}</h3>
      <p className="mb-4 text-sm text-muted-foreground">
        {book.author || "佚名"}
        {book.dynasty ? ` · ${book.dynasty}` : ""}
      </p>

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
            <span>{formatStableDate(book.lastAnalyzedAt)}</span>
          </div>
        )}
        {book.currentModel && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Cpu className="h-4 w-4 shrink-0" />
            <span>{book.currentModel}</span>
          </div>
        )}
      </div>

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="mt-auto flex items-center gap-1 text-xs text-primary hover:underline"
              onClick={(event) => event.preventDefault()}
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

  const cardCore = (
    <>
      {/* 与 sheji 对齐：恢复书脊 + 底部阴影，让书卡 hover 更有“上浮翻页”感。 */}
      <div
        className={cn(
          "library-book-card-surface relative aspect-[2/3] overflow-hidden rounded-sm",
          // 进一步收敛位移/旋转幅度，保持“虚浮”但避免过度摆动导致生硬。
          "transform-gpu will-change-transform [transform:translate3d(0,0,0)_rotate(0deg)_scale(1)]",
          "transition-[transform,box-shadow,filter,background-color,border-color] duration-[380ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
          "shadow-lg",
          isCompleted
            ? "group-hover:[transform:translate3d(0,-8px,0)_rotate(0.72deg)_scale(1.012)] group-hover:shadow-2xl group-active:[transform:translate3d(0,-4px,0)_rotate(0.45deg)_scale(1.006)]"
            : "opacity-50 grayscale-[30%]"
        )}
        style={{ perspective: "1000px", transformStyle: "preserve-3d" }}
      >
        <div
          className="pointer-events-none absolute top-0 left-0 z-20 h-full w-3 bg-linear-to-r from-black/36 via-black/16 to-transparent"
          aria-hidden="true"
        />

        <BookCover
          id={book.id}
          title={book.title}
          author={book.author}
          dynasty={book.dynasty}
          coverUrl={book.coverUrl}
          disabled={!isCompleted}
          className="h-full w-full rounded-none"
        />

        <div
          className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/28 via-transparent to-white/10"
          aria-hidden="true"
        />

        {statusBadge}
        {hoverPanel}
      </div>

      <div
        className={cn(
          "pointer-events-none absolute -bottom-2 left-2 right-2 h-4 rounded-full bg-foreground/10 opacity-70 blur-md transition-[filter,background-color,opacity,transform] duration-[380ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
          isCompleted && "group-hover:translate-y-[3px] group-hover:blur-2xl group-hover:bg-foreground/24 group-hover:opacity-100"
        )}
        aria-hidden="true"
      />
    </>
  );

  if (isCompleted) {
    return (
      <Link
        href={href}
        aria-label={`查看「${book.title}」人物图谱`}
        className="library-book-card group relative block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {cardCore}
      </Link>
    );
  }

  return (
    <div className="library-book-card group relative block cursor-not-allowed">
      {cardCore}
    </div>
  );
}
