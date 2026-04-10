import { Skeleton } from "@/components/ui/skeleton";

/**
 * =============================================================================
 * 文件定位（图谱子路由 loading）
 * -----------------------------------------------------------------------------
 * 这是 `app/(viewer)/books/[id]/graph/loading.tsx`。
 *
 * 框架语义：
 * - 在 `/books/:id/graph` 页面服务端数据尚未完成时，Next.js 自动展示该骨架屏；
 * - 数据 ready 后自动替换，不需要额外状态管理。
 *
 * 业务职责：
 * - 以“工具栏 + 图谱中心 + 时间轴”三段式骨架，尽量贴近真实布局；
 * - 降低用户对长耗时图谱加载的焦虑，避免跳闪。
 * =============================================================================
 */
export default function GraphLoading() {
  return (
    <section className="graph-loading relative left-1/2 h-[calc(100vh-64px)] w-screen -translate-x-1/2 overflow-hidden bg-(--color-graph-bg)">
      {/* Toolbar skeleton */}
      <div className="absolute left-4 top-4 z-10 flex flex-col gap-1 rounded-lg border border-border bg-card p-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-8 rounded-md" />
        ))}
      </div>

      {/* Central "book opening" loading stage */}
      <div className="graph-loading-center relative flex h-full items-center justify-center">
        <div
          className="graph-loading-book-open relative flex flex-col items-center gap-5"
          role="status"
          aria-live="polite"
          aria-label="正在展开书籍并加载人物图谱"
        >
          <div className="graph-loading-book-stage relative h-52 w-[min(82vw,22rem)] [perspective:1200px]">
            <div className="graph-loading-book-halo absolute inset-x-0 top-1/2 h-24 -translate-y-1/2 rounded-full" />
            <div className="graph-loading-book-shadow absolute bottom-3 left-1/2 h-6 w-[72%] -translate-x-1/2 rounded-full bg-foreground/15 blur-xl" />
            <div className="graph-loading-book-spine absolute bottom-6 left-1/2 z-20 h-28 w-3 -translate-x-1/2 rounded-sm bg-foreground/24" />

            <div className="graph-loading-book-pages absolute bottom-7 left-1/2 z-10 h-24 w-[68%] -translate-x-1/2 overflow-hidden rounded-[4px] border border-border/35 bg-card/80">
              <div className="graph-loading-book-pages-lines absolute inset-2 rounded-[2px]" />
            </div>

            <div className="graph-loading-book-cover-left absolute bottom-6 left-1/2 z-30 h-28 w-[34%] origin-right -translate-x-[98%] rounded-l-md border border-border/45 bg-linear-to-br from-card/95 via-card/85 to-muted/75 shadow-lg" />
            <div className="graph-loading-book-cover-right absolute bottom-6 left-1/2 z-30 h-28 w-[34%] origin-left translate-x-[-2%] rounded-r-md border border-border/45 bg-linear-to-bl from-card/95 via-card/85 to-muted/75 shadow-lg" />
          </div>

          <div className="flex flex-col items-center gap-2">
            <p className="graph-loading-book-caption text-sm font-medium text-foreground/90">
              书卷展开中，正在载入人物图谱
            </p>
            <div className="graph-loading-book-dots flex items-center gap-1.5" aria-hidden="true">
              <span className="h-1.5 w-1.5 rounded-full bg-primary/70" />
              <span className="h-1.5 w-1.5 rounded-full bg-primary/70" />
              <span className="h-1.5 w-1.5 rounded-full bg-primary/70" />
            </div>
          </div>
        </div>
      </div>

      {/* Timeline skeleton */}
      <div className="absolute bottom-0 left-0 right-0 border-t border-border bg-card px-6 py-3">
        <div className="mx-auto flex max-w-3xl items-center gap-4">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-2 flex-1" />
          <Skeleton className="h-3 w-12" />
        </div>
      </div>
    </section>
  );
}
