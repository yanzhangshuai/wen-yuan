import { Skeleton } from "@/components/ui/skeleton";

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
