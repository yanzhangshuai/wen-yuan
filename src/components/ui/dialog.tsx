"use client";

import type { HTMLAttributes, ReactNode } from "react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}

export interface DialogContentProps extends HTMLAttributes<HTMLDivElement> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export interface DialogHeaderProps extends HTMLAttributes<HTMLDivElement> {}
export interface DialogTitleProps extends HTMLAttributes<HTMLHeadingElement> {}
export interface DialogDescriptionProps
  extends HTMLAttributes<HTMLParagraphElement> {}
export interface DialogFooterProps extends HTMLAttributes<HTMLDivElement> {}

export function Dialog({ children }: DialogProps) {
  return <>{children}</>;
}

export function DialogContent({
  children,
  className,
  open,
  onOpenChange,
  ...props
}: DialogContentProps) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onOpenChange(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onOpenChange, open]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="ui-dialog fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="关闭弹窗"
        className="absolute inset-0 bg-black/45"
        onClick={() => onOpenChange(false)}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "ui-dialog-content relative z-10 w-full max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 text-[var(--card-foreground)] shadow-2xl",
          className
        )}
        {...props}
      >
        <button
          type="button"
          aria-label="关闭弹窗"
          className="absolute right-4 top-4 rounded-sm p-1 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--foreground)]"
          onClick={() => onOpenChange(false)}
        >
          <X className="size-4" />
        </button>
        {children}
      </div>
    </div>,
    document.body
  );
}

export function DialogHeader({ className, ...props }: DialogHeaderProps) {
  return <div className={cn("ui-dialog-header grid gap-2", className)} {...props} />;
}

export function DialogTitle({ className, ...props }: DialogTitleProps) {
  return (
    <h2 className={cn("ui-dialog-title text-lg font-semibold", className)} {...props} />
  );
}

export function DialogDescription({
  className,
  ...props
}: DialogDescriptionProps) {
  return (
    <p
      className={cn("ui-dialog-description text-sm text-[var(--muted-foreground)]", className)}
      {...props}
    />
  );
}

export function DialogFooter({ className, ...props }: DialogFooterProps) {
  return (
    <div
      className={cn("ui-dialog-footer mt-6 flex justify-end gap-3", className)}
      {...props}
    />
  );
}
