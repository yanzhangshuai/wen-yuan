import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

const BUTTON_VARIANT_CLASS_MAP = {
  default    : "bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-[var(--primary-strong)]",
  outline    : "border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--accent)]",
  secondary  : "bg-[var(--secondary)] text-[var(--secondary-foreground)] hover:opacity-90",
  ghost      : "text-[var(--foreground)] hover:bg-[var(--accent)]",
  destructive: "bg-[var(--destructive)] text-white hover:opacity-90"
} as const;

const BUTTON_SIZE_CLASS_MAP = {
  default: "h-10 px-4 py-2",
  sm     : "h-9 px-3 text-sm",
  lg     : "h-11 px-6 text-base",
  icon   : "size-10"
} as const;

type ButtonVariant = keyof typeof BUTTON_VARIANT_CLASS_MAP;
type ButtonSize = keyof typeof BUTTON_SIZE_CLASS_MAP;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?   : ButtonSize;
}

export function Button({
  className,
  variant = "default",
  size = "default",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "ui-button inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] disabled:pointer-events-none disabled:opacity-50",
        BUTTON_VARIANT_CLASS_MAP[variant],
        BUTTON_SIZE_CLASS_MAP[size],
        className
      )}
      {...props}
    />
  );
}
