/**
 * =============================================================================
 * 文件定位（graph 路由组布局）
 * -----------------------------------------------------------------------------
 * 本文件是 App Router 路由组 `(graph)` 的 `layout.tsx`。
 *
 * 设计意图：
 * - 图谱页面（/books/:id/graph）使用全屏沉浸式布局，拥有独立的 GraphPageHeader；
 * - 不需要全局 ViewerHeader，因此这里只做最低限度的容器包裹；
 * - 路由组名 `(graph)` 不参与 URL，路径仍为 /books/:id/graph。
 * =============================================================================
 */
export default function GraphLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-dvh flex-col">
      {children}
    </div>
  );
}
