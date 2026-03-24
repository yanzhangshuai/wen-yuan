import type { SelectHTMLAttributes } from "react";

import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {}

export function Select({ children, className, ...props }: SelectProps) {
  return (
    <div className="ui-select relative">
      <select
        className={cn(
          "h-10 w-full appearance-none rounded-md border border-[var(--input)] bg-[var(--background)] px-3 py-2 pr-10 text-sm text-[var(--foreground)] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted-foreground)]"
      />
    </div>
  );
}
