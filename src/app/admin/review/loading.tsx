export default function ReviewLoading() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-48 rounded animate-shimmer" />
      <div className="flex gap-6">
        <div className="w-64 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-12 rounded-md animate-shimmer" />
          ))}
        </div>
        <div className="flex-1 space-y-4">
          <div className="flex gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-10 w-24 rounded animate-shimmer" />
            ))}
          </div>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-20 rounded-md animate-shimmer" />
          ))}
        </div>
      </div>
    </div>
  );
}
