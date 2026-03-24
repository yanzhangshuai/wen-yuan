import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {}
export interface CardHeaderProps extends HTMLAttributes<HTMLDivElement> {}
export interface CardTitleProps extends HTMLAttributes<HTMLHeadingElement> {}
export interface CardDescriptionProps
  extends HTMLAttributes<HTMLParagraphElement> {}
export interface CardContentProps extends HTMLAttributes<HTMLDivElement> {}
export interface CardFooterProps extends HTMLAttributes<HTMLDivElement> {}

export function Card({ className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "ui-card rounded-2xl border border-[var(--border)] bg-[var(--card)] text-[var(--card-foreground)] shadow-sm",
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: CardHeaderProps) {
  return <div className={cn("ui-card-header space-y-1.5 p-6", className)} {...props} />;
}

export function CardTitle({ className, ...props }: CardTitleProps) {
  return (
    <h3 className={cn("ui-card-title text-lg font-semibold leading-none", className)} {...props} />
  );
}

export function CardDescription({
  className,
  ...props
}: CardDescriptionProps) {
  return (
    <p
      className={cn("ui-card-description text-sm text-[var(--muted-foreground)]", className)}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: CardContentProps) {
  return <div className={cn("ui-card-content px-6 pb-6", className)} {...props} />;
}

export function CardFooter({ className, ...props }: CardFooterProps) {
  return (
    <div
      className={cn("ui-card-footer flex items-center gap-3 px-6 pb-6", className)}
      {...props}
    />
  );
}
