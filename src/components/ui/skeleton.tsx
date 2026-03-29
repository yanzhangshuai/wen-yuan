import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      /* 使用 bg-muted 而非 bg-accent，避免在丹青/典藏等主题下
         accent 颜色为强饱和主题色导致骨架屏大面积红色/金色问题 */
      className={cn("bg-muted animate-pulse rounded-md", className)}
      {...props}
    />
  );
}

export { Skeleton };
