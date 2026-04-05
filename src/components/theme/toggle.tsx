"use client";

import { Palette, Check } from "lucide-react";
import { THEME_OPTIONS } from "@/theme";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useHydratedTheme } from "@/hooks/use-hydrated-theme";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";

/**
 * 文件定位（Client Component / 主题切换入口）：
 * - 用于头部区域的主题切换交互，驱动全站 CSS 变量主题变更。
 * - 依赖 `useHydratedTheme` 与点击事件，因此必须是客户端组件。
 */

export interface ThemeToggleProps {
  /** 触发按钮额外样式类，用于在不同 header 场景定制布局。 */
  triggerClassName?: string;
}

/** 主题色圆点映射：仅用于菜单视觉辅助，不参与真实主题计算。 */
const THEME_COLORS: Record<string, string> = {
  danqing : "bg-[#8b3a3a]",
  suya    : "bg-[#5a8a6c]",
  diancang: "bg-[#c9a227]",
  xingkong: "bg-[#6b8cae]"
};

/** 主题说明文案：帮助用户理解视觉风格差异。 */
const THEME_DESCRIPTIONS: Record<string, string> = {
  danqing : "深色古风 · 朱砂红",
  suya    : "暖调浅色 · 竹青绿",
  diancang: "博物馆暗色 · 黄铜金",
  xingkong: "深邃宇宙 · 星辉银蓝"
};

export function ThemeToggle({ triggerClassName }: ThemeToggleProps) {
  const { theme, setTheme, isHydrated } = useHydratedTheme();

  if (!isHydrated) {
    // Hydration 前先渲染占位，避免服务端主题值与客户端真实值不一致造成闪烁。
    return <div className="w-9 h-9 bg-muted/20 animate-pulse rounded-md" />;
  }

  const current = THEME_OPTIONS.find((o) => o.value === theme);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn("theme-toggle-trigger gap-2", triggerClassName)}
        >
          <Palette className="h-4 w-4" />
          <span className="hidden lg:inline">{current?.label ?? "主题"}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="theme-toggle-menu w-56">
        {THEME_OPTIONS.map((opt) => (
          <DropdownMenuItem
            key={opt.value}
            onClick={() => setTheme(opt.value)}
            data-selected={theme === opt.value ? "true" : "false"}
            className={cn(
              "theme-toggle-option group/theme-item flex cursor-pointer flex-col items-start gap-1 rounded-md py-3",
              /* hover 无边框，仅用透明底色表达；选中态保留更高不透明度。 */
              theme === opt.value
                ? "bg-accent/44 text-accent-foreground focus:bg-accent/44 data-[highlighted]:bg-accent/44 data-[highlighted]:text-accent-foreground"
                : "focus:bg-accent/20 data-[highlighted]:bg-accent/20 data-[highlighted]:text-accent-foreground"
            )}
          >
            <div className="flex w-full items-center gap-2">
              <span className={cn("w-3 h-3 rounded-full", THEME_COLORS[opt.value] || "bg-primary")} />
              <span className="font-medium">{opt.label}</span>
              {theme === opt.value && <Check className="h-3 w-3 ml-auto" />}
            </div>
            <span className="text-xs text-muted-foreground pl-5">
              {THEME_DESCRIPTIONS[opt.value] ?? ""}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
