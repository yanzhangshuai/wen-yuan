import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

const BADGE_VARIANT_CLASS_MAP = {
  default:
    "bg-primary text-white border-transparent shadow hover:bg-(--color-primary-hover)",
  secondary:
    "bg-muted text-white border-transparent hover:bg-muted/80",
  destructive:
    "bg-destructive text-white border-transparent shadow hover:bg-destructive/80",
  outline: 
    "text-foreground border-border",
  success: 
    "bg-success text-white border-transparent shadow",
  warning: 
    "bg-(--color-warning) text-white border-transparent shadow"
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
