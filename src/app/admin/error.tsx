"use client";

import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * 文件定位（Next.js App Router 分段错误文件）：
 * - 当前文件名为 `error.tsx`，位于 `app/admin/` 路由段下。
 * - Next.js 会将其注册为“admin 路由分段错误边界”：
 *   仅当 `admin` 段内页面/子组件抛错时才接管展示，不影响站点其他路由段。
 *
 * 核心职责：
 * - 为后台管理区域提供独立的错误反馈与重试入口。
 * - 与 `global-error.tsx` 形成分层兜底：优先在业务分段内恢复，减少全局中断范围。
 *
 * 运行与渲染语义：
 * - 由于要响应按钮点击并调用 `reset`，必须使用 `"use client"`。
 * - 这是错误态 UI 组件，不承担数据拉取职责，避免错误处理中再次放大故障。
 */
interface AdminErrorProps {
  /**
   * 业务语义：
   * - 当前 admin 分段渲染失败时的异常对象。
   * - `digest` 可能由 Next.js 生成，用于和服务端日志进行故障关联。
   */
  error: Error & { digest?: string };
  /**
   * 业务语义：
   * - 当前错误边界的恢复函数，触发后会重试该分段渲染链路。
   */
  reset: () => void;
}

export default function AdminError({
  error,
  reset
}: AdminErrorProps) {
  return (
    // 设计原因：后台错误反馈通常希望保持简洁、明确、可操作，使用居中布局聚焦“发生了什么 + 如何恢复”。
    <div className="flex flex-col items-center justify-center min-h-[50vh] px-4 text-center">
      {/* 业务语义：红色警示图标用于传达“当前不可用”状态，帮助管理员快速识别故障而非空白内容。 */}
      <div className="mb-6 p-4 rounded-full bg-red-500/10">
        <AlertCircle className="w-10 h-10 text-red-500" />
      </div>
      <h2 className="text-2xl font-bold mb-2">
        管理页面出错
      </h2>
      <p className="text-muted-foreground max-w-md mb-6">
        {/*
         * 分支原因：
         * - 优先显示真实错误消息，便于后台运维/开发快速排查。
         * - 兜底文案用于应对 message 缺失或不可展示场景，避免用户看到空内容。
         *
         * 风险提示（仅注释说明，不改逻辑）：
         * - 若错误消息包含内部实现细节，可能带来信息暴露风险；后续可按环境区分展示策略。
         */}
        {error.message || "发生了一个意外错误，请稍后重试。"}
      </p>
      {/*
       * 交互链路：
       * - 用户点击“重试” => 调用 `reset` => Next.js 重新尝试渲染当前 admin 分段。
       * - 这是“局部恢复”策略，业务规则是尽可能不打断用户在后台的操作路径。
       */}
      <Button onClick={reset} className="gap-2">
        <RefreshCw size={16} />
        重试
      </Button>
    </div>
  );
}
