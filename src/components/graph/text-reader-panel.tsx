"use client";

import { use, useEffect, useRef } from "react";
import { X, ChevronLeft, ChevronRight, BookOpen } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * =============================================================================
 * 文件定位（原文阅读侧栏）
 * -----------------------------------------------------------------------------
 * 组件角色：图谱页证据阅读面板。
 * 组件类型：Client Component。
 *
 * 业务职责：
 * - 展示指定章节全文段落；
 * - 支持按证据段落自动滚动定位；
 * - 提供“上一处/下一处证据”导航入口（由父级决定是否可用）。
 *
 * React 特性说明：
 * - 使用 `use(chapterPromise)` 消费异步章节内容；
 * - 要求父组件使用 Suspense 包裹。
 *
 * 上下游关系：
 * - 上游：`GraphView` 通过 `fetchChapterContent` 创建 Promise 后传入；
 * - 下游：无。
 * =============================================================================
 */

/* ------------------------------------------------
   Props
   ------------------------------------------------ */
export interface TextReaderPanelProps {
  /** 当前书籍 ID（当前版本未直接使用，保留上下游契约语义）。 */
  bookId             : string;
  /** 章节内容 Promise（由上游触发原文读取接口后提供）。 */
  chapterPromise     : Promise<ChapterContent>;
  /** 需要高亮并自动滚动到的段落下标。 */
  highlightParaIndex?: number;
  /** 关闭面板回调。 */
  onClose            : () => void;
  /** 上一处证据回调（可选，取决于调用场景是否维护证据游标）。 */
  onPrev?            : () => void;
  /** 下一处证据回调（可选）。 */
  onNext?            : () => void;
}

/**
 * 阅读面板内部章节视图模型。
 * 说明：与后端返回结构保持一致，但仅保留渲染所需字段。
 */
interface ChapterContent {
  /** 章节标题。 */
  title     : string;
  /** 章节序号（从 1 开始）。 */
  chapterNo : number;
  /** 章节段落文本数组。 */
  paragraphs: string[];
}

/* ------------------------------------------------
   Component
   ------------------------------------------------ */
export function TextReaderPanel({
  chapterPromise,
  highlightParaIndex,
  onClose,
  onPrev,
  onNext
}: TextReaderPanelProps) {
  /** 读取章节内容：pending/rejected 分别由 Suspense/错误边界处理。 */
  const content = use(chapterPromise);

  /** 高亮段落 DOM 引用，用于进入面板后自动滚动到证据处。 */
  const highlightRef = useRef<HTMLParagraphElement>(null);

  /**
   * 当章节内容或高亮索引变化时滚动定位。
   * 防御条件：必须同时满足“有内容 + 有索引 + ref 已绑定”。
   */
  useEffect(() => {
    if (content && highlightParaIndex != null && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [content, highlightParaIndex]);

  return (
    <aside className="text-reader-panel absolute right-0 top-0 z-30 flex h-full w-[480px] flex-col border-l border-border/60 bg-card/80 backdrop-blur-md shadow-xl">
      {/* 顶栏：章节标题 + 证据导航 + 关闭。 */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <BookOpen size={16} className="text-primary" />
          <span className="text-sm font-medium text-foreground">
            {`第${content.chapterNo}回 ${content.title}`}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {onPrev && (
            <button
              type="button"
              onClick={onPrev}
              className="rounded p-1 text-muted-foreground hover:text-foreground"
              aria-label="上一处证据"
              title="上一处证据"
            >
              <ChevronLeft size={16} />
            </button>
          )}
          {onNext && (
            <button
              type="button"
              onClick={onNext}
              className="rounded p-1 text-muted-foreground hover:text-foreground"
              aria-label="下一处证据"
              title="下一处证据"
            >
              <ChevronRight size={16} />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="ml-1 rounded p-1 text-muted-foreground hover:text-foreground"
            aria-label="关闭"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* 主体：逐段渲染原文；命中段高亮。 */}
      <div className="flex-1 overflow-y-auto px-6 py-4 custom-scrollbar">
        <div className="flex flex-col gap-0">
          {content.paragraphs.map((para, idx) => (
            <p
              key={idx}
              ref={idx === highlightParaIndex ? highlightRef : undefined}
              className={`py-1 text-sm leading-[1.8] ${
                idx === highlightParaIndex
                  ? "rounded-sm bg-primary-subtle px-2 font-medium text-foreground"
                  : "text-muted-foreground"
              }`}
            >
              {para}
            </p>
          ))}
        </div>
      </div>

      {/* 底部关闭入口：在滚动到底部时仍可快速退出。 */}
      <div className="border-t border-border px-4 py-2">
        <Button variant="ghost" size="sm" onClick={onClose} className="w-full">
          关闭阅读面板
        </Button>
      </div>
    </aside>
  );
}
