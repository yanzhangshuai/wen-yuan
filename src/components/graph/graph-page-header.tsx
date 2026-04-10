"use client";

import Link from "next/link";
import { ArrowLeft, Users, GitBranch } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme";

/**
 * =============================================================================
 * 文件定位（图谱页专属头部）
 * -----------------------------------------------------------------------------
 * 组件类型：Client Component（声明了 `"use client"`）。
 *
 * 在 Next.js 应用中的职责：
 * - 为图谱页提供专属的书籍信息头部，补足全局 ViewerHeader 缺失的书籍语境；
 * - 展示书名、作者、节点数、关系数与当前章节进度；
 * - 使用毛玻璃样式融入图谱背景，与图谱画布形成视觉层次感。
 *
 * 设计参考：
 * - 参照 sheji 项目 `app/graph/[bookId]/page.tsx` 顶部 header 设计；
 * - 采用 color-mix(oklch) 半透明背景 + backdrop-filter 模糊，保持主题自适应。
 *
 * 上下游关系：
 * - 上游：`GraphView`（提供书籍信息与实时图谱统计）；
 * - 无直接业务下游，通过 `onBack` 回调或 Link 与路由协作。
 * =============================================================================
 */

export interface GraphPageHeaderProps {
  /** 书籍标题，显示于头部中央区域。 */
  bookTitle      : string;
  /** 书籍作者，显示于书名下方。 */
  bookAuthor?    : string;
  /** 书籍人物总数（解析后），用于展示规模信息。 */
  characterCount?: number;
  /** 当前图谱可见节点数（随时间轴切片变化）。 */
  nodeCount      : number;
  /** 当前图谱可见边数（随时间轴切片变化）。 */
  edgeCount      : number;
  /** 当前选中的章节号（1-based）。 */
  currentChapter : number;
  /** 全书总章节数，用于显示进度（如"第 3 / 120 回"）。 */
  totalChapters  : number;
  /** 章节单位文案（默认"回"）。 */
  chapterUnit?   : string;
}

/**
 * 图谱页专属头部组件。
 * 为图谱页提供：反回书库按钮、书籍信息（书名/作者/人物数）、
 * 图谱统计（节点数/边数/当前章节）以及主题切换器。
 */
export function GraphPageHeader({
  bookTitle,
  bookAuthor,
  characterCount,
  nodeCount,
  edgeCount,
  currentChapter,
  totalChapters,
  chapterUnit = "回"
}: GraphPageHeaderProps) {
  // 书名首字作为书籍头像，提供视觉锚点。
  const bookInitial = bookTitle.charAt(0);

  return (
    <header
      className="graph-page-header shrink-0 flex h-14 items-center justify-between px-5 z-30"
      style={{
        // 半透明卡片底色 + 模糊：与图谱背景融合，体现层次感。
        background          : "color-mix(in oklch, var(--card) 70%, transparent)",
        backdropFilter      : "blur(16px) saturate(1.4)",
        WebkitBackdropFilter: "blur(16px) saturate(1.4)",
        borderBottom        : "1px solid color-mix(in oklch, var(--border) 50%, transparent)"
      }}
    >
      {/* 左侧：返回按钮 + 书籍信息 */}
      <div className="flex items-center gap-4">
        <Link href="/">
          <Button variant="ghost" size="sm" className="gap-1.5 h-8 text-xs">
            <ArrowLeft className="h-3.5 w-3.5" />
            返回书库
          </Button>
        </Link>

        {/* 分隔线 */}
        <div className="h-5 w-px bg-border/60" />

        <div className="flex items-center gap-3">
          {/* 书籍头像：首字 + 主题主色背景 */}
          <div
            className="flex h-8 w-8 items-center justify-center rounded-md text-sm font-bold font-serif"
            style={{
              background: "color-mix(in oklch, var(--primary) 15%, transparent)",
              color     : "var(--primary)",
              border    : "1px solid color-mix(in oklch, var(--primary) 25%, transparent)"
            }}
          >
            {bookInitial}
          </div>

          {/* 书名 + 副标题（作者 · 人物数） */}
          <div>
            <h1 className="text-sm font-bold leading-none">{bookTitle}</h1>
            {(bookAuthor || characterCount !== undefined) && (
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {[
                  bookAuthor,
                  characterCount !== undefined ? `${characterCount} 人物` : undefined
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* 中央：图谱统计（中等以上屏幕才显示） */}
      <div className="hidden md:flex items-center gap-4">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Users className="h-3.5 w-3.5" />
          <span>{nodeCount} 节点</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <GitBranch className="h-3.5 w-3.5" />
          <span>{edgeCount} 关系</span>
        </div>
        {totalChapters > 1 && (
          <Badge variant="outline" className="h-5 text-[10px] font-normal">
            第 {currentChapter} / {totalChapters} {chapterUnit}
          </Badge>
        )}
      </div>

      {/* 右侧：主题切换 */}
      <div className="flex items-center">
        <ThemeToggle />
      </div>
    </header>
  );
}
