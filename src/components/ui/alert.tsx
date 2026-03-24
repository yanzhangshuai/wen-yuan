import type { HTMLAttributes } from "react";

import { AlertCircle, CheckCircle2 } from "lucide-react";

import { cn } from "@/lib/utils";

const ALERT_VARIANT_CLASS_MAP = {
  default: "border-[var(--border)] bg-[var(--card)] text-[var(--card-foreground)]",
  destructive:
    "border-[color:color-mix(in_srgb,var(--destructive)_30%,transparent)] bg-[color:color-mix(in_srgb,var(--destructive)_12%,var(--card))] text-[var(--foreground)]",
  success:
    "border-[color:color-mix(in_srgb,#10b981_30%,transparent)] bg-[color:color-mix(in_srgb,#10b981_12%,var(--card))] text-[var(--foreground)]"
} as const;

type AlertVariant = keyof typeof ALERT_VARIANT_CLASS_MAP;

export interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  variant?: AlertVariant;
}

export interface AlertTitleProps extends HTMLAttributes<HTMLHeadingElement> {}

export interface AlertDescriptionProps
  extends HTMLAttributes<HTMLParagraphElement> {}

export function Alert({
  children,
  className,
  variant = "default",
  ...props
}: AlertProps) {
  const Icon = variant === "success" ? CheckCircle2 : AlertCircle;

  return (
    <div
      role="alert"
      className={cn(
        "ui-alert grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg border p-4",
        ALERT_VARIANT_CLASS_MAP[variant],
        className
      )}
      {...props}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-4" />
      <div className="space-y-1">{children}</div>
    </div>
  );
}

export function AlertTitle({ className, ...props }: AlertTitleProps) {
  return (
    <h5
      className={cn("ui-alert-title text-sm font-semibold leading-none", className)}
      {...props}
    />
  );
}

export function AlertDescription({
  className,
  ...props
}: AlertDescriptionProps) {
  return (
    <p
      className={cn(
        "ui-alert-description text-sm text-[var(--muted-foreground)]",
        className
      )}
      {...props}
    />
  );
}
