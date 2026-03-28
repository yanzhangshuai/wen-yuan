"use client";

import { use, useEffect, useRef } from "react";
import { X, ChevronLeft, ChevronRight, BookOpen } from "lucide-react";

import { Button } from "@/components/ui/button";

/* ------------------------------------------------
   Props
   ------------------------------------------------ */
export interface TextReaderPanelProps {
  bookId             : string;
  chapterPromise     : Promise<ChapterContent>;
  highlightParaIndex?: number;
  onClose            : () => void;
  onPrev?            : () => void;
  onNext?            : () => void;
}

interface ChapterContent {
  title     : string;
  chapterNo : number;
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
  const content = use(chapterPromise);
  const highlightRef = useRef<HTMLParagraphElement>(null);

  // Scroll to highlighted paragraph
  useEffect(() => {
    if (content && highlightParaIndex != null && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [content, highlightParaIndex]);

  return (
    <aside className="text-reader-panel absolute right-0 top-0 z-30 flex h-full w-[480px] flex-col border-l border-border bg-card shadow-xl">
      {/* Header */}
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

      {/* Content */}
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

      {/* Footer */}
      <div className="border-t border-border px-4 py-2">
        <Button variant="ghost" size="sm" onClick={onClose} className="w-full">
          关闭阅读面板
        </Button>
      </div>
    </aside>
  );
}
