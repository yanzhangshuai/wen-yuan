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

/**
 * =============================================================================
 * 文件定位（章节时间轴控制条）
 * -----------------------------------------------------------------------------
 * 组件角色：图谱页面底部时间轴交互条。
 * 组件类型：Client Component（依赖拖动、点击、自动播放定时器）。
 *
 * 业务职责：
 * - 允许用户按章节前后切换图谱时间切片；
 * - 提供“自动播放”能力用于关系演化回放；
 * - 提供首章/末章快速跳转，缩短大书籍浏览路径。
 *
 * 上下游关系：
 * - 上游：`GraphView` 通过 `currentChapter/onChapterChange` 控制实际图谱刷新；
 * - 下游：无。
 *
 * 重要约束：
 * - 自动播放不是独立数据源，只是周期性触发 `onChapterChange`；
 * - 章节编号从 1 开始，这是业务规则，不是技术限制。
 * =============================================================================
 */

/* ------------------------------------------------
   Props
   ------------------------------------------------ */
export interface ChapterTimelineProps {
  /** 总章节数，决定滑块上限与自动播放终点。 */
  totalChapters  : number;
  /** 当前章节号（受控状态）。 */
  currentChapter : number;
  /** 章节变化回调，调用方负责实际拉取该章节图谱。 */
  onChapterChange: (chapter: number) => void;
  /** 章节单位展示文案（如“回”“章”），默认“回”。 */
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
  /** 是否正在拖动滑块，用于显示悬浮章节提示。 */
  const [isDragging, setIsDragging] = useState(false);
  /** 是否处于自动播放中。 */
  const [isPlaying, setIsPlaying] = useState(false);
  /** 自动播放定时器引用，便于暂停和卸载时清理。 */
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /**
   * 滑块变更处理：input range 的 value 是字符串，需要转为 number。
   * 这里不做 clamp，由 `min/max` 与上层业务共同约束。
   */
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChapterChange(Number(e.target.value));
    },
    [onChapterChange]
  );

  /**
   * 用 ref 镜像当前章节。
   * 设计原因：`setInterval` 回调闭包会捕获旧值，ref 可确保读取最新章节号。
   */
  const chapterRef = useRef(currentChapter);
  useEffect(() => {
    chapterRef.current = currentChapter;
  }, [currentChapter]);

  /**
   * 自动播放副作用：
   * - 开启后每 2 秒推进一章；
   * - 到达末章时自动停止；
   * - 任意状态切换或卸载时清理旧定时器，避免重复计时。
   */
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

  // 没有章节时不渲染时间轴，避免无意义空壳 UI。
  if (totalChapters <= 0) return null;

  /**
   * 进度百分比（0~100）。
   * 防御：只有 1 章时分母按 1 处理，避免除 0。
   */
  const progress = ((currentChapter - 1) / Math.max(totalChapters - 1, 1)) * 100;

  return (
    <div className="chapter-timeline absolute bottom-0 left-0 right-0 z-10 border-t border-border/60 bg-card/80 backdrop-blur-md px-6 py-3">
      <div className="mx-auto flex max-w-4xl items-center gap-3">
        {/*
          回放控制区：
          - 首章/末章快速跳；
          - 单步前后跳；
          - 自动播放开关。
        */}
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

        {/* 当前章节标签：提供明确位置感。 */}
        <span className="shrink-0 text-xs font-medium text-muted-foreground min-w-[60px]">
          第{currentChapter}{chapterUnit}
        </span>

        {/*
          章节滑块：
          - 可拖拽快速定位章节；
          - 轨道层展示整体进度；
          - 拖拽中显示浮层提示，减少误判。
        */}
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
          {/* 仅拖动时显示章节气泡，避免常驻遮挡内容。 */}
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

        {/* 右侧位置指示，便于长书快速感知进度。 */}
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {currentChapter} / {totalChapters}
        </span>
      </div>
    </div>
  );
}
