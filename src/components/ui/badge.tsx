import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

const BADGE_VARIANT_CLASS_MAP = {
  default:
    "bg-[var(--color-primary)] text-white border-transparent shadow hover:bg-[var(--color-primary-hover)]",
  secondary:
    "bg-[var(--color-muted)] text-white border-transparent hover:bg-[var(--color-muted)]/80",
  destructive:
    "bg-[var(--color-danger)] text-white border-transparent shadow hover:bg-[var(--color-danger)]/80",
  outline: 
    "text-[var(--color-fg)] border-[var(--color-border)]",
  success: 
    "bg-[var(--color-success)] text-white border-transparent shadow",
  warning: 
    "bg-[var(--color-warning)] text-white border-transparent shadow"
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
