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
    <section className="graph-loading relative h-[calc(100vh-64px)] w-full overflow-hidden bg-(--color-graph-bg)">
      {/* Toolbar skeleton */}
      <div className="absolute left-4 top-4 z-10 flex flex-col gap-1 rounded-lg border border-border bg-card p-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-8 rounded-md" />
        ))}
      </div>

      {/* Central graph skeleton */}
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative h-48 w-48">
            <Skeleton className="absolute left-1/2 top-1/4 h-10 w-10 -translate-x-1/2 rounded-full" />
            <Skeleton className="absolute left-1/4 top-1/2 h-8 w-8 rounded-full" />
            <Skeleton className="absolute right-1/4 top-1/2 h-8 w-8 rounded-full" />
            <Skeleton className="absolute bottom-1/4 left-1/3 h-6 w-6 rounded-full" />
            <Skeleton className="absolute bottom-1/4 right-1/3 h-6 w-6 rounded-full" />
          </div>
          <Skeleton className="h-4 w-32" />
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
