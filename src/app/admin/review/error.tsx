"use client";

import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * =============================================================================
 * 文件定位（Next.js 路由段级错误边界）
 * -----------------------------------------------------------------------------
 * 文件路径：`app/admin/review/error.tsx`
 *
 * 框架语义：
 * - `error.tsx` 是 App Router 约定的错误边界组件；
 * - 只有 Client Component 才能接收 `reset` 回调，因此必须声明 `'use client'`；
 * - 当该路由段内抛出未捕获异常时，会渲染此组件而非整页崩溃。
 *
 * 业务作用：
 * - 给审核页面提供可恢复的异常反馈；
 * - 允许管理员点击“重试”触发同路由重新渲染，减少必须手动刷新页面的成本。
 *
 * 组件类型：
 * - 这是“路由级兜底展示组件”，不是业务容器组件；
 * - 它不负责重新请求数据，只负责向用户暴露 `reset` 恢复入口。
 *
 * 维护约束：
 * - 错误边界页面应保持“轻依赖、低副作用”，避免在错误态继续发起复杂请求导致二次失败；
 * - 当前直接展示 `error.message` 便于排障，但生产环境若涉及敏感信息，建议后续做脱敏展示。
 * =============================================================================
 */
export default function ReviewError({
  error,
  reset
}: {
  /**
   * Next.js 传入的错误对象。
   * `digest` 是框架内部用于错误分组/追踪的可选标识。
   */
  error: Error & { digest?: string };
  /**
   * Next.js 提供的恢复函数。
   * 调用后会重新尝试渲染当前路由段，常用于临时网络/服务抖动恢复。
   */
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] px-4 text-center">
      <div className="mb-6 p-4 rounded-full bg-red-500/10">
        <AlertCircle className="w-10 h-10 text-red-500" />
      </div>
      <h2 className="text-2xl font-bold mb-2">审核页面出错</h2>
      <p className="text-muted-foreground max-w-md mb-6">
        {/*
         * 分支语义：
         * - 优先显示真实错误消息，帮助管理员快速定位“权限/接口/数据”类问题；
         * - 如果 message 为空，则回落到通用文案，保证界面始终可读。
         */}
        {error.message || "加载审核数据时出错，请重试。"}
      </p>
      <Button
        // `reset` 是 Next.js 错误边界提供的官方恢复机制，不是手写刷新逻辑。
        // 这是框架推荐路径，可在不离开当前路由的前提下重试渲染链路。
        onClick={reset}
        className="gap-2"
      >
        <RefreshCw size={16} />
        重试
      </Button>
    </div>
  );
}
