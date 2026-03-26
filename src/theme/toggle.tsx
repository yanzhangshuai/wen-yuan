"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Palette, ChevronDown, Check } from "lucide-react";
import { THEME_OPTIONS } from "./constants";
import { cn } from "@/lib/utils";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  if (!mounted) {
    return <div className="w-25 h-9 bg-muted/20 animate-pulse rounded-md" />;
  }

  const current = THEME_OPTIONS.find((o) => o.value === theme);

  return (
    <div ref={ref} className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 h-9 px-2.5 rounded-md border border-border bg-transparent text-sm font-medium text-(--color-fg) transition-colors hover:border-(--color-primary) focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--color-primary) cursor-pointer"
        aria-label="切换主题"
        aria-expanded={open}
      >
        <Palette size={14} className="text-(--color-muted-fg)" aria-hidden="true" />
        <span>{current?.label ?? "主题"}</span>
        <ChevronDown size={14} className={cn("text-(--color-muted-fg) transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 min-w-[100px] rounded-md border border-(--color-border-strong) bg-(--color-card-bg) py-1 shadow-lg">
          {THEME_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { setTheme(opt.value); setOpen(false); }}
              className={cn(
                "flex items-center gap-2 w-full px-3 py-1.5 text-sm transition-colors cursor-pointer",
                opt.value === theme
                  ? "text-(--color-primary) font-medium bg-(--color-primary-subtle)"
                  : "text-(--color-fg) hover:bg-(--color-muted)/40"
              )}
            >
              {opt.value === theme && <Check size={12} aria-hidden="true" />}
              <span className={opt.value !== theme ? "pl-[20px]" : ""}>{opt.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
