import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

const BADGE_VARIANT_CLASS_MAP = {
  default:
    "bg-[var(--secondary)] text-[var(--secondary-foreground)] border-transparent",
  outline: "border-[var(--border)] text-[var(--foreground)]",
  success: "border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  warning: "border-transparent bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200"
} as const;

type BadgeVariant = keyof typeof BADGE_VARIANT_CLASS_MAP;

export interface BadgeProps extends HTMLAttributes<HTMLDivElement> {
  variant?: BadgeVariant;
}

export function Badge({
  className,
  variant = "default",
  ...props
}: BadgeProps) {
  return (
    <div
      className={cn(
        "ui-badge inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
        BADGE_VARIANT_CLASS_MAP[variant],
        className
      )}
      {...props}
    />
  );
}
