/**
 * 文件定位（Next.js App Router 约定文件）：
 * - 当前文件名为 `loading.tsx`，位于 `app/admin/` 路由段下。
 * - Next.js 会在该分段发生异步等待（如 Server Component 数据获取、懒加载边界）时自动渲染此占位 UI。
 *
 * 核心职责：
 * - 在后台页面真实数据尚未就绪时提供“结构化骨架屏”，减少白屏等待焦虑。
 * - 通过提前占位核心布局，降低内容加载完成后的视觉跳动，提升感知性能。
 *
 * 渲染与运行语义：
 * - 未声明 `"use client"`，因此该组件默认是 Server Component。
 * - 该文件通常非常轻量，不承担业务状态管理，只负责加载态表现层。
 *
 * 维护注意：
 * - 占位块的层级和尺寸应尽量贴近真实页面结构，这是体验一致性的业务需求，不是技术限制。
 */
export default function AdminLoading() {
  return (
    // 业务语义：整体容器模拟 admin 页面常见的“标题 + 描述 + 列表主体”布局节奏。
    <div className="space-y-6 p-6">
      {/* 标题占位：对应后台页面主标题区域。 */}
      <div className="h-8 w-48 rounded animate-shimmer" />
      {/* 副标题/说明占位：对应筛选提示或页面说明文本。 */}
      <div className="h-4 w-72 rounded animate-shimmer" />
      <div className="mt-8 space-y-4">
        {/*
         * 列表骨架生成逻辑：
         * - 固定渲染 5 条占位，目的是在常见列表场景下给用户“内容正在加载”的稳定预期。
         * - 这里并不代表真实数据一定是 5 条，而是视觉占位策略；避免因 0 条占位导致加载态过于空旷。
         */}
        {Array.from({ length: 5 }).map((_, i) => (
          // `key` 使用索引即可：占位项是静态短生命周期 UI，不涉及可重排的业务数据身份。
          <div key={i} className="h-16 rounded-md animate-shimmer" />
        ))}
      </div>
    </div>
  );
}
