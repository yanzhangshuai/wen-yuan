import type { HTMLAttributes, LabelHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export interface FormItemProps extends HTMLAttributes<HTMLDivElement> {}
export interface FormLabelProps
  extends LabelHTMLAttributes<HTMLLabelElement> {}
export interface FormDescriptionProps
  extends HTMLAttributes<HTMLParagraphElement> {}
export interface FormMessageProps extends HTMLAttributes<HTMLParagraphElement> {}

export function FormItem({ className, ...props }: FormItemProps) {
  return <div className={cn("ui-form-item grid gap-2", className)} {...props} />;
}

export function FormLabel({ className, ...props }: FormLabelProps) {
  return (
    <label
      className={cn("ui-form-label text-sm font-medium text-[var(--foreground)]", className)}
      {...props}
    />
  );
}

export function FormDescription({
  className,
  ...props
}: FormDescriptionProps) {
  return (
    <p
      className={cn("ui-form-description text-sm text-[var(--muted-foreground)]", className)}
      {...props}
    />
  );
}

export function FormMessage({ className, ...props }: FormMessageProps) {
  return (
    <p className={cn("ui-form-message text-sm text-[var(--destructive)]", className)} {...props} />
  );
}
