"use client";

import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * =============================================================================
 * 文件定位（viewer 路由组 error boundary）
 * -----------------------------------------------------------------------------
 * 这是 `app/(viewer)/error.tsx`，属于 Next.js 路由级错误边界文件。
 *
 * 为什么必须是 Client Component：
 * - Next.js 规定 `error.tsx` 需要在客户端接收 `reset` 回调并触发重试；
 * - 因此必须声明 `"use client"`。
 *
 * 框架行为：
 * - `(viewer)` 路由组下的页面/布局在渲染或数据获取阶段抛错时，会落到这里；
 * - 点击 `reset()` 会让 Next.js 重新尝试渲染当前路由段。
 *
 * 业务职责：
 * - 给用户稳定、可理解的错误反馈；
 * - 提供“重试”入口，避免用户只能刷新整页。
 * =============================================================================
 */
export default function ViewerError({
  error,
  reset
}: {
  /**
   * Next.js 注入的错误对象。
   * - `message`：可展示错误文案；
   * - `digest`：框架内部错误摘要，可用于日志关联。
   */
  error: Error & { digest?: string };
  /**
   * Next.js 注入的重试函数。
   * 调用后会重新执行当前路由段的渲染与数据获取流程。
   */
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
      <div className="mb-6 p-4 rounded-full bg-destructive/10">
        <AlertCircle className="w-10 h-10 text-destructive" />
      </div>
      <h2 className="text-2xl font-bold text-foreground mb-2">
        页面加载出错
      </h2>
      <p className="text-muted-foreground max-w-md mb-6">
        {/* 优先展示服务端抛出的业务可读信息，兜底为通用文案避免空白。 */}
        {error.message || "发生了一个意外错误，请稍后重试。"}
      </p>
      {/* 这里使用 reset 而不是 window.location.reload，避免整站级重载带来的额外成本。 */}
      <Button onClick={reset} className="gap-2">
        <RefreshCw size={16} />
        重试
      </Button>
    </div>
  );
}
