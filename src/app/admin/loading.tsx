export default function AdminLoading() {
  return (
    <div className="space-y-6 p-6">
      <div className="h-8 w-48 rounded animate-shimmer" />
      <div className="h-4 w-72 rounded animate-shimmer" />
      <div className="mt-8 space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 rounded-md animate-shimmer" />
        ))}
      </div>
    </div>
  );
}
