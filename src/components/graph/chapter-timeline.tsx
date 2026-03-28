"use client";

import { useCallback, useState } from "react";

/* ------------------------------------------------
   Props
   ------------------------------------------------ */
export interface ChapterTimelineProps {
  totalChapters  : number;
  currentChapter : number;
  onChapterChange: (chapter: number) => void;
  chapterUnit?   : string;
}

/* ------------------------------------------------
   Component
   ------------------------------------------------ */
export function ChapterTimeline({
  totalChapters,
  currentChapter,
  onChapterChange,
  chapterUnit = "回"
}: ChapterTimelineProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChapterChange(Number(e.target.value));
    },
    [onChapterChange]
  );

  if (totalChapters <= 0) return null;

  return (
    <div className="chapter-timeline absolute bottom-0 left-0 right-0 z-10 border-t border-border bg-card px-6 py-3"
      style={{ backgroundColor: "color-mix(in srgb, var(--color-card-bg) 90%, transparent)" }}
    >
      <div className="mx-auto flex max-w-3xl items-center gap-4">
        <span className="shrink-0 text-xs font-medium text-muted-foreground">
          第1{chapterUnit}
        </span>
        <div className="relative flex-1">
          <input
            type="range"
            min={1}
            max={totalChapters}
            value={currentChapter}
            onChange={handleChange}
            onMouseDown={() => setIsDragging(true)}
            onMouseUp={() => setIsDragging(false)}
            onTouchStart={() => setIsDragging(true)}
            onTouchEnd={() => setIsDragging(false)}
            className="chapter-slider w-full cursor-pointer accent-primary"
            aria-label={`章节滑块：第${currentChapter}${chapterUnit}`}
          />
          {/* Current chapter indicator */}
          {isDragging && (
            <div
              className="pointer-events-none absolute -top-8 rounded bg-primary px-2 py-0.5 text-xs text-(--color-primary-fg)"
              style={{
                left     : `${((currentChapter - 1) / Math.max(totalChapters - 1, 1)) * 100}%`,
                transform: "translateX(-50%)"
              }}
            >
              第{currentChapter}{chapterUnit}
            </div>
          )}
        </div>
        <span className="shrink-0 text-xs font-medium text-muted-foreground">
          第{totalChapters}{chapterUnit}
        </span>
        <span className="ml-2 min-w-[80px] rounded-md bg-muted px-2 py-1 text-center text-xs text-foreground">
          当前：第{currentChapter}{chapterUnit}
        </span>
      </div>
    </div>
  );
}
