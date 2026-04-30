import { Skeleton } from "@/components/ui/skeleton";

/**
 * =============================================================================
 * 文件定位（Next.js 路由段级 loading UI）
 * -----------------------------------------------------------------------------
 * 文件路径：`app/admin/role-workbench/loading.tsx`
 *
 * 框架语义：
 * - `loading.tsx` 是 App Router 的约定文件；
 * - 当该路由段下的 Server Component 正在等待异步数据时，Next.js 会自动渲染它；
 * - 不需要手动条件判断加载态。
 *
 * 业务作用：
 * - 为角色资料工作台提供骨架屏，降低“白屏等待”带来的感知延迟；
 * - 结构上模拟“左侧书籍列表 + 右侧 Tab 与资料卡片”，让用户提前建立页面预期。
 *
 * 设计原因：
 * - 这里使用“结构近似骨架”而非简单 spinner，是为了让用户感知到页面即将出现的布局层级；
 * - 左右分栏比例与真实页面一致，避免加载完成时发生大幅布局跳变（减少视觉抖动）。
 * =============================================================================
 */
export default function RoleWorkbenchLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48 rounded-md" />
      <div className="flex gap-6">
        <div className="w-64 space-y-3">
          {/* 左侧“书籍列表”占位：数量设置为 4，模拟常见列表场景。 */}
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-md" />
          ))}
        </div>
        <div className="flex-1 space-y-4">
          <div className="flex gap-2">
            {/* 顶部 Tab 占位：4 个标签对应角色资料主面板常见 tab 数量。 */}
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-24 rounded-md" />
            ))}
          </div>
          {/* 主内容卡片占位：6 行用于覆盖“资料列表首屏”典型密度。 */}
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-md" />
          ))}
        </div>
      </div>
    </div>
  );
}
