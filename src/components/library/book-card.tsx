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

function getBookDescription(book: BookLibraryListItem): string {
  if (book.lastErrorSummary) {
    return book.lastErrorSummary;
  }

  if (book.personaCount > 0) {
    return `已解析 ${book.personaCount} 位人物，${book.chapterCount} 个章回。数据由 AI 自动生成，仅供参考。`;
  }

  return "数据由 AI 自动解析生成，可能存在误差，欢迎校对纠正。";
}

export function BookCard({ book }: BookCardProps) {
  // 书库入口策略：只有 COMPLETED 才允许进入图谱，避免用户进入空图或半成品数据。
  const isCompleted = book.status === "COMPLETED";
  const href = `/books/${book.id}/graph`;
  const description = getBookDescription(book);

  const cardContent = (
    <>
      <div
        className={cn(
          "library-book-card-surface relative aspect-[2/3] overflow-hidden rounded-sm transition-all duration-300",
          "shadow-lg hover:shadow-xl",
          isCompleted ? "group-hover:-translate-y-2 group-hover:rotate-1" : "opacity-50 grayscale-[30%]"
        )}
        style={{ perspective: "1000px", transformStyle: "preserve-3d" }}
      >
        <div
          className="absolute top-0 left-0 z-10 h-full w-3"
          style={{ background: "linear-gradient(to right, rgba(0,0,0,0.3), transparent)" }}
          aria-hidden="true"
        />

        <BookCover
          id={book.id}
          title={book.title}
          author={book.author}
          dynasty={book.dynasty}
          coverUrl={book.coverUrl}
          disabled={!isCompleted}
          className="absolute inset-0"
        />

        {isCompleted && (
          <Link
            href={href}
            aria-label={`查看「${book.title}」人物图谱`}
            className="absolute inset-0 z-10 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
        )}

        <div
          className={cn(
            "library-book-card-hover pointer-events-none absolute inset-0 z-20 flex flex-col bg-background/95 p-4 pb-11 transition-opacity duration-300",
            "opacity-0 group-hover:opacity-100",
            !isCompleted && "group-hover:opacity-0"
          )}
        >
          <h3 className="mb-1 text-base font-semibold">{book.title}</h3>
          <p className="mb-4 text-sm text-muted-foreground">
            {book.author || "佚名"}
            {book.dynasty ? ` · ${book.dynasty}` : ""}
          </p>

          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <FileText className="h-4 w-4" />
              <span>{book.chapterCount} 章回</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Users className="h-4 w-4" />
              <span>{book.personaCount} 人物</span>
            </div>
            {book.lastAnalyzedAt && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>{formatStableDate(book.lastAnalyzedAt)}</span>
              </div>
            )}
            {book.currentModel && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Cpu className="h-4 w-4" />
                <span>{book.currentModel}</span>
              </div>
            )}
          </div>
        </div>

        {isCompleted && (
          <div className="absolute inset-x-4 bottom-4 z-30 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="interactive-text-link flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <Info className="h-3 w-3" />
                  数据说明
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                <p className="text-sm">{description}</p>
              </TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>

      <div
        className={cn(
          "absolute -bottom-2 left-2 right-2 h-4 rounded-full bg-foreground/10 blur-md transition-all duration-300",
          isCompleted && "group-hover:bg-foreground/15 group-hover:blur-lg"
        )}
        aria-hidden="true"
      />

      {!isCompleted && (
        <div className="library-book-card-status absolute top-3 left-3">
          <Badge variant="outline" className="bg-background/80 text-xs">
            解析中
          </Badge>
        </div>
      )}
    </>
  );

  return (
    <TooltipProvider>
      <div className={cn("library-book-card group relative block", !isCompleted && "cursor-not-allowed")}>
        {cardContent}
      </div>
    </TooltipProvider>
  );
}
