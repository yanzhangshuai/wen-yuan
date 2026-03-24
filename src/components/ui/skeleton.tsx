import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {}

export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn(
        "ui-skeleton animate-pulse rounded-md bg-[var(--accent)]",
        className
      )}
      {...props}
    />
  );
}
