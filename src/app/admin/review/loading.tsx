import { Skeleton } from "@/components/ui/skeleton";

export default function ReviewLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48 rounded-md" />
      <div className="flex gap-6">
        <div className="w-64 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-md" />
          ))}
        </div>
        <div className="flex-1 space-y-4">
          <div className="flex gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-24 rounded-md" />
            ))}
          </div>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-md" />
          ))}
        </div>
      </div>
    </div>
  );
}
