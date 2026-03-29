"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip";

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
  const [isPlaying, setIsPlaying] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChapterChange(Number(e.target.value));
    },
    [onChapterChange]
  );

  // Track current chapter in a ref for interval access (updated via effect, not during render)
  const chapterRef = useRef(currentChapter);
  useEffect(() => {
    chapterRef.current = currentChapter;
  }, [currentChapter]);

  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        const next = chapterRef.current + 1;
        if (next > totalChapters) {
          setIsPlaying(false);
          return;
        }
        onChapterChange(next);
      }, 2000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPlaying, totalChapters, currentChapter, onChapterChange]);

  if (totalChapters <= 0) return null;

  const progress = ((currentChapter - 1) / Math.max(totalChapters - 1, 1)) * 100;

  return (
    <div className="chapter-timeline absolute bottom-0 left-0 right-0 z-10 border-t border-border/60 bg-card/80 backdrop-blur-md px-6 py-3">
      <div className="mx-auto flex max-w-4xl items-center gap-3">
        {/* Playback controls */}
        <TooltipProvider delayDuration={200}>
          <div className="flex items-center gap-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => onChapterChange(1)}
                  disabled={currentChapter <= 1}
                >
                  <SkipBack size={14} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>第1{chapterUnit}</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => onChapterChange(Math.max(1, currentChapter - 1))}
                  disabled={currentChapter <= 1}
                >
                  <ChevronLeft size={14} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>上一{chapterUnit}</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setIsPlaying(!isPlaying)}
                >
                  {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{isPlaying ? "暂停" : "自动播放"}</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => onChapterChange(Math.min(totalChapters, currentChapter + 1))}
                  disabled={currentChapter >= totalChapters}
                >
                  <ChevronRight size={14} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>下一{chapterUnit}</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => onChapterChange(totalChapters)}
                  disabled={currentChapter >= totalChapters}
                >
                  <SkipForward size={14} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>第{totalChapters}{chapterUnit}</TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>

        {/* Chapter label */}
        <span className="shrink-0 text-xs font-medium text-muted-foreground min-w-[60px]">
          第{currentChapter}{chapterUnit}
        </span>

        {/* Slider track */}
        <div className="relative flex-1">
          <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-1 rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-100"
              style={{ width: `${progress}%` }}
            />
          </div>
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
            className="chapter-slider relative w-full cursor-pointer opacity-0"
            aria-label={`章节滑块：第${currentChapter}${chapterUnit}`}
          />
          {/* Current chapter indicator */}
          {isDragging && (
            <div
              className="pointer-events-none absolute -top-8 rounded bg-primary px-2 py-0.5 text-xs text-(--color-primary-fg)"
              style={{
                left     : `${progress}%`,
                transform: "translateX(-50%)"
              }}
            >
              第{currentChapter}{chapterUnit}
            </div>
          )}
        </div>

        {/* Position indicator */}
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {currentChapter} / {totalChapters}
        </span>
      </div>
    </div>
  );
}
