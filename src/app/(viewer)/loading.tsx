/**
 * =============================================================================
 * 文件定位（viewer 路由组 loading）
 * -----------------------------------------------------------------------------
 * 这是 `app/(viewer)/loading.tsx`，属于 Next.js 的保留文件约定。
 *
 * 框架行为：
 * - 当 `(viewer)` 路由组下页面在服务端取数尚未完成时，Next.js 会自动展示本组件；
 * - 页面完成后自动替换为真实内容，无需手动管理 loading 状态。
 *
 * 业务职责：
 * - 为书库首页提供“书封网格骨架屏”，降低空白等待感；
 * - 通过固定数量占位块，提前稳定布局，减少内容加载后的视觉跳动。
 *
 * 维护注意：
 * - 这里是“路由级 loading”，会影响该路由组内首屏等待体验；
 * - 占位尺寸应与真实卡片比例一致（当前 `aspect-[2/3]`），这是体验规则，不是技术限制。
 * =============================================================================
 */
export default function ViewerLoading() {
  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6 sm:gap-8 lg:gap-10">
        {/* 使用固定 12 个占位块模拟书封矩阵，确保加载前后网格节奏一致。 */}
        {Array.from({ length: 12 }).map((_, i) => (
          // key 使用索引是可接受的：该占位列表是静态只读，不参与重排。
          <div key={i} className="aspect-[2/3] rounded animate-shimmer" />
        ))}
      </div>
    </div>
  );
}
