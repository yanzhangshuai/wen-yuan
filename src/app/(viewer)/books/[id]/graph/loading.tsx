export default function GraphLoading() {
  return (
    <div className="min-h-[70vh] flex flex-col">
      {/* Toolbar skeleton */}
      <div className="flex items-center gap-3 p-4 border-b border-[var(--color-border)]">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-9 w-20 rounded-md animate-shimmer" />
        ))}
      </div>
      {/* Graph area skeleton */}
      <div className="flex-1 relative">
        <div className="absolute inset-0 animate-shimmer rounded-md m-4" />
      </div>
      {/* Timeline skeleton */}
      <div className="h-12 border-t border-[var(--color-border)] flex items-center px-4">
        <div className="h-2 flex-1 rounded-full animate-shimmer" />
      </div>
    </div>
  );
}
