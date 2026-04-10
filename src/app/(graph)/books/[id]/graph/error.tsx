"use client";

import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * =============================================================================
 * 文件定位（图谱子路由 error boundary）
 * -----------------------------------------------------------------------------
 * 这是 `app/(viewer)/books/[id]/graph/error.tsx`，用于图谱页面路由段错误兜底。
 *
 * 为什么是 Client Component：
 * - Next.js `error.tsx` 依赖客户端 `reset()` 回调机制；
 * - 因此必须 `use client`。
 *
 * 业务职责：
 * - 在图谱加载或渲染出错时给出可重试反馈；
 * - 将异常限制在图谱路由段，避免影响站点其它区域。
 * =============================================================================
 */
export default function GraphError({
  error,
  reset
}: {
  /** Next.js 注入错误对象，digest 可用于服务端日志关联。 */
  error: Error & { digest?: string };
  /** Next.js 注入重试函数，触发当前路由段重新渲染。 */
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
      <div className="mb-6 p-4 rounded-full bg-destructive/10">
        <AlertCircle className="w-10 h-10 text-destructive" />
      </div>
      <h2 className="text-2xl font-bold text-foreground mb-2">
        图谱加载出错
      </h2>
      <p className="text-muted-foreground max-w-md mb-6">
        {/* 优先显示业务可读错误信息，兜底提供统一可理解文案。 */}
        {error.message || "加载图谱数据时出错，请重试。"}
      </p>
      {/* 与手动刷新相比，reset 能更精确地重试当前路由片段。 */}
      <Button onClick={reset} className="gap-2">
        <RefreshCw size={16} />
        重试
      </Button>
    </div>
  );
}
